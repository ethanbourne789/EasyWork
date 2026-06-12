//! Notification click → jump to the corresponding message.
//!
//! When the user clicks a system notification for a new mail, the frontend
//! listens for the `notification-open` event and scrolls to the message.
//! This module provides the Rust-side handler that re-emits the event to
//! the frontend with the correct `account_id` and `message_id`.

use tauri::{AppHandle, Emitter};

#[derive(serde::Serialize, Clone, Debug)]
pub struct NotificationOpenPayload {
    pub account_id: i64,
    pub message_id: i64,
    pub subject: String,
    pub from_email: String,
}

/// Route a notification click to the frontend.
/// Called by the frontend (after receiving the OS notification event) so we
/// have a single source of truth (the Tauri event bus).
#[tauri::command]
pub async fn route_notification_open(
    app: AppHandle,
    account_id: i64,
    message_id: i64,
    subject: String,
    from_email: String,
) -> Result<(), String> {
    let payload = NotificationOpenPayload {
        account_id,
        message_id,
        subject,
        from_email,
    };
    app.emit("notification-open", payload)
        .map_err(|e| format!("emit notification-open failed: {}", e))?;
    Ok(())
}
