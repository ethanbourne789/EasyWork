use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use std::net::IpAddr;
use futures::{StreamExt, TryStreamExt};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

// ── TLS backend selection ──────────────────────────────────────────
// Android: use rustls (no vendored OpenSSL headache)
// Desktop (native-tls feature): use native-tls (OS trust store)
#[cfg(feature = "desktop-native-tls")]
type TlsStreamType = tokio_native_tls::TlsStream<tokio::net::TcpStream>;

#[cfg(not(feature = "desktop-native-tls"))]
type TlsStreamType = tokio_rustls::client::TlsStream<tokio::net::TcpStream>;

/// Wrapper enum that can hold either a plain TCP stream or a TLS stream.
/// Implements AsyncRead + AsyncWrite so async_imap can use either transparently.
pub enum MaybeTlsStream {
    Plain(tokio::net::TcpStream),
    Tls(TlsStreamType),
}

impl AsyncRead for MaybeTlsStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_read(cx, buf),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for MaybeTlsStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_write(cx, buf),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_write(cx, buf),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_flush(cx),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_flush(cx),
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            MaybeTlsStream::Plain(s) => Pin::new(s).poll_shutdown(cx),
            MaybeTlsStream::Tls(s) => Pin::new(s).poll_shutdown(cx),
        }
    }
}

// Implement futures traits via tokio_util::compat
impl futures::AsyncRead for MaybeTlsStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<std::io::Result<usize>> {
        let mut read_buf = ReadBuf::new(buf);
        match tokio::io::AsyncRead::poll_read(self, cx, &mut read_buf) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(read_buf.filled().len())),
            Poll::Ready(Err(e)) => Poll::Ready(Err(e)),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl futures::AsyncWrite for MaybeTlsStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        tokio::io::AsyncWrite::poll_write(self, cx, buf)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        tokio::io::AsyncWrite::poll_flush(self, cx)
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        tokio::io::AsyncWrite::poll_shutdown(self, cx)
    }
}

impl std::fmt::Debug for MaybeTlsStream {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MaybeTlsStream::Plain(_) => f.debug_tuple("Plain").finish(),
            MaybeTlsStream::Tls(_) => f.debug_tuple("Tls").finish(),
        }
    }
}

pub type ImapSession = async_imap::Session<MaybeTlsStream>;

/// Timeout per individual step (TCP, TLS, LOGIN)
const STEP_TIMEOUT: Duration = Duration::from_secs(10);
/// Overall connection timeout
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(30);

// ── BUG-1 fix: Global shared rustls ClientConfig ───────────────────
// Build once, reuse for all connections. Saves ~140 cert clones per connection.
#[cfg(not(feature = "desktop-native-tls"))]
static RUSTLS_CONFIG: std::sync::OnceLock<Arc<rustls::ClientConfig>> = std::sync::OnceLock::new();

#[cfg(not(feature = "desktop-native-tls"))]
fn get_rustls_config() -> Arc<rustls::ClientConfig> {
    RUSTLS_CONFIG.get_or_init(|| {
        let mut root_store = rustls::RootCertStore::empty();
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

        // BUG-3 fix: Enable TLS session resumption for faster reconnects
        let config = rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth();

        Arc::new(config)
    }).clone()
}

// ── BUG-2 fix: Parse host as IP address or DNS name ────────────────
#[cfg(not(feature = "desktop-native-tls"))]
fn parse_server_name(host: &str) -> Result<rustls::pki_types::ServerName<'static>, Box<dyn std::error::Error + Send + Sync>> {
    // Try IP address first
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(rustls::pki_types::ServerName::IpAddress(ip.into()));
    }
    // Fall back to DNS name
    rustls::pki_types::ServerName::try_from(host.to_string())
        .map(|name| name.to_owned())
        .map_err(|e| format!("无效的服务器主机名 '{}': {:?}", host, e).into())
}

