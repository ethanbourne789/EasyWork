pub mod config;
pub mod creds;
pub mod engine;
pub mod postgres;
pub mod schema;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub id: String,
    pub enabled: bool,
    pub provider: String,
    pub connection_string: String,
    pub database_name: String,
    pub last_sync_at: Option<String>,
    pub sync_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub enabled: bool,
    pub last_sync_at: Option<String>,
    pub sync_error: Option<String>,
    pub device_id: String,
    pub device_name: String,
    /// 待处理冲突数（本地与云端并发修改，等待用户裁决）
    pub pending_conflicts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    pub id: String,
    pub table_name: String,
    pub pk_value: String,
    pub local_snapshot: String,
    pub remote_snapshot: String,
    pub detected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLogEntry {
    pub id: String,
    pub direction: String,
    pub table_name: String,
    pub records_count: i32,
    pub status: String,
    pub error_message: Option<String>,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub records_uploaded: i32,
    pub records_downloaded: i32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncUploadResult {
    pub records_uploaded: i32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncDownloadResult {
    pub records_downloaded: i32,
    pub conflicts_resolved: i32,
    pub error: Option<String>,
}
