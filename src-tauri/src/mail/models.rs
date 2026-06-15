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
    /// User-assigned display name shown in UI; defaults to email when empty.
    #[serde(default)]
    pub display_name: String,
    /// Hex color (#RRGGBB) for sidebar avatar / account badge.
    #[serde(default)]
    pub color: String,
    /// Whether this account is the default for compose when no account context.
    #[serde(default)]
    pub is_default: bool,
    /// Whether desktop notifications fire for new mail on this account.
    #[serde(default = "default_true")]
    pub notifications_enabled: bool,
}

fn default_true() -> bool { true }

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
    /// v1.1: JSON 数组字符串 `["a@x.com","b@x.com"]`，用于 `search_messages_by_email` 二次过滤
    #[serde(default)]
    pub to_list: String,
    #[serde(default)]
    pub cc_list: String,
    /// v1.2: 来源账户邮箱地址（用于多账户聚合视图显示）
    #[serde(default)]
    pub account_email: String,
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

#[allow(dead_code)]
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
    /// v1.1: FK → mail_contact_groups.id。可空（未分组）。
    #[serde(default)]
    pub group_id: Option<i64>,
    /// v1.1: VCF FN 字段（与 name 区分；未来可独立编辑）。
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailContactGroup {
    pub id: Option<i64>,
    pub account_id: i64,
    pub name: String,
    #[serde(default = "default_group_color")]
    pub color: String,
    #[serde(default)]
    pub sort_order: i32,
}

fn default_group_color() -> String {
    "#6366f1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactMailSummary {
    pub contact_email: String,
    pub total: i64,
    pub account_ids: Vec<i64>,
    pub messages: Vec<MailMessageSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailSignature {
    pub id: Option<i64>,
    pub account_id: i64,
    pub name: String,
    pub signature_text: String,
    pub signature_html: String,
    pub is_default: bool,
}
