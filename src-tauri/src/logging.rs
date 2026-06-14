//! Structured logging module for EasyWork.
//!
//! Provides:
//! - File + console + SQLite triple-output logging via `fern`
//! - Trace ID generation for correlating multi-step operations
//! - Structured log parsing for database storage
//! - Automatic timestamp, log level, source location

use std::path::PathBuf;
use std::sync::mpsc;
use std::io::Write;

use crate::db::DbPool;
use crate::log_writer::{LogWriter, LogEntry, parse_log_message, extract_module};

/// 全局日志发送端（用于将日志写入 SQLite）
static LOG_SENDER: std::sync::OnceLock<mpsc::Sender<LogEntry>> = std::sync::OnceLock::new();

/// 初始化日志系统
///
/// 输出到三个目标：
/// 1. 文件：`{app_data_dir}/logs/easywork.log`（完整日志）
/// 2. 控制台：stderr（Info 级别以上）
/// 3. SQLite：`app_logs` 表（结构化日志，异步批量写入）
pub fn init(app_data_dir: &PathBuf, pool: DbPool) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir)?;

    let log_file = log_dir.join("easywork.log");

    // 创建 channel 用于异步写入 SQLite
    let (tx, rx) = mpsc::channel::<LogEntry>();

    // 保存全局 sender
    let _ = LOG_SENDER.set(tx.clone());

    // 启动后台写入线程
    std::thread::spawn(move || {
        let writer = LogWriter::new(pool, rx);
        writer.run();
    });

    // 文件输出配置
    let file_config = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{} {:<5} {}:{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.file().unwrap_or("unknown"),
                record.line().unwrap_or(0),
                message,
            ))
        })
        .level(log::LevelFilter::Debug)
        .chain(fern::log_file(&log_file)?);

    // 控制台输出配置
    let stderr_config = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{:<5}] {}",
                record.level(),
                message,
            ))
        })
        .level(log::LevelFilter::Info)
        .chain(std::io::stderr());

    // SQLite 输出配置（通过 channel）
    let sqlite_config = fern::Dispatch::new()
        .format(|out, message, record| {
            // 将 Arguments 转换为 String
            let message_str = message.to_string();
            
            // 解析日志消息，提取结构化字段
            let parsed = parse_log_message(&message_str);
            let module = record.file()
                .map(extract_module)
                .unwrap_or_else(|| "system".to_string());

            // 从消息中提取 trace_id（如果存在）
            let trace_id = parsed.trace_id.or_else(|| {
                // 尝试从消息开头提取 [xxxx] 格式
                if message_str.starts_with('[') {
                    if let Some(end) = message_str.find(']') {
                        return Some(message_str[1..end].to_string());
                    }
                }
                None
            });

            let entry = LogEntry {
                trace_id,
                level: record.level().to_string(),
                module,
                action: parsed.action,
                status: parsed.status,
                params: parsed.params,
                result: None,
                error_msg: if record.level() == log::Level::Error {
                    Some(message_str)
                } else {
                    None
                },
                duration_ms: None,
                source_file: record.file().map(|s| s.to_string()),
                source_line: record.line().map(|l| l as i32),
            };

            // 发送到 channel（非阻塞）
            if let Some(sender) = LOG_SENDER.get() {
                let _ = sender.send(entry);
            }

            // 输出空消息（实际内容已通过 channel 发送）
            out.finish(format_args!(""))
        })
        .level(log::LevelFilter::Info);

    // 组合所有输出
    fern::Dispatch::new()
        .chain(file_config)
        .chain(stderr_config)
        .chain(sqlite_config)
        .apply()?;

    log::info!("══════════════════════════════════════════");
    log::info!("EasyWork v{} started", env!("CARGO_PKG_VERSION"));
    log::info!("Log file: {}", log_file.display());
    log::info!("SQLite logging: enabled (async batch write)");
    log::info!("══════════════════════════════════════════");

    Ok(())
}

/// 生成 trace ID，用于关联同一操作的多条日志
pub fn trace_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    // 取时间戳的后 8 位十六进制
    format!("{:08x}", ts as u32)
}

/// 记录结构化日志（供业务代码调用）
///
/// 示例：
/// ```rust
/// log_structured(
///     "INFO",
///     "mail",
///     Some("add_account"),
///     Some("START"),
///     Some(r#"{"email":"a***@gmail.com"}"#),
///     None,
///     None,
///     None,
/// );
/// ```
pub fn log_structured(
    level: &str,
    module: &str,
    action: Option<&str>,
    status: Option<&str>,
    params: Option<&str>,
    result: Option<&str>,
    error_msg: Option<&str>,
    duration_ms: Option<i64>,
) {
    // 构建消息（用于文件和控制台输出）
    let mut message = String::new();

    if let Some(act) = action {
        message.push_str(act);
    }
    if let Some(st) = status {
        if !message.is_empty() {
            message.push(' ');
        }
        message.push_str(st);
    }
    if let Some(p) = params {
        if !message.is_empty() {
            message.push(' ');
        }
        message.push_str(p);
    }

    // 根据级别调用 log 宏
    match level.to_uppercase().as_str() {
        "DEBUG" => log::debug!("{}", message),
        "INFO" => log::info!("{}", message),
        "WARN" => log::warn!("{}", message),
        "ERROR" => log::error!("{}", message),
        _ => log::info!("{}", message),
    }

    // 直接写入 SQLite（绕过 fern，用于更精细的控制）
    if let Some(sender) = LOG_SENDER.get() {
        let entry = LogEntry {
            trace_id: None,
            level: level.to_string(),
            module: module.to_string(),
            action: action.map(|s| s.to_string()),
            status: status.map(|s| s.to_string()),
            params: params.map(|s| s.to_string()),
            result: result.map(|s| s.to_string()),
            error_msg: error_msg.map(|s| s.to_string()),
            duration_ms,
            source_file: None,
            source_line: None,
        };
        let _ = sender.send(entry);
    }
}
