mod db;
mod error;
mod mail;
mod stock;
mod commands;
mod logging;
mod log_writer;
mod sync;

use tauri::{
    Emitter, Manager, WindowEvent,
};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri_plugin_notification::NotificationExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Desktop-only: set up system tray icon and menu
#[cfg(desktop)]
fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::TrayIconBuilder;

    let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
    let fetch_item = MenuItemBuilder::with_id("fetch", "立即收取邮件").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&fetch_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    log::debug!("Tray left-click: main window shown");
                }
            }
        })
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
    Ok(())
}

// ---- Tauri Commands for global-shortcut & autostart ----

#[cfg(desktop)]
#[tauri::command]
async fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.state::<tauri_plugin_autostart::AutoLaunchManager>();
    if enabled {
        manager.enable().map_err(|e| format!("Failed to enable autostart: {}", e))?;
    } else {
        manager.disable().map_err(|e| format!("Failed to disable autostart: {}", e))?;
    }
    log::info!("Autostart set to {}", enabled);
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
async fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    let manager = app.state::<tauri_plugin_autostart::AutoLaunchManager>();
    manager.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_global_shortcut(pool: tauri::State<'_, db::DbPool>) -> Result<String, String> {
    Ok(db::ops::get_config(&pool, "global_shortcut").unwrap_or_else(|| "Alt+W".to_string()))
}

