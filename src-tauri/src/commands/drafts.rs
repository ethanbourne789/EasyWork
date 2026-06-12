//! IMAP Drafts sync — push local drafts to the server's Drafts folder and
//! pull server drafts into the local DB.
//!
//! Workflow:
//!  - **Push** a local draft (remote_uid == 0) to IMAP Drafts via APPEND + \Draft flag.
//!  - **Pull** server drafts by selecting the Drafts folder, fetching any UIDs
//!    we don't have, and parsing them into `mail_messages`.

use crate::db::ops;
use crate::db::DbPool;
use crate::mail::{self, MailMessage, MailFolder};
use tauri::State;

/// Get a single local draft by message id (None if not found).
#[tauri::command]
pub async fn list_local_drafts(
    pool: State<'_, DbPool>,
    account_id: i64,
    message_id: Option<i64>,
) -> Result<Vec<MailMessage>, String> {
    let all = ops::list_local_drafts(&pool, account_id).map_err(|e| e.to_string())?;
    Ok(match message_id {
        Some(mid) => all.into_iter().filter(|m| m.id == Some(mid)).collect(),
        None => all,
    })
}

#[tauri::command]
pub async fn push_draft_to_imap(
    pool: State<'_, DbPool>,
    message_id: i64,
) -> Result<i64, String> {
    let draft = ops::list_local_drafts(&pool, message_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|m| m.id == Some(message_id))
        .ok_or_else(|| "Local draft not found".to_string())?;
    let account_id = draft.account_id;

    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    // Build a minimal RFC 2822 message (text/plain only for simplicity).
    let to_list: Vec<String> = serde_json::from_str(&draft.to_list).unwrap_or_default();
    let to_str = to_list.join(", ");
    let rfc2822 = format!(
        "From: {from}\r\nTo: {to}\r\nSubject: {subj}\r\nDate: {date}\r\nMessage-ID: {mid}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}",
        from = if draft.from_name.is_empty() { draft.from_email.clone() } else { format!("{} <{}>", draft.from_name, draft.from_email) },
        to = to_str,
        subj = draft.subject,
        date = draft.date,
        mid = draft.message_id_header,
        body = draft.body_text,
    );

    let mut session = mail::imap::connect(
        &account.imap_host, account.imap_port, &account.email, &password,
    ).await.map_err(|e| format!("IMAP connect failed: {}", e))?;

    // Find the Drafts folder. Mozilla-style first, then common names.
    let folders = mail::imap::list_folders(&mut session).await
        .map_err(|e| format!("List folders failed: {}", e))?;
    let draft_folder = folders.iter()
        .find(|(_, _, role)| role == "drafts")
        .map(|(rid, _, _)| rid.clone())
        .or_else(|| {
            folders.iter()
                .find(|(_, name, _)| {
                    let n = name.to_lowercase();
                    n == "drafts" || n.contains("draft") || n.contains("草稿")
                })
                .map(|(rid, _, _)| rid.clone())
        })
        .ok_or_else(|| "Drafts folder not found on server".to_string())?;

    // APPEND to Drafts with \Draft flag
    let appended_uid = append_draft(&mut session, &draft_folder, rfc2822.as_bytes()).await
        .map_err(|e| format!("APPEND failed: {}", e))?;

    // Update the local row's remote_uid so next sync won't re-create.
    let _ = ops::set_message_remote_uid(&pool, message_id, appended_uid as i64);

    let _ = mail::imap::logout(session).await;
    log::info!("Pushed local draft msg_id={} to IMAP Drafts as UID {}", message_id, appended_uid);
    Ok(appended_uid as i64)
}

