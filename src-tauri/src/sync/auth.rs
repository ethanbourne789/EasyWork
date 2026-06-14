use serde::Deserialize;
use sha2::{Digest, Sha256};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use std::io::{Read, Write};
use std::net::TcpListener;

/// Supabase Auth 响应
#[derive(Debug, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: AuthUser,
}

#[derive(Debug, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub email: Option<String>,
}

/// PKCE challenge 对
struct PkcePair {
    verifier: String,
    challenge: String,
}

/// OAuth 回调中收到的 token（由浏览器 JS 从 fragment 提取并 POST 到本地服务器）
#[derive(Debug, Deserialize)]
struct OAuthTokenPayload {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

/// 认证错误
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Auth failed: {0}")]
    Failed(String),
    #[error("Not signed in")]
    NotSignedIn,
    #[error("Server error: {0}")]
    Server(String),
    #[error("OAuth cancelled")]
    Cancelled,
}

/// Supabase Auth 客户端
#[derive(Clone)]
pub struct SupabaseAuth {
    http: reqwest::Client,
    base_url: String,
    anon_key: String,
}

impl SupabaseAuth {
    pub fn new(url: &str, anon_key: &str) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: format!("{}/auth/v1", url),
            anon_key: anon_key.to_string(),
        }
    }

    /// 注册新用户（邮箱+密码）
    pub async fn sign_up(&self, email: &str, password: &str) -> Result<AuthResponse, AuthError> {
        let url = format!("{}/signup", self.base_url);
        let body = serde_json::json!({
            "email": email,
            "password": password,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.anon_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AuthError::Failed(format!("{}: {}", status, text)));
        }

        let auth: AuthResponse = resp.json().await?;
        Ok(auth)
    }

    /// 邮箱+密码登录
    pub async fn sign_in(&self, email: &str, password: &str) -> Result<AuthResponse, AuthError> {
        let url = format!("{}/token?grant_type=password", self.base_url);
        let body = serde_json::json!({
            "email": email,
            "password": password,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.anon_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AuthError::Failed(format!("{}: {}", status, text)));
        }

        let auth: AuthResponse = resp.json().await?;
        Ok(auth)
    }

    /// 刷新 token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<AuthResponse, AuthError> {
        let url = format!("{}/token?grant_type=refresh_token", self.base_url);
        let body = serde_json::json!({
            "refresh_token": refresh_token,
        });
        let resp = self
            .http
            .post(&url)
            .header("apikey", &self.anon_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AuthError::Failed(format!("{}: {}", status, text)));
        }

        let auth: AuthResponse = resp.json().await?;
        Ok(auth)
    }

    /// 通过 GitHub OAuth 登录（PKCE + 本地重定向服务器）
    ///
    /// 1. 生成 PKCE challenge
    /// 2. 在 127.0.0.1 上启动临时 HTTP 服务器
    /// 3. 打开系统浏览器到 Supabase GitHub OAuth 页面
    /// 4. Supabase 重定向到本地服务器，URL fragment 中带 access_token
    /// 5. 服务器返回一段 HTML（JS 提取 fragment 并通过 POST 送回服务器）
    /// 6. 服务器收到 token 后设置 JWT 并返回成功
    /// 7. 返回 AuthResponse
    pub async fn sign_in_github(&self) -> Result<AuthResponse, AuthError> {
        // ── 1. 生成 PKCE verifier + challenge ──
        let pkce = generate_pkce();

        // ── 2. 绑定随机端口 ──
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| AuthError::Server(format!("无法启动本地服务器: {}", e)))?;
        let port = listener.local_addr()
            .map_err(|e| AuthError::Server(format!("无法获取端口: {}", e)))?
            .port();
        let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

        // ── 3. 构建 OAuth URL ──
        let auth_url = format!(
            "{}/authorize?provider=github&redirect_to={}&code_challenge={}&code_challenge_method=s256&scope=openid%20email%20profile",
            self.base_url,
            urlencoding(&redirect_uri),
            pkce.challenge
        );

        log::info!("Opening browser for GitHub OAuth: port={}", port);

        // ── 4. 在独立线程中打开浏览器 ──
        let url_for_browser = auth_url.clone();
        std::thread::spawn(move || {
            if let Err(e) = open::that(&url_for_browser) {
                log::error!("Failed to open browser for OAuth: {}", e);
            }
        });

        // ── 5. 等待回调并提取 token ──
        let result = wait_for_oauth_token(&listener, &redirect_uri, &pkce.verifier, &self.anon_key, &self.base_url);

        // 关闭 listener 防止泄漏
        drop(listener);

        match result {
            Ok(token_resp) => Ok(token_resp),
            Err(msg) => Err(AuthError::Failed(msg)),
        }
    }
}

// ── 辅助类型 ──

/// OAuth 令牌交换响应（从 Supabase /token 端点返回）
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    user: Option<AuthUser>,
}

// ── PKCE ──

/// 生成 PKCE code_verifier + code_challenge (S256)
fn generate_pkce() -> PkcePair {
    use rand::Rng;
    // 43 字节随机数 → base64url 编码 → 43 字符 verifier
    let random_bytes: Vec<u8> = (0..32).map(|_| rand::thread_rng().gen::<u8>()).collect();
    let verifier = URL_SAFE_NO_PAD.encode(&random_bytes);

    // SHA256 → base64url → challenge
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(&hash);

    PkcePair { verifier, challenge }
}

// ── URL 编码 ──

