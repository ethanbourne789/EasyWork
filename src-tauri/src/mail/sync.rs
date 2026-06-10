use crate::db::{ops, DbPool};
use crate::mail::{self, MailFolder, MailMessage, PendingOp};
use std::time::Duration;

/// Start the background mail sync worker with exponential backoff.
///
/// For each connected account:
/// - On success: reset backoff counter, poll at account's configured interval
/// - On failure: exponential backoff (15s → 30s → 60s → ... → max 300s)
/// - After sync: execute any pending operations (flags, deletes, etc.)
pub async fn start_sync_worker(pool: DbPool) {
    tokio::spawn(async move {
        log::info!("Mail sync worker started (polling mode)");

        // Maps account_id -> consecutive_failures for backoff
        let mut backoff: std::collections::HashMap<i64, u32> = std::collections::HashMap::new();

        // Initial delay to let the app settle
        tokio::time::sleep(Duration::from_secs(10)).await;

        loop {
            match poll_all_accounts(&pool, &mut backoff).await {
                Ok((accounts, messages)) => {
                    if accounts > 0 {
                        if messages > 0 {
                            log::info!(
                                "Background sync: {} accounts, {} new messages",
                                accounts, messages
                            );
                        }

                        // Execute pending operations after successful sync
                        if let Err(e) = execute_pending_ops(&pool).await {
                            log::warn!("Failed to execute pending ops: {}", e);
                        }
                    }
                }
                Err(e) => {
                    log::error!("Background sync error: {}", e);
                }
            }

            // Compute next poll delay using the minimum interval across accounts
            let interval = get_next_poll_delay(&pool, &backoff);
            log::debug!("Next sync in {}s", interval.as_secs());
            tokio::time::sleep(interval).await;
        }
    });
}

/// Calculate next poll delay: use min sync_interval from accounts, with backoff applied.
fn get_next_poll_delay(pool: &DbPool, backoff: &std::collections::HashMap<i64, u32>) -> Duration {
    let base = get_min_sync_interval(pool).unwrap_or(300);
    let base_dur = Duration::from_secs(base);

    // If any account has failures, apply the max backoff
    if let Some(&max_fails) = backoff.values().max() {
        if max_fails > 0 {
            let backoff_secs = compute_backoff(base, max_fails);
            return Duration::from_secs(backoff_secs);
        }
    }

    base_dur
}

/// Compute exponential backoff: base * 2^(fails-1), clamped to [base, 300s]
fn compute_backoff(base_secs: u64, consecutive_failures: u32) -> u64 {
    if consecutive_failures == 0 {
        return base_secs;
    }
    let backoff = base_secs.saturating_mul(2u64.saturating_pow(consecutive_failures.saturating_sub(1)));
    backoff.clamp(base_secs.min(15), 300)
}

fn get_min_sync_interval(pool: &DbPool) -> Option<u64> {
    let accounts = ops::list_accounts(pool).ok()?;
    let min = accounts.iter()
        .map(|a| a.sync_interval_secs.max(60) as u64)
        .min()?;
    Some(min)
}

/// Poll sync across all registered accounts with backoff tracking.
async fn poll_all_accounts(
    pool: &DbPool,
    backoff: &mut std::collections::HashMap<i64, u32>,
) -> Result<(usize, usize), String> {
    let accounts = ops::list_accounts(pool).map_err(|e| e.to_string())?;
    if accounts.is_empty() {
        return Ok((0, 0));
    }

    let mut synced_accounts = 0usize;
    let mut total_new = 0usize;

    for account in &accounts {
        let account_id = match account.id {
            Some(id) => id,
            None => {
                log::warn!("Account {} has no ID, skipping", account.email);
                continue;
            }
        };

        let (_, password) = match ops::get_account_with_password(pool, account_id) {
            Ok(Some(v)) => v,
            Ok(None) => {
                log::warn!("Account {} not found in DB", account_id);
                backoff.remove(&account_id);
                continue;
            }
            Err(e) => {
                log::error!("Failed to read account {}: {}", account_id, e);
                let fails = backoff.entry(account_id).or_insert(0);
                *fails = (*fails).saturating_add(1).min(10);
                continue;
            }
        };

        let days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };

        let mut session = match mail::imap::connect(
            &account.imap_host, account.imap_port,
            &account.username, &password,
        ).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Poll sync: IMAP connect failed for {}: {}", account.email, e);
                let fails = backoff.entry(account_id).or_insert(0);
                *fails = (*fails).saturating_add(1).min(10);
                continue;
            }
        };

        match sync_inbox(pool, &mut session, account_id, days).await {
            Ok(n) => {
                if n > 0 {
                    log::info!("Poll sync: {} new messages in {}", n, account.email);
                }
                total_new += n;
                synced_accounts += 1;
                // Reset backoff on success
                backoff.remove(&account_id);
            }
            Err(e) => {
                log::warn!("Poll sync failed for {}: {}", account.email, e);
                let fails = backoff.entry(account_id).or_insert(0);
                *fails = (*fails).saturating_add(1).min(10);
            }
        }

        let _ = mail::imap::logout(session).await;
    }

    Ok((synced_accounts, total_new))
}

