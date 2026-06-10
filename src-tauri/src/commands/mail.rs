use tauri::State;
use crate::db::ops;
use crate::db::DbPool;
use crate::mail::{self, MailAccount, MailFolder, MailMessage, MailMessageSummary, MailContact};
use base64::Engine;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub folders_count: usize,
    pub messages_new: usize,
    pub messages_total: usize,
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
}

// ==================== Account ====================

#[tauri::command]
pub async fn add_account(
    pool: State<'_, DbPool>,
    account: MailAccount,
) -> Result<i64, String> {
    let id = ops::insert_account(&pool, &account).map_err(|e| e.to_string())?;
    log::info!("Account added: id={}, email={}", id, account.email);
    Ok(id)
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
    if account.id.is_none() {
        return Err("Account ID is required for update".into());
    }
    ops::update_account(&pool, &account).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_unread_counts(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<Vec<(i64, i64)>, String> {
    ops::folder_unread_counts(&pool, account_id).map_err(|e| e.to_string())
}

// ==================== Messages ====================

#[tauri::command]
pub async fn fetch_messages(
    pool: State<'_, DbPool>,
    account_id: i64,
    folder_id: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<Vec<MailMessageSummary>, String> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(50);
    ops::list_messages(&pool, account_id, folder_id, page, page_size)
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
    if let Ok(Some((account_id, remote_uid, _subject))) = ops::get_message_remote_info(&pool, message_id) {
        let payload = serde_json::json!({
            "remote_uid": remote_uid,
            "is_read": is_read,
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
    if let Ok(Some((account_id, remote_uid, _subject))) = ops::get_message_remote_info(&pool, message_id) {
        let payload = serde_json::json!({
            "remote_uid": remote_uid,
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
    if let Ok(Some((account_id, remote_uid, _subject))) = ops::get_message_remote_info(&pool, message_id) {
        let payload = serde_json::json!({
            "remote_uid": remote_uid,
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
    log::info!("Sending mail from account {}: subject='{}' to='{}'", request.account_id, request.subject, request.to);

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
        &account.username,
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
    ).await {
        Ok(()) => {
            log::info!("Mail sent successfully from {} (to={}, cc={}, bcc={}, attachments={})",
                account.email, to_list.len(), cc_list.len(), bcc_list.len(), attachments.len());
            Ok(SendResult { success: true, error: None })
        }
        Err(e) => {
            log::error!("Failed to send mail: {}", e);
            Ok(SendResult {
                success: false,
                error: Some(format!("发送失败: {}", e)),
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

// ==================== Sync ====================

#[tauri::command]
pub async fn test_connection(
    account: MailAccount,
) -> Result<String, String> {
    log::info!("Testing IMAP connection to {}:{}", account.imap_host, account.imap_port);
    match mail::imap::connect(
        &account.imap_host,
        account.imap_port,
        &account.username,
        &account.password,
    ).await {
        Ok(session) => {
            let _ = mail::imap::logout(session).await;
            Ok("连接成功: IMAP 服务器可达，认证通过".into())
        }
        Err(e) => {
            log::warn!("IMAP connection test failed: {}", e);
            Err(format!("连接失败: {}", e))
        }
    }
}

// ---- Sync implementation (shared between command and tray) ----

pub async fn sync_account_impl(
    pool: DbPool,
    account_id: i64,
) -> Result<SyncResult, String> {
    log::info!("Starting sync for account {}", account_id);

    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    let period_days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };
    log::info!("Sync period: {} days, connecting to {}:{}", period_days, account.imap_host, account.imap_port);

    let mut session = mail::imap::connect(
        &account.imap_host,
        account.imap_port,
        &account.username,
        &password,
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

    let mut total_new = 0usize;
    let mut total_all = 0usize;
    let mut total_parsed = 0usize;
    let mut total_failed_parse = 0usize;
    let mut total_failed_insert = 0usize;

    for (folder_name, folder_db_id) in &folder_db_ids {
        if let Err(e) = mail::imap::select_folder(&mut session, folder_name).await {
            log::warn!("Failed to select folder '{}': {}", folder_name, e);
            continue;
        }

        let remote_uids = match mail::imap::fetch_uids_since(&mut session, folder_name, period_days).await {
            Ok(uids) => uids,
            Err(e) => {
                log::warn!("Failed to fetch UIDs for '{}': {}", folder_name, e);
                continue;
            }
        };

        if remote_uids.is_empty() {
            continue;
        }

        log::info!("Folder '{}': found {} UIDs to fetch", folder_name, remote_uids.len());

        let batch_size = 50usize;
        for chunk in remote_uids.chunks(batch_size) {
            total_all += chunk.len();

            let raw_msgs = match mail::imap::fetch_messages_raw_batch(&mut session, chunk).await {
                Ok(msgs) => {
                    log::info!(
                        "Folder '{}': fetched {}/{} bodies, about to parse+store",
                        folder_name, msgs.len(), chunk.len()
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
                        total_parsed += 1;

                        match ops::insert_message(&pool, &msg) {
                            Ok(msg_id) => {
                                let _ = ops::insert_message_folder(&pool, msg_id, *folder_db_id);
                                let _ = ops::fts_insert(&pool, msg_id, &msg.subject, &msg.from_name, &msg.from_email, &parsed.body_text);
                                if !parsed.attachments.is_empty() {
                                    let app_data_dir = std::env::current_dir()
                                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                                    let attach_dir = app_data_dir.join("mail_attachments").join(msg_id.to_string());
                                    let _ = std::fs::create_dir_all(&attach_dir);
                                    for att in &parsed.attachments {
                                        let safe_name = sanitize_filename::sanitize(&att.filename);
                                        let local_path = attach_dir.join(&safe_name);
                                        let _ = std::fs::write(&local_path, &att.content);
                                        let _ = ops::insert_attachment(
                                            &pool, msg_id, &att.filename, &att.content_type,
                                            att.size as i64, &local_path.to_string_lossy(), "",
                                        );
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

    log::info!(
        "Sync complete for account {}: {} folders, {} new / {} total",
        account_id, folder_db_ids.len(), total_new, total_all
    );

    Ok(SyncResult {
        success: true,
        folders_count: folder_db_ids.len(),
        messages_new: total_new,
        messages_total: total_all,
        error: None,
    })
}

#[tauri::command]
pub async fn sync_account(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<SyncResult, String> {
    sync_account_impl(pool.inner().clone(), account_id).await
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
