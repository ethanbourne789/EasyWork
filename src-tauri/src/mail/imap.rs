use std::sync::Arc;
use tokio_rustls::TlsConnector;
use rustls::pki_types::ServerName;
use futures::{StreamExt, TryStreamExt};
use tokio_util::compat::TokioAsyncReadCompatExt;

pub type ImapSession = async_imap::Session<tokio_util::compat::Compat<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>>;

pub async fn connect(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<ImapSession, Box<dyn std::error::Error + Send + Sync>> {
    let tcp = tokio::net::TcpStream::connect((host, port)).await?;

    // Build rustls TLS config (safe defaults, no client auth)
    let root_store: rustls::RootCertStore = webpki_roots::TLS_SERVER_ROOTS.iter().cloned().collect();
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(config));
    let domain = ServerName::try_from(host.to_string())?;
    let tls_stream = connector.connect(domain, tcp).await?;
    // Wrap tokio TlsStream in compat layer for futures traits (async-imap requires futures::AsyncRead+Write)
    let tls_stream = tls_stream.compat();

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

/// Fetch flags (uid, is_read, is_starred) for all messages in the selected folder.
/// Uses IMAP FETCH with FLAGS to retrieve \Seen and \Flagged states.
pub async fn fetch_flags_batch(
    session: &mut ImapSession,
) -> Result<Vec<(u32, bool, bool)>, Box<dyn std::error::Error + Send + Sync>> {
    use futures::TryStreamExt;

    // Fetch all UIDs first, then batch fetch flags
    let uids = session.uid_search("ALL").await?;
    let uid_list: Vec<u32> = uids.into_iter().collect();

    if uid_list.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    for chunk in uid_list.chunks(100) {
        let uid_set = chunk.iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let stream = session.uid_fetch(&uid_set, "(UID FLAGS)").await?;
        let fetches: Vec<async_imap::types::Fetch> = stream.try_collect().await?;

        for fetch in &fetches {
            if let Some(uid) = fetch.uid {
                let mut flags = fetch.flags();
                let is_read = flags.any(|f| format!("{:?}", f).eq_ignore_ascii_case("\\Seen"));
                let is_starred = flags.any(|f| format!("{:?}", f).eq_ignore_ascii_case("\\Flagged"));
                results.push((uid, is_read, is_starred));
            }
        }
    }

    log::info!("Fetched flags for {} messages", results.len());
    Ok(results)
}

/// IDLE loop: wait for new mail events with a timeout.
/// Uses a polling fallback (UID comparison) which works with all IMAP servers.
/// Native IMAP IDLE requires async-imap v0.9 idle extension which has API limitations.
pub async fn idle_wait(
    session: &mut ImapSession,
    folder: &str,
    timeout: std::time::Duration,
) -> Result<IdleEvent, Box<dyn std::error::Error + Send + Sync>> {
    // Select folder and record current UID count
    let mailbox = session.select(folder).await?;
    let initial_exists = mailbox.exists;

    // Wait for the configured duration
    tokio::time::sleep(timeout).await;

    // Re-select and check if new messages arrived
    let mailbox = session.select(folder).await?;

    if mailbox.exists > initial_exists {
        Ok(IdleEvent::NewMail)
    } else {
        Ok(IdleEvent::Timeout)
    }
}

/// Result of IDLE monitoring.
#[derive(Debug, Clone)]
pub enum IdleEvent {
    NewMail,
    Timeout,
}

/// Check for folder changes by comparing UID counts (fallback when IDLE unsupported).
pub async fn check_folder_changes(
    session: &mut ImapSession,
    folder: &str,
    last_uid: u32,
) -> Result<(bool, u32), Box<dyn std::error::Error + Send + Sync>> {
    session.select(folder).await?;
    let uids = session.uid_search("ALL").await?;
    let max_uid: u32 = uids.into_iter().max().unwrap_or(0);

    if max_uid > last_uid {
        Ok((true, max_uid))
    } else {
        Ok((false, last_uid))
    }
}

pub async fn logout(
    mut session: ImapSession,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    session.logout().await?;
    log::info!("IMAP logged out");
    Ok(())
}