pub async fn connect(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    use_tls: bool,
) -> Result<ImapSession, Box<dyn std::error::Error + Send + Sync>> {
    let overall_start = Instant::now();

    // Race the entire connection against a 30-second timer.
    let result = tokio::select! {
        result = connection_attempt(host, port, username, password, use_tls) => result,
        _ = tokio::time::sleep(CONNECTION_TIMEOUT) => {
            let elapsed = overall_start.elapsed();
            log::warn!(
                "IMAP connection timed out after {:.1}s: {}:{}",
                elapsed.as_secs_f64(), host, port
            );
            return Err(format!(
                "IMAP 连接超时 ({}:{}): 连接过程超过 {} 秒",
                host, port, CONNECTION_TIMEOUT.as_secs()
            ).into());
        }
    };

    match result {
        Ok(session) => {
            let elapsed = overall_start.elapsed();
            log::info!(
                "IMAP connect OK to {}:{} as {} in {:.1}s (tls={})",
                host, port, username, elapsed.as_secs_f64(), use_tls
            );
            Ok(session)
        }
        Err(e) => {
            let elapsed = overall_start.elapsed();
            log::warn!(
                "IMAP connection failed after {:.1}s: {}:{} - {}",
                elapsed.as_secs_f64(), host, port, e
            );
            Err(e)
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
    use_tls: bool,
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

    // ── BUG-4 fix: Set TCP keepalive ───────────────────────────────
    // Detect dead connections on Android when network switches or Doze mode activates
    let tcp = {
        use socket2::{SockRef, TcpKeepalive};
        let sock_ref = SockRef::from(&tcp);
        let keepalive = TcpKeepalive::new()
            .with_time(Duration::from_secs(60))
            .with_interval(Duration::from_secs(15));
        if let Err(e) = sock_ref.set_tcp_keepalive(&keepalive) {
            log::warn!("Failed to set TCP keepalive: {}", e);
        }
        tcp
    };

    let tcp_elapsed = tcp_start.elapsed();
    let peer_addr = tcp.peer_addr().map(|a| a.to_string()).unwrap_or_else(|_| "?".into());
    log::info!(
        "IMAP Step 1/3 OK: TCP connected to {} (resolved to {}) in {:.3}s",
        host, peer_addr, tcp_elapsed.as_secs_f64()
    );

    // ── BUG-5 fix: Respect use_tls flag ────────────────────────────
    // If use_tls is false, skip TLS and use plain TCP (insecure)
    let stream = if !use_tls {
        log::warn!("IMAP: connecting WITHOUT TLS to {}:{} (insecure!)", host, port);
        MaybeTlsStream::Plain(tcp)
    } else {
        // ── Step 2: TLS handshake (10s timeout) ──
        #[cfg(feature = "desktop-native-tls")]
        {
            let tls_start = Instant::now();
            log::info!("IMAP Step 2/3: TLS handshake (native-tls) with {}:{} ...", host, port);

            let tls_connector = native_tls::TlsConnector::builder()
                .build()
                .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                    log::error!("IMAP TLS: failed to build native connector: {}", e);
                    format!("TLS 初始化失败: {}", e).into()
                })?;
            let tls_connector = tokio_native_tls::TlsConnector::from(tls_connector);

            let tls_future = tls_connector.connect(host, tcp);
            let stream: tokio_native_tls::TlsStream<tokio::net::TcpStream> = tokio::select! {
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

            MaybeTlsStream::Tls(stream)
        }

        #[cfg(not(feature = "desktop-native-tls"))]
        {
            let tls_start = Instant::now();
            log::info!("IMAP Step 2/3: TLS handshake (rustls) with {}:{} ...", host, port);

            let config = get_rustls_config();
            let tls_connector = tokio_rustls::TlsConnector::from(config);

            let server_name = parse_server_name(host)?;

            // 方案一：增强超时处理，添加更详细的日志
            let tls_future = tls_connector.connect(server_name, tcp);

            // 使用 tokio::time::timeout 替代 tokio::select!，更可靠的超时机制
            let stream = match tokio::time::timeout(STEP_TIMEOUT, tls_future).await {
                Ok(result) => result.map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                    let elapsed = tls_start.elapsed();
                    log::error!(
                        "IMAP TLS handshake FAILED with {}:{} after {:.3}s: {}",
                        host, port, elapsed.as_secs_f64(), e
                    );
                    format!("TLS 握手失败 ({}:{}): {}", host, port, e).into()
                })?,
                Err(_) => {
                    let elapsed = tls_start.elapsed();
                    log::error!(
                        "IMAP TLS handshake TIMEOUT with {}:{} after {:.3}s (rustls 握手超时)",
                        host, port, elapsed.as_secs_f64()
                    );
                    return Err(format!(
                        "TLS 握手超时 ({}:{}): {} 秒内未完成，可能是 rustls 与服务器不兼容",
                        host, port, STEP_TIMEOUT.as_secs()
                    ).into());
                }
            };

            let tls_elapsed = tls_start.elapsed();
            log::info!(
                "IMAP Step 2/3 OK: TLS handshake (rustls) complete in {:.3}s",
                tls_elapsed.as_secs_f64()
            );

            MaybeTlsStream::Tls(stream)
        }
    };

    login_imap(stream, host, port, username, password).await
}

