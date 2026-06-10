use tauri::State;
use crate::db::ops;
use crate::db::DbPool;
use crate::mail::{self, MailAccount, MailFolder, MailMessage, MailMessageSummary};

/// Structured sync result returned to frontend
#[derive(serde::Serialize)]
pub struct SyncResult {
    pub success: bool,
    pub folders_count: usize,
    pub messages_new: usize,
    pub messages_total: usize,
    pub error: Option<String>,
}

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
    if let Some(id) = account.id {
        ops::delete_account(&pool, id).map_err(|e| e.to_string())?;
        ops::insert_account(&pool, &account).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Account ID is required for update".into())
    }
}

#[tauri::command]
pub async fn fetch_messages(
    pool: State<'_, DbPool>,
    account_id: i64,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<Vec<MailMessageSummary>, String> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(50);
    ops::list_messages(&pool, account_id, None, page, page_size)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_message_body(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<serde_json::Value, String> {
    let (body_text, body_html) = ops::get_message_body(&pool, message_id)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "body_text": body_text,
        "body_html": body_html,
    }))
}

#[tauri::command]
pub async fn mark_message_read(
    pool: State<'_, DbPool>,
    message_id: i64,
    is_read: bool,
) -> Result<(), String> {
    ops::mark_read(&pool, message_id, is_read).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_message_star(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<bool, String> {
    ops::toggle_star(&pool, message_id).map_err(|e| e.to_string())
}

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

/// Full IMAP sync: connect → list folders → fetch by date range → store
#[tauri::command]
pub async fn sync_account(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<SyncResult, String> {
    log::info!("Starting sync for account {}", account_id);

    // 1. Get account with password and sync_period_days from DB
    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    let period_days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };
    log::info!("Sync period: {} days, connecting to {}:{}", period_days, account.imap_host, account.imap_port);

    // 2. Connect IMAP
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

    // 3. List folders → store in DB
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

    // 4. For each folder, fetch messages using date-based search
    let mut total_new = 0usize;
    let mut total_all = 0usize;
    let mut total_parsed = 0usize;
    let mut total_failed_parse = 0usize;
    let mut total_failed_insert = 0usize;

    for (folder_name, folder_db_id) in &folder_db_ids {
        // Select folder
        if let Err(e) = mail::imap::select_folder(&mut session, folder_name).await {
            log::warn!("Failed to select folder '{}': {}", folder_name, e);
            continue;
        }

        // Get UIDs since sync_period_days ago
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

        // Fetch in batches of 50 to avoid overwhelming the server
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

            // Bulk dedup: skip UIDs that already exist in DB (Pebble pattern)
            let chunk_uids: Vec<i64> = raw_msgs.iter().map(|(uid, _)| *uid as i64).collect();
            let existing_uids = ops::get_existing_remote_uids(&pool, account_id, &chunk_uids)
                .unwrap_or_default();
            log::info!(
                "Folder '{}' chunk: {} bodies, {} already in DB",
                folder_name, raw_msgs.len(), existing_uids.len()
            );

            // Parse and store each message
            for (uid, raw) in raw_msgs {
                // Skip if already synced
                if existing_uids.contains(&(uid as i64)) {
                    continue;
                }

                match mail::parser::parse_raw_message(&raw) {
                    Ok(parsed) => {
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
                            body_text: parsed.body_text,
                            body_html: parsed.body_html,
                            is_read: false,
                            is_starred: false,
                            has_attachment: !parsed.attachments.is_empty(),
                            size: raw.len() as i64,
                            folder_ids: vec![*folder_db_id],
                        };
                        total_parsed += 1;

                        match ops::insert_message(&pool, &msg) {
                            Ok(msg_id) => {
                                let _ = ops::insert_message_folder(&pool, msg_id, *folder_db_id);
                                total_new += 1;
                            }
                            Err(e) => {
                                total_failed_insert += 1;
                                log::warn!(
                                    "Failed to insert message uid={} from='{}' subject='{}': {}",
                                    uid, msg.from_email, msg.subject, e
                                );
                            }
                        }
                    }
                    Err(e) => {
                        total_failed_parse += 1;
                        log::warn!(
                            "Failed to parse message uid={} ({} bytes): {}",
                            uid, raw.len(), e
                        );
                    }
                }
            }
        }
    }

    // 5. Update sync state
    let sync_state = serde_json::json!({
        "last_sync_at": chrono::Utc::now().to_rfc3339(),
        "messages_new": total_new,
        "period_days": period_days,
    });
    let _ = ops::update_sync_state(&pool, account_id, &sync_state.to_string());

    // 6. Logout
    let _ = mail::imap::logout(session).await;

    log::info!(
        "Sync complete for account {}: {} folders, {} new / {} total fetched ({} parsed, {} parse-fail, {} insert-fail), period={}d",
        account_id, folder_db_ids.len(), total_new, total_all, total_parsed, total_failed_parse, total_failed_insert, period_days
    );

    Ok(SyncResult {
        success: true,
        folders_count: folder_db_ids.len(),
        messages_new: total_new,
        messages_total: total_all,
        error: None,
    })
}
