use crate::db::{ops, DbPool};
use crate::mail::{self, MailFolder, MailMessage};

/// Start the background mail sync worker.
/// Efficient polling: connects, checks for new messages, disconnects.
/// Uses sync_period_days from each account config.
///
/// Note: IMAP IDLE (real-time push) is planned for a future release.
/// The async-imap v0.9 API requires consuming the session for IDLE,
/// which would need an always-connected pool architecture.
pub async fn start_sync_worker(pool: DbPool) {
    tokio::spawn(async move {
        log::info!("Mail sync worker started (polling mode)");
        // Initial delay to let the app settle
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

        loop {
            match poll_all_accounts(&pool).await {
                Ok((accounts, messages)) => {
                    if accounts > 0 && messages > 0 {
                        log::info!(
                            "Background sync: {} accounts, {} new messages",
                            accounts, messages
                        );
                    }
                }
                Err(e) => {
                    log::error!("Background sync error: {}", e);
                }
            }

            // Poll interval: use the shortest sync_interval_secs from all accounts,
            // default to 300s
            let interval = get_min_sync_interval(&pool).unwrap_or(300);
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        }
    });
}

fn get_min_sync_interval(pool: &DbPool) -> Option<u64> {
    let accounts = ops::list_accounts(pool).ok()?;
    let min = accounts.iter()
        .map(|a| a.sync_interval_secs.max(60) as u64) // minimum 60s
        .min()?;
    Some(min)
}

/// Poll sync across all registered accounts.
/// For each: connect → search UIDs since sync_period_days → batch fetch → parse → store
async fn poll_all_accounts(pool: &DbPool) -> Result<(usize, usize), String> {
    let accounts = ops::list_accounts(pool).map_err(|e| e.to_string())?;
    if accounts.is_empty() {
        return Ok((0, 0));
    }

    let mut synced_accounts = 0usize;
    let mut total_new = 0usize;

    for account in &accounts {
        let account_id = match account.id {
            Some(id) => id,
            None => continue,
        };

        let (_, password) = match ops::get_account_with_password(pool, account_id) {
            Ok(Some(v)) => v,
            Ok(None) => {
                log::warn!("Account {} not found in DB", account_id);
                continue;
            }
            Err(e) => {
                log::error!("Failed to read account {}: {}", account_id, e);
                continue;
            }
        };

        let days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };

        // Connect
        let mut session = match mail::imap::connect(
            &account.imap_host, account.imap_port,
            &account.username, &password,
        ).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Poll sync: IMAP connect failed for {}: {}", account.email, e);
                continue;
            }
        };

        // Sync INBOX (background sync is lightweight — INBOX only)
        match sync_inbox(pool, &mut session, account_id, days).await {
            Ok(n) => {
                if n > 0 {
                    log::info!("Poll sync: {} new messages in {}", n, account.email);
                }
                total_new += n;
                synced_accounts += 1;
            }
            Err(e) => {
                log::warn!("Poll sync failed for {}: {}", account.email, e);
            }
        }

        let _ = mail::imap::logout(session).await;
    }

    Ok((synced_accounts, total_new))
}

/// Sync INBOX for a single account using date-based search.
/// Returns the count of newly inserted messages.
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

    // Upsert INBOX folder record
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

    for chunk in uids.chunks(batch_size) {
        let raw_msgs = mail::imap::fetch_messages_raw_batch(session, chunk)
            .await
            .map_err(|e| format!("Batch fetch failed: {}", e))?;

        for (uid, raw) in raw_msgs {
            if let Ok(parsed) = mail::parser::parse_raw_message(&raw) {
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
                };

                if let Ok(msg_id) = ops::insert_message(pool, &msg) {
                    let _ = ops::insert_message_folder(pool, msg_id, folder_db_id);
                    total_new += 1;
                }
            }
        }
    }

    // Update sync state
    let state = serde_json::json!({
        "last_sync_at": chrono::Utc::now().to_rfc3339(),
        "messages_synced": total_new,
        "period_days": period_days,
    });
    let _ = ops::update_sync_state(pool, account_id, &state.to_string());

    Ok(total_new)
}