/// Common IMAP LOGIN step (Step 3/3)
async fn login_imap(
    stream: MaybeTlsStream,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<ImapSession, Box<dyn std::error::Error + Send + Sync>> {
    let login_start = Instant::now();
    log::info!("IMAP Step 3/3: LOGIN as {} ...", username);

    let client = async_imap::Client::new(stream);
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
        let raw_name = item.name().to_string();

        // Decode IMAP UTF-7 encoded folder names (e.g. &g0l6P3ux- -> 草稿箱)
        let name_str = decode_imap_utf7(&raw_name);

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

        // Store with decoded display name, using raw name as remote_id for folder selection
        folders.push((raw_name.clone(), name_str, role.to_string()));
    }

    Ok(folders)
}

/// Decode an IMAP UTF-7 string (RFC 3501 section 5.1.3).
/// Converts e.g. `&g0l6P3ux-` to `草稿箱`.
/// BUG-9 fix: Properly handle UTF-16 surrogate pairs for characters outside BMP.
fn decode_imap_utf7(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'&' {
            // Find the terminating '-'
            let start = i + 1;
            if start < bytes.len() && bytes[start] == b'-' {
                // "&-" represents a literal "&"
                result.push('&');
                i = start + 1;
                continue;
            }
            // Find end marker '-'
            if let Some(end) = bytes[start..].iter().position(|&b| b == b'-') {
                let encoded = &bytes[start..start + end];
                // Decode modified Base64: ',' -> '+' (RFC 3501)
                let b64: String = encoded.iter().map(|&b| if b == b',' { '+' } else { b as char }).collect();
                // Pad to multiple of 4 for standard base64 decode
                let padded = pad_base64(&b64);
                match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, padded.as_bytes()) {
                    Ok(decoded) => {
                        // Convert UTF-16BE bytes to chars, handling surrogate pairs
                        let mut chars = Vec::new();
                        let mut j = 0;
                        while j + 1 < decoded.len() {
                            let unit = u16::from_be_bytes([decoded[j], decoded[j + 1]]);
                            j += 2;

                            // Check for high surrogate (0xD800-0xDBFF)
                            if (0xD800..=0xDBFF).contains(&unit) {
                                // Need low surrogate
                                if j + 1 < decoded.len() {
                                    let low = u16::from_be_bytes([decoded[j], decoded[j + 1]]);
                                    j += 2;
                                    if (0xDC00..=0xDFFF).contains(&low) {
                                        // Valid surrogate pair
                                        let code_point = 0x10000 + ((unit as u32 - 0xD800) << 10) + (low as u32 - 0xDC00);
                                        if let Some(ch) = char::from_u32(code_point) {
                                            chars.push(ch);
                                        } else {
                                            log::warn!("UTF-7 decode: invalid code point U+{:X}", code_point);
                                            chars.push('\u{FFFD}');
                                        }
                                    } else {
                                        // Invalid low surrogate
                                        log::warn!("UTF-7 decode: invalid low surrogate 0x{:04X}", low);
                                        chars.push('\u{FFFD}');
                                        // Don't advance j, try to decode low as standalone
                                        j -= 2;
                                    }
                                } else {
                                    // Truncated surrogate pair
                                    log::warn!("UTF-7 decode: truncated surrogate pair");
                                    chars.push('\u{FFFD}');
                                }
                            } else if (0xDC00..=0xDFFF).contains(&unit) {
                                // Unexpected low surrogate
                                log::warn!("UTF-7 decode: unexpected low surrogate 0x{:04X}", unit);
                                chars.push('\u{FFFD}');
                            } else {
                                // Regular BMP character
                                if let Some(ch) = char::from_u32(unit as u32) {
                                    chars.push(ch);
                                } else {
                                    log::warn!("UTF-7 decode: invalid char 0x{:04X}", unit);
                                    chars.push('\u{FFFD}');
                                }
                            }
                        }
                        for ch in chars {
                            result.push(ch);
                        }
                    }
                    Err(e) => {
                        log::warn!("UTF-7 base64 decode failed for segment '{}': {}", b64, e);
                        // Keep the original encoded segment as fallback
                        result.push_str(&input[i..start + end + 1]);
                    }
                }
                i = start + end + 1; // skip past the '-'
            } else {
                // No terminator, treat '&' as literal
                result.push('&');
                i += 1;
            }
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }
    result
}

