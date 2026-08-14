use tauri::{AppHandle, State};
use rusqlite::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::mail::creds::CredentialStore;
use crate::mail::db_queries;
use crate::mail::error::MailError;
use crate::mail::service::MailService;
use crate::mail::smtp::{SmtpParams, send_mail};
use crate::mail::types::*;
use crate::sync::{SyncConfig, SyncStatus, SyncLogEntry, ConnectionTestResult, SyncResult as CloudSyncResult};

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
            provider: "supabase".to_string(),
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

/// 返回当前同步状态（启用开关、上次同步时间、错误信息、设备 ID/名称）。
#[tauri::command]
pub async fn sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let db = state.db.lock().await;
    let cfg = crate::sync::config::get_sync_config(&db).ok().flatten();
    let device_id = crate::sync::config::get_device_id(&db).map_err(|e| e.to_string())?;
    let device_name = crate::sync::config::get_device_name(&db)
        .unwrap_or_else(|_| "EasyWork Device".to_string());
    Ok(SyncStatus {
        enabled: cfg.as_ref().map(|c| c.enabled).unwrap_or(false),
        last_sync_at: cfg.as_ref().and_then(|c| c.last_sync_at.clone()),
        sync_error: cfg.as_ref().and_then(|c| c.sync_error.clone()),
        device_id,
        device_name,
    })
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
