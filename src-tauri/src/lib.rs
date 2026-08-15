pub mod mail;
pub mod commands;
pub mod db;
pub mod sync;
pub mod calendar_sync;
pub mod business;

#[cfg(test)]
mod tests;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone)]
pub struct AppSharedState {
    pub close_behavior: Arc<AtomicBool>,
}

/// 应用数据根目录（本次会话解析结果，供各模块共享）。
/// 优先「文档/EasyWork」，解析或迁移失败时回退到应用数据目录。
#[derive(Clone)]
pub struct DataRoot(pub std::path::PathBuf);

/// 解析数据根目录：优先用户文档目录下的 EasyWork 子目录，失败回退应用数据目录。
fn resolve_data_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, tauri::Error> {
    match app.path().document_dir() {
        Ok(doc) => Ok(doc.join("EasyWork")),
        Err(_) => app.path().app_data_dir(),
    }
}

/// 递归复制目录内容。
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

/// 把旧位置（应用数据目录）的数据库迁移到新根目录。
/// 仅在新位置尚无数据库且旧位置存在库时执行；先 checkpoint WAL 再复制，避免丢最新数据。
fn migrate_legacy_data(
    new_root: &std::path::Path,
    legacy_root: &std::path::Path,
) -> std::io::Result<()> {
    if new_root.join("easywork.db").exists() || !legacy_root.join("easywork.db").exists() {
        return Ok(());
    }
    // 先 checkpoint 旧库，把 WAL 日志合并进主文件，再复制（否则复制主文件会丢最新写入）。
    for rel in ["easywork.db", "mail/easywork-mail.db"] {
        let p = legacy_root.join(rel);
        if p.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&p) {
                let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            }
        }
    }
    std::fs::create_dir_all(new_root)?;
    std::fs::copy(legacy_root.join("easywork.db"), new_root.join("easywork.db"))?;
    let legacy_mail = legacy_root.join("mail");
    if legacy_mail.exists() {
        let new_mail = new_root.join("mail");
        std::fs::create_dir_all(&new_mail)?;
        if legacy_mail.join("easywork-mail.db").exists() {
            std::fs::copy(
                legacy_mail.join("easywork-mail.db"),
                new_mail.join("easywork-mail.db"),
            )?;
        }
        let la = legacy_mail.join("attachments");
        if la.exists() {
            copy_dir_recursive(&la, &new_mail.join("attachments"))?;
        }
    }
    let lr = legacy_root.join("receipts");
    if lr.exists() {
        copy_dir_recursive(&lr, &new_root.join("receipts"))?;
    }
    Ok(())
}