fn pad_base64(s: &str) -> String {
    let len = s.len();
    let padded_len = ((len + 3) / 4) * 4;
    let mut result = s.to_string();
    while result.len() < padded_len {
        result.push('=');
    }
    result
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
    // Outbox
    if leaf.contains("outbox") || leaf.contains("发件箱") || leaf.contains("待发送") {
        return "outbox";
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

#[allow(dead_code)]
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

/// Fetch a single message by UID and return the full raw bytes.
/// Used by download_attachment to retrieve a specific message on demand.
#[allow(dead_code)]
pub async fn fetch_message_raw_by_uid(
    session: &mut ImapSession,
    uid: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let fetch_cmd = "(UID BODY.PEEK[])";
    let stream = session.uid_fetch(uid.to_string(), fetch_cmd).await?;
    use futures::TryStreamExt;
    let fetches: Vec<async_imap::types::Fetch> = stream.try_collect().await?;

    for fetch in &fetches {
        if fetch.uid == Some(uid) {
            if let Some(body) = fetch.body() {
                return Ok(body.to_vec());
            }
        }
    }
    Err(format!("No body returned for UID {}", uid).into())
}

/// Fetch only message headers (no body/attachments) by UID list.
/// Uses (UID BODY.PEEK[HEADER] FLAGS) — much faster than fetching full bodies
/// for first sync or header-only operations.
#[allow(dead_code)]
pub async fn fetch_messages_headers_batch(
    session: &mut ImapSession,
    uids: &[u32],
) -> Result<Vec<(u32, Vec<u8>, bool, bool)>, Box<dyn std::error::Error + Send + Sync>> {
    if uids.is_empty() {
        return Ok(Vec::new());
    }

    let uid_set = uids.iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    // Fetch only the RFC 2822 header section — no body, no attachments
    let fetch_cmd = "(UID BODY.PEEK[HEADER] FLAGS)";

    log::info!(
        "Fetching headers-only for {} UIDs from set {{{}}}",
        uids.len(),
        if uid_set.len() > 80 { format!("{}...", &uid_set[..80]) } else { uid_set.clone() }
    );

    let stream = session.uid_fetch(uid_set, fetch_cmd).await?;
    let fetches: Vec<async_imap::types::Fetch> = stream.try_collect().await?;

    let mut results = Vec::new();
    for fetch in &fetches {
        match (fetch.uid, fetch.header()) {
            (Some(uid), Some(header_bytes)) => {
                let flags: Vec<_> = fetch.flags().collect();
                // BUG-10 fix: Use pattern matching instead of Debug format comparison
                let is_read = flags.iter().any(|f| matches!(f, async_imap::types::Flag::Seen));
                let is_starred = flags.iter().any(|f| matches!(f, async_imap::types::Flag::Flagged));
                results.push((uid, header_bytes.to_vec(), is_read, is_starred));
            }
            (uid_opt, header_opt) => {
                log::debug!(
                    "Header fetch item: uid={:?} header={} bytes",
                    uid_opt,
                    header_opt.map_or(0, |b| b.len())
                );
            }
        }
    }

    log::info!(
        "Fetched {}/{} headers",
        results.len(),
        uids.len()
    );
    Ok(results)
}

/// Check for new messages quickly by comparing highest UID in DB vs server.
/// Returns the count of new UIDs found (none of them fetched yet).
#[allow(dead_code)]
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
                let flags: Vec<_> = fetch.flags().collect();
                // BUG-10 fix: Use pattern matching instead of Debug format comparison
                let is_read = flags.iter().any(|f| matches!(f, async_imap::types::Flag::Seen));
                let is_starred = flags.iter().any(|f| matches!(f, async_imap::types::Flag::Flagged));
                results.push((uid, is_read, is_starred));
            }
        }
    }

    log::info!("Fetched flags for {} messages", results.len());
    Ok(results)
}

