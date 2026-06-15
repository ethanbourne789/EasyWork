use crate::db::{ops, DbPool};
use crate::mail::{self, MailFolder, MailMessage, PendingOp};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// App focus state for smart polling. When `true` (foreground), poll more aggressively.
pub static APP_FOCUSED: AtomicBool = AtomicBool::new(false);

/// Set the app focus state from the frontend (window focus events).
pub fn set_app_focused(focused: bool) {
    APP_FOCUSED.store(focused, Ordering::Relaxed);
}

/// Smart poll intervals in seconds. Matches Pebble's RealtimePollPolicy.
const POLL_FOREGROUND_ACTIVE_SECS: u64 = 10;
#[allow(dead_code)]
const POLL_FOREGROUND_IDLE_SECS: u64 = 30;
const POLL_BACKGROUND_SECS: u64 = 120;
const POLL_BASE_FLOOR_SECS: u64 = 15; // minimum interval per-account
const CIRCUIT_BREAKER_THRESHOLD: u32 = 5;

/// Shared set of in-flight account IDs across all sync paths
/// (smart-poll worker, IDLE callbacks, manual button, auto-fetch,
/// system tray). Prevents two paths from concurrently using IMAP
/// sessions for the same account.
pub type InFlightLock = Arc<AsyncMutex<HashSet<i64>>>;

pub fn new_in_flight_lock() -> InFlightLock {
    Arc::new(AsyncMutex::new(HashSet::new()))
}

/// Try to claim the slot for `account_id`. Returns Some(guard) if
/// claimed, None if another sync is already running.
pub async fn try_claim(lock: &InFlightLock, account_id: i64) -> Option<InFlightGuard> {
    let mut guard = lock.lock().await;
    if guard.contains(&account_id) {
        return None;
    }
    guard.insert(account_id);
    Some(InFlightGuard { lock: lock.clone(), account_id })
}

/// RAII guard that releases the slot on drop.
pub struct InFlightGuard {
    lock: InFlightLock,
    account_id: i64,
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        let lock = self.lock.clone();
        let account_id = self.account_id;
        tauri::async_runtime::spawn(async move {
            let mut guard = lock.lock().await;
            guard.remove(&account_id);
        });
    }
}

/// Emit a `new-mail` event AND, on desktop, post a system notification
/// when new messages arrive. On Android, the frontend listens to the
/// `new-mail` event for in-app toasts; system notifications are posted
/// by the Android `MailSyncPlugin` after the channel is registered.
fn emit_new_mail(
    app_handle: &AppHandle,
    account_id: i64,
    account_email: &str,
    new_count: usize,
) {
    if new_count == 0 {
        return;
    }
    let _ = app_handle.emit("new-mail", serde_json::json!({
        "account_id": account_id,
        "account_email": account_email,
        "count": new_count,
    }));

    // Desktop only: use tauri-plugin-notification.
    // Android: tauri-plugin-notification on Android requires the channel
    // to be pre-registered in MainActivity.kt; we still call the same API
    // so the Android plugin handles delivery. If channel is missing, the
    // plugin will log a warning but the event above will still reach the
    // frontend.
    #[cfg(any(target_os = "android", target_os = "ios", target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        use tauri_plugin_notification::NotificationExt;
        let title = if new_count == 1 {
            format!("新邮件 · {}", account_email)
        } else {
            format!("{} 封新邮件 · {}", new_count, account_email)
        };
        let _ = app_handle
            .notification()
            .builder()
            .title(&title)
            .body(&format!("点击查看（账户 ID: {}）", account_id))
            .id((account_id as i32) + 1)
            .show();
    }
}

