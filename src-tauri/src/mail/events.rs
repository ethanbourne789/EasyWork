use tauri::{AppHandle, Emitter};
use crate::mail::types::SyncProgress;

pub fn emit_progress(app: &AppHandle, progress: SyncProgress) {
    let _ = app.emit("mail://sync-progress", &progress);
}
