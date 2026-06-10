mod db;
mod mail;
mod commands;

use tauri::{
    Emitter, Manager, WindowEvent,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};
use tauri_plugin_notification::NotificationExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Track whether a "close to tray" event is in progress
    let closing_to_tray = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let pool = db::init_db(&app_data_dir)
                .expect("Failed to initialize mail database");

            app.manage(pool.clone());

            // Start background sync worker
            let pool_clone = pool.clone();
            tauri::async_runtime::spawn(async move {
                mail::sync::start_sync_worker(pool_clone).await;
            });

            // ---- System Tray ----
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let fetch_item = MenuItemBuilder::with_id("fetch", "立即收取邮件").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&fetch_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "fetch" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let pool = handle.state::<db::DbPool>().inner().clone();
                                let accounts = db::ops::list_accounts(&pool).unwrap_or_default();
                                for account in &accounts {
                                    if let Some(id) = account.id {
                                        log::info!("Tray fetch: syncing account {}", id);
                                        let _ = commands::mail::sync_account_impl(
                                            pool.clone(), id,
                                        ).await;
                                    }
                                }
                            });
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // ---- Auto-fetch scheduler ----
            let pool_for_fetch = pool.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    // Read configured interval (default 5 min)
                    let interval_secs = db::ops::get_config(&pool_for_fetch, "auto_fetch_interval")
                        .and_then(|v| v.parse::<u64>().ok())
                        .unwrap_or(300);

                    tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;

                    // Sync all accounts
                    let accounts = db::ops::list_accounts(&pool_for_fetch).unwrap_or_default();
                    for account in &accounts {
                        if let Some(id) = account.id {
                            match commands::mail::sync_account_impl(
                                pool_for_fetch.clone(), id,
                            ).await {
                                Ok(result) => {
                                    if result.messages_new > 0 {
                                        // Send notification for new messages
                                        let _ = app_handle.emit("new-mail", result.messages_new);
                                        // Also send system notification
                                        let _ = app_handle.notification()
                                            .builder()
                                            .title("EasyWork")
                                            .body(&format!("收到 {} 封新邮件", result.messages_new))
                                            .show();
                                    }
                                }
                                Err(e) => {
                                    log::warn!("Auto-fetch error for account {}: {}", id, e);
                                }
                            }
                        }
                    }
                }
            });

            log::info!("EasyWork mail module initialized with tray");
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Check close behavior setting
                let pool = window.state::<db::DbPool>();
                let close_behavior = db::ops::get_config(&pool, "close_behavior")
                    .unwrap_or_else(|| "minimize".to_string());

                if close_behavior == "minimize" {
                    api.prevent_close();
                    let _ = window.hide();
                    closing_to_tray.store(true, Ordering::SeqCst);
                }
                // If "exit", let the window close naturally
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Accounts
            commands::mail::add_account,
            commands::mail::list_accounts,
            commands::mail::delete_account,
            commands::mail::update_account,
            commands::mail::test_connection,
            // Folders
            commands::mail::list_folders,
            commands::mail::folder_unread_counts,
            // Messages
            commands::mail::fetch_messages,
            commands::mail::search_messages,
            commands::mail::get_message_body,
            commands::mail::get_message_headers,
            commands::mail::mark_message_read,
            commands::mail::toggle_message_star,
            commands::mail::delete_message,
            commands::mail::archive_message,
            // Send
            commands::mail::send_mail,
            // Sync
            commands::mail::sync_account,
            // Attachments
            commands::mail::list_message_attachments,
            commands::mail::open_file,
            commands::mail::read_file_as_base64,
            // Contacts
            commands::mail::add_contact,
            commands::mail::list_contacts,
            commands::mail::delete_contact,
            commands::mail::update_contact,
            // Reconciliation & Monitoring
            commands::mail::reconcile_account,
            commands::mail::get_pending_ops_summary,
            // Config & Tray
            commands::mail::get_auto_fetch_interval,
            commands::mail::set_auto_fetch_interval,
            commands::mail::get_close_behavior,
            commands::mail::set_close_behavior,
            commands::mail::get_unread_count,
            // Remote Images
            commands::mail::get_remote_images_enabled,
            commands::mail::set_remote_images_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
