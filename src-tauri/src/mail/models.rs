use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailAccount {
    pub id: Option<i64>,
    pub email: String,
    pub provider: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub password: String,
    pub use_tls: bool,
    pub sync_interval_secs: i64,
    pub sync_period_days: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailFolder {
    pub id: Option<i64>,
    pub account_id: i64,
    pub remote_id: String,
    pub name: String,
    pub role: String,
    pub folder_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailMessage {
    pub id: Option<i64>,
    pub account_id: i64,
    pub remote_uid: i64,
    pub message_id_header: String,
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub to_list: String,
    pub cc_list: String,
    pub date: String,
    pub body_text: String,
    pub body_html: String,
    pub is_read: bool,
    pub is_starred: bool,
    pub has_attachment: bool,
    pub size: i64,
    pub folder_ids: Vec<i64>,
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailMessageSummary {
    pub id: i64,
    pub account_id: i64,
    pub remote_uid: i64,
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub date: String,
    pub is_read: bool,
    pub is_starred: bool,
    pub has_attachment: bool,
    pub size: i64,
    #[serde(default)]
    pub thread_id: String,
    #[serde(default)]
    pub is_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOp {
    pub id: Option<i64>,
    pub account_id: i64,
    pub message_id: Option<i64>,
    pub op_type: String,
    #[serde(default)]
    pub payload: String,
    pub status: String,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub attempts: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub last_sync_uid: Option<i64>,
    pub uid_validity: Option<u64>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailContact {
    pub id: Option<i64>,
    pub account_id: i64,
    pub name: String,
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub group_name: String,
    #[serde(default)]
    pub notes: String,
}
