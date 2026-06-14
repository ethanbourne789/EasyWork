//! 后台日志写入器
//!
//! 负责从 channel 接收日志条目，批量写入 SQLite 数据库。
//! 设计目标：
//! - 异步非阻塞：业务代码写入 channel 后立即返回
//! - 批量写入：每 500ms 或满 100 条时批量 INSERT
//! - 自动清理：保留最近 7 天或最多 10000 条

use std::sync::mpsc;
use std::time::{Duration, Instant};
use rusqlite::params;
use crate::db::DbPool;

/// 日志条目结构
#[derive(Debug, Clone)]
pub struct LogEntry {
    pub trace_id: Option<String>,
    pub level: String,
    pub module: String,
    pub action: Option<String>,
    pub status: Option<String>,
    pub params: Option<String>,
    pub result: Option<String>,
    pub error_msg: Option<String>,
    pub duration_ms: Option<i64>,
    pub source_file: Option<String>,
    pub source_line: Option<i32>,
}

/// 批量写入配置
const BATCH_INTERVAL_MS: u64 = 500;
const BATCH_SIZE: usize = 100;

/// 清理策略
const RETENTION_DAYS: i64 = 7;
const MAX_LOG_COUNT: i64 = 10000;

/// 日志写入器
pub struct LogWriter {
    pool: DbPool,
    receiver: mpsc::Receiver<LogEntry>,
    buffer: Vec<LogEntry>,
    last_cleanup: Instant,
}

impl LogWriter {
    /// 创建新的日志写入器
    pub fn new(pool: DbPool, receiver: mpsc::Receiver<LogEntry>) -> Self {
        Self {
            pool,
            receiver,
            buffer: Vec::with_capacity(BATCH_SIZE),
            last_cleanup: Instant::now(),
        }
    }

