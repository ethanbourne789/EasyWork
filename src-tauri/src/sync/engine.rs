use std::sync::Arc;
use tokio::sync::RwLock;
use crate::db::DbPool;
use super::client::SupabaseClient;
use super::changelog;

/// 同步状态
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncStatus {
    /// 未登录
    NotAuthenticated,
    /// 已登录，离线
    Offline,
    /// 已登录，同步中
    Syncing,
    /// 已登录，已同步
    Synced,
    /// 同步失败
    Failed(String),
}

/// 同步引擎：协调本地 SQLite 与 Supabase 的数据同步
pub struct SyncEngine {
    pool: DbPool,
    client: Arc<RwLock<Option<SupabaseClient>>>,
    status: Arc<RwLock<SyncStatus>>,
}

impl SyncEngine {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool,
            client: Arc::new(RwLock::new(None)),
            status: Arc::new(RwLock::new(SyncStatus::NotAuthenticated)),
        }
    }

    /// 设置 Supabase 客户端（登录后调用）
    pub async fn set_client(&self, client: SupabaseClient) {
        *self.client.write().await = Some(client);
        *self.status.write().await = SyncStatus::Offline;
    }

    /// 清空客户端（登出后调用）
    pub async fn clear_client(&self) {
        *self.client.write().await = None;
        *self.status.write().await = SyncStatus::NotAuthenticated;
    }

    /// 获取当前同步状态
    pub async fn get_status(&self) -> SyncStatus {
        self.status.read().await.clone()
    }

    /// 检查网络连通性
    pub async fn check_connectivity(&self) -> bool {
        let client = self.client.read().await;
        match client.as_ref() {
            Some(c) => c.check_connectivity().await,
            None => false,
        }
    }

    /// 执行全量同步（首次登录或手动触发）
    pub async fn sync_all(&self) -> Result<(), SyncError> {
        let client = self.client.read().await;
        let client = match client.as_ref() {
            Some(c) => c,
            None => return Err(SyncError::NotAuthenticated),
        };

        *self.status.write().await = SyncStatus::Syncing;

        // 先上传本地变更，再拉取远端
        if let Err(e) = self.upload_dirty(client).await {
            *self.status.write().await = SyncStatus::Failed(e.to_string());
            return Err(e);
        }

        if let Err(e) = self.download_updates(client).await {
            *self.status.write().await = SyncStatus::Failed(e.to_string());
            return Err(e);
        }

        *self.status.write().await = SyncStatus::Synced;
        Ok(())
    }

    /// 增量同步（定时或事件触发）
    pub async fn sync_incremental(&self) -> Result<(), SyncError> {
        let client = self.client.read().await;
        let client = match client.as_ref() {
            Some(c) => c,
            None => return Err(SyncError::NotAuthenticated),
        };

        *self.status.write().await = SyncStatus::Syncing;

        // 先上传本地变更
        if let Err(e) = self.upload_dirty(client).await {
            log::warn!("Incremental sync upload failed: {}", e);
            // 继续尝试下载，不中断
        }

        // 再拉取远端增量
        if let Err(e) = self.download_incremental(client).await {
            log::warn!("Incremental sync download failed: {}", e);
            *self.status.write().await = SyncStatus::Failed(e.to_string());
            return Err(e);
        }

        *self.status.write().await = SyncStatus::Synced;
        Ok(())
    }

    /// 上传所有 dirty 记录到云端
    async fn upload_dirty(&self, client: &SupabaseClient) -> Result<(), SyncError> {
        for table in changelog::SYNC_TABLES {
            let dirty_rows = changelog::get_dirty_rows(&self.pool, table)
                .map_err(|e| SyncError::Database(e.to_string()))?;

            if dirty_rows.is_empty() {
                continue;
            }

            log::debug!("Uploading {} dirty rows from {}", dirty_rows.len(), table);

            // 分离普通更新和删除
            let mut updates = Vec::new();
            let mut deletes = Vec::new();

            for row in dirty_rows {
                let obj = row.as_object().unwrap();
                let sync_status = obj.get("sync_status").and_then(|v| v.as_str()).unwrap_or("");
                let id = obj.get("id").and_then(|v| v.as_i64()).unwrap_or(0);

                if sync_status == changelog::SYNC_DELETING {
                    deletes.push(id);
                } else {
                    updates.push(row);
                }
            }

            // 批量上传更新
            if !updates.is_empty() {
                if let Err(e) = client.upsert_batch(table, &updates).await {
                    log::error!("Failed to upload {} rows to {}: {}", updates.len(), table, e);
                    return Err(SyncError::UploadFailed(e.to_string()));
                }
                // 标记为 clean
                let ids: Vec<i64> = updates
                    .iter()
                    .filter_map(|r| r.as_object().and_then(|o| o.get("id").and_then(|v| v.as_i64())))
                    .collect();
                changelog::mark_clean(&self.pool, table, &ids)
                    .map_err(|e| SyncError::Database(e.to_string()))?;
            }

            // 执行远端删除
            for &id in &deletes {
                if let Err(e) = client.delete_by_id(table, id).await {
                    log::error!("Failed to delete id {} from {}: {}", id, table, e);
                    return Err(SyncError::UploadFailed(e.to_string()));
                }
            }
            // 本地清除已删除的行
            changelog::purge_deleted(&self.pool, table, &deletes)
                .map_err(|e| SyncError::Database(e.to_string()))?;

            // 更新最后同步时间
            let now = chrono::Utc::now().to_rfc3339();
            changelog::set_last_synced_at(&self.pool, table, &now)
                .map_err(|e| SyncError::Database(e.to_string()))?;
        }

        Ok(())
    }

    /// 下载所有表的增量更新（基于 last_synced_at）
    async fn download_updates(&self, client: &SupabaseClient) -> Result<(), SyncError> {
        for table in changelog::SYNC_TABLES {
            let rows = client
                .select_all(table)
                .await
                .map_err(|e| SyncError::DownloadFailed(e.to_string()))?;

            log::debug!("Downloaded {} rows from {}", rows.len(), table);

            changelog::merge_remote_rows(&self.pool, table, &rows)
                .map_err(|e| SyncError::Database(e.to_string()))?;

            let now = chrono::Utc::now().to_rfc3339();
            changelog::set_last_synced_at(&self.pool, table, &now)
                .map_err(|e| SyncError::Database(e.to_string()))?;
        }
        Ok(())
    }

    /// 下载增量更新（仅拉取 last_synced_at 之后的数据）
    async fn download_incremental(&self, client: &SupabaseClient) -> Result<(), SyncError> {
        for table in changelog::SYNC_TABLES {
            let since = changelog::get_last_synced_at(&self.pool, table)
                .map_err(|e| SyncError::Database(e.to_string()))?
                .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

            let rows = client
                .select_since(table, &since)
                .await
                .map_err(|e| SyncError::DownloadFailed(e.to_string()))?;

            if rows.is_empty() {
                continue;
            }

            log::debug!("Downloaded {} incremental rows from {}", rows.len(), table);

            changelog::merge_remote_rows(&self.pool, table, &rows)
                .map_err(|e| SyncError::Database(e.to_string()))?;

            let now = chrono::Utc::now().to_rfc3339();
            changelog::set_last_synced_at(&self.pool, table, &now)
                .map_err(|e| SyncError::Database(e.to_string()))?;
        }
        Ok(())
    }
}

/// 同步错误
#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("Not authenticated")]
    NotAuthenticated,
    #[error("Database error: {0}")]
    Database(String),
    #[error("Upload failed: {0}")]
    UploadFailed(String),
    #[error("Download failed: {0}")]
    DownloadFailed(String),
}
