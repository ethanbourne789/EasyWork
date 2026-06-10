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

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let pool = db::init_db(&app_data_dir)
                .expect("Failed to initialize mail database");

            app.manage(pool.clone());

            // Start background sync worker
            tauri::async_runtime::spawn(async move {
                mail::sync::start_sync_worker(pool).await;
            });

            log::info!("EasyWork mail module initialized");
            Ok(())
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
            // Contacts
            commands::mail::add_contact,
            commands::mail::list_contacts,
            commands::mail::delete_contact,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
