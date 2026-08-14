pub mod mail;
pub mod commands;
pub mod db;
pub mod sync;
pub mod calendar_sync;

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
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("EasyWork 启动失败: {e}");
        std::process::exit(1);
    }
}