/// Start the background mail sync worker with exponential backoff + IDLE + circuit breaker.
pub async fn start_sync_worker(
    pool: DbPool,
    cancel_token: CancellationToken,
    in_flight: InFlightLock,
    app_handle: AppHandle,
) {
    let pool_clone = pool.clone();

    // Channel for IDLE tasks to notify the main poll loop of new mail.
    let (idle_tx, mut idle_rx) = mpsc::channel::<i64>(32);

    // Track spawned IDLE tasks per account so we don't spawn duplicates.
    let mut idle_tasks: HashMap<i64, tokio::task::JoinHandle<()>> = HashMap::new();

    // Main poll loop
    tokio::spawn(async move {
        log::info!("Mail sync worker started (smart polling + IDLE + circuit breaker)");

        let mut backoff: std::collections::HashMap<i64, u32> = std::collections::HashMap::new();
        let mut circuit_open: std::collections::HashMap<i64, bool> = std::collections::HashMap::new();
        let mut reconcile_tick = 0u64;

        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(10)) => {}
            _ = cancel_token.cancelled() => {
                log::info!("Mail sync worker cancelled during initial delay");
                return;
            }
        }

        loop {
            // Check for cancellation before each iteration
            if cancel_token.is_cancelled() {
                log::info!("Mail sync worker shutting down gracefully");
                break;
            }

            let focused = APP_FOCUSED.load(Ordering::Relaxed);

            match poll_all_accounts(&pool, &in_flight, &mut backoff, &mut circuit_open, &app_handle).await {
                Ok((accounts, messages)) => {
                    if accounts > 0 && messages > 0 {
                        log::info!("Background sync: {} accounts, {} new messages", accounts, messages);
                    }
                    if accounts > 0 {
                        if let Err(e) = execute_pending_ops(&pool).await {
                            log::warn!("Failed to execute pending ops: {}", e);
                        }

                        // Spawn IDLE tasks for successfully synced accounts
                        let account_list = ops::list_accounts(&pool).unwrap_or_default();
                        for account in &account_list {
                            let account_id = match account.id {
                                Some(id) => id,
                                None => continue,
                            };
                            if *circuit_open.get(&account_id).unwrap_or(&false) {
                                continue;
                            }
                            if !idle_tasks.contains_key(&account_id) {
                                let handle = spawn_idle_for_account(
                                    account_id,
                                    pool.clone(),
                                    cancel_token.clone(),
                                    idle_tx.clone(),
                                );
                                idle_tasks.insert(account_id, handle);
                            }
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

            let interval = get_next_poll_delay(&pool, &backoff, &circuit_open, focused);
            log::debug!("Next sync in {}s (focused={})", interval.as_secs(), focused);

            // Use tokio::select! to allow cancellation during sleep and listen for IDLE notifications
            tokio::select! {
                _ = tokio::time::sleep(interval) => {}
                _ = cancel_token.cancelled() => {
                    log::info!("Mail sync worker cancelled during sleep");
                    break;
                }
                Some(account_id) = idle_rx.recv() => {
                    log::info!("IDLE notification: account {} detected new mail, triggering immediate sync", account_id);
                    // Trigger immediate sync for this account
                    if let Err(e) = sync_inbox_for_account(&pool, &in_flight, account_id, &app_handle).await {
                        log::warn!("IDLE-triggered sync failed for account {}: {}", account_id, e);
                    }
                }
            }
        }

        // Cancel all IDLE tasks when shutting down
        for (account_id, handle) in idle_tasks.drain() {
            log::debug!("Cancelling IDLE task for account {}", account_id);
            handle.abort();
        }

        log::info!("Mail sync worker stopped");
    });
}

/// Smart poll delay — adjusts interval based on app focus state and per-account backoff.
fn get_next_poll_delay(
    pool: &DbPool,
    backoff: &std::collections::HashMap<i64, u32>,
    circuit_open: &std::collections::HashMap<i64, bool>,
    focused: bool,
) -> Duration {
    let base = if focused { POLL_FOREGROUND_ACTIVE_SECS } else { POLL_BACKGROUND_SECS };

    // If any account is in circuit-open state, back off more.
    let any_circuit_open = circuit_open.values().any(|&v| v);
    let base = if any_circuit_open { base.max(120) } else { base };

    // Apply per-account exponential backoff
    if let Some(&max_fails) = backoff.values().max() {
        if max_fails > 0 {
            let backoff_secs = compute_backoff(base, max_fails);
            return Duration::from_secs(backoff_secs);
        }
    }

    // Respect per-account minimum sync interval
    let min_interval = get_min_sync_interval(pool).unwrap_or(POLL_BASE_FLOOR_SECS);
    Duration::from_secs(base.max(min_interval))
}

/// Exponential backoff with cap. base_secs base; doubles per failure; cap 300s.
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
    in_flight: &InFlightLock,
    backoff: &mut std::collections::HashMap<i64, u32>,
    circuit_open: &mut std::collections::HashMap<i64, bool>,
    app_handle: &AppHandle,
) -> Result<(usize, usize), String> {
    let accounts = ops::list_accounts(pool).map_err(|e| e.to_string())?;
    if accounts.is_empty() { return Ok((0, 0)); }

    let mut synced_accounts = 0usize;
    let mut total_new = 0usize;

    for account in &accounts {
        let account_id = match account.id { Some(id) => id, None => continue };

        // Skip if circuit is open — wait for next backoff cycle to retry.
        if *circuit_open.get(&account_id).unwrap_or(&false) {
            log::debug!("Account {}: circuit OPEN — skipping", account_id);
            continue;
        }

        let (_, password) = match ops::get_account_with_password(pool, account_id) {
            Ok(Some(v)) => v,
            Ok(None) => continue,
            Err(e) => { log::error!("Failed to read account {}: {}", account_id, e); continue; }
        };

        let days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };

        // Acquire the global in-flight slot to prevent IDLE callbacks,
        // manual buttons, tray, and auto-fetch from racing on the same
        // account. Drop releases the slot.
        let _guard = match try_claim(in_flight, account_id).await {
            Some(g) => g,
            None => {
                log::debug!("Account {}: in-flight slot busy, skipping this cycle", account_id);
                continue;
            }
        };

        // Try connect with one retry on connection-class errors.
        let mut session = None;
        let mut last_err = String::new();
        for attempt in 1..=2 {
            match mail::imap::connect(&account.imap_host, account.imap_port, &account.email, &password, account.use_tls).await {
                Ok(s) => { session = Some(s); break; }
                Err(e) => {
                    last_err = e.to_string();
                    if attempt < 2 {
                        log::warn!("Account {}: connect attempt {} failed: {} — retrying", account_id, attempt, e);
                        tokio::time::sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        }
        let mut session = match session {
            Some(s) => s,
            None => {
                log::warn!("Account {}: connect failed after retry: {}", account_id, last_err);
                let fails = backoff.entry(account_id).or_insert(0);
                *fails = (*fails).saturating_add(1).min(10);
                // Circuit breaker: open if consecutive failures >= threshold
                if *fails >= CIRCUIT_BREAKER_THRESHOLD {
                    circuit_open.insert(account_id, true);
                    log::warn!("Account {}: circuit breaker OPENED after {} consecutive failures",
                        account_id, *fails);
                }
                continue;
            }
        };

        let mut account_new_total = 0usize;
        let mut account_had_error = false;

        match sync_inbox_with_cursor(pool, &mut session, account_id, days).await {
            Ok(n) => { account_new_total += n; }
            Err(e) => {
                log::warn!("Inbox sync failed for {}: {}", account.email, e);
                account_had_error = true;
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
                if *fails >= CIRCUIT_BREAKER_THRESHOLD {
                    circuit_open.insert(account_id, true);
                }
                continue;
            }
        };

        for (remote_id, _name, role) in &folders {
            if role == "inbox" || role == "trash" || role == "junk" {
                continue;
            }
            match sync_folder_with_cursor(pool, &mut session, account_id, remote_id, role, days).await {
                Ok(n) => { account_new_total += n; }
                Err(e) => {
                    log::debug!("Folder '{}' sync: {}", remote_id, e);
                    account_had_error = true;
                }
            }
        }

        // Emit single new-mail event + (desktop) notification for this account
        if account_new_total > 0 {
            emit_new_mail(app_handle, account_id, &account.email, account_new_total);
            total_new += account_new_total;
        }

        // Success: clear backoff and close circuit
        if !account_had_error {
            backoff.remove(&account_id);
            if circuit_open.remove(&account_id).is_some() {
                log::info!("Account {}: circuit breaker CLOSED (recovered)", account_id);
            }
        } else {
            let fails = backoff.entry(account_id).or_insert(0);
            *fails = (*fails).saturating_add(1).min(10);
            if *fails >= CIRCUIT_BREAKER_THRESHOLD {
                circuit_open.insert(account_id, true);
                log::warn!("Account {}: circuit breaker OPENED after {} consecutive failures", account_id, *fails);
            }
        }
        synced_accounts += 1;
        let _ = mail::imap::logout(session).await;
        // _guard released here
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

    // Update cursor with UIDVALIDITY. If UIDVALIDITY changed since last sync, the
    // cursor is invalidated and we must re-fetch everything from the server.
    let prev_uidvalidity = ops::get_folder_cursor(pool, folder_db_id).ok().flatten().and_then(|c| c.0);
    let uidvalidity_changed = match (prev_uidvalidity, mailbox.uid_validity) {
        (Some(prev), Some(cur)) => (prev as u64) != (cur as u64),
        _ => false,
    };
    if uidvalidity_changed {
        log::warn!(
            "Folder '{}' (account {}): UIDVALIDITY changed ({} -> {}), cursor invalidated",
            folder_name, account_id, prev_uidvalidity.unwrap_or(0), mailbox.uid_validity.unwrap_or(0),
        );
        // Reset cursor so the next block treats this as a first sync
        let _ = ops::update_folder_cursor(pool, folder_db_id, mailbox.uid_validity.map(|v| v as i64), None, Some(0));
    } else {
        let _ = ops::update_folder_cursor(pool, folder_db_id, mailbox.uid_validity.map(|v| v as i64), None, None);
    }

    // First-sync: limit to most recent 200 messages (matches Pebble's strategy).
    // Subsequent syncs: incremental UID > last_uid.
    let is_first_sync = last_uid == 0 || uidvalidity_changed;
    let first_sync_limit: usize = 200;

    let uids: Vec<u32> = if is_first_sync {
        // Use UID SEARCH to get all UIDs, then take the last N (highest UIDs = newest).
        let all_uids = mail::imap::fetch_uids_since(session, folder_name, period_days).await
            .map_err(|e| format!("UID search in '{}' failed: {}", folder_name, e))?;
        // Sort ascending, take last 200
        let mut sorted = all_uids;
        sorted.sort_unstable();
        let n = sorted.len();
        if n > first_sync_limit {
            sorted[n - first_sync_limit..].to_vec()
        } else {
            sorted
        }
    } else {
        // Incremental: only UIDs > last_uid
        mail::imap::fetch_uids_since(session, folder_name, period_days).await
            .map_err(|e| format!("UID search in '{}' failed: {}", folder_name, e))?
            .into_iter()
            .filter(|&u| u > last_uid as u32)
            .collect()
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
                // v1.2: thread_id disabled — all messages displayed as independent entries
                let thread_id = String::new();

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

        // ---- v1.2: Thread re-association disabled (threading removed) ----
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
    let mut session = mail::imap::connect(&account.imap_host, account.imap_port, &account.email, password, account.use_tls)
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

/// Spawn an IDLE monitoring task for a specific account.
/// Returns a JoinHandle that can be used to cancel the task.
fn spawn_idle_for_account(
    account_id: i64,
    pool: DbPool,
    cancel_token: CancellationToken,
    idle_tx: mpsc::Sender<i64>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        log::info!("Starting IDLE monitor for account {}", account_id);
        idle_monitor_account(account_id, pool, cancel_token, idle_tx).await;
        log::info!("IDLE monitor stopped for account {}", account_id);
    })
}

/// IDLE monitoring loop for a single account.
/// Connects to IMAP, enters IDLE for INBOX, and notifies the main loop when new mail arrives.
/// BUG-11 fix: Implements exponential backoff for Android Doze mode recovery.
async fn idle_monitor_account(
    account_id: i64,
    pool: DbPool,
    cancel_token: CancellationToken,
    idle_tx: mpsc::Sender<i64>,
) {
    let mut consecutive_errors = 0u32;
    const MAX_IDLE_ERRORS: u32 = 5;
    // Exponential backoff: 2^0, 2^1, 2^2, 2^3, 2^4 = 1, 2, 4, 8, 16 seconds
    const BASE_BACKOFF_SECS: u64 = 1;
    const MAX_BACKOFF_SECS: u64 = 60;

    loop {
        if cancel_token.is_cancelled() {
            break;
        }

        // Fetch account credentials
        let account_info = match ops::get_account_with_password(&pool, account_id) {
            Ok(Some((account, password))) => (account, password),
            Ok(None) => {
                log::warn!("Account {} not found, stopping IDLE monitor", account_id);
                break;
            }
            Err(e) => {
                log::error!("Failed to read account {}: {}", account_id, e);
                break;
            }
        };
        let (account, password) = account_info;

        // Connect to IMAP
        let session = match mail::imap::connect(&account.imap_host, account.imap_port, &account.email, &password, account.use_tls).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("IDLE connect failed for account {}: {}", account_id, e);
                consecutive_errors += 1;
                
                // BUG-12 fix: Detect network-related errors
                let error_msg = e.to_string().to_lowercase();
                let is_network_error = error_msg.contains("timeout") 
                    || error_msg.contains("connection") 
                    || error_msg.contains("network")
                    || error_msg.contains("unreachable");
                
                if is_network_error {
                    log::warn!("IDLE network error detected for account {}, may be network switch or Doze mode", account_id);
                }
                
                if consecutive_errors >= MAX_IDLE_ERRORS {
                    log::error!("IDLE monitor for account {} exceeded max errors, falling back to polling", account_id);
                    break;
                }
                
                // BUG-11 fix: Exponential backoff
                let backoff_secs = (BASE_BACKOFF_SECS * 2u64.pow(consecutive_errors.saturating_sub(1))).min(MAX_BACKOFF_SECS);
                log::info!("IDLE retry {} for account {} in {}s", consecutive_errors, account_id, backoff_secs);
                
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(backoff_secs)) => {}
                    _ = cancel_token.cancelled() => break,
                }
                continue;
            }
        };

        // Reset backoff on successful connection
        consecutive_errors = 0;

        // Enter IDLE loop
        log::debug!("Account {} entering IDLE for INBOX", account_id);
        let idle_timeout = Duration::from_secs(29 * 60); // RFC 2177: 29 minutes

        let result = mail::imap::idle_wait(session, "INBOX", idle_timeout).await;

        match result {
            Ok((session, event)) => {
                match event {
                    mail::imap::IdleEvent::NewMail => {
                        log::info!("IDLE: New mail detected for account {}", account_id);
                        // Notify main loop
                        let _ = idle_tx.send(account_id).await;
                        // Logout before next IDLE cycle
                        let _ = mail::imap::logout(session).await;
                    }
                    mail::imap::IdleEvent::Timeout => {
                        log::debug!("IDLE: Timeout for account {}, re-entering IDLE", account_id);
                        // Logout before next IDLE cycle
                        let _ = mail::imap::logout(session).await;
                    }
                }
            }
            Err(e) => {
                let error_msg = e.to_string().to_lowercase();
                log::warn!("IDLE error for account {}: {}", account_id, e);
                
                // BUG-12 fix: Detect network-related IDLE errors
                let is_network_error = error_msg.contains("timeout") 
                    || error_msg.contains("connection") 
                    || error_msg.contains("network")
                    || error_msg.contains("broken pipe")
                    || error_msg.contains("connection reset");
                
                if is_network_error {
                    log::warn!("IDLE network error detected for account {}, likely network switch or Doze mode", account_id);
                }
                
                consecutive_errors += 1;
                if consecutive_errors >= MAX_IDLE_ERRORS {
                    log::error!("IDLE monitor for account {} exceeded max errors, falling back to polling", account_id);
                    break;
                }
                
                // BUG-11 fix: Exponential backoff
                let backoff_secs = (BASE_BACKOFF_SECS * 2u64.pow(consecutive_errors.saturating_sub(1))).min(MAX_BACKOFF_SECS);
                log::info!("IDLE retry {} for account {} in {}s", consecutive_errors, account_id, backoff_secs);
                
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(backoff_secs)) => {}
                    _ = cancel_token.cancelled() => break,
                }
            }
        }

        // Small delay before re-entering IDLE (only on success)
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(2)) => {}
            _ = cancel_token.cancelled() => break,
        }
    }
}

