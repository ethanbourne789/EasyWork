//! IMAP/SMTP auto-discovery via Mozilla autoconfig XML.
//!
//! Tries (in order) on user-input email `user@domain`:
//!  1. Hardcoded provider configs (for domains without autoconfig XML)
//!  2. `https://autoconfig.{domain}/mail/config-v1.1.xml` (RFC 6186 style, Mozilla)
//!  3. `https://{domain}/.well-known/autoconfig/mail/config-v1.1.xml` (well-known)
//!  4. `https://autoconfig.{domain}/.well-known/autoconfig/mail/config-v1.1.xml` (combined)
//!
//! If a config is found, returns IMAP/SMTP host+port+security.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub protocol: String, // "imap" or "smtp"
    pub hostname: String,
    pub port: u16,
    /// "ssl" (implicit TLS) or "starttls" (STARTTLS) or "none"
    pub socket_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutoconfigResult {
    pub email: String,
    pub domain: String,
    pub imap: Option<ServerConfig>,
    pub smtp: Option<ServerConfig>,
    /// Whether the config came from a successful autoconfig lookup.
    pub source: String,
    pub error: Option<String>,
}

/// Hardcoded provider configs for domains that don't publish autoconfig XML.
/// Format: domain -> (imap, smtp)
fn hardcoded_provider(domain: &str) -> Option<(ServerConfig, ServerConfig)> {
    match domain {
        "jasolar.com" => Some((
            ServerConfig {
                protocol: "imap".into(),
                hostname: "imaphz.qiye.163.com".into(),
                port: 993,
                socket_type: "ssl".into(),
            },
            ServerConfig {
                protocol: "smtp".into(),
                hostname: "smtphz.qiye.163.com".into(),
                port: 465,
                socket_type: "ssl".into(),
            },
        )),
        _ => None,
    }
}

#[tauri::command]
pub async fn autodiscover_account(email: String) -> Result<AutoconfigResult, String> {
    let trace_id = crate::logging::trace_id();
    let trimmed = email.trim().to_lowercase();
    let at_pos = trimmed.find('@').ok_or_else(|| "邮箱格式错误（缺少 @）".to_string())?;
    let domain = trimmed[at_pos + 1..].trim().to_string();
    if domain.is_empty() {
        return Err("邮箱域名不能为空".to_string());
    }

    log::info!("[{}] autodiscover START {}", trace_id, serde_json::json!({"email": trimmed, "domain": domain}));

    let mut imap_cfg: Option<ServerConfig> = None;
    let mut smtp_cfg: Option<ServerConfig> = None;
    let mut source = String::new();
    let mut last_error: Option<String> = None;

    // Step 1: Check hardcoded provider configs (fast, no network)
    if let Some((imap, smtp)) = hardcoded_provider(&domain) {
        log::info!("[{}] Using hardcoded config for {}", trace_id, domain);
        imap_cfg = Some(imap);
        smtp_cfg = Some(smtp);
        source = "hardcoded".to_string();
    } else {
        // Step 2: Try Mozilla autoconfig URLs
        let urls = [
            format!("https://autoconfig.{}/mail/config-v1.1.xml", domain),
            format!("https://{}/.well-known/autoconfig/mail/config-v1.1.xml", domain),
            format!("https://autoconfig.{}/.well-known/autoconfig/mail/config-v1.1.xml", domain),
        ];

        for url in urls.iter() {
            match fetch_autoconfig(url, &domain).await {
                Ok(Some((imap, smtp))) => {
                    imap_cfg = imap;
                    smtp_cfg = smtp;
                    source = url.clone();
                    break;
                }
                Ok(None) => {} // not found, try next
                Err(e) => {
                    log::debug!("[{}] autodiscover URL {} failed: {}", trace_id, url, e);
                    last_error = Some(e);
                }
            }
        }
    }

    let result = serde_json::json!({
        "domain": domain,
        "imap_found": imap_cfg.is_some(),
        "smtp_found": smtp_cfg.is_some(),
        "source": source,
    });
    log::info!("[{}] autodiscover SUCCESS {}", trace_id, result);

    Ok(AutoconfigResult {
        email: trimmed,
        domain,
        imap: imap_cfg,
        smtp: smtp_cfg,
        source,
        error: last_error,
    })
}

async fn fetch_autoconfig(url: &str, _domain: &str) -> Result<Option<(Option<ServerConfig>, Option<ServerConfig>)>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent("EasyWork/0.1")
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;
    let resp = client.get(url).send().await.map_err(|e| format!("HTTP 请求失败: {}", e))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("HTTP 状态码 {}", resp.status()));
    }
    let body = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    parse_autoconfig_xml(&body)
}

/// Minimal XML parser for Mozilla autoconfig (we avoid pulling in a heavy XML crate
/// by doing a simple element walk).
fn parse_autoconfig_xml(xml: &str) -> Result<Option<(Option<ServerConfig>, Option<ServerConfig>)>, String> {
    use std::sync::OnceLock;
    use regex::Regex;

    static SERVER_RE: OnceLock<Regex> = OnceLock::new();
    let server_re = SERVER_RE.get_or_init(|| {
        Regex::new(r#"(?s)<incomingServer[^>]*type="imap"[^>]*>.*?</incomingServer>"#).unwrap()
    });
    static SMTP_RE: OnceLock<Regex> = OnceLock::new();
    let smtp_re = SMTP_RE.get_or_init(|| {
        Regex::new(r#"(?s)<outgoingServer[^>]*type="smtp"[^>]*>.*?</outgoingServer>"#).unwrap()
    });
    static HOST_RE: OnceLock<Regex> = OnceLock::new();
    let host_re = HOST_RE.get_or_init(|| Regex::new(r"<hostname>([^<]+)</hostname>").unwrap());
    static PORT_RE: OnceLock<Regex> = OnceLock::new();
    let port_re = PORT_RE.get_or_init(|| Regex::new(r"<port>([^<]+)</port>").unwrap());
    static SOCKET_RE: OnceLock<Regex> = OnceLock::new();
    let socket_re = SOCKET_RE.get_or_init(|| Regex::new(r"<socketType>([^<]+)</socketType>").unwrap());

    let imap_match = server_re.find(xml);
    let smtp_match = smtp_re.find(xml);

    let parse = |server_xml: &str| -> Option<ServerConfig> {
        let host = host_re.captures(server_xml)?.get(1)?.as_str().trim().to_string();
        let port: u16 = port_re.captures(server_xml)?.get(1)?.as_str().trim().parse().ok()?;
        let socket = socket_re.captures(server_xml)?.get(1)?.as_str().trim().to_string();
        Some(ServerConfig {
            protocol: if server_xml.contains("type=\"imap\"") { "imap".into() } else { "smtp".into() },
            hostname: host,
            port,
            socket_type: socket.to_lowercase(),
        })
    };

    let imap_cfg = imap_match.and_then(|m| parse(m.as_str()));
    let smtp_cfg = smtp_match.and_then(|m| parse(m.as_str()));

    if imap_cfg.is_none() && smtp_cfg.is_none() {
        return Ok(None);
    }
    Ok(Some((imap_cfg, smtp_cfg)))
}
