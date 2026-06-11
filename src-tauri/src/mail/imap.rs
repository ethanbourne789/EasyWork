use std::sync::Arc;
use std::time::{Duration, Instant};
use futures::{StreamExt, TryStreamExt};
use tokio_util::compat::TokioAsyncReadCompatExt;

/// IMAP session using native-tls (schannel on Windows).
/// Mirrors curl's SSL behaviour — works reliably with QQ/K8s/163 IMAP servers.
pub type ImapSession = async_imap::Session<
    tokio_util::compat::Compat<tokio_native_tls::TlsStream<tokio::net::TcpStream>>
>;

/// Timeout per individual step (TCP, TLS, LOGIN)
const STEP_TIMEOUT: Duration = Duration::from_secs(10);
/// Overall connection timeout
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(30);

pub async fn connect(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<ImapSession, Box<dyn std::error::Error + Send + Sync>> {
    let overall_start = Instant::now();

    // Race the entire connection against a 30-second timer.
    tokio::select! {
        result = connection_attempt(host, port, username, password) => {
            let elapsed = overall_start.elapsed();
            log::info!(
                "IMAP connect OK to {}:{} as {} in {:.1}s",
                host, port, username, elapsed.as_secs_f64()
            );
            result
        }
        _ = tokio::time::sleep(CONNECTION_TIMEOUT) => {
            let elapsed = overall_start.elapsed();
            log::warn!(
                "IMAP connection timed out after {:.1}s: {}:{}",
                elapsed.as_secs_f64(), host, port
            );
            Err(format!(
                "IMAP 连接超时 ({}:{}): 连接过程超过 {} 秒",
                host, port, CONNECTION_TIMEOUT.as_secs()
            ).into())
        }
    }
}

/// Inner connection logic — isolated so tokio::select! can cancel it.
/// Each step has its own timeout and detailed timing log.
async fn connection_attempt(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<ImapSession, Box<dyn std::error::Error + Send + Sync>> {
    // ── Step 1: DNS resolve + TCP connect (10s timeout) ──
    let tcp_start = Instant::now();
    log::info!("IMAP Step 1/3: TCP connecting to {}:{} ...", host, port);

    let connect_future = tokio::net::TcpStream::connect((host, port));
    let tcp = tokio::select! {
        t = connect_future => t.map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
            log::error!(
                "IMAP TCP connect FAILED to {}:{} after {:.1}s: {}",
                host, port, tcp_start.elapsed().as_secs_f64(), e
            );
            format!("无法连接 {}:{}: {}", host, port, e).into()
        })?,
        _ = tokio::time::sleep(STEP_TIMEOUT) => {
            let elapsed = tcp_start.elapsed();
            log::error!(
                "IMAP TCP connect TIMEOUT to {}:{} after {:.1}s",
                host, port, elapsed.as_secs_f64()
            );
            return Err(format!("TCP 连接超时 ({}:{}): {} 秒内无响应", host, port, STEP_TIMEOUT.as_secs()).into());
        }
    };

    let tcp_elapsed = tcp_start.elapsed();
    let peer_addr = tcp.peer_addr().map(|a| a.to_string()).unwrap_or_else(|_| "?".into());
    log::info!(
        "IMAP Step 1/3 OK: TCP connected to {} (resolved to {}) in {:.3}s",
        host, peer_addr, tcp_elapsed.as_secs_f64()
    );

    // ── Step 2: TLS handshake (10s timeout) using native-tls ──
    let tls_start = Instant::now();
    log::info!("IMAP Step 2/3: TLS handshake (native-tls) with {}:{} ...", host, port);

    // native-tls uses the OS trust store (schannel on Windows, Security.framework on macOS, OpenSSL on Linux)
    let tls_connector = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
            log::error!("IMAP TLS: failed to build native connector: {}", e);
            format!("TLS 初始化失败: {}", e).into()
        })?;
    let tls_connector = tokio_native_tls::TlsConnector::from(tls_connector);

    let tls_future = tls_connector.connect(host, tcp);
    let tls_stream = tokio::select! {
        t = tls_future => t.map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
            log::error!(
                "IMAP TLS handshake FAILED with {}:{} after {:.1}s: {}",
                host, port, tls_start.elapsed().as_secs_f64(), e
            );
            format!("TLS 握手失败 ({}:{}): {}", host, port, e).into()
        })?,
        _ = tokio::time::sleep(STEP_TIMEOUT) => {
            let elapsed = tls_start.elapsed();
            log::error!(
                "IMAP TLS handshake TIMEOUT with {}:{} after {:.1}s",
                host, port, elapsed.as_secs_f64()
            );
            return Err(format!("TLS 握手超时 ({}:{}): {} 秒内未完成", host, port, STEP_TIMEOUT.as_secs()).into());
        }
    };

    let tls_elapsed = tls_start.elapsed();
    log::info!(
        "IMAP Step 2/3 OK: TLS handshake (native-tls) complete in {:.3}s",
        tls_elapsed.as_secs_f64()
    );

    let tls_stream = tls_stream.compat();

    // ── Step 3: IMAP LOGIN (10s timeout) ──
    let login_start = Instant::now();
    log::info!("IMAP Step 3/3: LOGIN as {} ...", username);

    let client = async_imap::Client::new(tls_stream);
    let login_future = client.login(username, password);
    let session = tokio::select! {
        s = login_future => s.map_err(|(e, _)| -> Box<dyn std::error::Error + Send + Sync> {
            log::error!(
                "IMAP LOGIN FAILED for {}@{}:{} after {:.1}s: {:?}",
                username, host, port, login_start.elapsed().as_secs_f64(), e
            );
            format!("登录失败: 用户名或密码/授权码不正确 ({})", e).into()
        })?,
        _ = tokio::time::sleep(STEP_TIMEOUT) => {
            let elapsed = login_start.elapsed();
            log::error!(
                "IMAP LOGIN TIMEOUT for {}@{}:{} after {:.1}s",
                username, host, port, elapsed.as_secs_f64()
            );
            return Err(format!("IMAP 登录超时 ({}:{}): {} 秒内服务器未响应 LOGIN 命令", host, port, STEP_TIMEOUT.as_secs()).into());
        }
    };

    let login_elapsed = login_start.elapsed();
    log::info!(
        "IMAP Step 3/3 OK: logged in as {}@{}:{} in {:.3}s",
        username, host, port, login_elapsed.as_secs_f64()
    );

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