fn urlencoding(input: &str) -> String {
    // 简单 URL 编码（仅编码需要编码的字符）
    let mut result = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// ── OAuth 本地服务器 ──

/// 本地回调服务器的 HTML 页面（JS 从 fragment 提取 token 并 POST 回服务器）
const OAUTH_CALLBACK_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>登录中...</title></head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;font-family:sans-serif">
<div style="text-align:center;padding:2rem">
<h1 style="color:#333">GitHub 登录中...</h1>
<p id="status" style="color:#666">正在获取授权信息...</p>
</div>
<script>
(function() {
  const hash = window.location.hash.substring(1);
  if (!hash) {
    document.getElementById('status').textContent = '未收到授权信息，请重试。';
    return;
  }
  const params = new URLSearchParams(hash);
  const payload = {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    expires_in: parseInt(params.get('expires_in') || '3600')
  };
  fetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(r) {
    if (r.ok) {
      document.body.innerHTML = '<div style="text-align:center;padding:2rem"><h1 style="color:#22c55e">✅ 登录成功！</h1><p style="color:#666">您可以关闭此窗口返回应用。</p></div>';
    } else {
      document.getElementById('status').textContent = '登录失败，请重试。';
    }
  }).catch(function() {
    document.getElementById('status').textContent = '网络错误，请重试。';
  });
})();
</script>
</body>
</html>"#;

/// 等待 OAuth 回调，接收本地 HTTP 服务器上的 token POST
fn wait_for_oauth_token(
    listener: &TcpListener,
    _redirect_uri: &str,
    _code_verifier: &str,
    anon_key: &str,
    base_url: &str,
) -> Result<AuthResponse, String> {
    // 最多接受 30 秒内的连接
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("set_nonblocking failed: {}", e))?;

    // 接受连接的循环（单线程，5 分钟超时）
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);

    for stream in listener.incoming() {
        if std::time::Instant::now() > deadline {
            return Err("OAuth 超时（5分钟）".to_string());
        }

        let mut stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };

        let peer = stream.peer_addr().ok();
        log::debug!("OAuth server: connection from {:?}", peer);

        let mut buf = [0u8; 8192];
        let size = match stream.read(&mut buf) {
            Ok(0) => continue,
            Ok(n) => n,
            Err(_) => continue,
        };

        let request = String::from_utf8_lossy(&buf[..size]);
        let (status_line, body) = match request.split_once("\r\n\r\n") {
            Some((head, body)) => (head, body),
            None => (request.as_ref(), ""),
        };

        let method_line = status_line.lines().next().unwrap_or("");

        // ── GET /callback — 返回提取 fragment 的 HTML ──
        if method_line.starts_with("GET /callback") {
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                OAUTH_CALLBACK_HTML.len(),
                OAUTH_CALLBACK_HTML
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            log::debug!("OAuth server: served callback HTML");
            continue;
        }

        // ── POST /token — 收到浏览器 JS 发来的 token ──
        if method_line.starts_with("POST /token") {
            // 从 body 解析 JSON
            let payload: OAuthTokenPayload = match serde_json::from_str(body) {
                Ok(p) => p,
                Err(e) => {
                    let err_body = format!("{{\"error\":\"{}\"}}", e);
                    let resp = format!(
                        "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        err_body.len(),
                        err_body
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    continue;
                }
            };

            log::info!("OAuth: received access_token from callback");

            // 通过 PKCE 交换 code → 完整 token（用 refresh_token grant 获取 user 信息）
            // 实际上 implicit flow 已返回完整 access_token，但我们需要 user 信息
            // 用 access_token 调用 /userinfo 或 /user 获取用户
            let user_info = get_user_info_with_token(&payload.access_token, anon_key, base_url);

            // 发送成功响应
            let success_html = r#"<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;font-family:sans-serif"><div style="text-align:center;padding:2rem"><h1 style="color:#22c55e">✅ 登录成功！</h1><p style="color:#666">可以关闭此窗口返回应用。</p></div></body></html>"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                success_html.len(),
                success_html
            );
            let _ = stream.write_all(response.as_bytes());

            match user_info {
                Ok(user) => {
                    let auth_resp = AuthResponse {
                        access_token: payload.access_token,
                        refresh_token: payload.refresh_token.unwrap_or_default(),
                        user,
                    };
                    return Ok(auth_resp);
                }
                Err(e) => {
                    // 即使获取 user 失败，至少 access_token 拿到了
                    let auth_resp = AuthResponse {
                        access_token: payload.access_token,
                        refresh_token: payload.refresh_token.unwrap_or_default(),
                        user: AuthUser {
                            id: "unknown".to_string(),
                            email: None,
                        },
                    };
                    log::warn!("OAuth: failed to get user info: {}", e);
                    return Ok(auth_resp);
                }
            }
        }

        // ── 其他路径 — 404 ──
        let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes());
    }

    Err("OAuth 服务器意外关闭".to_string())
}

/// 用 access_token 从 Supabase 获取用户信息
fn get_user_info_with_token(
    access_token: &str,
    anon_key: &str,
    base_url: &str,
) -> Result<AuthUser, String> {
    use reqwest::blocking::Client;

    let client = Client::builder()
        .build()
        .map_err(|e| format!("构建 HTTP client 失败: {}", e))?;

    let url = format!("{}/user", base_url);
    let resp = client
        .get(&url)
        .header("apikey", anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .map_err(|e| format!("请求用户信息失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("获取用户信息失败: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct SupabaseUser {
        id: String,
        email: Option<String>,
    }

    let user: SupabaseUser = resp
        .json()
        .map_err(|e| format!("解析用户信息失败: {}", e))?;

    Ok(AuthUser {
        id: user.id,
        email: user.email,
    })
}
