use crate::db::ops;
use crate::db::DbPool;
use crate::mail::{self, MailAccount};
use std::collections::{HashMap, HashSet};

/// Compute flag differences between local and remote state.
///
/// Returns changes to apply: (message_id, Option<is_read>, Option<is_starred>)
/// Only includes entries where at least one flag differs.
/// Messages modified within the last 60 seconds are skipped (local-writeback race protection).
pub fn compute_flag_diff(
    local: &[(i64, i64, bool, bool, i64)],
    remote: &[(u32, bool, bool)],
) -> Vec<(i64, Option<bool>, Option<bool>)> {
    let now = chrono::Utc::now().timestamp();

    let remote_map: HashMap<u32, (bool, bool)> = remote
        .iter()
        .map(|&(uid, read, starred)| (uid, (read, starred)))
        .collect();

    let mut changes = Vec::new();

    for &(msg_id, remote_uid, local_read, local_starred, updated_at) in local {
        // Skip recently modified messages (60s grace window)
        if now - updated_at < 60 {
            continue;
        }

        let uid = remote_uid as u32;
        if let Some(&(remote_read, remote_starred)) = remote_map.get(&uid) {
            let read_change = if local_read != remote_read {
                Some(remote_read)
            } else {
                None
            };
            let starred_change = if local_starred != remote_starred {
                Some(remote_starred)
            } else {
                None
            };

            if read_change.is_some() || starred_change.is_some() {
                changes.push((msg_id, read_change, starred_change));
            }
        }
    }

    changes
}

/// Detect messages that exist locally but have been deleted on the server (EXPUNGE).
pub fn detect_deletions(local_remote_uids: &[(i64, i64)], server_uids: &[u32]) -> Vec<i64> {
    let server_set: HashSet<u32> = server_uids.iter().copied().collect();
    local_remote_uids
        .iter()
        .filter_map(|&(msg_id, uid)| {
            if server_set.contains(&(uid as u32)) {
                None
            } else {
                Some(msg_id)
            }
        })
        .collect()
}

/// Reconcile flags for a single account: fetch server flags, diff, apply local changes.
/// This should be called periodically (e.g., every 15 minutes) for active accounts.
pub async fn reconcile_account(
    pool: &DbPool,
    account: &MailAccount,
    account_id: i64,
    password: &str,
) -> Result<(usize, usize), String> {
    // Connect IMAP
    let mut session = mail::imap::connect(
        &account.imap_host,
        account.imap_port,
        &account.email,
        password,
    )
    .await
    .map_err(|e| format!("Reconcile connect failed: {}", e))?;

    // Get folders
    let folders = ops::list_folders(pool, account_id).map_err(|e| e.to_string())?;
    let mut flag_changes = 0usize;
    let mut deletion_count = 0usize;

    for folder in &folders {
        let folder_id = match folder.id {
            Some(id) => id,
            None => continue,
        };

        // Select folder
        if mail::imap::select_folder(&mut session, &folder.remote_id).await.is_err() {
            continue;
        }

        // Fetch server UIDs and flags for this folder
        let server_flags = match mail::imap::fetch_flags_batch(&mut session).await {
            Ok(flags) => flags,
            Err(e) => {
                log::warn!("Failed to fetch flags for folder '{}': {}", folder.remote_id, e);
                continue;
            }
        };

        // Build local state: (msg_id, remote_uid, is_read, is_starred, updated_at)
        let local_state = match ops::get_local_flag_state(pool, account_id, folder_id) {
            Ok(state) => state,
            Err(e) => {
                log::warn!("Failed to get local state: {}", e);
                continue;
            }
        };

        // Compute changes
        let changes = compute_flag_diff(&local_state, &server_flags);
        for (msg_id, read_opt, star_opt) in &changes {
            if let Some(is_read) = read_opt {
                let _ = ops::mark_read(pool, *msg_id, *is_read);
            }
            if let Some(is_starred) = star_opt {
                // Direct set instead of toggle
                let _ = ops::set_starred(pool, *msg_id, *is_starred);
            }
        }
        flag_changes += changes.len();

        // Detect server-side deletions
        let local_uids: Vec<(i64, i64)> = local_state
            .iter()
            .map(|&(msg_id, uid, _, _, _)| (msg_id, uid))
            .collect();
        let server_uids: Vec<u32> = server_flags.iter().map(|&(uid, _, _)| uid).collect();
        let deleted = detect_deletions(&local_uids, &server_uids);
        for msg_id in &deleted {
            let _ = ops::soft_delete_message(pool, *msg_id);
        }
        deletion_count += deleted.len();
    }

    let _ = mail::imap::logout(session).await;

    if flag_changes > 0 || deletion_count > 0 {
        log::info!(
            "Reconciled account {}: {} flag changes, {} deletions detected",
            account_id, flag_changes, deletion_count
        );
    }

    Ok((flag_changes, deletion_count))
}