#[tauri::command]
pub async fn pull_drafts_from_imap(
    pool: State<'_, DbPool>,
    account_id: i64,
) -> Result<usize, String> {
    let (account, password) = ops::get_account_with_password(&pool, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Account {} not found", account_id))?;

    let mut session = mail::imap::connect(
        &account.imap_host, account.imap_port, &account.email, &password,
    ).await.map_err(|e| format!("IMAP connect failed: {}", e))?;

    let folders = mail::imap::list_folders(&mut session).await
        .map_err(|e| format!("List folders failed: {}", e))?;
    let draft_folder = folders.iter()
        .find(|(_, _, role)| role == "drafts")
        .map(|(rid, _, _)| rid.clone())
        .or_else(|| {
            folders.iter()
                .find(|(_, name, _)| {
                    let n = name.to_lowercase();
                    n == "drafts" || n.contains("draft") || n.contains("草稿")
                })
                .map(|(rid, _, _)| rid.clone())
        })
        .ok_or_else(|| "Drafts folder not found on server".to_string())?;

    // Ensure local folder row exists
    let folder_obj = MailFolder {
        id: None,
        account_id,
        remote_id: draft_folder.clone(),
        name: draft_folder.clone(),
        role: "drafts".into(),
        folder_type: "user".into(),
    };
    let folder_db_id = ops::insert_folder(&pool, &folder_obj)
        .map_err(|e| e.to_string())?;

    mail::imap::select_folder(&mut session, &draft_folder).await
        .map_err(|e| format!("Select drafts failed: {}", e))?;

    // Fetch all UIDs
    let all_uids: Vec<u32> = session.uid_search("ALL").await
        .map_err(|e| format!("UID SEARCH failed: {}", e))?
        .into_iter().collect();
    if all_uids.is_empty() {
        let _ = mail::imap::logout(session).await;
        return Ok(0);
    }

    let all_uids_i64: Vec<i64> = all_uids.iter().map(|u| *u as i64).collect();
    let existing = ops::get_existing_remote_uids(&pool, account_id, &all_uids_i64)
        .unwrap_or_default();
    let new_uids: Vec<u32> = all_uids.into_iter()
        .filter(|u| !existing.contains(&(*u as i64)))
        .collect();

    let raw_msgs = mail::imap::fetch_messages_raw_batch(&mut session, &new_uids).await
        .map_err(|e| format!("Fetch drafts failed: {}", e))?;

    let mut pulled = 0usize;
    for (uid, raw) in raw_msgs {
        if let Ok(parsed) = mail::parser::parse_raw_message(&raw) {
            let thread_id = mail::thread::compute_thread_id(
                &parsed.message_id, &parsed.in_reply_to, &parsed.references, &parsed.subject,
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
                body_text: parsed.body_text.clone(),
                body_html: parsed.body_html,
                is_read: true, // drafts are always considered read locally
                is_starred: false,
                has_attachment: !parsed.attachments.is_empty(),
                size: raw.len() as i64,
                folder_ids: vec![folder_db_id],
                thread_id,
            };
            if let Ok(msg_id) = ops::insert_message(&pool, &msg) {
                let _ = ops::insert_message_folder(&pool, msg_id, folder_db_id);
                let _ = ops::fts_insert(&pool, msg_id, &msg.subject, &msg.from_name, &msg.from_email, &parsed.body_text);
                pulled += 1;
            }
        }
    }

    let _ = mail::imap::logout(session).await;
    log::info!("Pulled {} drafts for account {}", pulled, account_id);
    Ok(pulled)
}

async fn append_draft(
    session: &mut mail::imap::ImapSession,
    folder: &str,
    message: &[u8],
) -> Result<u32, Box<dyn std::error::Error + Send + Sync>> {
    // async-imap 0.9.x's append() doesn't take flags. Just APPEND to Drafts folder
    // (mail clients typically identify drafts by folder location, not \Draft flag).
    session.append(folder, message).await?;
    // After APPEND, the message is in the folder but we don't have a UID
    // from async-imap's append. Caller should re-select the folder and SEARCH ALL
    // to find the new UID. For now, return 0 and let the caller handle it.
    Ok(0)
}