/// 返回应用版本号。
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppSharedState>();
                let close_on_exit = state.close_behavior.load(Ordering::Relaxed);
                if close_on_exit {
                    api.prevent_close();
                    window.app_handle().exit(0);
                } else {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let legacy_root = app.path().app_data_dir()
                .expect("无法获取应用数据目录");
            // 数据根目录优先「文档/EasyWork」；解析失败或迁移失败时回退旧目录，保证数据不丢。
            let data_root = match resolve_data_root(app.handle()) {
                Ok(root) => match migrate_legacy_data(&root, &legacy_root) {
                    Ok(()) => root,
                    Err(e) => {
                        tracing::warn!("数据迁移到文档目录失败，本次回退使用旧目录: {e}");
                        legacy_root
                    }
                },
                Err(_) => legacy_root,
            };
            app.manage(DataRoot(data_root.clone()));
            let mail_dir = data_root.join("mail");
            std::fs::create_dir_all(&mail_dir)?;
            std::fs::create_dir_all(mail_dir.join("attachments"))?;

            let db_path = mail_dir.join("easywork-mail.db");
            let conn = mail::db::init_db(&db_path)
                .expect("无法初始化邮件数据库");

            // 主应用本地数据库（任务/笔记等业务表 + 同步元数据表）。
            let app_db_path = data_root.join("easywork.db");
            let app_conn = db::init_db(&app_db_path)
                .expect("无法初始化应用数据库");
            crate::sync::config::create_sync_tables(&app_conn)
                .expect("无法创建同步元数据表");

            let service = mail::service::MailService {
                db: Arc::new(tokio::sync::Mutex::new(conn)),
                attachments_dir: mail_dir.join("attachments").into_boxed_path(),
                locks: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
            };

            app.manage(commands::AppState {
                service,
                db: Arc::new(tokio::sync::Mutex::new(app_conn)),
            });

            let close_behavior = Arc::new(AtomicBool::new(false));
            app.manage(AppSharedState {
                close_behavior: close_behavior.clone(),
            });

            #[cfg(desktop)]
            {
                let _ = app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None,
                ));

                let autostart_manager = app.autolaunch();
                if autostart_manager.is_enabled().unwrap_or(false) {
                    let _ = autostart_manager.enable();
                }
            }

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                use tokio::time::{sleep, Duration};
                loop {
                    sleep(Duration::from_secs(300)).await;
                    let _ = commands::mail_sync(
                        app_handle.state::<commands::AppState>(),
                        app_handle.clone(),
                        None,
                    ).await;
                }
            });

            // 云端增量同步后台任务：每 60 秒检查一次同步配置，若已启用则自动
            // 上传本地变更并下载云端变更。所有错误仅记录日志，绝不让同步故障
            // 拖垮主进程。
            {
                let cloud_db = app.state::<commands::AppState>().db.clone();
                let cloud_mail_db = app.state::<commands::AppState>().service.db.clone();
                tauri::async_runtime::spawn(async move {
                    use tokio::time::{sleep, Duration};
                    loop {
                        sleep(Duration::from_secs(60)).await;
                        if let Err(e) = crate::sync::engine::sync_upload(
                            &cloud_db,
                            &cloud_mail_db,
                        ).await {
                            tracing::warn!("云端同步上传失败: {}", e);
                        }
                        if let Err(e) = crate::sync::engine::sync_download(
                            &cloud_db,
                            &cloud_mail_db,
                        ).await {
                            tracing::warn!("云端同步下载失败: {}", e);
                        }
                    }
                });
            }

            let show_item = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 EasyWork", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("EasyWork")
                .on_menu_event(|app_handle, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.unminimize();
                            }
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        let app_handle = tray.app_handle();
                        if let Some(window) = app_handle.get_webview_window("main") {
                            match window.is_visible().unwrap_or(false) {
                                true => {
                                    let _ = window.hide();
                                }
                                false => {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = window.unminimize();
                                }
                            }
                        }
                    }
                })
                .build(app)?;

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
            commands::mail_update_account,
            commands::mail_delete_account,
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
            commands::mail_set_account_signature,
            commands::get_autostart_status,
            commands::set_autostart,
            commands::get_close_behavior,
            commands::set_close_behavior,
            commands::sync_config_get,
            commands::sync_config_save,
            commands::sync_config_delete,
            commands::sync_test_connection,
            commands::sync_trigger,
            commands::sync_status,
            commands::sync_log_get,
            commands::sync_set_device_name,
            // ---- local-first 业务命令（任务/笔记/记账/日历）----
            business::task_list_all,
            business::task_get,
            business::task_create,
            business::task_update,
            business::task_delete,
            business::subtask_list,
            business::subtask_create,
            business::subtask_update,
            business::subtask_delete,
            business::tag_list_all,
            business::tag_create,
            business::tag_update,
            business::tag_delete,
            business::task_tag_list,
            business::task_tag_set,
            business::note_list_all,
            business::note_get,
            business::note_create,
            business::note_update,
            business::note_delete,
            business::note_folder_list_all,
            business::note_folder_create,
            business::note_folder_update,
            business::note_folder_delete,
            business::note_tag_list_all,
            business::note_tag_create,
            business::note_tag_update,
            business::note_tag_delete,
            business::note_tag_get_by_note,
            business::note_tag_get_ids,
            business::note_tag_list_all_relations,
            business::note_tag_set,
            business::transaction_list_all,
            business::transaction_get,
            business::transaction_create,
            business::transaction_update,
            business::transaction_delete,
            business::account_list_all,
            business::account_get,
            business::account_create,
            business::account_update,
            business::account_delete,
            business::category_list_all,
            business::category_create,
            business::category_update,
            business::category_delete,
            business::budget_list_all,
            business::budget_create,
            business::budget_update,
            business::budget_delete,
            business::calendar_event_list_all,
            business::calendar_event_get,
            business::calendar_event_create,
            business::calendar_event_update,
            business::calendar_event_delete,
            business::calendar_subscription_list_all,
            business::calendar_subscription_get,
            business::calendar_subscription_create,
            business::calendar_subscription_update,
            business::calendar_subscription_delete,
            business::calendar_sync_subscription,
            business::data_export_all,
            business::data_import_all,
            business::data_clear_all,
            business::receipt_save,
            business::receipt_open,
            business::auth_register,
            business::auth_login,
            business::auth_get_user,
            business::auth_update_profile,
            business::auth_change_password,
            business::demo_enter,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("EasyWork 启动失败: {e}");
        std::process::exit(1);
    }
}