/// Sync INBOX for a specific account (called when IDLE detects new mail).
async fn sync_inbox_for_account(
    pool: &DbPool,
    in_flight: &InFlightLock,
    account_id: i64,
    app_handle: &AppHandle,
) -> Result<usize, String> {
    let (account, password) = match ops::get_account_with_password(pool, account_id) {
        Ok(Some(v)) => v,
        Ok(None) => return Err(format!("Account {} not found", account_id)),
        Err(e) => return Err(format!("Failed to read account {}: {}", account_id, e)),
    };

    // Reuse the global in-flight slot — if the smart-poll worker is
    // already syncing this account, skip (the worker will pick up the
    // new mail anyway).
    let _guard = match try_claim(in_flight, account_id).await {
        Some(g) => g,
        None => {
            log::debug!("sync_inbox_for_account({}): in-flight slot busy, skipping", account_id);
            return Ok(0);
        }
    };

    let days = if account.sync_period_days > 0 { account.sync_period_days } else { 30 };

    // Connect to IMAP
    let mut session = mail::imap::connect(&account.imap_host, account.imap_port, &account.email, &password, account.use_tls)
        .await
        .map_err(|e| format!("IMAP connect failed: {}", e))?;

    // Sync INBOX
    let result = sync_inbox_with_cursor(pool, &mut session, account_id, days).await;

    // Logout
    let _ = mail::imap::logout(session).await;

    let new_count = result.clone().unwrap_or(0);
    if new_count > 0 {
        emit_new_mail(app_handle, account_id, &account.email, new_count);
    }
    result
}
