use serde::Deserialize;

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

/// 认证错误
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Auth failed: {0}")]
    Failed(String),
    #[error("Not signed in")]
    NotSignedIn,
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

    /// 注册新用户
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

    /// 登录
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
}
