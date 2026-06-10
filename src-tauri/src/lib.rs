mod db;
mod mail;
mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize mail database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let pool = db::init_db(&app_data_dir)
                .expect("Failed to initialize mail database");

            // Manage pool as Tauri state
            app.manage(pool.clone());

            // Start background sync worker
            tauri::async_runtime::spawn(async move {
                mail::sync::start_sync_worker(pool).await;
            });

            log::info!("EasyWork mail module initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::mail::add_account,
            commands::mail::list_accounts,
            commands::mail::delete_account,
            commands::mail::update_account,
            commands::mail::fetch_messages,
            commands::mail::get_message_body,
            commands::mail::mark_message_read,
            commands::mail::toggle_message_star,
            commands::mail::test_connection,
            commands::mail::sync_account,
            commands::mail::list_folders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
