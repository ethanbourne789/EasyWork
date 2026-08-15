use tauri::{AppHandle, State};
use rusqlite::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::mail::creds::CredentialStore;
use crate::mail::db_queries;
use crate::mail::error::MailError;
use crate::mail::imap::ImapAdapter;
use crate::mail::service::MailService;
use crate::mail::smtp::{SmtpParams, build_raw, send_mail};
use crate::mail::types::*;
use crate::mail::contacts;
use crate::sync::{SyncConfig, SyncStatus, SyncLogEntry, ConnectionTestResult, SyncResult as CloudSyncResult};
use mail_parser::MessageParser;

pub struct AppState {
    pub service: MailService,
    /// 主应用本地数据库（任务/笔记等业务表 + 同步元数据表 sync_config/sync_log/device_info）。
    /// 云端同步引擎的 upload / download 都以此为本地数据源。
    pub db: Arc<Mutex<Connection>>,
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
    drop(db);
    trigger_cloud_sync(&state);
    Ok(account)
}

#[tauri::command]
pub async fn mail_update_account(state: State<'_, AppState>, id: String, email: String,
    display_name: Option<String>, username: Option<String>, password: Option<String>,
    imap_host: String, imap_port: i64, smtp_host: String, smtp_port: i64,
    use_ssl: Option<bool>) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::update_account(&db, &id, &email, display_name.as_deref(), username.as_deref(),
        &imap_host, imap_port, &smtp_host, smtp_port, use_ssl.unwrap_or(true))?;
    drop(db);
    if let Some(pwd) = password {
        if !pwd.is_empty() {
            CredentialStore::save_password(&id, &pwd)?;
        }
    }
    trigger_cloud_sync(&state);
    Ok(())
}

#[tauri::command]
pub async fn mail_delete_account(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::delete_account_data(&db, &id)?;
    drop(db);
    let _ = CredentialStore::delete_password(&id);
    trigger_cloud_sync(&state);
    Ok(())
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
    let mut errors: Vec<String> = Vec::new();
    for account in target {
        match state.service.sync_account(&app, &account.id).await {
            Ok(r) => {
                total.fetched += r.fetched;
                total.inserted += r.inserted;
                total.folders += r.folders;
                // 子账号的非致命错误（锁冲突/部分文件夹失败）必须透传，不能静默丢弃
                if let Some(e) = r.error {
                    errors.push(format!("{}: {}", account.email, e));
                }
            }
            Err(e) => {
                errors.push(format!("{}: {}", account.email, e.message));
            }
        }
    }
    // 单账号场景下硬错误直接返回 Err（前端按失败处理）；多账号聚合成 error 字段
    if total.folders == 0 && total.fetched == 0 && !errors.is_empty() {
        total.error = Some(errors.join("；"));
    } else if !errors.is_empty() {
        total.error = Some(errors.join("；"));
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
    let imap_host = account.imap_host.clone();
    let imap_port = account.imap_port as u16;
    let account_email = account.email.clone();
    let account_name = account.display_name.clone();

    let params = SmtpParams {
        host: account.smtp_host, port: account.smtp_port as u16,
        username: username.clone(), password: password.clone(),
        from_email: account_email.clone(), from_name: account_name.clone(),
    };
    let raw_mail = send_mail(&params, &to, &cc, &subject, &body_html, &body_text).await?;

    // 最佳努力：把已发送副本 APPEND 到 IMAP 已发送文件夹（失败不影响发送结果）
    let sent_path: Option<String> = {
        let db = state.service.db.lock().await;
        db.query_row(
            "SELECT imap_path FROM email_folders WHERE account_id = ?1 AND folder_type = 'sent'",
            rusqlite::params![account_id], |row| row.get(0)
        ).ok()
    };
    if let Some(path) = sent_path {
        match ImapAdapter::connect(&imap_host, imap_port, &username, &password).await {
            Ok(mut imap) => {
                if let Err(e) = imap.append_to_mailbox(&path, &raw_mail).await {
                    tracing::warn!("追加已发送到 IMAP 失败: {}", e.message);
                }
            }
            Err(e) => tracing::warn!("连接 IMAP 追加已发送失败: {}", e.message),
        }
    }

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
        uid: None, from_address: Some(account_email.clone()),
        to_addresses: Some(serde_json::to_string(&to).unwrap_or_default()),
        cc_addresses: Some(serde_json::to_string(&cc).unwrap_or_default()),
        subject: Some(subject), preview_text: Some(body_text.chars().take(200).collect()),
        body_text: Some(body_text), body_html: Some(body_html), has_attachments: false,
        is_read: true, is_starred: false, received_at: Some(now()),
        created_at: now(), account_email: Some(account_email), account_name,
    };
    let db = state.service.db.lock().await;
    db_queries::upsert_email(&db, &email)?;
    Ok(email)
}