    /// 运行写入循环（阻塞，应在独立线程中运行）
    pub fn run(mut self) {
        // 尝试先写一条测试日志，验证 SQLite 写入正常
        if let Ok(conn) = self.pool.get() {
            if conn.execute(
                "INSERT INTO app_logs (level, module, action, status) VALUES ('INFO', 'log_writer', 'start', 'OK')",
                [],
            ).is_ok() {
                // 再删掉测试记录
                let _ = conn.execute("DELETE FROM app_logs WHERE module = 'log_writer' AND action = 'start'", []);
            }
        }

        loop {
            // 尝试接收日志条目
            match self.receiver.recv_timeout(Duration::from_millis(BATCH_INTERVAL_MS)) {
                Ok(entry) => {
                    self.buffer.push(entry);

                    // 批量接收直到满或超时
                    while self.buffer.len() < BATCH_SIZE {
                        match self.receiver.try_recv() {
                            Ok(entry) => self.buffer.push(entry),
                            Err(_) => break,
                        }
                    }

                    // 达到批量大小则刷新
                    if self.buffer.len() >= BATCH_SIZE {
                        self.flush();
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // 超时，检查是否需要刷新
                    if !self.buffer.is_empty() {
                        self.flush();
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    // 发送端已关闭，刷新剩余并退出
                    self.flush();
                    break;
                }
            }

            // 定期检查是否需要清理（每 60 秒）
            if self.last_cleanup.elapsed() > Duration::from_secs(60) {
                self.cleanup();
                self.last_cleanup = Instant::now();
            }
        }
    }

    /// 刷新缓冲区，批量写入数据库
    fn flush(&mut self) {
        if self.buffer.is_empty() {
            return;
        }

        let conn = match self.pool.get() {
            Ok(conn) => conn,
            Err(e) => {
                eprintln!("LogWriter: failed to get DB connection: {}", e);
                return;
            }
        };

        let mut stmt = match conn.prepare(
            "INSERT INTO app_logs (trace_id, level, module, action, status, params, result, error_msg, duration_ms, source_file, source_line)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
        ) {
            Ok(stmt) => stmt,
            Err(e) => {
                eprintln!("LogWriter: failed to prepare statement: {}", e);
                return;
            }
        };

        let mut inserted = 0;
        for entry in self.buffer.drain(..) {
            if let Err(e) = stmt.execute(params![
                entry.trace_id,
                entry.level,
                entry.module,
                entry.action,
                entry.status,
                entry.params,
                entry.result,
                entry.error_msg,
                entry.duration_ms,
                entry.source_file,
                entry.source_line,
            ]) {
                eprintln!("LogWriter: failed to insert log: {}", e);
            } else {
                inserted += 1;
            }
        }

        if inserted > 0 {
            eprintln!("LogWriter: flushed {} logs to database", inserted);
        }
    }

    /// 清理旧日志
    fn cleanup(&self) {
        let conn = match self.pool.get() {
            Ok(conn) => conn,
            Err(e) => {
                eprintln!("LogWriter cleanup: failed to get DB connection: {}", e);
                return;
            }
        };

        // 按时间清理：删除 7 天前的日志
        let _ = conn.execute(
            "DELETE FROM app_logs WHERE created_at < datetime('now', ?1)",
            params![format!("-{} days", RETENTION_DAYS)],
        );

        // 按数量清理：保留最新的 MAX_LOG_COUNT 条
        let _ = conn.execute(
            "DELETE FROM app_logs WHERE id NOT IN (SELECT id FROM app_logs ORDER BY created_at DESC LIMIT ?1)",
            params![MAX_LOG_COUNT],
        );
    }
}

/// 解析日志消息，提取结构化字段
///
/// 支持格式：
/// - `[trace_id] action status {json_params}` - 完整格式
/// - `[trace_id] action status` - 无参数
/// - `action status` - 无 trace_id
/// - 其他 - 作为普通消息
pub fn parse_log_message(message: &str) -> ParsedLog {
    let message = message.trim();

    // 尝试提取 trace_id: [xxxxxxxx]
    let (trace_id, rest) = if message.starts_with('[') {
        if let Some(end) = message.find(']') {
            let trace = message[1..end].to_string();
            (Some(trace), message[end + 1..].trim())
        } else {
            (None, message)
        }
    } else {
        (None, message)
    };

    // 尝试提取 action 和 status
    let parts: Vec<&str> = rest.splitn(3, ' ').collect();

    match parts.len() {
        0 => ParsedLog {
            trace_id,
            action: None,
            status: None,
            params: None,
        },
        1 => ParsedLog {
            trace_id,
            action: Some(parts[0].to_string()),
            status: None,
            params: None,
        },
        2 => {
            // 检查第二部分是否是 JSON
            if parts[1].starts_with('{') {
                ParsedLog {
                    trace_id,
                    action: Some(parts[0].to_string()),
                    status: None,
                    params: Some(parts[1].to_string()),
                }
            } else {
                ParsedLog {
                    trace_id,
                    action: Some(parts[0].to_string()),
                    status: Some(parts[1].to_string()),
                    params: None,
                }
            }
        }
        _ => {
            let action = parts[0].to_string();
            let status = parts[1].to_string();
            let params = if parts[2].starts_with('{') {
                Some(parts[2].to_string())
            } else {
                Some(parts[2].to_string())
            };

            ParsedLog {
                trace_id,
                action: Some(action),
                status: Some(status),
                params,
            }
        }
    }
}

/// 解析后的日志字段
pub struct ParsedLog {
    pub trace_id: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub params: Option<String>,
}

/// 从文件路径提取模块名
pub fn extract_module(file: &str) -> String {
    let file = file.replace('\\', "/");

    // 匹配 src-tauri/src/commands/xxx.rs -> xxx
    if let Some(start) = file.find("commands/") {
        let rest = &file[start + 9..];
        if let Some(end) = rest.find('/') {
            return rest[..end].replace(".rs", "");
        }
        return rest.replace(".rs", "");
    }

    // 匹配 src-tauri/src/mail/xxx.rs -> mail
    if file.contains("/mail/") {
        return "mail".to_string();
    }

    // 匹配 src-tauri/src/db/xxx.rs -> db
    if file.contains("/db/") {
        return "db".to_string();
    }

    // 匹配 src-tauri/src/stock/xxx.rs -> stock
    if file.contains("/stock/") {
        return "stock".to_string();
    }

    // 默认使用文件名
    file.split('/')
        .last()
        .unwrap_or("unknown")
        .replace(".rs", "")
}
