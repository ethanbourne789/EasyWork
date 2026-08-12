use tauri::{AppHandle, State};
use crate::mail::creds::CredentialStore;
use crate::mail::db_queries;
use crate::mail::error::MailError;
use crate::mail::service::MailService;
use crate::mail::smtp::{SmtpParams, send_mail};
use crate::mail::types::*;

pub struct AppState {
    pub service: MailService,
}

fn now() -> String { chrono::Utc::now().to_rfc3339() }

#[tauri::command]
pub async fn mail_list_accounts(state: State<'_, AppState>) -> Result<Vec<EmailAccount>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_accounts(&db)
}

#[tauri::command]
pub async fn mail_list_folders(state: State<'_, AppState>, account_id: Option<String>) -> Result<Vec<EmailFolder>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_folders(&db, account_id.as_deref())
}

#[tauri::command]
pub async fn mail_list_messages(state: State<'_, AppState>, folder_id: String, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<Email>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_messages(&db, &folder_id, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn mail_unified_inbox(state: State<'_, AppState>, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<Email>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_unified_inbox(&db, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn mail_unified_unread(state: State<'_, AppState>) -> Result<i64, MailError> {
    let db = state.service.db.lock().await;
    db_queries::unified_unread_count(&db)
}

#[tauri::command]
pub async fn mail_get_message(state: State<'_, AppState>, id: String) -> Result<Email, MailError> {
    let db = state.service.db.lock().await;
    db_queries::get_message(&db, &id)
}

#[tauri::command]
pub async fn mail_folder_unread(state: State<'_, AppState>, account_id: Option<String>) -> Result<Vec<(String, i64)>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::folder_unread_counts(&db, account_id.as_deref())
}

#[tauri::command]
pub async fn mail_add_account(state: State<'_, AppState>, email: String, display_name: Option<String>,
    username: Option<String>, password: String, imap_host: String, imap_port: i64,
    smtp_host: String, smtp_port: i64, use_ssl: Option<bool>) -> Result<EmailAccount, MailError> {
    let id = uuid::Uuid::new_v4().to_string();
    CredentialStore::save_password(&id, &password)?;
    let account = EmailAccount {
        id: id.clone(), email, display_name, username, credential_ref: CredentialStore::credential_ref(&id),
        imap_host, imap_port, smtp_host, smtp_port, use_ssl: use_ssl.unwrap_or(true),
        auth_type: "password".into(), signature_id: None,
        signature_auto_append_new: true, signature_auto_append_reply: true,
        last_synced_at: None, sync_enabled: true, sync_interval_mins: 5,
        created_at: now(), updated_at: now(),
    };
    let db = state.service.db.lock().await;
    db_queries::insert_account(&db, &account)?;
    Ok(account)
}

#[tauri::command]
pub async fn mail_sync(state: State<'_, AppState>, app: AppHandle, account_id: Option<String>) -> Result<SyncResult, MailError> {
    let accounts: Vec<EmailAccount> = {
        let db = state.service.db.lock().await;
        db_queries::list_accounts(&db)?
    };
    let target = match account_id {
        Some(id) => {
            let db = state.service.db.lock().await;
            vec![db_queries::get_account(&db, &id)?]
        }
        None => accounts,
    };
    let mut total = SyncResult { fetched: 0, inserted: 0, folders: 0, error: None };
    for account in target {
        let r = state.service.sync_account(&app, &account.id).await?;
        total.fetched += r.fetched;
        total.inserted += r.inserted;
        total.folders += r.folders;
    }
    Ok(total)
}

#[tauri::command]
pub async fn mail_send(state: State<'_, AppState>, account_id: String, to: Vec<String>, cc: Vec<String>,
    subject: String, body_html: String, body_text: String) -> Result<Email, MailError> {
    if to.len() > 50 { return Err(MailError::new("VALIDATION", "收件人不能超过50个")); }
    let account = {
        let db = state.service.db.lock().await;
        db_queries::get_account(&db, &account_id)?
    };
    let password = CredentialStore::get_password(&account_id)?;
    let username = account.username.clone().unwrap_or(account.email.clone());

    let params = SmtpParams {
        host: account.smtp_host, port: account.smtp_port as u16,
        username, password, from_email: account.email.clone(), from_name: account.display_name,
    };
    let raw_mail = send_mail(&params, &to, &cc, &subject, &body_html, &body_text).await?;
    let _ = raw_mail;  // 暂未追加到 IMAP Sent 文件夹

    // 插入已发送副本
    let sent_folder = {
        let db = state.service.db.lock().await;
        let f: Option<String> = db.query_row(
            "SELECT id FROM email_folders WHERE account_id = ?1 AND folder_type = 'sent'",
            rusqlite::params![account_id], |row| row.get(0)
        ).ok();
        f
    };

    let email = Email {
        id: uuid::Uuid::new_v4().to_string(), account_id: account_id.clone(),
        folder_id: sent_folder, message_id: Some(format!("sent-{}", uuid::Uuid::new_v4())),
        uid: None, from_address: Some(account.email.clone()),
        to_addresses: Some(serde_json::to_string(&to).unwrap_or_default()),
        cc_addresses: Some(serde_json::to_string(&cc).unwrap_or_default()),
        subject: Some(subject), preview_text: Some(body_text.chars().take(200).collect()),
        body_text: Some(body_text), body_html: Some(body_html), has_attachments: false,
        is_read: true, is_starred: false, received_at: Some(now()),
        created_at: now(), account_email: Some(account.email), account_name: None,
    };
    let db = state.service.db.lock().await;
    db_queries::upsert_email(&db, &email)?;
    Ok(email)
}

#[tauri::command]
pub async fn mail_mark_read(state: State<'_, AppState>, id: String, is_read: bool) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::mark_read(&db, &id, is_read)
}

#[tauri::command]
pub async fn mail_toggle_star(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::toggle_star(&db, &id)
}

#[tauri::command]
pub async fn mail_delete_message(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::delete_message(&db, &id)
}

#[tauri::command]
pub async fn mail_create_folder(state: State<'_, AppState>, account_id: String, name: String) -> Result<EmailFolder, MailError> {
    state.service.create_folder(&account_id, &name).await
}

#[tauri::command]
pub async fn mail_rename_folder(state: State<'_, AppState>, id: String, name: String) -> Result<EmailFolder, MailError> {
    state.service.rename_folder(&id, &name).await
}

#[tauri::command]
pub async fn mail_delete_folder(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    state.service.delete_folder(&id).await
}

#[tauri::command]
pub async fn mail_list_signatures(state: State<'_, AppState>) -> Result<Vec<EmailSignature>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_signatures(&db)
}

#[tauri::command]
pub async fn mail_save_signature(state: State<'_, AppState>, id: Option<String>, name: String, html: String, is_default: Option<bool>) -> Result<EmailSignature, MailError> {
    let sig = EmailSignature {
        id: id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name, html, is_default: is_default.unwrap_or(false),
        created_at: now(), updated_at: now(),
    };
    let db = state.service.db.lock().await;
    db_queries::save_signature(&db, &sig)?;
    Ok(sig)
}

#[tauri::command]
pub async fn mail_delete_signature(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::delete_signature(&db, &id)
}

#[tauri::command]
pub async fn mail_set_account_signature(state: State<'_, AppState>, account_id: String,
    signature_id: Option<String>, auto_new: Option<bool>, auto_reply: Option<bool>) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::set_account_signature(&db, &account_id, signature_id.as_deref(), auto_new, auto_reply)
}