/// 保存草稿：构建 MIME 后最佳努力 APPEND 到 IMAP 草稿箱，并写入本地库
#[tauri::command]
pub async fn mail_save_draft(state: State<'_, AppState>, account_id: String, to: Vec<String>,
    cc: Vec<String>, subject: String, body_html: String, body_text: String) -> Result<Email, MailError> {
    let account = {
        let db = state.service.db.lock().await;
        db_queries::get_account(&db, &account_id)?
    };
    let raw = build_raw(&account.email, account.display_name.as_deref(), &to, &cc, &subject, &body_html, &body_text)?;

    let draft_folder: Option<(String, String)> = {
        let db = state.service.db.lock().await;
        db.query_row(
            "SELECT id, imap_path FROM email_folders WHERE account_id = ?1 AND folder_type = 'drafts'",
            rusqlite::params![account_id], |row| Ok((row.get(0)?, row.get(1)?))
        ).ok()
    };

    if let Some((_, ref path)) = draft_folder {
        let username = account.username.clone().unwrap_or(account.email.clone());
        if let Ok(password) = CredentialStore::get_password(&account_id) {
            match ImapAdapter::connect(&account.imap_host, account.imap_port as u16, &username, &password).await {
                Ok(mut imap) => {
                    if let Err(e) = imap.append_to_mailbox(path, &raw).await {
                        tracing::warn!("追加草稿到 IMAP 失败: {}", e.message);
                    }
                }
                Err(e) => tracing::warn!("连接 IMAP 保存草稿失败: {}", e.message),
            }
        }
    }

    let email = Email {
        id: uuid::Uuid::new_v4().to_string(), account_id: account_id.clone(),
        folder_id: draft_folder.map(|(id, _)| id),
        message_id: Some(format!("draft-{}", uuid::Uuid::new_v4())),
        uid: None, from_address: Some(account.email.clone()),
        to_addresses: Some(serde_json::to_string(&to).unwrap_or_default()),
        cc_addresses: Some(serde_json::to_string(&cc).unwrap_or_default()),
        subject: Some(subject), preview_text: Some(body_text.chars().take(200).collect()),
        body_text: Some(body_text), body_html: Some(body_html), has_attachments: false,
        is_read: true, is_starred: false, received_at: Some(now()),
        created_at: now(), account_email: Some(account.email), account_name: account.display_name,
    };
    let db = state.service.db.lock().await;
    db_queries::upsert_email(&db, &email)?;
    Ok(email)
}

