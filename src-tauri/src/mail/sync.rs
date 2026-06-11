use crate::db::{ops, DbPool};
use crate::mail::{self, MailFolder, MailMessage, PendingOp};
use std::time::Duration;

/// Start the background mail sync worker with exponential backoff + IDLE + reconcile.
pub async fn start_sync_worker(pool: DbPool) {
    let pool_clone = pool.clone();

    // Main poll loop
    tokio::spawn(async move {
        log::info!("Mail sync worker started (polling + IDLE mode)");

        let mut backoff: std::collections::HashMap<i64, u32> = std::collections::HashMap::new();
        let mut reconcile_tick = 0u64;

        tokio::time::sleep(Duration::from_secs(10)).await;

        loop {
            match poll_all_accounts(&pool, &mut backoff).await {
                Ok((accounts, messages)) => {
                    if accounts > 0 && messages > 0 {
                        log::info!("Background sync: {} accounts, {} new messages", accounts, messages);
                    }
                    if accounts > 0 {
                        if let Err(e) = execute_pending_ops(&pool).await {
                            log::warn!("Failed to execute pending ops: {}", e);
                        }
                    }
                }
                Err(e) => { log::error!("Background sync error: {}", e); }
            }

            // Periodic reconciliation (every ~15 minutes)
            reconcile_tick += 1;
            if reconcile_tick % 3 == 0 {
                reconcile_all_accounts(&pool_clone).await;
            }

            let interval = get_next_poll_delay(&pool, &backoff);
            log::debug!("Next sync in {}s", interval.as_secs());
            tokio::time::sleep(interval).await;
        }
    });
}

fn get_next_poll_delay(pool: &DbPool, backoff: &std::collections::HashMap<i64, u32>) -> Duration {
    let base = get_min_sync_interval(pool).unwrap_or(300);
    if let Some(&max_fails) = backoff.values().max() {
        if max_fails > 0 {
            return Duration::from_secs(compute_backoff(base, max_fails));
        }
    }
    Duration::from_secs(base)
}

fn compute_backoff(base_secs: u64, consecutive_failures: u32) -> u64 {
    if consecutive_failures == 0 { return base_secs; }
    let backoff = base_secs.saturating_mul(2u64.saturating_pow(consecutive_failures.saturating_sub(1)));
    backoff.clamp(base_secs.min(15), 300)
}

fn get_min_sync_interval(pool: &DbPool) -> Option<u64> {
    let accounts = ops::list_accounts(pool).ok()?;
    accounts.iter().map(|a| a.sync_interval_secs.max(60) as u64).min()
}

async fn poll_all_accounts(
    pool: &DbPool,
    backoff: &mut std::collections::HashMap<i64, u32>,
) -> Result<(usize, usize), String> {
    let accounts = ops::list_accounts(pool).map_err(|e| e.to_string())?;
    if accounts.is_empty() { return Ok((0, 0)); }

    let mut synced_accounts = 0usize;
    let mut total_new = 0usize;

    for account in &accounts {
        let account_id = match account.id { Some(id) => id, None => continue };
        let (_, password) = match ops::get_account_with_password(pool, account_id) {
            Ok(Some(v)) => v,
            Ok(None) => continue,
            Err(e) => { log::error!("Failed to read account {}: {}", account_id, e); continue; }
        };

        let days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };
        let mut session = match mail::imap::connect(&account.imap_host, account.imap_port, &account.email, &password).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Poll sync: IMAP connect failed for {}: {}", account.email, e);
                let fails = backoff.entry(account_id).or_insert(0);
                *fails = (*fails).saturating_add(1).min(10);
                continue;
            }
        };

        match sync_inbox_with_cursor(pool, &mut session, account_id, days).await {
            Ok(n) => { total_new += n; synced_accounts += 1; }
            Err(e) => {
                log::warn!("Inbox sync failed for {}: {}", account.email, e);
            }
        }

        // Sync all other user folders (Sent, Drafts, Archive, etc.)
        let folders = match mail::imap::list_folders(&mut session).await {
            Ok(f) => f,
            Err(e) => {
                log::warn!("Folder list failed for {}: {}", account.email, e);
                let _ = mail::imap::logout(session).await;
                let fails = backoff.entry(account_id).or_insert(0);
                *fails = (*fails).saturating_add(1).min(10);
                continue;
            }
        };

        for (remote_id, name, role) in &folders {
            if role == "inbox" || role == "trash" || role == "junk" {
                continue; // INBOX already done; trash/junk don't need syncing
            }
            match sync_folder_with_cursor(pool, &mut session, account_id, remote_id, role, days).await {
                Ok(n) => { total_new += n; }
                Err(e) => log::debug!("Folder '{}' sync: {}", remote_id, e),
            }
        }

        // Mark success
        backoff.remove(&account_id);
        let _ = mail::imap::logout(session).await;
    }
    Ok((synced_accounts, total_new))
}

