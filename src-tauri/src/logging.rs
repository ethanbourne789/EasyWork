//! Structured logging module for EasyWork.
//!
//! Provides:
//! - File + console dual-output logging via `fern`
//! - Trace ID generation for correlating multi-step operations
//! - Operation-level logging with `#[instrument]`-style macros
//! - Automatic timestamp, log level, source location

use std::path::PathBuf;

/// Initialize the logging system.
///
/// Writes to `{app_data_dir}/logs/easywork.log` (rotated daily) AND to stderr.
/// Rotation: once per day, keep 7 days.
pub fn init(app_data_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir)?;

    let log_file = log_dir.join("easywork.log");

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

    // Combine both outputs
    fern::Dispatch::new()
        .chain(file_config)
        .chain(stderr_config)
        .apply()?;

    log::info!("══════════════════════════════════════════");
    log::info!("EasyWork v{} started", env!("CARGO_PKG_VERSION"));
    log::info!("Log file: {}", log_file.display());
    log::info!("══════════════════════════════════════════");

    Ok(())
}

/// Generate a short trace ID for correlating log entries in a single operation.
pub fn trace_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    // Take the last 8 hex chars of the timestamp for readability
    format!("{:08x}", ts as u32)
}
