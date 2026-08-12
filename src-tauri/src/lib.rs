/// 返回应用版本号。
/// 注意：Rust 原生层目前仅承载极少量命令（如本命令）。业务功能（含邮件收发）
/// 实际通过 Supabase Edge Function + 前端直连实现，桌面壳为「WebView + Supabase」模式，
/// 并非完整原生实现。版本号来源为 Cargo.toml 的 [package].version，
/// 应与 tauri.conf.json 的 version 及前端回退值保持一致。
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub mod mail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = tauri::Builder::default()
        .setup(|_app| {
            // 当前为轻量壳模式，业务逻辑通过 Supabase Edge Function 实现
            // 如需原生初始化（tray、deep link、自动更新等），在此处添加
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
    {
        eprintln!("EasyWork 启动失败: {e}");
        std::process::exit(1);
    }
}
