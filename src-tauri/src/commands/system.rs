//! 系统级只读命令（app 数据目录等）
use tauri::Manager;

/// 返回当前 Tauri app 的数据目录（跨平台）。
/// - Windows: `C:\Users\<User>\AppData\Roaming\com.easywork.desktop\`
/// - Android: `/data/data/com.easywork.desktop/files/`
#[tauri::command]
pub async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}
