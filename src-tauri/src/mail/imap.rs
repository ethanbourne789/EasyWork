use async_native_tls::TlsConnector;
use async_net::TcpStream;
use futures::{StreamExt, TryStreamExt};

pub type ImapSession = async_imap::Session<async_native_tls::TlsStream<TcpStream>>;

pub async fn connect(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<ImapSession, Box<dyn std::error::Error + Send + Sync>> {
    let tcp = TcpStream::connect((host, port)).await?;
    let tls = TlsConnector::new();
    let tls_stream = tls.connect(host, tcp).await?;

    let client = async_imap::Client::new(tls_stream);
    let session = client.login(username, password).await.map_err(|e| e.0)?;

    log::info!("IMAP connected to {}:{} as {}", host, port, username);
    Ok(session)
}

pub async fn list_folders(
    session: &mut ImapSession,
) -> Result<Vec<(String, String, String)>, Box<dyn std::error::Error + Send + Sync>> {
    let list_result = session.list(Some(""), Some("*")).await?;
    let mut folders = Vec::new();

    let names: Vec<_> = list_result.collect().await;

    for item in names {
        let item = item?;
        let name_str = item.name().to_string();

        // Skip \Noselect mailboxes (can't contain messages)
        let attributes = item.attributes();
        if attributes.iter().any(|a| matches!(a, async_imap::types::NameAttribute::NoSelect)) {
            continue;
        }

        // Role detection: IMAP attributes first, then name heuristics (CN + EN)
        let role = if let Some(role) = detect_role_by_attribs(&item) {
            role
        } else {
            detect_role_by_name(&name_str)
        };

        folders.push((name_str.clone(), name_str, role.to_string()));
    }

    Ok(folders)
}

/// Detect folder role from IMAP LIST attributes (e.g. \Sent, \Trash)
fn detect_role_by_attribs(item: &async_imap::types::Name) -> Option<&'static str> {
    for attr in item.attributes() {
        match attr {
            async_imap::types::NameAttribute::Sent => return Some("sent"),
            async_imap::types::NameAttribute::Drafts => return Some("drafts"),
            async_imap::types::NameAttribute::Trash => return Some("trash"),
            async_imap::types::NameAttribute::Junk => return Some("junk"),
            async_imap::types::NameAttribute::Archive => return Some("archive"),
            async_imap::types::NameAttribute::Extension(ext)
                if ext.eq_ignore_ascii_case("\\Inbox") => return Some("inbox"),
            _ => {}
        }
    }
    None
}

/// Detect folder role by name heuristics (Chinese + English)
fn detect_role_by_name(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    // Get the last segment (leaf name) for nested folders like "[Gmail]/Sent Mail"
    let leaf = lower.rsplit('/').next().unwrap_or(&lower);
    let leaf = leaf.rsplit('.').next().unwrap_or(leaf).trim();

    // INBOX
    if name.eq_ignore_ascii_case("INBOX") || leaf == "收件箱" {
        return "inbox";
    }
    // Sent
    if leaf.contains("sent") || leaf.contains("已发送") || leaf.contains("已发件") || leaf.contains("寄件") {
        return "sent";
    }
    // Drafts
    if leaf.contains("draft") || leaf.contains("草稿") {
        return "drafts";
    }
    // Trash / Deleted
    if leaf.contains("trash") || leaf.contains("deleted")
        || leaf.contains("已删除") || leaf.contains("废纸篓") || leaf.contains("回收站")
    {
        return "trash";
    }
    // Spam / Junk
    if leaf.contains("spam") || leaf.contains("junk")
        || leaf.contains("垃圾") || leaf.contains("广告") || leaf.contains("病毒")
    {
        return "junk";
    }
    // Archive
    if leaf.contains("archive") || leaf.contains("归档") || leaf.contains("存档")
        || leaf.contains("all mail") || leaf.contains("全部邮件")
    {
        return "archive";
    }
    // Unrecognized
    ""
}

pub async fn select_folder(
    session: &mut ImapSession,
    folder: &str,
) -> Result<async_imap::types::Mailbox, Box<dyn std::error::Error + Send + Sync>> {
    let mailbox = session.select(folder).await?;
    log::info!("Selected '{}': {} messages", folder, mailbox.exists);
    Ok(mailbox)
}

pub async fn fetch_message_uids(
    session: &mut ImapSession,
    folder: &str,
) -> Result<Vec<u32>, Box<dyn std::error::Error + Send + Sync>> {
    session.select(folder).await?;
    let uids = session.uid_search("ALL").await?;
    Ok(uids.into_iter().collect())
}

/// Fetch UIDs since a specific date (IMAP SEARCH SINCE dd-Mon-yyyy)
pub async fn fetch_uids_since(
    session: &mut ImapSession,
    folder: &str,
    since_days: i64,
) -> Result<Vec<u32>, Box<dyn std::error::Error + Send + Sync>> {
    session.select(folder).await?;

    let since_date = chrono::Utc::now() - chrono::Duration::days(since_days);
    let since_str = since_date.format("%d-%b-%Y").to_string();
    let search_cmd = format!("SINCE {}", since_str);

    log::info!("IMAP SEARCH {} in folder '{}'", search_cmd, folder);

    let uids = session.uid_search(&search_cmd).await?;
    let collected: Vec<u32> = uids.into_iter().collect();
    log::info!("Found {} UIDs since {} in '{}'", collected.len(), since_str, folder);
    Ok(collected)
}

/// Fetch raw message bodies by UID. Matches Pebble's pattern: use (UID BODY.PEEK[])
/// in fetch items and try_collect() instead of streaming for reliability.
pub async fn fetch_messages_raw_batch(
    session: &mut ImapSession,
    uids: &[u32],
) -> Result<Vec<(u32, Vec<u8>)>, Box<dyn std::error::Error + Send + Sync>> {
    if uids.is_empty() {
        return Ok(Vec::new());
    }

    let uid_set = uids.iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    // Match Pebble's pattern: include UID in fetch items so the parser
    // correctly associates UIDs with body data in all response formats
    let fetch_cmd = "(UID BODY.PEEK[])";

    log::info!(
        "Fetching {} UIDs from set {{{}}}",
        uids.len(),
        if uid_set.len() > 80 { format!("{}...", &uid_set[..80]) } else { uid_set.clone() }
    );

    let stream = session.uid_fetch(uid_set, fetch_cmd).await?;
    let fetches: Vec<async_imap::types::Fetch> = stream.try_collect().await?;

    let mut results = Vec::new();
    for fetch in &fetches {
        match (fetch.uid, fetch.body()) {
            (Some(uid), Some(body)) => {
                results.push((uid, body.to_vec()));
            }
            (uid_opt, body_opt) => {
                log::debug!(
                    "Fetch item: uid={:?} body={} bytes",
                    uid_opt,
                    body_opt.map_or(0, |b| b.len())
                );
            }
        }
    }

    log::info!(
        "Fetched {}/{} message bodies ({} fetches received)",
        results.len(),
        uids.len(),
        fetches.len()
    );
    Ok(results)
}

/// Check for new messages quickly by comparing highest UID in DB vs server.
/// Returns the count of new UIDs found (none of them fetched yet).
pub async fn check_new_uid_count(
    session: &mut ImapSession,
    folder: &str,
    since_days: i64,
) -> Result<Vec<u32>, Box<dyn std::error::Error + Send + Sync>> {
    fetch_uids_since(session, folder, since_days).await
}

pub async fn logout(
    mut session: ImapSession,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    session.logout().await?;
    log::info!("IMAP logged out");
    Ok(())
}
