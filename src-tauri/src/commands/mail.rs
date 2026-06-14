use std::collections::HashSet;
use std::sync::Mutex;
use tauri::State;
use crate::db::ops;
use crate::db::DbPool;
use crate::mail::{self, MailAccount, MailFolder, MailMessage, MailMessageSummary, MailContact, MailContactGroup, ContactMailSummary, MailSignature};

/// Maximum attachment size (5MB) for auto-download during sync.
/// Attachments larger than this are recorded in the DB with an empty
/// local_path and must be manually downloaded by the user on demand.
const MAX_AUTO_ATTACHMENT_SIZE: i64 = 5 * 1024 * 1024;

/// Per-account in-flight sync lock. Prevents manual-sync button, auto-fetch
/// scheduler, and smart-poll worker from all hammering the same account at
/// once. Held in `app.manage(SyncLock)` at startup.
#[derive(Default)]
pub struct SyncLock {
    pub in_flight: Mutex<HashSet<i64>>,
}

impl SyncLock {
    /// Try to acquire the lock for `account_id`. Returns `Ok(())` if acquired,
    /// `Err` if another sync is already running for that account.
    pub fn try_acquire(&self, account_id: i64) -> Result<(), String> {
        let mut guard = self.in_flight.lock().map_err(|e| format!("锁中毒: {e}"))?;
        if guard.contains(&account_id) {
            return Err(format!("账户 {} 已在同步中，请稍候", account_id));
        }
        guard.insert(account_id);
        Ok(())
    }

    /// Release the lock for `account_id`. Always call in a defer-style guard.
    pub fn release(&self, account_id: i64) {
        if let Ok(mut guard) = self.in_flight.lock() {
            guard.remove(&account_id);
        }
    }
}

/// RAII guard that releases the per-account sync lock on drop, ensuring we
/// never leak the lock on early return / panic.
pub struct SyncLockGuard<'a> {
    lock: &'a SyncLock,
    account_id: i64,
}

impl<'a> SyncLockGuard<'a> {
    pub fn acquire(lock: &'a SyncLock, account_id: i64) -> Result<Self, String> {
        lock.try_acquire(account_id)?;
        Ok(Self { lock, account_id })
    }
}