/// Sync a specific folder using folder cursor for incremental update.
async fn sync_folder_with_cursor(
    pool: &DbPool,
    session: &mut mail::imap::ImapSession,
    account_id: i64,
    folder_name: &str,
    folder_role: &str,
    period_days: i64,
) -> Result<usize, String> {
    // Ensure the folder exists in local DB
    let folder_obj = MailFolder {
        id: None, account_id,
        remote_id: folder_name.into(),
        name: folder_name.into(),
        role: folder_role.into(),
        folder_type: "user".into(),
    };
    let folder_db_id = ops::insert_folder(pool, &folder_obj).map_err(|e| e.to_string())?;

    // Get cursor for incremental sync
    let cursor = ops::get_folder_cursor(pool, folder_db_id).unwrap_or(None);
    let last_uid = cursor.and_then(|c| c.2).unwrap_or(0);

    // Select folder and check for new UIDs
    let mailbox = mail::imap::select_folder(session, folder_name).await
        .map_err(|e| format!("Select '{}' failed: {}", folder_name, e))?;

    // Update cursor with UIDVALIDITY
    let _ = ops::update_folder_cursor(pool, folder_db_id, mailbox.uid_validity.map(|v| v as i64), None, None);

    // Determine which UIDs to fetch
    let uids: Vec<u32> = if last_uid > 0 {
        mail::imap::fetch_uids_since(session, folder_name, period_days).await
            .map_err(|e| format!("UID search in '{}' failed: {}", folder_name, e))?
            .into_iter()
            .filter(|&u| u > last_uid as u32)
            .collect()
    } else {
        mail::imap::fetch_uids_since(session, folder_name, period_days).await
            .map_err(|e| format!("UID search in '{}' failed: {}", folder_name, e))?
    };

    if uids.is_empty() { return Ok(0); }

    let all_uids_i64: Vec<i64> = uids.iter().map(|&u| u as i64).collect();
    let existing_uids = ops::get_existing_remote_uids(pool, account_id, &all_uids_i64).unwrap_or_default();
    let new_uids: Vec<u32> = uids.into_iter().filter(|u| !existing_uids.contains(&(*u as i64))).collect();

    if new_uids.is_empty() { return Ok(0); }

    let mut total_new = 0usize;
    let mut max_new_uid = 0u32;

    for chunk in new_uids.chunks(50) {
        let raw_msgs = mail::imap::fetch_messages_raw_batch(session, chunk).await
            .map_err(|e| format!("Batch fetch for '{}' failed: {}", folder_name, e))?;

        for (uid, raw) in raw_msgs {
            if let Ok(parsed) = mail::parser::parse_raw_message(&raw) {
                let thread_id = mail::thread::compute_thread_id(
                    &parsed.message_id, &parsed.in_reply_to,
                    &parsed.references, &parsed.subject,
                );

                let msg = MailMessage {
                    id: None, account_id, remote_uid: uid as i64,
                    message_id_header: parsed.message_id,
                    subject: if parsed.subject.is_empty() { "(无主题)".to_string() } else { parsed.subject },
                    from_name: parsed.from_name, from_email: parsed.from_email,
                    to_list: serde_json::to_string(&parsed.to_list).unwrap_or_default(),
                    cc_list: serde_json::to_string(&parsed.cc_list).unwrap_or_default(),
                    date: parsed.date, body_text: parsed.body_text.clone(),
                    body_html: parsed.body_html,
                    is_read: false, is_starred: false,
                    has_attachment: !parsed.attachments.is_empty(),
                    size: raw.len() as i64, folder_ids: vec![folder_db_id], thread_id,
                };

                if let Ok(msg_id) = ops::insert_message(pool, &msg) {
                    let _ = ops::insert_message_folder(pool, msg_id, folder_db_id);
                    let _ = ops::fts_insert(pool, msg_id, &msg.subject, &msg.from_name, &msg.from_email, &parsed.body_text);
                    if !parsed.attachments.is_empty() {
                        let base_dir = ops::get_config(pool, "app_data_dir")
                            .map(std::path::PathBuf::from)
                            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")));
                        let attach_dir = base_dir.join("mail_attachments").join(msg_id.to_string());
                        let _ = std::fs::create_dir_all(&attach_dir);
                        for att in &parsed.attachments {
                            let safe_name = sanitize_filename::sanitize(&att.filename);
                            let local_path = attach_dir.join(&safe_name);
                            let _ = std::fs::write(&local_path, &att.content);
                            let _ = ops::insert_attachment(pool, msg_id, &att.filename, &att.content_type, att.size as i64, &local_path.to_string_lossy(), "");
                        }
                    }
                    total_new += 1;
                    if uid > max_new_uid { max_new_uid = uid; }
                }
            }
        }
    }

    if total_new > 0 {
        let _ = ops::update_folder_cursor(pool, folder_db_id, None, None, Some(max_new_uid as i32));
    }
    Ok(total_new)
}