/// IDLE loop: real IMAP IDLE command (RFC 2177) for push notifications.
///
/// Replaces the previous polling-sleep implementation (Bug #2). The server
/// keeps the connection in `+ idling` state and pushes unilateral
/// `EXISTS`/`RECENT` updates whenever the mailbox changes. The client MUST
/// renew the IDLE state every 29 minutes (RFC 2177 §2) to avoid the server
/// unilaterally closing the connection. We use `wait_with_timeout(29min)` so
/// the loop self-renews without external timers.
///
/// Takes the session **by value** because the IDLE handle consumes the
/// session for the duration of the wait, and `handle.done().await` returns
/// a fresh `Session` that we hand back to the caller.
///
/// Falls back to polling if the server doesn't support IDLE (returns a
/// `NO`/`BAD` for the IDLE command).
pub async fn idle_wait(
    session: ImapSession,
    folder: &str,
    timeout: std::time::Duration,
) -> Result<(ImapSession, IdleEvent), Box<dyn std::error::Error + Send + Sync>> {
    // ── Bug #2 fix: real RFC 2177 IDLE ──
    // 1. SELECT the folder (IDLE works on the currently selected mailbox).
    //    We do this in a small inline block that takes `session` back by
    //    value and gives it back to the IDLE handle so we never fight the
    //    borrow checker.
    let session = match select_for_idle(session, folder).await? {
        SelectForIdle::Ok(s) => s,
        SelectForIdle::FailBack(s) => {
            // SELECT itself failed — most likely auth/connection issue.
            return Ok((s, IdleEvent::Timeout));
        }
    };

    // 2. Acquire the IDLE handle (consumes the session) and send IDLE.
    let mut handle = session.idle();
    if let Err(e) = handle.init().await {
        // BUG-8 fix: IDLE init failed, try to recover session gracefully
        log::warn!("IDLE init failed for '{}', attempting session recovery: {}", folder, e);
        // Try to call done() to get the session back, but don't propagate error
        // If done() also fails, we'll just return Timeout and let caller reconnect
        match handle.done().await {
            Ok(session) => {
                log::info!("IDLE init failed but session recovered, falling back to polling");
                return idle_polling_fallback(session, folder, timeout).await;
            }
            Err(recovery_err) => {
                log::warn!("IDLE init failed and session recovery also failed: {}", recovery_err);
                // Return a dummy session - caller will need to reconnect
                // This is a rare edge case; the caller's error handling will reconnect
                return Err(format!("IDLE init failed and could not recover session: {}", recovery_err).into());
            }
        }
    }

    // 3. Wait for server push (or our timeout). Cap the inner timeout at 29 min
    //    (RFC 2177 §2 — servers may close after that). The outer `timeout` arg
    //    remains a soft upper bound for the caller; we choose the smaller.
    let idle_window = std::cmp::min(timeout, std::time::Duration::from_secs(29 * 60));
    let (wait_fut, _stop) = handle.wait_with_timeout(idle_window);

    // 4. If the outer caller-supplied `timeout` is shorter than 29 minutes,
    //    additionally race a `tokio::time::sleep` so the caller can also
    //    re-enter this function for any reason (UI refresh, app pause, etc.).
    let event_result: Result<async_imap::extensions::idle::IdleResponse, _> = if timeout < idle_window {
        tokio::select! {
            res = wait_fut => res,
            _ = tokio::time::sleep(timeout) => Ok(async_imap::extensions::idle::IdleResponse::Timeout),
        }
    } else {
        wait_fut.await
    };

    // 5. Always send DONE before letting the handle go out of scope, so the
    //    server releases the mailbox and we get the session back.
    let session = handle.done().await?;

    let event = event_result?;
    let idle_event = match event {
        async_imap::extensions::idle::IdleResponse::NewData(_) => IdleEvent::NewMail,
        async_imap::extensions::idle::IdleResponse::Timeout => IdleEvent::Timeout,
        async_imap::extensions::idle::IdleResponse::ManualInterrupt => IdleEvent::Timeout,
    };
    Ok((session, idle_event))
}

