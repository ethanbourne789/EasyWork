use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAccount {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub username: Option<String>,
    pub imap_host: String,
    pub imap_port: i64,
    pub smtp_host: String,
    pub smtp_port: i64,
    pub use_ssl: bool,
    pub auth_type: String,
    pub signature_id: Option<String>,
    pub signature_auto_append_new: bool,
    pub signature_auto_append_reply: bool,
    pub last_synced_at: Option<String>,
    pub sync_enabled: bool,
    pub sync_interval_mins: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailFolder {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub imap_path: String,
    pub parent_path: Option<String>,
    pub is_system: bool,
    pub folder_type: String,
    pub sort_order: i64,
    pub unread_count: i64,
    pub total_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Email {
    pub id: String,
    pub account_id: String,
    pub folder_id: Option<String>,
    pub message_id: Option<String>,
    pub uid: Option<i64>,
    pub from_address: Option<String>,
    pub to_addresses: Option<String>,
    pub cc_addresses: Option<String>,
    pub subject: Option<String>,
    pub preview_text: Option<String>,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub has_attachments: bool,
    pub is_read: bool,
    pub is_starred: bool,
    pub received_at: Option<String>,
    pub created_at: String,
    pub account_email: Option<String>,
    pub account_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAttachment {
    pub id: String,
    pub email_id: String,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: Option<i64>,
    pub file_path: String,
    pub is_inline: bool,
    pub content_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailSignature {
    pub id: String,
    pub name: String,
    pub html: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailTemplate {
    pub id: String,
    pub name: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub fetched: i64,
    pub inserted: i64,
    pub folders: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase")]
pub enum SyncProgress {
    #[serde(rename = "connecting")]
    Connecting { account_id: String },
    #[serde(rename = "folder")]
    Folder { account_id: String, path: String, done: i64, total: i64 },
    #[serde(rename = "done")]
    Done { account_id: String, fetched: i64, inserted: i64 },
    #[serde(rename = "error")]
    Error { account_id: String, message: String },
    #[serde(rename = "new-mail")]
    NewMail { account_id: String, subject: String, from: String },
}