/// Sync INBOX using folder cursor for incremental update.
async fn sync_inbox_with_cursor(
    pool: &DbPool,
    session: &mut mail::imap::ImapSession,
    account_id: i64,
    period_days: i64,
) -> Result<usize, String> {
    sync_folder_with_cursor(pool, session, account_id, "INBOX", "inbox", period_days).await
}

/// Periodic flag reconciliation across all accounts.
async fn reconcile_all_accounts(pool: &DbPool) {
    let accounts = match ops::list_accounts(pool) {
        Ok(a) => a,
        Err(e) => { log::error!("Reconcile: failed to list accounts: {}", e); return; }
    };

    for account in &accounts {
        let account_id = match account.id { Some(id) => id, None => continue };
        let (_, password) = match ops::get_account_with_password(pool, account_id) {
            Ok(Some(v)) => v,
            _ => continue,
        };

        match mail::reconcile::reconcile_account(pool, account, account_id, &password).await {
            Ok((flags, deletions)) => {
                if flags > 0 || deletions > 0 {
                    log::info!("Reconciled account {}: {} flag changes, {} deletions", account_id, flags, deletions);
                }
            }
            Err(e) => log::warn!("Reconcile failed for account {}: {}", account_id, e),
        }

        // ---- Thread re-association: find mislinked threads and fix them ----
        if let Ok(mislinks) = ops::find_mislinked_threads(pool, account_id) {
            for (msg_id, _current_tid, msg_id_header, _subject) in &mislinks {
                // Look up the parent thread_id (message referenced by msg_id_header)
                if let Ok(Some(parent_tid)) = ops::get_thread_id_by_message_id(pool, account_id, msg_id_header) {
                    log::info!("Re-associating message {} (msg_id={}) to thread {}", msg_id, msg_id_header, parent_tid);
                    let _ = ops::update_message_thread_id(pool, *msg_id, &parent_tid);
                }
            }
            if !mislinks.is_empty() {
                log::info!("Re-associated {} threads for account {}", mislinks.len(), account_id);
            }
        }
    }
}

async fn execute_pending_ops(pool: &DbPool) -> Result<usize, String> {
    let accounts = ops::list_accounts(pool).map_err(|e| e.to_string())?;
    let mut processed = 0usize;

    for account in &accounts {
        let account_id = match account.id { Some(id) => id, None => continue };
        let pending = ops::list_pending_ops(pool, account_id).map_err(|e| e.to_string())?;
        let (_, password) = match ops::get_account_with_password(pool, account_id) {
            Ok(Some(v)) => v, _ => continue,
        };

        for op in &pending {
            let op_id = match op.id { Some(id) => id, None => continue };
            let result = execute_single_pending_op(pool, account, &password, op).await;
            match result {
                Ok(()) => { ops::update_pending_op_status(pool, op_id, "completed", None).unwrap_or_default(); processed += 1; }
                Err(e) => {
                    if op.attempts + 1 >= 5 {
                        ops::update_pending_op_status(pool, op_id, "failed", Some(&e)).unwrap_or_default();
                    } else {
                        ops::update_pending_op_status(pool, op_id, "retrying", Some(&e)).unwrap_or_default();
                    }
                }
            }
        }
    }
    if processed > 0 { log::info!("Executed {} pending ops", processed); }
    Ok(processed)
}