#[tauri::command]
async fn set_global_shortcut(pool: tauri::State<'_, db::DbPool>, shortcut: String) -> Result<(), String> {
    db::ops::set_config(&pool, "global_shortcut", &shortcut);
    log::info!("Global shortcut saved: {} (will take effect on next restart)", shortcut);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Track whether a "close to tray" event is in progress
    let closing_to_tray = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            // ---- Autostart plugin (desktop only) ----
            #[cfg(desktop)]
            app.handle().plugin(
                tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec![]),
                )
            ).ok();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ---- Single instance (desktop only) ----
            #[cfg(desktop)]
            app.handle().plugin(
                tauri_plugin_single_instance::init(|app, _args, _cwd| {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
            ).ok();

            // ── Get app data dir FIRST (used by logging, db, shortcuts) ──
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            // ── Initialize database (stock module DDL is part of schema.rs) ──
            let pool = db::init_db(&app_data_dir)
                .expect("Failed to initialize mail database");

            // ── Initialize structured file+console+SQLite logging ──
            if let Err(e) = logging::init(&app_data_dir, pool.clone()) {
                eprintln!("WARN: logging::init failed: {}. Logging to stderr only.", e);
            }

            // ---- Global shortcut (desktop only) ----
            #[cfg(desktop)]
            {
                let shortcut_key = db::ops::get_config(&pool, "global_shortcut")
                    .unwrap_or_else(|| "Alt+W".to_string());

                let app_handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::default()
                        .with_handler(move |_app_handle, shortcut, event| {
                            if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                                log::info!("Global shortcut triggered: {}", shortcut);
                                if let Some(window) = _app_handle.get_webview_window("main") {
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        })
                        .build(),
                )?;

                // Register the configured shortcut
                let _ = app_handle.global_shortcut().register(shortcut_key.as_str());
            }

            app.manage(pool.clone());

            // Store app_data_dir in config so background workers can find it
            db::ops::set_config(&pool, "app_data_dir", &app_data_dir.to_string_lossy());

            // ── Initialize cloud sync manager ──
            let sync_manager = sync::SyncManager::new(pool.clone());
            app.manage(sync_manager);

            // Per-account sync lock — prevents manual button, auto-fetch
            // scheduler, and smart-poll worker from all syncing the same
            // account concurrently. Try-acquire returns a friendly error
            // string the frontend can show in the toast.
            let sync_lock: commands::mail::SyncLock = Default::default();
            app.manage(sync_lock);

            // Start background sync worker
            let pool_clone = pool.clone();
            let cancel_token = tokio_util::sync::CancellationToken::new();
            tauri::async_runtime::spawn(async move {
                mail::sync::start_sync_worker(pool_clone, cancel_token).await;
            });

            // ---- Stock price alert worker ----
            // 后台轮询 stock_alerts 启用的预警，触发后通过系统通知提醒用户
            #[cfg(desktop)]
            {
                let app_handle_alerts = app.handle().clone();
                stock::alert_worker::spawn(pool.clone(), app_handle_alerts);
            }

            // ---- System Tray (desktop only) ----
            #[cfg(desktop)]
            setup_tray(app.handle())?;

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
                            // Acquire per-account lock so we don't race with
                            // the manual button or the smart-poll worker.
                            let lock = app_handle.state::<commands::mail::SyncLock>();
                            let _guard = match commands::mail::SyncLockGuard::acquire(lock.inner(), id) {
                                Ok(g) => g,
                                Err(busy) => {
                                    log::debug!("auto-fetch: skipping account {} ({})", id, busy);
                                    continue;
                                }
                            };
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
            match event {
                // Update smart-poll focus state so the background worker
                // uses 10s polling when the user is in the app and 120s
                // when minimized. Previously set_app_focused had no caller
                // and APP_FOCUSED was stuck at false, defeating the smart
                // poll design.
                WindowEvent::Focused(focused) => {
                    let focused = *focused;
                    mail::sync::set_app_focused(focused);
                    log::info!("App focus changed: focused={} (smart poll → {}s)", focused, if focused { 10 } else { 120 });
                }
                WindowEvent::CloseRequested { api, .. } => {
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
                _ => {}
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
            commands::mail::fetch_messages_multi,
            commands::mail::search_messages,
            commands::mail::search_messages_multi,
            commands::mail::mark_folder_read,
            commands::mail::get_unread_count_multi,
            commands::mail::get_message_body,
            commands::mail::get_message_headers,
            commands::mail::mark_message_read,
            commands::mail::toggle_message_star,
            commands::mail::delete_message,
            commands::mail::archive_message,
            // IMAP autoconfig discovery
            commands::autoconfig::autodiscover_account,
            // Notification click routing
            commands::notification_handler::route_notification_open,
            // Drafts sync
            commands::drafts::push_draft_to_imap,
            commands::drafts::pull_drafts_from_imap,
            commands::drafts::list_local_drafts,
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
            // v1.1 Contact Groups
            commands::mail::list_contact_groups,
            commands::mail::add_contact_group,
            commands::mail::update_contact_group,
            commands::mail::delete_contact_group,
            // v1.1 Find + Search
            commands::mail::find_contact_by_email,
            commands::mail::search_messages_by_email,
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
            // Signatures
            commands::mail::list_signatures,
            commands::mail::add_signature,
            commands::mail::update_signature,
            commands::mail::delete_signature,
            commands::mail::get_default_signature,
            commands::mail::set_default_signature,
            // Settings KV (基础设施，本轮不暴露前端 API)
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_get_all,
            // System
            #[cfg(desktop)]
            set_autostart,
            #[cfg(desktop)]
            get_autostart,
            get_global_shortcut,
            set_global_shortcut,
            // Stock module — watchlist / trades / positions / alerts
            crate::stock::commands::stock_watchlist_list,
            crate::stock::commands::stock_watchlist_add,
            crate::stock::commands::stock_watchlist_remove,
            crate::stock::commands::stock_watchlist_reorder,
            crate::stock::commands::stock_trade_add,
            crate::stock::commands::stock_trade_delete,
            crate::stock::commands::stock_trades_list,
            crate::stock::commands::stock_trades_count,
            crate::stock::commands::stock_positions_get,
            crate::stock::commands::stock_alert_list,
            crate::stock::commands::stock_alert_add,
            crate::stock::commands::stock_alert_update,
            crate::stock::commands::stock_alert_delete,
            crate::stock::commands::stock_alert_toggle,
            // Accounting module — transactions / categories / budgets / stats
            commands::accounting::txn_list,
            commands::accounting::txn_create,
            commands::accounting::txn_update,
            commands::accounting::txn_delete,
            commands::accounting::category_list,
            commands::accounting::category_create,
            commands::accounting::category_update,
            commands::accounting::category_delete,
            commands::accounting::budget_list,
            commands::accounting::budget_create,
            commands::accounting::budget_update,
            commands::accounting::budget_delete,
            commands::accounting::budget_save_all,
            commands::accounting::stats_summary,
            // Log module — query / export / clear / stats
            commands::log::query_logs,
            commands::log::get_trace_chain,
            commands::log::get_log_stats,
            commands::log::clear_logs,
            commands::log::export_logs,
            commands::log::get_log_modules,
            // Cloud sync module
            sync::sync_sign_in,
            sync::sync_sign_up,
            sync::sync_sign_out,
            sync::sync_is_authenticated,
            sync::sync_get_status,
            sync::sync_now,
            sync::sync_check_connectivity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