enum SelectForIdle {
    Ok(ImapSession),
    FailBack(ImapSession),
}

/// SELECT the folder and hand the session back. If SELECT fails we return
/// `FailBack` so the caller can choose a polling path without unwinding.
async fn select_for_idle(
    mut session: ImapSession,
    folder: &str,
) -> Result<SelectForIdle, Box<dyn std::error::Error + Send + Sync>> {
    match select_folder(&mut session, folder).await {
        Ok(_) => Ok(SelectForIdle::Ok(session)),
        Err(e) => {
            log::warn!("IDLE pre-select failed for '{}': {}", folder, e);
            Ok(SelectForIdle::FailBack(session))
        }
    }
}

/// Polling fallback when IDLE is unsupported. Re-selects the folder after a
/// sleep and reports whether the message count changed.
async fn idle_polling_fallback(
    mut session: ImapSession,
    folder: &str,
    timeout: std::time::Duration,
) -> Result<(ImapSession, IdleEvent), Box<dyn std::error::Error + Send + Sync>> {
    let mailbox = match select_folder(&mut session, folder).await {
        Ok(m) => m,
        Err(e) => {
            log::warn!("Polling fallback: select '{}' failed: {}", folder, e);
            return Ok((session, IdleEvent::Timeout));
        }
    };
    let initial_exists = mailbox.exists;
    tokio::time::sleep(timeout).await;
    let mailbox = match select_folder(&mut session, folder).await {
        Ok(m) => m,
        Err(_) => return Ok((session, IdleEvent::Timeout)),
    };
    let event = if mailbox.exists > initial_exists {
        IdleEvent::NewMail
    } else {
        IdleEvent::Timeout
    };
    Ok((session, event))
}

/// Apply flags (e.g. \\Seen, \\Flagged, \\Deleted) to a message by UID.
pub async fn store_flags(
    session: &mut ImapSession,
    uid: u32,
    flags: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use futures::TryStreamExt;
    let stream = session.uid_store(uid.to_string(), flags).await?;
    let _: Vec<_> = stream.try_collect().await?;
    Ok(())
}

/// Move a message to another folder via UID COPY + UID STORE +FLAGS (\\Deleted).
pub async fn copy_and_delete(
    session: &mut ImapSession,
    source_folder: &str,
    uid: u32,
    target_folder: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use futures::TryStreamExt;
    session.select(source_folder).await?;
    session.uid_copy(uid.to_string(), target_folder).await?;
    let stream1 = session.uid_store(uid.to_string(), "+FLAGS (\\Deleted)").await?;
    let _: Vec<_> = stream1.try_collect().await?;
    let stream2 = session.uid_expunge(uid.to_string()).await?;
    let _: Vec<_> = stream2.try_collect().await?;
    log::info!("Moved UID {} from '{}' to '{}'", uid, source_folder, target_folder);
    Ok(())
}

/// Permanently expunge (remove) messages marked with \\Deleted for the current folder.
pub async fn expunge(
    session: &mut ImapSession,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use futures::TryStreamExt;
    let stream = session.expunge().await?;
    let _: Vec<_> = stream.try_collect().await?;
    Ok(())
}

/// Result of IDLE monitoring.
#[derive(Debug, Clone)]
pub enum IdleEvent {
    NewMail,
    Timeout,
}

/// Check for folder changes by comparing UID counts (fallback when IDLE unsupported).
#[allow(dead_code)]
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