async fn execute_single_pending_op(
    pool: &DbPool,
    account: &crate::mail::MailAccount,
    password: &str,
    op: &PendingOp,
) -> Result<(), String> {
    let mut session = mail::imap::connect(&account.imap_host, account.imap_port, &account.email, password)
        .await.map_err(|e| format!("IMAP connect failed: {}", e))?;

    let result = match op.op_type.as_str() {
        "mark_read" => {
            // Parse payload: remote_uid, is_read, folder_remote_id
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&op.payload) {
                let remote_uid = payload["remote_uid"].as_i64().unwrap_or(0) as u32;
                let is_read = payload["is_read"].as_bool().unwrap_or(true);
                // Bug #4 fix: SELECT the right folder, not hard-coded "INBOX"
                let folder = payload["folder_remote_id"].as_str().unwrap_or("INBOX");
                if remote_uid > 0 {
                    let flags = if is_read { "+FLAGS (\\Seen)" } else { "-FLAGS (\\Seen)" };
                    log::info!("Executing pending mark_read: UID {} in '{}' -> {}", remote_uid, folder, flags);
                    if let Err(e) = mail::imap::select_folder(&mut session, folder).await {
                        log::warn!("mark_read: select '{}' failed: {}", folder, e);
                    }
                    mail::imap::store_flags(&mut session, remote_uid, flags).await
                        .map_err(|e| format!("IMAP STORE failed: {}", e))?;
                }
            }
            Ok(())
        }
        "delete" => {
            // Parse payload: remote_uid, folder_remote_id
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&op.payload) {
                let remote_uid = payload["remote_uid"].as_i64().unwrap_or(0) as u32;
                // Bug #4 fix: use the folder the message actually lives in
                let folder = payload["folder_remote_id"].as_str().unwrap_or("INBOX");
                let msg_id = op.message_id.unwrap_or(0);
                if remote_uid > 0 {
                    log::info!("Executing pending delete: UID {} in '{}'", remote_uid, folder);
                    if let Err(e) = mail::imap::select_folder(&mut session, folder).await {
                        return Err(format!("Select '{}' failed: {}", folder, e));
                    }
                    mail::imap::store_flags(&mut session, remote_uid, "+FLAGS (\\Deleted)").await
                        .map_err(|e| format!("IMAP STORE +Deleted failed: {}", e))?;
                    mail::imap::expunge(&mut session).await
                        .map_err(|e| format!("IMAP EXPUNGE failed: {}", e))?;
                    if msg_id > 0 {
                        let _ = ops::hard_delete_messages(pool, &[msg_id]);
                    }
                }
            }
            Ok(())
        }
        "archive" => {
            // Parse payload: remote_uid, folder_remote_id
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&op.payload) {
                let remote_uid = payload["remote_uid"].as_i64().unwrap_or(0) as u32;
                // Bug #4 fix: archive from the actual source folder
                let folder = payload["folder_remote_id"].as_str().unwrap_or("INBOX");
                if remote_uid > 0 {
                    log::info!("Executing pending archive: UID {} in '{}'", remote_uid, folder);
                    if let Err(e) = mail::imap::select_folder(&mut session, folder).await {
                        return Err(format!("Select '{}' failed: {}", folder, e));
                    }
                    // Try common archive folder names
                    for try_folder in &["[Gmail]/All Mail", "Archive", "Archives", "INBOX.Archive"] {
                        match mail::imap::copy_and_delete(&mut session, folder, remote_uid, try_folder).await {
                            Ok(()) => return Ok(()),
                            Err(e) => log::debug!("Archive to '{}' failed: {}", try_folder, e),
                        }
                    }
                    // Fallback: just delete from source
                    mail::imap::store_flags(&mut session, remote_uid, "+FLAGS (\\Deleted)").await
                        .map_err(|e| format!("IMAP STORE +Deleted (archive fallback) failed: {}", e))?;
                    mail::imap::expunge(&mut session).await
                        .map_err(|e| format!("IMAP EXPUNGE (archive fallback) failed: {}", e))?;
                }
            }
            Ok(())
        }
        other => { log::debug!("Unknown pending op: {}", other); Ok(()) }
    };

    let _ = mail::imap::logout(session).await;
    result
}
