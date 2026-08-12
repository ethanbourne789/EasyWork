pub mod mail;
pub mod commands;

use std::sync::Arc;
use tauri::Manager;

/// 返回应用版本号。
/// 注意：Rust 原生层目前仅承载极少量命令（如本命令）。业务功能（含邮件收发）
/// 实际通过 Supabase Edge Function + 前端直连实现，桌面壳为「WebView + Supabase」模式，
/// 并非完整原生实现。版本号来源为 Cargo.toml 的 [package].version，
/// 应与 tauri.conf.json 的 version 及前端回退值保持一致。
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");
            let mail_dir = app_data_dir.join("mail");
            std::fs::create_dir_all(&mail_dir)?;
            std::fs::create_dir_all(mail_dir.join("attachments"))?;

            let db_path = mail_dir.join("easywork-mail.db");
            let conn = mail::db::init_db(&db_path)
                .expect("无法初始化邮件数据库");

            let service = mail::service::MailService {
                db: Arc::new(tokio::sync::Mutex::new(conn)),
                attachments_dir: mail_dir.join("attachments").into_boxed_path(),
                locks: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
            };

            app.manage(commands::AppState { service });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            commands::mail_list_accounts,
            commands::mail_list_folders,
            commands::mail_list_messages,
            commands::mail_unified_inbox,
            commands::mail_unified_unread,
            commands::mail_get_message,
            commands::mail_folder_unread,
            commands::mail_add_account,
            commands::mail_sync,
            commands::mail_send,
            commands::mail_mark_read,
            commands::mail_toggle_star,
            commands::mail_delete_message,
            commands::mail_create_folder,
            commands::mail_rename_folder,
            commands::mail_delete_folder,
            commands::mail_list_signatures,
            commands::mail_save_signature,
            commands::mail_delete_signature,
            commands::mail_set_account_signature
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("EasyWork 启动失败: {e}");
        std::process::exit(1);
    }
}
