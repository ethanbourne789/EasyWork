use reqwest::Client;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Supabase 配置（URL + 密钥从 Tauri 的 env 或配置文件读取）
#[derive(Debug, Clone)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

impl SupabaseConfig {
    /// 从环境变量加载；若缺失则返回 None（同步功能禁用）
    pub fn from_env() -> Option<Self> {
        let url = std::env::var("SUPABASE_URL").ok()?;
        let key = std::env::var("SUPABASE_ANON_KEY").ok()?;
        if url.is_empty() || key.is_empty() {
            return None;
        }
        Some(Self { url, anon_key: key })
    }
}

/// Supabase REST 客户端（基于 reqwest）
#[derive(Clone)]
pub struct SupabaseClient {
    http: Client,
    base_url: String,
    api_key: String,
    /// 当前登录用户的 JWT（登录后设置，登出清空）
    jwt: Arc<RwLock<Option<String>>>,
}

/// 通用行数据（JSON 序列化）
pub type Row = serde_json::Value;

/// Supabase 操作结果
pub type SbResult<T> = Result<T, SupabaseError>;

#[derive(Debug, thiserror::Error)]
pub enum SupabaseError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Not authenticated")]
    NotAuthenticated,
    #[error("Auth failed: {0}")]
    AuthFailed(String),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Request failed: {0}")]
    RequestFailed(String),
}

impl SupabaseClient {
    pub fn new(config: &SupabaseConfig) -> Self {
        let http = Client::builder()
            .default_headers({
                let mut h = reqwest::header::HeaderMap::new();
                h.insert(
                    reqwest::header::AUTHORIZATION,
                    reqwest::header::HeaderValue::from_str(&format!("Bearer {}", config.anon_key))
                        .unwrap(),
                );
                h.insert(
                    "apikey",
                    reqwest::header::HeaderValue::from_str(&config.anon_key).unwrap(),
                );
                h
            })
            .build()
            .expect("Failed to build HTTP client");

        Self {
            http,
            base_url: format!("{}/rest/v1", config.url),
            api_key: config.anon_key.clone(),
            jwt: Arc::new(RwLock::new(None)),
        }
    }

    /// 设置当前用户的 JWT token
    pub async fn set_jwt(&self, jwt: Option<String>) {
        *self.jwt.write().await = jwt;
    }

    /// 获取当前 JWT；若未登录返回错误
    async fn bearer(&self) -> SbResult<String> {
        self.jwt
            .read()
            .await
            .clone()
            .ok_or(SupabaseError::NotAuthenticated)
    }

    /// 构造带用户 JWT 的请求头（覆盖默认的 anon key）
    async fn authed_request(&self, method: reqwest::Method, url: &str) -> SbResult<reqwest::RequestBuilder> {
        let token = self.bearer().await?;
        Ok(self
            .http
            .request(method, url)
            .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", token))
            .header("apikey", &self.api_key))
    }

    /// 查询表中所有行（带 user_id 过滤由 RLS 保证）
    pub async fn select_all(&self, table: &str) -> SbResult<Vec<Row>> {
        let url = format!("{}?select=*", self.table_url(table));
        let req = self.authed_request(reqwest::Method::GET, &url).await?;
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SupabaseError::RequestFailed(format!("{}: {}", status, body)));
        }
        let rows: Vec<Row> = resp.json().await?;
        Ok(rows)
    }

    /// 查询表中 updated_at > since 的行
    pub async fn select_since(&self, table: &str, since: &str) -> SbResult<Vec<Row>> {
        let url = format!(
            "{}?select=*&updated_at=gt.{}&order=updated_at.asc",
            self.table_url(table),
            since
        );
        let req = self.authed_request(reqwest::Method::GET, &url).await?;
        let resp = req.send().await?;
        let rows: Vec<Row> = resp.json().await?;
        Ok(rows)
    }

    /// 插入一行（UPSERT：on_conflict 按 id）
    pub async fn upsert(&self, table: &str, row: &Row) -> SbResult<()> {
        let url = format!(
            "{}?on_conflict=id",
            self.table_url(table)
        );
        let req = self
            .authed_request(reqwest::Method::POST, &url)
            .await?
            .header("Prefer", "resolution=merge-duplicates")
            .json(row);
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SupabaseError::RequestFailed(format!("{}: {}", status, body)));
        }
        Ok(())
    }

    /// 批量 upsert
    pub async fn upsert_batch(&self, table: &str, rows: &[Row]) -> SbResult<()> {
        if rows.is_empty() {
            return Ok(());
        }
        let url = format!(
            "{}?on_conflict=id",
            self.table_url(table)
        );
        let req = self
            .authed_request(reqwest::Method::POST, &url)
            .await?
            .header("Prefer", "resolution=merge-duplicates")
            .json(rows);
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SupabaseError::RequestFailed(format!("{}: {}", status, body)));
        }
        Ok(())
    }

    /// 按 id 删除一行
    pub async fn delete_by_id(&self, table: &str, id: i64) -> SbResult<()> {
        let url = format!("{}?id=eq.{}", self.table_url(table), id);
        let req = self.authed_request(reqwest::Method::DELETE, &url).await?;
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SupabaseError::RequestFailed(format!("{}: {}", status, body)));
        }
        Ok(())
    }

    /// 检查网络连通性（HEAD 请求 Supabase REST 根）
    pub async fn check_connectivity(&self) -> bool {
        let url = format!("{}/", self.base_url);
        match self.http.head(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    fn table_url(&self, table: &str) -> String {
        format!("{}/{}", self.base_url, table)
    }
}