impl<'a> Drop for SyncLockGuard<'a> {
    fn drop(&mut self) {
        self.lock.release(self.account_id);
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub folders_count: usize,
    pub messages_new: usize,
    pub messages_total: usize,
    /// Number of folders that could not be SELECTed (e.g. permission denied).
    /// Helps the UI surface "5 个文件夹 (1 个跳过)" instead of silent failures.
    pub folders_skipped: usize,
    /// Number of messages that failed IMAP body parse.
    pub messages_failed_parse: usize,
    /// Number of messages that failed DB insert.
    pub messages_failed_insert: usize,
    /// Set when the per-account sync lock was already held by another path.
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SendMailRequest {
    pub account_id: i64,
    pub to: String,
    pub to_name: Option<String>,
    pub cc: Option<String>,
    pub bcc: Option<String>,
    pub subject: String,
    pub body_text: String,
    pub body_html: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<Vec<String>>,
    /// Optional attachments: vec of { filename, content_type, data (base64) }
    pub attachments: Option<Vec<AttachmentItem>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AttachmentItem {
    pub filename: String,
    pub content_type: String,
    pub data_base64: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SendResult {
    pub success: bool,
    pub error: Option<String>,
    /// Bug #8 fix: when a sent message is linked to an existing thread (e.g.
    /// the user replied to msg X), this carries the local id of that message
    /// so the UI can scroll to / highlight the thread the new mail joined.
    /// `None` for brand-new threads.
    pub linked_message_id: Option<i64>,
    /// The local id assigned to the newly sent message (so the UI can
    /// immediately render it in Sent / a future "Sent" sync).
    pub new_message_id: Option<i64>,
}

// ==================== Account ====================

/// Add an email account.
///
/// Flow:
///   1. Validate input (email format, required fields, port ranges)
///   2. Encrypt password via OS keyring (offloaded to blocking thread-pool)
///   3. INSERT into mail_accounts (transactional)
///   4. Return new account ID
///
/// On failure, the caller should NOT retry without fixing the input.
#[tauri::command]
pub async fn add_account(
    pool: State<'_, DbPool>,
    account: MailAccount,
) -> Result<i64, String> {
    let trace_id = crate::logging::trace_id();
    let params = serde_json::json!({
        "email": account.email,
        "imap_host": account.imap_host,
        "imap_port": account.imap_port,
        "smtp_host": account.smtp_host,
        "smtp_port": account.smtp_port,
    });
    log::info!("[{}] add_account START {}", trace_id, params);

    // ── Step 1: Input validation ──
    validate_account_input(&account, &trace_id)?;

    // ── Step 2: Encrypt + insert (offloaded to blocking pool) ──
    let pool_clone = pool.inner().clone();
    let account_clone = account.clone();
    let tid = trace_id.clone();

    let id = tokio::task::spawn_blocking(move || {
        log::debug!(
            "[{tid}] insert_account: email={} imap={}:{} smtp={}:{}",
            account_clone.email,
            account_clone.imap_host, account_clone.imap_port,
            account_clone.smtp_host, account_clone.smtp_port,
        );
        ops::insert_account(&pool_clone, &account_clone)
    })
    .await
    .map_err(|e| {
        let error_msg = e.to_string();
        log::error!("[{}] add_account FAILED {}", trace_id, serde_json::json!({"error": error_msg}));
        format!("内部错误: 后台任务异常")
    })?
    .map_err(|e| {
        let msg = if e.to_string().contains("UNIQUE constraint") {
            log::warn!("[{}] add_account FAILED {}", trace_id, serde_json::json!({"error": "duplicate_email", "email": account.email}));
            format!("该邮箱 {} 已存在，请勿重复添加", account.email)
        } else {
            log::error!("[{}] add_account FAILED {}", trace_id, serde_json::json!({"error": e.to_string()}));
            format!("数据库写入失败: {}", e)
        };
        msg
    })?;

    let result = serde_json::json!({
        "account_id": id,
        "email": account.email,
    });
    log::info!("[{}] add_account SUCCESS {}", trace_id, result);
    Ok(id)
}

/// Validate MailAccount fields before persisting.
fn validate_account_input(account: &MailAccount, trace_id: &str) -> Result<(), String> {
    // Email
    if account.email.is_empty() || !account.email.contains('@') {
        log::warn!("[{trace_id}] validation: invalid email '{}'", account.email);
        return Err("请输入有效的邮箱地址".into());
    }
    // IMAP
    if account.imap_host.is_empty() {
        return Err("请输入 IMAP 服务器地址".into());
    }
    if account.imap_port == 0 {
        log::warn!("[{trace_id}] validation: invalid imap_port {}", account.imap_port);
        return Err(format!("IMAP 端口无效: {}", account.imap_port));
    }
    // SMTP
    if account.smtp_host.is_empty() {
        return Err("请输入 SMTP 服务器地址".into());
    }
    if account.smtp_port == 0 {
        log::warn!("[{trace_id}] validation: invalid smtp_port {}", account.smtp_port);
        return Err(format!("SMTP 端口无效: {}", account.smtp_port));
    }
    // Password
    if account.password.is_empty() {
        return Err("请输入密码或授权码".into());
    }

    log::debug!(
        "[{trace_id}] validation PASS: email={} imap={}:{} smtp={}:{}",
        account.email,
        account.imap_host, account.imap_port,
        account.smtp_host, account.smtp_port,
    );
    Ok(())
}

#[tauri::command]
pub async fn list_accounts(
    pool: State<'_, DbPool>,
) -> Result<Vec<MailAccount>, String> {
    ops::list_accounts(&pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_account(
    pool: State<'_, DbPool>,
    id: i64,
) -> Result<(), String> {
    ops::delete_account(&pool, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_folders(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Vec<MailFolder>, String> {
    ops::list_folders(&pool, account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_account(
    pool: State<'_, DbPool>,
    account: MailAccount,
) -> Result<(), String> {
    let trace_id = crate::logging::trace_id();
    if account.id.is_none() {
        return Err("Account ID is required for update".into());
    }

    // ── Password handling: empty password means "keep the existing one".
    // This is the standard "edit form" semantics: the password field is left
    // blank so the user can change other settings without re-entering the
    // sensitive secret. A non-empty password re-encrypts and replaces it.
    let final_account = if account.password.is_empty() {
        match ops::get_account_with_password(&pool, account.id.unwrap()) {
            Ok(Some((existing, _stored_pw))) => MailAccount {
                password: existing.password, // sentinel: same as stored
                ..account
            },
            Ok(None) => {
                log::warn!("[{}] update_account: account {:?} not found", trace_id, account.id);
                return Err("账户不存在".into());
            }
            Err(e) => {
                log::error!("[{}] update_account: failed to read existing: {}", trace_id, e);
                return Err(format!("读取现有账户失败: {}", e));
            }
        }
    } else {
        account
    };

    ops::update_account(&pool, &final_account).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_unread_counts(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Vec<(i64, i64)>, String> {
    ops::folder_unread_counts(&pool, account_id).map_err(|e| e.to_string())
}

// ==================== Messages ====================

#[derive(serde::Serialize, serde::Deserialize)]
pub struct FetchMessagesResult {
    pub messages: Vec<MailMessageSummary>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[tauri::command]
pub async fn fetch_messages(
    pool: State<'_, DbPool>,
    account_id: i64,
    folder_id: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<FetchMessagesResult, String> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(30);
    let messages = ops::list_messages(&pool, account_id, folder_id, page, page_size)
        .map_err(|e| e.to_string())?;
    let total = ops::count_messages(&pool, account_id, folder_id)
        .map_err(|e| e.to_string())?;
    log::info!(
        "fetch_messages: account_id={}, folder_id={:?}, page={}, page_size={}, returned={}, total={}",
        account_id, folder_id, page, page_size, messages.len(), total,
    );
    Ok(FetchMessagesResult { messages, total, page, page_size })
}

/// Combined inbox — list messages from multiple accounts (or all) optionally filtered by folder role.
/// `account_ids == None` means ALL accounts.
/// `folder_role == None` means any folder.
#[tauri::command]
pub async fn fetch_messages_multi(
    pool: State<'_, DbPool>,
    account_ids: Option<Vec<i64>>,
    folder_role: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<FetchMessagesResult, String> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(30);
    let ids_slice = account_ids.as_deref();
    let messages = ops::list_messages_multi(&pool, ids_slice, folder_role.as_deref(), page, page_size)
        .map_err(|e| e.to_string())?;
    let total = ops::count_messages_multi(&pool, ids_slice, folder_role.as_deref())
        .map_err(|e| e.to_string())?;
    log::info!(
        "fetch_messages_multi: account_ids={:?}, folder_role={:?}, page={}, page_size={}, returned={}, total={}",
        account_ids, folder_role, page, page_size, messages.len(), total,
    );
    Ok(FetchMessagesResult { messages, total, page, page_size })
}

/// Combined unread count for sidebar / dock badge.
#[tauri::command]
pub async fn get_unread_count_multi(
    pool: State<'_, DbPool>,
    account_ids: Option<Vec<i64>>,
) -> Result<i64, String> {
    ops::count_unread_multi(&pool, account_ids.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_messages(
    pool: State<'_, DbPool>,
    account_id: i64,
    query: String,
) -> Result<Vec<MailMessageSummary>, String> {
    ops::search_messages(&pool, account_id, &query).map_err(|e| e.to_string())
}

/// Unified search across all (or specific) accounts.
#[tauri::command]
pub async fn search_messages_multi(
    pool: State<'_, DbPool>,
    account_ids: Option<Vec<i64>>,
    query: String,
) -> Result<Vec<MailMessageSummary>, String> {
    ops::search_messages_multi(&pool, account_ids.as_deref(), &query)
        .map_err(|e| e.to_string())
}

/// Mark all messages in a folder (or all folders if folder_id is None) as read.
#[tauri::command]
pub async fn mark_folder_read(
    pool: State<'_, DbPool>,
    account_id: i64,
    folder_id: Option<i64>,
) -> Result<i64, String> {
    ops::mark_folder_read(&pool, account_id, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_message_body(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<serde_json::Value, String> {
    let (body_text, body_html, cc_list) = ops::get_message_body(&pool, message_id)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "body_text": body_text,
        "body_html": body_html,
        "cc_list": cc_list,
    }))
}

#[tauri::command]
pub async fn get_message_headers(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<serde_json::Value, String> {
    let (subject, from_name, from_email, to_list, msg_id) = ops::get_message_headers(&pool, message_id)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "subject": subject,
        "from_name": from_name,
        "from_email": from_email,
        "to_list": to_list,
        "message_id": msg_id,
    }))
}

#[tauri::command]
pub async fn mark_message_read(
    pool: State<'_, DbPool>,
    message_id: i64,
    is_read: bool,
) -> Result<(), String> {
    ops::mark_read(&pool, message_id, is_read).map_err(|e| e.to_string())?;

    // Create pending op for IMAP remote sync
    if let Ok(Some((account_id, remote_uid, _subject, folder_remote_id))) =
        ops::get_message_remote_info(&pool, message_id)
    {
        // Bug #4 fix: persist the source folder so the executor can SELECT
        // the right mailbox (Gmail's "[Gmail]/Sent Mail" etc) instead of
        // hard-coding "INBOX".
        let payload = serde_json::json!({
            "remote_uid": remote_uid,
            "is_read": is_read,
            "folder_remote_id": folder_remote_id,
        }).to_string();
        let op = mail::PendingOp {
            id: None,
            account_id,
            message_id: Some(message_id),
            op_type: "mark_read".into(),
            payload,
            status: "pending".into(),
            last_error: None,
            attempts: 0,
        };
        let _ = ops::insert_pending_op(&pool, &op);
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_message_star(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<bool, String> {
    ops::toggle_star(&pool, message_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_message(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<(), String> {
    ops::soft_delete_message(&pool, message_id).map_err(|e| e.to_string())?;

    // Create pending op for IMAP remote sync
    if let Ok(Some((account_id, remote_uid, _subject, folder_remote_id))) =
        ops::get_message_remote_info(&pool, message_id)
    {
        // Bug #4 fix: persist the source folder for the pending delete.
        let payload = serde_json::json!({
            "remote_uid": remote_uid,
            "folder_remote_id": folder_remote_id,
        }).to_string();
        let op = mail::PendingOp {
            id: None,
            account_id,
            message_id: Some(message_id),
            op_type: "delete".into(),
            payload,
            status: "pending".into(),
            last_error: None,
            attempts: 0,
        };
        let _ = ops::insert_pending_op(&pool, &op);
    }
    Ok(())
}

#[tauri::command]
pub async fn archive_message(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<(), String> {
    ops::archive_message(&pool, message_id).map_err(|e| e.to_string())?;

    // Create pending op for IMAP remote sync
    if let Ok(Some((account_id, remote_uid, _subject, folder_remote_id))) =
        ops::get_message_remote_info(&pool, message_id)
    {
        // Bug #4 fix: persist the source folder for the pending archive.
        let payload = serde_json::json!({
            "remote_uid": remote_uid,
            "folder_remote_id": folder_remote_id,
        }).to_string();
        let op = mail::PendingOp {
            id: None,
            account_id,
            message_id: Some(message_id),
            op_type: "archive".into(),
            payload,
            status: "pending".into(),
            last_error: None,
            attempts: 0,
        };
        let _ = ops::insert_pending_op(&pool, &op);
    }
    Ok(())
}

// ==================== Send Mail ====================

#[tauri::command]
pub async fn send_mail(
    pool: State<'_, DbPool>,
    request: SendMailRequest,
) -> Result<SendResult, String> {
    let trace_id = crate::logging::trace_id();
    let params = serde_json::json!({
        "account_id": request.account_id,
        "to": request.to,
        "subject": request.subject,
        "has_attachments": request.attachments.as_ref().map(|a| !a.is_empty()).unwrap_or(false),
    });
    log::info!("[{}] send_mail START {}", trace_id, params);

    let (account, password) = ops::get_account_with_password(&pool, request.account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", request.account_id))?;

    let from_name = request.to_name.clone();

    // Parse recipients into lists
    let to_list: Vec<String> = if request.to.contains(';') {
        request.to.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    } else {
        vec![request.to.clone()]
    };

    let cc_list: Vec<String> = request.cc.as_ref()
        .map(|cc| cc.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();

    let bcc_list: Vec<String> = request.bcc.as_ref()
        .map(|bcc| bcc.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();

    // Prepare attachments (decode from base64)
    let mut attachments = Vec::new();
    if let Some(items) = &request.attachments {
        for item in items {
            let data = base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                &item.data_base64,
            ).map_err(|e| format!("附件解码失败: {}", e))?;
            attachments.push(mail::smtp::MailAttachment {
                filename: item.filename.clone(),
                content_type: item.content_type.clone(),
                data,
            });
        }
    }

    match mail::smtp::send_mail(
        &account.smtp_host,
        account.smtp_port,
        &account.email,
        &password,
        &account.email,
        from_name.as_deref(),
        &to_list,
        &cc_list,
        &bcc_list,
        &request.subject,
        &request.body_text,
        request.body_html.as_deref(),
        &attachments,
        account.use_tls,
    ).await {
        Ok(()) => {
            let result = serde_json::json!({
                "account_id": request.account_id,
                "to_count": to_list.len(),
                "cc_count": cc_list.len(),
                "bcc_count": bcc_list.len(),
                "attachment_count": attachments.len(),
            });
            log::info!("[{}] send_mail SUCCESS {}", trace_id, result);

            // Bug #8 fix: persist the sent message in the local DB and link it
            // back to the message it replied to (if any). We need the
            // message_id from the In-Reply-To header to find the parent.
            let pool_for_record = pool.inner().clone();
            let account_id = request.account_id;
            let subject_for_record = request.subject.clone();
            let body_text_for_record = request.body_text.clone();
            let body_html_for_record = request.body_html.clone();
            let to_list_for_record = to_list.clone();
            let cc_list_for_record = cc_list.clone();
            let in_reply_to_header = request.in_reply_to.clone();
            let _references_for_record = request.references.clone();
            let account_email_for_record = account.email.clone();
            let from_name_for_record = from_name.clone();

            let record_result: Result<(Option<i64>, Option<i64>), String> = tokio::task::spawn_blocking(move || {
                use crate::mail::MailMessage;

                // 1. Resolve the parent message (if this is a reply/forward).
                //    We match on message_id_header equality, which is what the
                //    existing thread_id logic uses.
                let parent_msg_id: Option<i64> = if let Some(ref in_reply_to) = in_reply_to_header {
                    let cleaned = in_reply_to.trim().trim_start_matches('<').trim_end_matches('>').trim().to_string();
                    if !cleaned.is_empty() {
                        ops::find_message_id_by_header(&pool_for_record, account_id, &cleaned).ok().flatten()
                    } else {
                        None
                    }
                } else {
                    None
                };

                // 2. Build a thread_id consistent with how incoming messages
                //    compute theirs. If we have a parent, use the parent's
                //    thread_id (so the new mail joins the same conversation).
                //    Otherwise the new message's own (unknown yet) id will be
                //    used as the root.
                let thread_id = if let Some(pid) = parent_msg_id {
                    // Look up the parent's message_id_header, then resolve
                    // its thread_id. (We have an id, not a header.)
                    let parent_header: Option<String> = {
                        let conn = pool_for_record.get().ok();
                        conn.and_then(|c| {
                            c.query_row(
                                "SELECT message_id_header FROM mail_messages WHERE id = ?1",
                                rusqlite::params![pid],
                                |row| row.get::<_, String>(0),
                            ).ok()
                        })
                    };
                    parent_header
                        .and_then(|hdr| ops::get_thread_id_by_message_id(&pool_for_record, account_id, &hdr).ok().flatten())
                        .unwrap_or_default()
                } else {
                    String::new()
                };

                // 3. Find the Sent folder for this account; default to creating
                //    a placeholder entry otherwise.
                let sent_folder_id = ops::list_folders(&pool_for_record, account_id)
                    .ok()
                    .and_then(|folders| folders.into_iter().find(|f| f.role == "sent"))
                    .and_then(|f| f.id)
                    .unwrap_or(0);

                let now = chrono::Utc::now();
                let _date_iso = now.format("%Y-%m-%d %H:%M:%S").to_string();

                let new_msg = MailMessage {
                    id: None,
                    account_id,
                    remote_uid: -1, // outgoing, no IMAP UID yet
                    message_id_header: format!("<{}.{}@easywork.local>",
                        now.timestamp_millis(), account_id),
                    subject: subject_for_record,
                    from_name: from_name_for_record.unwrap_or_else(|| account_email_for_record.clone()),
                    from_email: account_email_for_record,
                    to_list: serde_json::to_string(&to_list_for_record).unwrap_or_default(),
                    cc_list: serde_json::to_string(&cc_list_for_record).unwrap_or_default(),
                    date: now.to_rfc3339(),
                    body_text: body_text_for_record,
                    body_html: body_html_for_record.unwrap_or_default(),
                    is_read: true,
                    is_starred: false,
                    has_attachment: !attachments.is_empty(),
                    size: 0,
                    folder_ids: if sent_folder_id > 0 { vec![sent_folder_id] } else { vec![] },
                    thread_id: thread_id.clone(),
                };

                let new_id = ops::insert_message(&pool_for_record, &new_msg).ok();

                // 4. After the row exists, set thread_id to the row's own id
                //    if we have no parent (new thread root).
                if let Some(new_id) = new_id {
                    if thread_id.is_empty() {
                        let _ = ops::update_message_thread_id(&pool_for_record, new_id, &new_id.to_string());
                    }
                    if sent_folder_id > 0 {
                        let _ = ops::insert_message_folder(&pool_for_record, new_id, sent_folder_id);
                    }
                }

                Ok((new_id, parent_msg_id))
            })
            .await
            .unwrap_or_else(|e| Err(format!("后台记录已发送邮件失败: {}", e)));

            let (new_id, parent_id) = match record_result {
                Ok(v) => v,
                Err(e) => {
                    log::warn!("send_mail: SMTP succeeded but local record failed: {}", e);
                    (None, None)
                }
            };

            Ok(SendResult {
                success: true,
                error: None,
                linked_message_id: parent_id,
                new_message_id: new_id,
            })
        }
        Err(e) => {
            log::error!("[{}] send_mail FAILED {}", trace_id, serde_json::json!({"error": e.to_string()}));
            Ok(SendResult {
                success: false,
                error: Some(format!("发送失败: {}", e)),
                linked_message_id: None,
                new_message_id: None,
            })
        }
    }
}

// ==================== Attachments ====================

#[tauri::command]
pub async fn list_message_attachments(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let attachments = ops::list_attachments(&pool, message_id).map_err(|e| e.to_string())?;
    Ok(attachments.into_iter().map(|(id, filename, content_type, size, local_path, content_id)| {
        serde_json::json!({
            "id": id,
            "filename": filename,
            "content_type": content_type,
            "size": size,
            "local_path": local_path,
            "content_id": content_id,
        })
    }).collect())
}

/// Manually download a lazy attachment (one that was not auto-downloaded during sync
/// because its size exceeded MAX_AUTO_ATTACHMENT_SIZE).
///
/// Flow:
///   1. Look up the attachment record by ID to get message_id and filename.
///   2. Look up the message's remote info (account_id, remote_uid).
///   3. Connect to the IMAP server and fetch the full raw message.
///   4. Parse the raw message and extract the matching attachment by filename.
///   5. Save the attachment to disk and update the DB record's local_path.
///   6. Return the local_path so the frontend can open it immediately.
#[allow(dead_code)]
#[tauri::command]
pub async fn download_attachment(
    pool: State<'_, DbPool>,
    attachment_id: i64,
    message_id: i64,
) -> Result<String, String> {
    let trace_id = crate::logging::trace_id();
    log::info!("[{trace_id}] download_attachment START att_id={} msg_id={}", attachment_id, message_id);

    // 1. Get attachment metadata from DB
    let all_atts = ops::list_attachments(&pool, message_id).map_err(|e| e.to_string())?;
    let (att_filename, _att_content_type, att_size) = all_atts
        .into_iter()
        .find(|(id, _, _, _, _, _)| *id == attachment_id)
        .map(|(_, filename, content_type, size, _, _)| (filename, content_type, size))
        .ok_or_else(|| format!("Attachment {} not found for message {}", attachment_id, message_id))?;

    // 2. Get message remote info
    let (account_id, remote_uid, _subject, folder_remote_id) = ops::get_message_remote_info(&pool, message_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Message {} not found", message_id))?;

    // 3. Get account credentials
    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    log::info!(
        "[{trace_id}] download_attachment: msg remote_uid={}, folder='{}', filename='{}' ({} bytes)",
        remote_uid, folder_remote_id, att_filename, att_size,
    );

    // 4. Connect to IMAP and fetch the full message
    let mut session = mail::imap::connect(
        &account.imap_host, account.imap_port, &account.email, &password, account.use_tls,
    ).await.map_err(|e| format!("IMAP连接失败: {}", e))?;

    let _ = mail::imap::select_folder(&mut session, &folder_remote_id).await
        .map_err(|e| format!("选择文件夹失败: {}", e))?;

    let raw = mail::imap::fetch_message_raw_by_uid(&mut session, remote_uid as u32).await
        .map_err(|e| format!("拉取邮件失败: {}", e))?;

    let _ = mail::imap::logout(session).await;

    // 5. Parse and extract the specific attachment
    let extracted = mail::parser::extract_attachment_by_name(&raw, &att_filename)
        .map_err(|e| format!("提取附件失败: {}", e))?;

    // 6. Save to disk
    let base_dir = ops::get_config(&pool, "app_data_dir")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from(".")));
    let attach_dir = base_dir.join("mail_attachments").join(message_id.to_string());
    let _ = std::fs::create_dir_all(&attach_dir);
    let safe_name = sanitize_filename::sanitize(&att_filename);
    let local_path = attach_dir.join(&safe_name);
    std::fs::write(&local_path, &extracted).map_err(|e| format!("写入附件文件失败: {}", e))?;

    // 7. Update DB record
    ops::update_attachment_path(&pool, attachment_id, &local_path.to_string_lossy())
        .map_err(|e| format!("更新附件记录失败: {}", e))?;

    log::info!(
        "[{trace_id}] download_attachment OK: att_id={} saved to {} ({} bytes)",
        attachment_id, local_path.display(), extracted.len(),
    );

    Ok(local_path.to_string_lossy().to_string())
}

// ==================== File Operations ====================

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("打开文件失败: {}", e))
}

#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data))
}

// ==================== Contacts ====================

#[tauri::command]
pub async fn add_contact(
    pool: State<'_, DbPool>,
    contact: MailContact,
) -> Result<i64, String> {
    ops::insert_contact(&pool, &contact).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_contacts(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Vec<MailContact>, String> {
    ops::list_contacts(&pool, account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_contact(
    pool: State<'_, DbPool>,
    id: i64,
) -> Result<(), String> {
    ops::delete_contact(&pool, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_contact(
    pool: State<'_, DbPool>,
    contact: MailContact,
) -> Result<(), String> {
    ops::update_contact(&pool, &contact).map_err(|e| e.to_string())
}

// ─── v1.1 Contact Groups ───

#[tauri::command]
pub async fn list_contact_groups(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Vec<MailContactGroup>, String> {
    ops::list_contact_groups(&pool, account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_contact_group(
    pool: State<'_, DbPool>,
    group: MailContactGroup,
) -> Result<i64, String> {
    ops::insert_contact_group(&pool, &group).map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "group_exists".to_string()
        } else {
            msg
        }
    })
}

#[tauri::command]
pub async fn update_contact_group(
    pool: State<'_, DbPool>,
    group: MailContactGroup,
) -> Result<(), String> {
    ops::update_contact_group(&pool, &group).map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "group_exists".to_string()
        } else {
            msg
        }
    })
}

#[tauri::command]
pub async fn delete_contact_group(
    pool: State<'_, DbPool>,
    id: i64,
) -> Result<i64, String> {
    ops::delete_contact_group(&pool, id).map_err(|e| e.to_string())
}

// ─── v1.1 Find Contact + Search by Email ───

#[tauri::command]
pub async fn find_contact_by_email(
    pool: State<'_, DbPool>,
    email: String,
    account_id: Option<i64>,
) -> Result<Option<MailContact>, String> {
    ops::find_contact_by_email(&pool, &email, account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_messages_by_email(
    pool: State<'_, DbPool>,
    email: String,
    account_ids: Option<Vec<i64>>,
    limit: Option<i64>,
) -> Result<ContactMailSummary, String> {
    let ids_slice = account_ids.as_deref();
    ops::search_messages_by_email(&pool, &email, ids_slice, limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

// ==================== Sync ====================

#[tauri::command]
pub async fn test_connection(
    account: MailAccount,
) -> Result<String, String> {
    let trace_id = crate::logging::trace_id();
    let params = serde_json::json!({
        "imap_host": account.imap_host,
        "imap_port": account.imap_port,
        "email": account.email,
    });
    log::info!("[{}] test_connection START {}", trace_id, params);

    let result = mail::imap::connect(
        &account.imap_host,
        account.imap_port,
        &account.email,
        &account.password,
        account.use_tls,
    ).await;

    match result {
        Ok(session) => {
            let _ = mail::imap::logout(session).await;
            log::info!("[{}] test_connection SUCCESS", trace_id);
            Ok("连接成功: IMAP 服务器可达，认证通过".into())
        }
        Err(e) => {
            let msg = e.to_string();
            // Classify the error for better user feedback
            let (error_type, user_msg) = if msg.contains("超时") {
                ("TIMEOUT", format!("连接超时: 无法在 15 秒内连接到 {}:{}\n请检查服务器地址和网络连接", account.imap_host, account.imap_port))
            } else if msg.contains("ILLEGAL.EMAIL") || msg.contains("ILLEGAL_EMAIL") {
                ("ILLEGAL_EMAIL", "登录失败: 用户名格式不正确，请使用完整的邮箱地址（如 user@domain.com）作为用户名".into())
            } else if msg.contains("authentication") || msg.contains("AUTHENTICATIONFAILED") || msg.contains("Login") {
                ("AUTH_FAILED", "登录失败: 用户名或密码/授权码不正确".into())
            } else if msg.contains("No such host") || msg.contains("dns") || msg.contains("Name or service not known") {
                ("DNS_FAILED", format!("无法解析服务器地址: {}\n请检查 IMAP 服务器域名是否正确", account.imap_host))
            } else if msg.contains("Connection refused") {
                ("CONN_REFUSED", format!("连接被拒绝: {}:{}\n端口可能不对或服务器未开启 IMAP", account.imap_host, account.imap_port))
            } else {
                ("UNKNOWN", format!("连接失败: {}", msg))
            };
            log::error!("[{}] test_connection FAILED {}", trace_id, serde_json::json!({"error_type": error_type, "error": msg}));
            Err(user_msg)
        }
    }
}

// ---- Sync implementation (shared between command and tray) ----

pub async fn sync_account_impl(
    pool: DbPool,
    account_id: i64,
) -> Result<SyncResult, String> {
    sync_account_impl_with_lock(pool, account_id, None).await
}

/// Inner implementation that also takes an optional `SyncLock` to prevent
/// concurrent syncs of the same account from the manual button, auto-fetch
/// scheduler, and smart-poll worker.
pub async fn sync_account_impl_with_lock(
    pool: DbPool,
    account_id: i64,
    sync_lock: Option<&SyncLock>,
) -> Result<SyncResult, String> {
    // ── Acquire per-account lock if provided ──
    // RAII guard releases the lock on every return path (Ok / Err / panic).
    let _guard = match sync_lock {
        Some(lock) => Some(SyncLockGuard::acquire(lock, account_id)?),
        None => None,
    };

    let trace_id = crate::logging::trace_id();
    let params = serde_json::json!({
        "account_id": account_id,
    });
    log::info!("[{}] sync_account START {}", trace_id, params);

    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    let period_days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };
    log::info!("Sync period: {} days, connecting to {}:{}", period_days, account.imap_host, account.imap_port);

    let mut session = mail::imap::connect(
        &account.imap_host,
        account.imap_port,
        &account.email,
        &password,
        account.use_tls,
    )
    .await
    .map_err(|e| {
        log::error!("IMAP connect failed for account {}: {}", account_id, e);
        format!("IMAP 连接失败: {}", e)
    })?;

    let remote_folders = mail::imap::list_folders(&mut session)
        .await
        .map_err(|e| {
            log::error!("Folder list failed: {}", e);
            format!("文件夹列表失败: {}", e)
        })?;

    let mut folder_db_ids: Vec<(String, i64)> = Vec::new();
    for (remote_id, name, role) in &remote_folders {
        let folder = MailFolder {
            id: None,
            account_id,
            remote_id: remote_id.clone(),
            name: name.clone(),
            role: role.clone(),
            folder_type: "user".to_string(),
        };
        let db_id = ops::insert_folder(&pool, &folder).map_err(|e| e.to_string())?;
        folder_db_ids.push((remote_id.clone(), db_id));
    }

    log::info!("Synced {} folders for account {}", folder_db_ids.len(), account_id);

    // ── Detect first sync: if no messages exist, use header-only mode ──
    let existing_count = ops::count_account_messages(&pool, account_id)
        .map_err(|e| format!("检查账户邮件数失败: {e}"))?;
    let is_first_sync = existing_count == 0;
    log::info!(
        "Account {}: {} existing messages → first_sync={}",
        account_id, existing_count, is_first_sync,
    );

    let mut total_new = 0usize;
    let mut total_all = 0usize;
    let mut total_failed_parse = 0usize;
    let mut total_failed_insert = 0usize;
    let mut folders_skipped = 0usize;

    for (folder_name, folder_db_id) in &folder_db_ids {
        // NOTE: We do NOT call select_folder here — fetch_uids_since does its
        // own SELECT internally, so this avoids the redundant second SELECT
        // that previously showed up in the IMAP logs.

        let remote_uids = match mail::imap::fetch_uids_since(&mut session, folder_name, period_days).await {
            Ok(uids) => uids,
            Err(e) => {
                log::warn!("Failed to fetch UIDs for '{}': {}", folder_name, e);
                folders_skipped += 1;
                continue;
            }
        };

        if remote_uids.is_empty() {
            continue;
        }

        log::info!("Folder '{}': found {} UIDs to fetch", folder_name, remote_uids.len());

        let batch_size = 50usize;
        if is_first_sync {
            log::info!(
                "First sync for account {} — fetching full bodies (will skip attachments >5MB)",
                account_id,
            );
        }

        for chunk in remote_uids.chunks(batch_size) {
            total_all += chunk.len();

                // ── Always fetch full bodies (headers-only was too aggressive: no body, no has_attachment flag).
                //    Attachments >5MB are still skipped (see attachment handling below). ──
                let raw_msgs = match mail::imap::fetch_messages_raw_batch(&mut session, chunk).await {
                    Ok(msgs) => {
                        log::info!(
                            "Folder '{}': fetched {}/{} full messages{}",
                            folder_name, msgs.len(), chunk.len(),
                            if is_first_sync { " (first sync)" } else { "" },
                        );
                        msgs
                    }
                    Err(e) => {
                        log::warn!("Failed to fetch batch in '{}': {}", folder_name, e);
                        continue;
                    }
                };

                let chunk_uids: Vec<i64> = raw_msgs.iter().map(|(uid, _)| *uid as i64).collect();
                let existing_uids = ops::get_existing_remote_uids(&pool, account_id, &chunk_uids)
                    .unwrap_or_default();

                for (uid, raw) in raw_msgs {
                    if existing_uids.contains(&(uid as i64)) {
                        continue;
                    }

                    match mail::parser::parse_raw_message(&raw) {
                        Ok(parsed) => {
                            let thread_id = mail::thread::compute_thread_id(
                                &parsed.message_id,
                                &parsed.in_reply_to,
                                &parsed.references,
                                &parsed.subject,
                            );

                            let msg = MailMessage {
                                id: None,
                                account_id,
                                remote_uid: uid as i64,
                                message_id_header: parsed.message_id,
                                subject: if parsed.subject.is_empty() { "(无主题)".to_string() } else { parsed.subject },
                                from_name: parsed.from_name,
                                from_email: parsed.from_email,
                                to_list: serde_json::to_string(&parsed.to_list).unwrap_or_else(|_| "[]".into()),
                                cc_list: serde_json::to_string(&parsed.cc_list).unwrap_or_else(|_| "[]".into()),
                                date: parsed.date,
                                body_text: parsed.body_text.clone(),
                                body_html: parsed.body_html,
                                is_read: false,
                                is_starred: false,
                                has_attachment: !parsed.attachments.is_empty(),
                                size: raw.len() as i64,
                                folder_ids: vec![*folder_db_id],
                                thread_id,
                            };
                            match ops::insert_message(&pool, &msg) {
                                Ok(msg_id) => {
                                    let _ = ops::insert_message_folder(&pool, msg_id, *folder_db_id);
                                    let _ = ops::fts_insert(&pool, msg_id, &msg.subject, &msg.from_name, &msg.from_email, &parsed.body_text);
                                    if !parsed.attachments.is_empty() {
                                        let base_dir = ops::get_config(&pool, "app_data_dir")
                                            .map(std::path::PathBuf::from)
                                            .unwrap_or_else(|| std::env::current_dir()
                                                .unwrap_or_else(|_| std::path::PathBuf::from(".")));
                                        let attach_dir = base_dir.join("mail_attachments").join(msg_id.to_string());
                                        let _ = std::fs::create_dir_all(&attach_dir);
                                        for att in &parsed.attachments {
                                            let safe_name = sanitize_filename::sanitize(&att.filename);
                                            let local_path = attach_dir.join(&safe_name);
                                            // Skip auto-download for large attachments (>5MB).
                                            // Record metadata with empty local_path so the user
                                            // can download on demand via download_attachment.
                                            if att.size as i64 > MAX_AUTO_ATTACHMENT_SIZE {
                                                log::info!(
                                                    "Skipping auto-download for large attachment: '{}' ({} bytes) message_id={}",
                                                    att.filename, att.size, msg_id,
                                                );
                                                // Insert with empty local_path (lazy marker)
                                                let _ = ops::insert_attachment(
                                                    &pool, msg_id, &att.filename, &att.content_type,
                                                    att.size as i64, "", "",
                                                );
                                            } else {
                                                let _ = std::fs::write(&local_path, &att.content);
                                                let _ = ops::insert_attachment(
                                                    &pool, msg_id, &att.filename, &att.content_type,
                                                    att.size as i64, &local_path.to_string_lossy(), "",
                                                );
                                            }
                                        }
                                    }
                                    total_new += 1;
                                }
                                Err(e) => {
                                    total_failed_insert += 1;
                                    log::warn!("Failed to insert message uid={}: {}", uid, e);
                                }
                            }
                        }
                        Err(e) => {
                            total_failed_parse += 1;
                            log::warn!("Failed to parse message uid={}: {}", uid, e);
                        }
                    }
                }
        }
    }

    let sync_state = serde_json::json!({
        "last_sync_at": chrono::Utc::now().to_rfc3339(),
        "messages_new": total_new,
        "period_days": period_days,
    });
    let _ = ops::update_sync_state(&pool, account_id, &sync_state.to_string());

    let _ = mail::imap::logout(session).await;

    let result = serde_json::json!({
        "folders_count": folder_db_ids.len(),
        "messages_new": total_new,
        "messages_total": total_all,
        "folders_skipped": folders_skipped,
        "parse_failures": total_failed_parse,
        "insert_failures": total_failed_insert,
    });
    log::info!("[{}] sync_account SUCCESS {}", trace_id, result);

    Ok(SyncResult {
        success: true,
        folders_count: folder_db_ids.len(),
        messages_new: total_new,
        messages_total: total_all,
        folders_skipped,
        messages_failed_parse: total_failed_parse,
        messages_failed_insert: total_failed_insert,
        error: None,
    })
}

#[tauri::command]
pub async fn sync_account(
    pool: State<'_, DbPool>,
    sync_lock: State<'_, SyncLock>,
    account_id: i64,
) -> Result<SyncResult, String> {
    sync_account_impl_with_lock(
        pool.inner().clone(),
        account_id,
        Some(sync_lock.inner()),
    ).await
}

// ==================== Config & Tray Commands ====================

#[tauri::command]
pub async fn get_auto_fetch_interval(pool: State<'_, DbPool>) -> Result<i64, String> {
    Ok(ops::get_config(&pool, "auto_fetch_interval")
        .and_then(|v| v.parse().ok())
        .unwrap_or(300))
}

#[tauri::command]
pub async fn set_auto_fetch_interval(pool: State<'_, DbPool>, interval_secs: i64) -> Result<(), String> {
    ops::set_config(&pool, "auto_fetch_interval", &interval_secs.to_string());
    Ok(())
}

#[tauri::command]
pub async fn get_close_behavior(pool: State<'_, DbPool>) -> Result<String, String> {
    Ok(ops::get_config(&pool, "close_behavior").unwrap_or_else(|| "minimize".to_string()))
}

#[tauri::command]
pub async fn set_close_behavior(pool: State<'_, DbPool>, behavior: String) -> Result<(), String> {
    if behavior != "minimize" && behavior != "exit" {
        return Err("无效的关闭行为，支持: minimize, exit".into());
    }
    ops::set_config(&pool, "close_behavior", &behavior);
    Ok(())
}

#[tauri::command]
pub async fn get_unread_count(pool: State<'_, DbPool>, account_id: i64) -> Result<i64, String> {
    Ok(ops::get_unread_message_count(&pool, account_id))
}

// ==================== Reconciliation ====================

#[tauri::command]
pub async fn reconcile_account(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<serde_json::Value, String> {
    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    let (flag_changes, deletions) = mail::reconcile::reconcile_account(
        &pool, &account, account_id, &password,
    ).await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "flag_changes": flag_changes,
        "deletions": deletions,
    }))
}

// ==================== Pending Ops ====================

#[tauri::command]
pub async fn get_pending_ops_summary(
    pool: State<'_, DbPool>,
) -> Result<serde_json::Value, String> {
    ops::get_pending_ops_summary(&pool).map_err(|e| e.to_string())
}

// ==================== Remote Images Config ====================

#[tauri::command]
pub async fn get_remote_images_enabled(pool: State<'_, DbPool>) -> Result<bool, String> {
    let val = ops::get_config(&pool, "remote_images_enabled");
    Ok(val.as_deref().map(|v| v == "1").unwrap_or(true))
}

#[tauri::command]
pub async fn set_remote_images_enabled(pool: State<'_, DbPool>, enabled: bool) -> Result<(), String> {
    ops::set_config(&pool, "remote_images_enabled", if enabled { "1" } else { "0" });
    Ok(())
}

// ==================== Signatures ====================

#[tauri::command]
pub async fn list_signatures(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Vec<MailSignature>, String> {
    ops::list_signatures(&pool, account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_signature(
    pool: State<'_, DbPool>,
    signature: MailSignature,
) -> Result<i64, String> {
    ops::insert_signature(&pool, &signature).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_signature(
    pool: State<'_, DbPool>,
    signature: MailSignature,
) -> Result<(), String> {
    ops::update_signature(&pool, &signature).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_signature(
    pool: State<'_, DbPool>,
    id: i64,
) -> Result<(), String> {
    ops::delete_signature(&pool, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_default_signature(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Option<MailSignature>, String> {
    ops::get_default_signature(&pool, account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_default_signature(
    pool: State<'_, DbPool>,
    id: i64,
) -> Result<(), String> {
    ops::set_default_signature(&pool, id).map_err(|e| e.to_string())
}