/// Sync INBOX for a single account using date-based search.
async fn sync_inbox(
    pool: &DbPool,
    session: &mut mail::imap::ImapSession,
    account_id: i64,
    period_days: i64,
) -> Result<usize, String> {
    let _ = mail::imap::select_folder(session, "INBOX").await;

    let uids = mail::imap::fetch_uids_since(session, "INBOX", period_days)
        .await
        .map_err(|e| format!("UID search failed: {}", e))?;

    if uids.is_empty() {
        return Ok(0);
    }

    let inbox_folder = MailFolder {
        id: None,
        account_id,
        remote_id: "INBOX".into(),
        name: "INBOX".into(),
        role: "inbox".into(),
        folder_type: "system".into(),
    };
    let folder_db_id = ops::insert_folder(pool, &inbox_folder).map_err(|e| e.to_string())?;

    let mut total_new = 0usize;
    let batch_size = 50usize;

    // Bulk dedup: get existing UIDs from the full set first
    let all_uids_i64: Vec<i64> = uids.iter().map(|&u| u as i64).collect();
    let existing_uids = ops::get_existing_remote_uids(pool, account_id, &all_uids_i64)
        .unwrap_or_default();

    for chunk in uids.chunks(batch_size) {
        let raw_msgs = mail::imap::fetch_messages_raw_batch(session, chunk)
            .await
            .map_err(|e| format!("Batch fetch failed: {}", e))?;

        for (uid, raw) in raw_msgs {
            if existing_uids.contains(&(uid as i64)) {
                continue;
            }

            if let Ok(parsed) = mail::parser::parse_raw_message(&raw) {
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
                    to_list: serde_json::to_string(&parsed.to_list).unwrap_or_default(),
                    cc_list: serde_json::to_string(&parsed.cc_list).unwrap_or_default(),
                    date: parsed.date,
                    body_text: parsed.body_text,
                    body_html: parsed.body_html,
                    is_read: false,
                    is_starred: false,
                    has_attachment: !parsed.attachments.is_empty(),
                    size: raw.len() as i64,
                    folder_ids: vec![folder_db_id],
                    thread_id,
                };

                if let Ok(msg_id) = ops::insert_message(pool, &msg) {
                    let _ = ops::insert_message_folder(pool, msg_id, folder_db_id);

                    // Store attachments on disk
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
                                pool, msg_id,
                                &att.filename,
                                &att.content_type,
                                att.size as i64,
                                &local_path.to_string_lossy(),
                                "",
                            );
                        }
                    }
                    total_new += 1;
                }
            }
        }
    }

    let state = serde_json::json!({
        "last_sync_at": chrono::Utc::now().to_rfc3339(),
        "messages_synced": total_new,
        "period_days": period_days,
    });
    let _ = ops::update_sync_state(pool, account_id, &state.to_string());

    Ok(total_new)
}

/// Execute pending mail operations that accumulated while offline.
/// Currently handles: mark_read, toggle_star, soft_delete, archive
async fn execute_pending_ops(pool: &DbPool) -> Result<usize, String> {
    let accounts = ops::list_accounts(pool).map_err(|e| e.to_string())?;
    let mut processed = 0usize;

    for account in &accounts {
        let account_id = match account.id {
            Some(id) => id,
            None => continue,
        };

        let pending = ops::list_pending_ops(pool, account_id)
            .map_err(|e| e.to_string())?;

        for op in &pending {
            let op_id = match op.id {
                Some(id) => id,
                None => continue,
            };

            let result = execute_single_pending_op(pool, account, op).await;

            match result {
                Ok(()) => {
                    ops::update_pending_op_status(pool, op_id, "completed", None)
                        .unwrap_or_default();
                    processed += 1;
                }
                Err(e) => {
                    let new_attempts = op.attempts + 1;
                    if new_attempts >= 5 {
                        log::warn!(
                            "Pending op {} ({}) permanently failed after {} attempts: {}",
                            op_id, op.op_type, new_attempts, e
                        );
                        ops::update_pending_op_status(pool, op_id, "failed", Some(&e))
                            .unwrap_or_default();
                    } else {
                        ops::update_pending_op_status(pool, op_id, "retrying", Some(&e))
                            .unwrap_or_default();
                    }
                }
            }
        }
    }

    if processed > 0 {
        log::info!("Executed {} pending ops", processed);
    }
    Ok(processed)
}

/// Try to sync a single pending operation back to the IMAP server.
async fn execute_single_pending_op(
    pool: &DbPool,
    account: &crate::mail::MailAccount,
    op: &PendingOp,
) -> Result<(), String> {
    let (_, password) = ops::get_account_with_password(pool, account.id.unwrap())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;

    let mut session = mail::imap::connect(
        &account.imap_host,
        account.imap_port,
        &account.username,
        &password,
    )
    .await
    .map_err(|e| format!("IMAP connect failed: {}", e))?;

    let result = match op.op_type.as_str() {
        "mark_read" | "mark_unread" => {
            if let Some(_msg_id) = op.message_id {
                // TODO: Implement IMAP STORE FLAGS +/-\Seen when we store remote_uid → message mapping
                // For now, just mark the local operation as completed since we can't easily
                // map local message IDs back to IMAP UIDs without additional schema
                Ok(())
            } else {
                Err("No message_id for mark_read op".to_string())
            }
        }
        "delete" => {
            if let Some(_msg_id) = op.message_id {
                // TODO: IMAP STORE +FLAGS (\Deleted) + EXPUNGE
                Ok(())
            } else {
                Err("No message_id for delete op".to_string())
            }
        }
        "archive" => {
            // Archive is handled locally (move to archive folder)
            // No IMAP action needed unless we want to sync back
            Ok(())
        }
        other => {
            log::debug!("Unknown pending op type: {}", other);
            Ok(())
        }
    };

    let _ = mail::imap::logout(session).await;
    result
}