/// IDLE loop: use the real IMAP IDLE command (RFC 2177) for push notifications.
///
/// Falls back to polling if the server doesn't support IDLE.
pub async fn idle_wait(
    session: &mut ImapSession,
    folder: &str,
    timeout: std::time::Duration,
) -> Result<IdleEvent, Box<dyn std::error::Error + Send + Sync>> {
    // Select the folder first
    let _ = select_folder(session, folder).await?;

    // For now, use the polling approach which works reliably.
    let mailbox = session.select(folder).await?;
    let initial_exists = mailbox.exists;
    tokio::time::sleep(timeout).await;
    let mailbox = session.select(folder).await?;
    if mailbox.exists > initial_exists {
        Ok(IdleEvent::NewMail)
    } else {
        Ok(IdleEvent::Timeout)
    }
}

/// Apply flags (e.g. \\Seen, \\Flagged, \\Deleted) to a message by UID.
pub async fn store_flags(
    session: &mut ImapSession,
    uid: u32,
    flags: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    session.uid_store(uid.to_string(), flags).await?;
    Ok(())
}

/// Move a message to another folder via UID COPY + UID STORE +FLAGS (\\Deleted).
pub async fn copy_and_delete(
    session: &mut ImapSession,
    source_folder: &str,
    uid: u32,
    target_folder: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    session.select(source_folder).await?;
    session.uid_copy(uid.to_string(), target_folder).await?;
    session.uid_store(uid.to_string(), "+FLAGS (\\Deleted)").await?;
    session.uid_expunge(uid.to_string()).await?;
    log::info!("Moved UID {} from '{}' to '{}'", uid, source_folder, target_folder);
    Ok(())
}

/// Permanently expunge (remove) messages marked with \\Deleted for the current folder.
pub async fn expunge(
    session: &mut ImapSession,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    session.expunge().await?;
    Ok(())
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