#[tauri::command]
pub async fn mail_mark_read(state: State<'_, AppState>, id: String, is_read: bool) -> Result<(), MailError> {
    let info = {
        let db = state.service.db.lock().await;
        db_queries::get_email_sync_info(&db, &id)?
    };
    {
        let db = state.service.db.lock().await;
        db_queries::mark_read(&db, &id, is_read)?;
    }
    // 最佳努力回写 IMAP \Seen（失败仅告警；本地状态已生效，下次同步从服务端收敛）
    let (account_id, folder_id, uid) = info;
    if let (Some(fid), Some(u)) = (folder_id, uid) {
        push_flag_to_imap(&state, &account_id, &fid, u, "\\Seen", is_read).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn mail_toggle_star(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let info = {
        let db = state.service.db.lock().await;
        db_queries::get_email_sync_info(&db, &id)?
    };
    let next = {
        let db = state.service.db.lock().await;
        db_queries::toggle_star(&db, &id)?
    };
    let (account_id, folder_id, uid) = info;
    if let (Some(fid), Some(u)) = (folder_id, uid) {
        push_flag_to_imap(&state, &account_id, &fid, u, "\\Flagged", next).await;
    }
    Ok(())
}

/// 把本地状态变更回写到 IMAP 服务端（UID STORE +/-FLAGS）。
/// 幂等、失败仅告警，不阻断本地操作。
async fn push_flag_to_imap(state: &AppState, account_id: &str, folder_id: &str, uid: i64, flag: &str, add: bool) {
    let account = {
        let db = state.service.db.lock().await;
        db_queries::get_account(&db, account_id).ok()
    };
    let path = {
        let db = state.service.db.lock().await;
        db.query_row(
            "SELECT imap_path FROM email_folders WHERE id = ?1",
            rusqlite::params![folder_id], |row| row.get::<_, String>(0)
        ).ok()
    };
    let (Some(account), Some(path)) = (account, path) else { return };
    let Ok(password) = CredentialStore::get_password(account_id) else { return };
    let username = account.username.clone().unwrap_or(account.email.clone());
    match ImapAdapter::connect(&account.imap_host, account.imap_port as u16, &username, &password).await {
        Ok(mut imap) => {
            if let Err(e) = imap.select_folder(&path).await {
                tracing::warn!("IMAP 回写 select 失败 folder={} err={}", path, e.message);
                return;
            }
            if let Err(e) = imap.store_flag(uid as u32, flag, add).await {
                tracing::warn!("IMAP 回写 {} 失败 uid={} err={}", flag, uid, e.message);
            }
        }
        Err(e) => tracing::warn!("IMAP 回写连接失败 err={}", e.message),
    }
}

#[tauri::command]
pub async fn mail_search(state: State<'_, AppState>, query: String, limit: Option<i64>) -> Result<Vec<Email>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::search_messages(&db, &query, limit.unwrap_or(50))
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

// ---------------------------------------------------------------------------
// 邮件模板
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn mail_list_templates(state: State<'_, AppState>) -> Result<Vec<EmailTemplate>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_templates(&db)
}

#[tauri::command]
pub async fn mail_save_template(state: State<'_, AppState>, id: Option<String>, name: String,
    subject: Option<String>, body: Option<String>) -> Result<EmailTemplate, MailError> {
    let tpl = EmailTemplate {
        id: id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name, subject, body, created_at: now(),
    };
    let db = state.service.db.lock().await;
    db_queries::save_template(&db, &tpl)?;
    Ok(tpl)
}

#[tauri::command]
pub async fn mail_delete_template(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::delete_template(&db, &id)
}

// ---------------------------------------------------------------------------
// 联系人（CRUD + 分组 + VCF 导入导出）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn contact_list(state: State<'_, AppState>, group_id: Option<String>,
    query: Option<String>) -> Result<Vec<Contact>, MailError> {
    let db = state.service.db.lock().await;
    contacts::list_contacts(&db, group_id.as_deref(), query.as_deref())
}

#[tauri::command]
pub async fn contact_save(state: State<'_, AppState>, contact: Contact) -> Result<Contact, MailError> {
    let mut c = contact;
    if c.id.is_empty() {
        c.id = uuid::Uuid::new_v4().to_string();
        c.created_at = now();
    }
    c.updated_at = now();
    if c.created_at.is_empty() {
        c.created_at = c.updated_at.clone();
    }
    let db = state.service.db.lock().await;
    contacts::save_contact(&db, &c)?;
    Ok(c)
}

#[tauri::command]
pub async fn contact_delete(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    contacts::delete_contact(&db, &id)
}

#[tauri::command]
pub async fn contact_group_list(state: State<'_, AppState>) -> Result<Vec<ContactGroup>, MailError> {
    let db = state.service.db.lock().await;
    contacts::list_groups(&db)
}

#[tauri::command]
pub async fn contact_group_save(state: State<'_, AppState>, id: Option<String>,
    name: String) -> Result<ContactGroup, MailError> {
    let ts = now();
    let group = ContactGroup {
        id: id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name, sort_order: 0, member_count: 0,
        created_at: ts.clone(), updated_at: ts,
    };
    let db = state.service.db.lock().await;
    contacts::save_group(&db, &group)?;
    Ok(group)
}

#[tauri::command]
pub async fn contact_group_delete(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    contacts::delete_group(&db, &id)
}

#[tauri::command]
pub async fn contact_export_vcf(state: State<'_, AppState>, group_id: Option<String>) -> Result<String, MailError> {
    let db = state.service.db.lock().await;
    contacts::export_vcf(&db, group_id.as_deref())
}

#[tauri::command]
pub async fn contact_import_vcf(state: State<'_, AppState>, content: String) -> Result<i64, MailError> {
    let db = state.service.db.lock().await;
    contacts::import_vcf(&db, &content)
}

// ---------------------------------------------------------------------------
// 邮件附件
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn mail_list_attachments(state: State<'_, AppState>, email_id: String) -> Result<Vec<EmailAttachment>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_attachments(&db, &email_id)
}

/// 下载附件：弹出系统保存对话框，把附件复制到用户选择的位置；用户取消返回空字符串
#[tauri::command]
pub async fn mail_download_attachment(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<String, MailError> {
    use tauri_plugin_dialog::DialogExt;
    let att = {
        let db = state.service.db.lock().await;
        db_queries::get_attachment(&db, &id)?
    };
    let src = std::path::PathBuf::from(&att.file_path);
    if !src.exists() {
        return Err(MailError::new("NOT_FOUND", "附件文件不存在或已被清理"));
    }
    let default_name = att.filename.clone().unwrap_or_else(|| "attachment".into());
    let picked = app.dialog().file()
        .set_file_name(default_name)
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(String::new()); // 用户取消
    };
    let dest = path.into_path()
        .map_err(|e| MailError::new("IO_ERROR", &format!("无效保存路径: {}", e)))?;
    std::fs::copy(&src, &dest)
        .map_err(|e| MailError::new("IO_ERROR", &format!("复制附件失败: {}", e)))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// 按需下载大附件：同步时只存元数据（file_path 为空），用户点击附件时从 IMAP
/// 拉取对应 MIME part 解码后写入本地缓存，回写 file_path 并返回该路径。
#[tauri::command]
pub async fn email_attachment_download(state: State<'_, AppState>, email_id: String, attachment_id: String) -> Result<String, MailError> {
    let (att, email) = {
        let db = state.service.db.lock().await;
        let att = db_queries::get_attachment(&db, &attachment_id)?;
        let email = db_queries::get_message(&db, &email_id)?;
        (att, email)
    };

    // 已存在本地缓存则直接返回
    if !att.file_path.is_empty() {
        return Ok(att.file_path);
    }
    if att.email_id != email_id {
        return Err(MailError::new("VALIDATION", "附件不属于该邮件"));
    }

    let uid = email.uid.ok_or_else(|| MailError::new("NOT_FOUND", "邮件缺少 UID，无法从服务端拉取附件"))? as u32;
    let folder_path = {
        let db = state.service.db.lock().await;
        let fid = email.folder_id.clone().ok_or_else(|| MailError::new("NOT_FOUND", "邮件缺少文件夹信息"))?;
        let p: Option<String> = db.query_row(
            "SELECT imap_path FROM email_folders WHERE id = ?1",
            rusqlite::params![fid], |row| row.get(0)
        ).ok();
        p.ok_or_else(|| MailError::new("NOT_FOUND", "邮件所在文件夹不存在"))?
    };

    let account = {
        let db = state.service.db.lock().await;
        db_queries::get_account(&db, &email.account_id)?
    };
    let password = CredentialStore::get_password(&email.account_id)?;
    let username = account.username.as_deref().unwrap_or(&account.email);
    let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

    // 附件在邮件附件列表中的序号 i，用于保持 {email_id}_{i} 的落盘命名
    let index = {
        let db = state.service.db.lock().await;
        let all = db_queries::list_attachments_for_email(&db, &email_id)?;
        all.iter().position(|a| a.id == attachment_id)
            .ok_or_else(|| MailError::new("NOT_FOUND", "附件记录不存在"))?
    };

    // 按 MIME part 拉取并解码；part_id 缺失或拉取失败时回退整封拉取再解析
    let data = if let Some(pid) = att.part_id.as_deref() {
        match imap.fetch_attachment(&folder_path, uid, pid).await {
            Ok(fetched) => match decode_fetched_part(&fetched.mime_headers, &fetched.body) {
                Ok(bytes) if !bytes.is_empty() => bytes,
                _ => {
                    tracing::warn!("[attachment] part 解码失败，回退整封拉取 email={} part={}", email_id, pid);
                    fetch_and_extract(&mut imap, &folder_path, uid, index).await?
                }
            },
            Err(e) => {
                tracing::warn!("[attachment] part 拉取失败，回退整封拉取 email={} err={}", email_id, e.message);
                fetch_and_extract(&mut imap, &folder_path, uid, index).await?
            }
        }
    } else {
        fetch_and_extract(&mut imap, &folder_path, uid, index).await?
    };

    let disk_name = format!("{}_{}", email_id, index);
    let path = state.service.attachments_dir.join(&disk_name);
    std::fs::write(&path, &data)
        .map_err(|e| MailError::new("IO_ERROR", &format!("附件写入失败: {}", e)))?;
    let path_str = path.to_string_lossy().into_owned();

    {
        let db = state.service.db.lock().await;
        db_queries::mark_attachment_downloaded(&db, &attachment_id, &path_str)?;
    }
    Ok(path_str)
}

/// 拉取整封邮件并解析出第 index 个附件的解码字节
async fn fetch_and_extract(imap: &mut ImapAdapter, folder: &str, uid: u32, index: usize) -> Result<Vec<u8>, MailError> {
    let raw = imap.fetch_full(folder, uid).await?;
    let parsed = crate::mail::mime::parse_message(&raw)?;
    parsed.attachments.into_iter().nth(index)
        .map(|att| att.data)
        .ok_or_else(|| MailError::new("NOT_FOUND", "未在邮件中解析到该附件"))
}

/// 用按需拉取的 part 头部 + body 组装合成消息，交给 mail-parser 按
/// Content-Transfer-Encoding 解码，得到与同步时一致的原始附件字节。
fn decode_fetched_part(mime_headers: &[u8], body: &[u8]) -> Result<Vec<u8>, MailError> {
    if body.is_empty() {
        return Err(MailError::new("PARSE_ERROR", "附件数据为空"));
    }
    let mut raw = Vec::with_capacity(mime_headers.len() + body.len() + 8);
    raw.extend_from_slice(mime_headers);
    // 保证头部与正文之间恰好一个空行（.MIME 返回的头部通常以单个 CRLF 结尾）
    if mime_headers.ends_with(b"\r\n\r\n") || mime_headers.ends_with(b"\n\n") {
        // 已含空行
    } else if mime_headers.ends_with(b"\r\n") {
        raw.extend_from_slice(b"\r\n");
    } else if mime_headers.ends_with(b"\n") {
        raw.extend_from_slice(b"\n");
    } else {
        raw.extend_from_slice(b"\r\n\r\n");
    }
    raw.extend_from_slice(body);
    let parsed = MessageParser::default().parse(&raw)
        .ok_or_else(|| MailError::new("PARSE_ERROR", "无法解析附件数据"))?;
    let mut out: Option<Vec<u8>> = None;
    for part in parsed.attachments() {
        let data = part.contents();
        if !data.is_empty() {
            out = Some(data.to_vec());
            break;
        }
    }
    out.ok_or_else(|| MailError::new("PARSE_ERROR", "附件数据为空"))
}

#[tauri::command]
pub fn get_autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    autostart.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_close_behavior(app: tauri::AppHandle) -> Result<bool, String> {
    use std::sync::atomic::Ordering;
    use tauri::Manager;
    use crate::AppSharedState;
    let state = app.state::<AppSharedState>();
    Ok(state.close_behavior.load(Ordering::Relaxed))
}

#[tauri::command]
pub fn set_close_behavior(app: tauri::AppHandle, close_on_exit: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    use tauri::Manager;
    use crate::AppSharedState;
    let state = app.state::<AppSharedState>();
    state.close_behavior.store(close_on_exit, Ordering::Relaxed);
    Ok(())
}

// ----------------------------------------------------------------------------
// 云端同步相关命令（PostgreSQL 增量同步）
// ----------------------------------------------------------------------------

/// 读取当前同步配置。若从未保存过，返回一份带默认值（disabled）的配置，便于前端表单初始化。
#[tauri::command]
pub async fn sync_config_get(state: State<'_, AppState>) -> Result<SyncConfig, String> {
    let db = state.db.lock().await;
    match crate::sync::config::get_sync_config(&db).map_err(|e| e.to_string())? {
        Some(cfg) => Ok(cfg),
        None => Ok(SyncConfig {
            id: "default".to_string(),
            enabled: false,
            provider: "custom".to_string(),
            connection_string: String::new(),
            database_name: String::new(),
            last_sync_at: None,
            sync_error: None,
            created_at: now(),
            updated_at: now(),
        }),
    }
}

/// 保存（UPSERT）同步配置。强制 id='default'；首次保存写入 created_at，每次保存刷新 updated_at 并清空错误。
#[tauri::command]
pub async fn sync_config_save(state: State<'_, AppState>, config: SyncConfig) -> Result<(), String> {
    let db = state.db.lock().await;
    let existing = crate::sync::config::get_sync_config(&db).ok().flatten();
    let created_at = existing.as_ref().map(|c| c.created_at.clone()).unwrap_or_else(now);
    let last_sync_at = existing.as_ref().and_then(|c| c.last_sync_at.clone());
    let cfg = SyncConfig {
        id: "default".to_string(),
        enabled: config.enabled,
        provider: config.provider,
        connection_string: config.connection_string,
        database_name: config.database_name,
        last_sync_at,
        sync_error: None,
        created_at,
        updated_at: now(),
    };
    crate::sync::config::save_sync_config(&db, &cfg).map_err(|e| e.to_string())
}

/// 删除同步配置（停止同步）。
#[tauri::command]
pub async fn sync_config_delete(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    crate::sync::config::delete_sync_config(&db).map_err(|e| e.to_string())
}

/// 测试 PostgreSQL 连接。优先使用入参的连接串；为空时回退到已保存的配置。
#[tauri::command]
pub async fn sync_test_connection(
    state: State<'_, AppState>,
    connection_string: Option<String>,
) -> Result<ConnectionTestResult, String> {
    let conn_str = match connection_string {
        Some(s) if !s.trim().is_empty() => s,
        _ => {
            let db = state.db.lock().await;
            match crate::sync::config::get_sync_config(&db).map_err(|e| e.to_string())? {
                Some(cfg) if !cfg.connection_string.trim().is_empty() => cfg.connection_string,
                _ => {
                    return Ok(ConnectionTestResult {
                        success: false,
                        message: "未配置连接字符串".to_string(),
                    });
                }
            }
        }
    };
    Ok(crate::sync::postgres::test_connection(&conn_str).await)
}

/// 手动触发一次完整同步（先上传本地，再下载云端，应用 LWW）。
#[tauri::command]
pub async fn sync_trigger(state: State<'_, AppState>) -> Result<CloudSyncResult, String> {
    crate::sync::engine::full_sync(&state.db, &state.service.db)
        .await
        .map_err(|e| e)
}

/// 返回当前同步状态（启用开关、上次同步时间、错误信息、设备 ID/名称、待处理冲突数）。
#[tauri::command]
pub async fn sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let db = state.db.lock().await;
    let cfg = crate::sync::config::get_sync_config(&db).ok().flatten();
    let device_id = crate::sync::config::get_device_id(&db).map_err(|e| e.to_string())?;
    let device_name = crate::sync::config::get_device_name(&db)
        .unwrap_or_else(|_| "EasyWork Device".to_string());
    let pending_conflicts: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_conflicts WHERE resolved = 0",
        [],
        |r| r.get(0),
    ).unwrap_or(0);
    Ok(SyncStatus {
        enabled: cfg.as_ref().map(|c| c.enabled).unwrap_or(false),
        last_sync_at: cfg.as_ref().and_then(|c| c.last_sync_at.clone()),
        sync_error: cfg.as_ref().and_then(|c| c.sync_error.clone()),
        device_id,
        device_name,
        pending_conflicts,
    })
}

/// 列出未解决的云同步冲突。
#[tauri::command]
pub async fn sync_conflicts_list(state: State<'_, AppState>) -> Result<Vec<crate::sync::SyncConflict>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.prepare(
        "SELECT id, table_name, pk_value, local_snapshot, remote_snapshot, detected_at \
         FROM sync_conflicts WHERE resolved = 0 ORDER BY detected_at"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(crate::sync::SyncConflict {
            id: r.get(0)?,
            table_name: r.get(1)?,
            pk_value: r.get(2)?,
            local_snapshot: r.get(3)?,
            remote_snapshot: r.get(4)?,
            detected_at: r.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// 解决一条云同步冲突。
/// - keep_local = true：保留本地版本（仅删除冲突记录，本地行不动）。
/// - keep_local = false：采用云端版本（将云端快照写回本地，并标记为本地已同步，避免再次拉取）。
#[tauri::command]
pub async fn sync_conflict_resolve(
    state: State<'_, AppState>,
    id: String,
    keep_local: bool,
) -> Result<(), String> {
    let db = state.db.lock().await;
    let conflict = db.query_row(
        "SELECT table_name, pk_value, remote_snapshot FROM sync_conflicts WHERE id = ?1 AND resolved = 0",
        rusqlite::params![id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
    ).map_err(|e| format!("冲突不存在或已解决: {}", e))?;
    let (table, pk_value, remote_snapshot) = conflict;

    if !keep_local {
        crate::sync::engine::apply_conflict_remote(&db, &table, &pk_value, &remote_snapshot)?;
    }

    db.execute(
        "UPDATE sync_conflicts SET resolved = 1 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// 查询最近的同步日志（默认 20 条，封顶 200）。
#[tauri::command]
pub async fn sync_log_get(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<SyncLogEntry>, String> {
    let db = state.db.lock().await;
    let lim = limit.unwrap_or(20).clamp(1, 200);
    crate::sync::config::get_sync_logs(&db, lim).map_err(|e| e.to_string())
}

/// 设置当前设备的显示名称。
#[tauri::command]
pub async fn sync_set_device_name(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let db = state.db.lock().await;
    crate::sync::config::set_device_name(&db, &name).map_err(|e| e.to_string())
}

/// 数据变更后触发一次非阻塞的即时上传（仅当已启用同步时才会真正连接云端）。
/// 捕获所有错误并记录日志，绝不让同步故障影响主业务流程。
fn trigger_cloud_sync(state: &AppState) {
    let db = state.db.clone();
    let mail_db = state.service.db.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::sync::engine::sync_upload(&db, &mail_db).await {
            tracing::warn!("即时云端同步失败: {}", e);
        }
    });
}
