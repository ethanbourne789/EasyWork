pub mod auth;
pub mod changelog;
pub mod client;
pub mod engine;
pub mod helpers;

use std::sync::Arc;
use tokio::sync::RwLock;
use crate::db::DbPool;
use auth::{AuthError, SupabaseAuth};
use client::{SupabaseClient, SupabaseConfig};
use engine::SyncEngine;

/// 全局同步管理器（Tauri State）
pub struct SyncManager {
    pub engine: Arc<SyncEngine>,
    pub auth: Arc<SupabaseAuth>,
    pub config: Option<SupabaseConfig>,
}

impl SyncManager {
    pub fn new(pool: DbPool) -> Self {
        let config = SupabaseConfig::from_env();
        let auth = config
            .as_ref()
            .map(|c| Arc::new(SupabaseAuth::new(&c.url, &c.anon_key)));

        // 如果 auth 为 None，创建一个 dummy（不会实际使用）
        let auth = auth.unwrap_or_else(|| {
            Arc::new(SupabaseAuth::new("https://placeholder.supabase.co", "placeholder"))
        });

        let engine = Arc::new(SyncEngine::new(pool));

        Self {
            engine,
            auth,
            config,
        }
    }

    /// 用户登录
    pub async fn sign_in(&self, email: &str, password: &str) -> Result<(), AuthError> {
        let config = self.config.as_ref().ok_or(AuthError::Failed(
            "Supabase not configured".to_string(),
        ))?;

        let auth_resp = self.auth.sign_in(email, password).await?;

        // 创建 Supabase 客户端并设置 JWT
        let client = SupabaseClient::new(config);
        client.set_jwt(Some(auth_resp.access_token.clone())).await;

        // 注入到引擎
        self.engine.set_client(client).await;

        // TODO: 持久化 refresh_token 以便自动刷新

        log::info!("User signed in: {}", email);
        Ok(())
    }

    /// 用户注册
    pub async fn sign_up(&self, email: &str, password: &str) -> Result<(), AuthError> {
        let config = self.config.as_ref().ok_or(AuthError::Failed(
            "Supabase not configured".to_string(),
        ))?;

        let _auth_resp = self.auth.sign_up(email, password).await?;

        log::info!("User signed up: {} (please verify email before signing in)", email);
        Ok(())
    }

    /// 用户登出
    pub async fn sign_out(&self) {
        self.engine.clear_client().await;
        log::info!("User signed out");
    }

    /// 检查是否已登录
    pub async fn is_authenticated(&self) -> bool {
        !matches!(
            self.engine.get_status().await,
            engine::SyncStatus::NotAuthenticated
        )
    }
}

// ── Tauri Commands ──

#[tauri::command]
pub async fn sync_sign_in(
    manager: tauri::State<'_, SyncManager>,
    email: String,
    password: String,
) -> Result<(), String> {
    manager
        .sign_in(&email, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_sign_up(
    manager: tauri::State<'_, SyncManager>,
    email: String,
    password: String,
) -> Result<(), String> {
    manager
        .sign_up(&email, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_sign_out(manager: tauri::State<'_, SyncManager>) -> Result<(), String> {
    manager.sign_out().await;
    Ok(())
}

#[tauri::command]
pub async fn sync_is_authenticated(manager: tauri::State<'_, SyncManager>) -> Result<bool, String> {
    Ok(manager.is_authenticated().await)
}

#[tauri::command]
pub async fn sync_get_status(manager: tauri::State<'_, SyncManager>) -> Result<String, String> {
    let status = manager.engine.get_status().await;
    let s = match status {
        engine::SyncStatus::NotAuthenticated => "not_authenticated",
        engine::SyncStatus::Offline => "offline",
        engine::SyncStatus::Syncing => "syncing",
        engine::SyncStatus::Synced => "synced",
        engine::SyncStatus::Failed(_) => "failed",
    };
    Ok(s.to_string())
}

#[tauri::command]
pub async fn sync_now(manager: tauri::State<'_, SyncManager>) -> Result<(), String> {
    manager
        .engine
        .sync_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_check_connectivity(manager: tauri::State<'_, SyncManager>) -> Result<bool, String> {
    Ok(manager.engine.check_connectivity().await)
}
