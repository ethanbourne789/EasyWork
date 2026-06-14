//! 日志查询/导出/清空 IPC 命令
//!
//! 提供前端日志页面所需的所有后端接口：
//! - 分页查询日志
//! - 按 trace_id 查询调用链
//! - 导出日志为 JSON/文本
//! - 清空日志
//! - 统计信息

use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use crate::db::DbPool;

/// 日志条目（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLog {
    pub id: i64,
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
    pub created_at: String,
}

/// 分页查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub module: Option<String>,
    pub level: Option<String>,
    pub action: Option<String>,
    pub trace_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub keyword: Option<String>,
}

/// 分页查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogQueryResult {
    pub logs: Vec<AppLog>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

/// 日志统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogStats {
    pub total: i64,
    pub today: i64,
    pub error_count: i64,
    pub warn_count: i64,
    pub info_count: i64,
    pub debug_count: i64,
}

/// 查询日志（分页 + 过滤）
#[tauri::command]
pub async fn query_logs(
    pool: State<'_, DbPool>,
    query: LogQuery,
) -> Result<LogQueryResult, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // 检查 app_logs 表是否存在
    let table_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='app_logs'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !table_exists {
        return Ok(LogQueryResult {
            logs: vec![],
            total: 0,
            page: query.page.unwrap_or(1),
            page_size: query.page_size.unwrap_or(50),
        });
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).max(1).min(200);
    let offset = (page - 1) * page_size;

    // 构建 WHERE 子句
    let mut conditions = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref module) = query.module {
        if !module.is_empty() {
            conditions.push(format!("module = ?{}", param_values.len() + 1));
            param_values.push(Box::new(module.clone()));
        }
    }

    if let Some(ref level) = query.level {
        if !level.is_empty() {
            conditions.push(format!("level = ?{}", param_values.len() + 1));
            param_values.push(Box::new(level.clone()));
        }
    }

    if let Some(ref action) = query.action {
        if !action.is_empty() {
            conditions.push(format!("action = ?{}", param_values.len() + 1));
            param_values.push(Box::new(action.clone()));
        }
    }

    if let Some(ref trace_id) = query.trace_id {
        if !trace_id.is_empty() {
            conditions.push(format!("trace_id = ?{}", param_values.len() + 1));
            param_values.push(Box::new(trace_id.clone()));
        }
    }

    if let Some(ref start_time) = query.start_time {
        if !start_time.is_empty() {
            conditions.push(format!("created_at >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(start_time.clone()));
        }
    }

    if let Some(ref end_time) = query.end_time {
        if !end_time.is_empty() {
            conditions.push(format!("created_at <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(end_time.clone()));
        }
    }

    if let Some(ref keyword) = query.keyword {
        if !keyword.is_empty() {
            conditions.push(format!(
                "(action LIKE ?{0} OR status LIKE ?{0} OR params LIKE ?{0} OR error_msg LIKE ?{0} OR module LIKE ?{0} OR trace_id LIKE ?{0})",
                param_values.len() + 1
            ));
            param_values.push(Box::new(format!("%{}%", keyword)));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // 查询总数
    let count_sql = format!("SELECT COUNT(*) FROM app_logs {}", where_clause);
    let refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&count_sql, refs.as_slice(), |row| row.get(0))
        .unwrap_or(0);

    // 查询数据
    let data_sql = format!(
        "SELECT id, trace_id, level, module, action, status, params, result, error_msg, duration_ms, source_file, source_line, created_at \
         FROM app_logs {} ORDER BY created_at DESC LIMIT ?{} OFFSET ?{}",
        where_clause,
        param_values.len() + 1,
        param_values.len() + 2
    );

    let mut stmt = conn.prepare(&data_sql).map_err(|e| e.to_string())?;

    let mut data_params = param_values;
    data_params.push(Box::new(page_size));
    data_params.push(Box::new(offset));

    let data_refs: Vec<&dyn rusqlite::types::ToSql> = data_params.iter().map(|p| p.as_ref()).collect();

    let logs: Vec<AppLog> = stmt.query_map(data_refs.as_slice(), |row| {
        Ok(AppLog {
            id: row.get("id")?,
            trace_id: row.get("trace_id")?,
            level: row.get("level")?,
            module: row.get("module")?,
            action: row.get("action")?,
            status: row.get("status")?,
            params: row.get("params")?,
            result: row.get("result")?,
            error_msg: row.get("error_msg")?,
            duration_ms: row.get("duration_ms")?,
            source_file: row.get("source_file")?,
            source_line: row.get("source_line")?,
            created_at: row.get("created_at")?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(LogQueryResult {
        logs,
        total,
        page,
        page_size,
    })
}

/// 按 trace_id 查询完整调用链
#[tauri::command]
pub async fn get_trace_chain(
    pool: State<'_, DbPool>,
    trace_id: String,
) -> Result<Vec<AppLog>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, trace_id, level, module, action, status, params, result, error_msg, duration_ms, source_file, source_line, created_at \
         FROM app_logs WHERE trace_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;

    let logs: Vec<AppLog> = stmt.query_map(params![trace_id], |row| {
        Ok(AppLog {
            id: row.get("id")?,
            trace_id: row.get("trace_id")?,
            level: row.get("level")?,
            module: row.get("module")?,
            action: row.get("action")?,
            status: row.get("status")?,
            params: row.get("params")?,
            result: row.get("result")?,
            error_msg: row.get("error_msg")?,
            duration_ms: row.get("duration_ms")?,
            source_file: row.get("source_file")?,
            source_line: row.get("source_line")?,
            created_at: row.get("created_at")?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(logs)
}

/// 获取日志统计
#[tauri::command]
pub async fn get_log_stats(pool: State<'_, DbPool>) -> Result<LogStats, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // 检查 app_logs 表是否存在
    let table_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='app_logs'",
        [],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !table_exists {
        eprintln!("LOG_WARN: app_logs table does not exist");
        return Ok(LogStats {
            total: 0, today: 0, error_count: 0,
            warn_count: 0, info_count: 0, debug_count: 0,
        });
    }

    let total: i64 = conn.query_row("SELECT COUNT(*) FROM app_logs", [], |row| row.get(0))
        .unwrap_or(0);

    let today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_logs WHERE created_at >= date('now')",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    let error_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_logs WHERE level = 'ERROR'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    let warn_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_logs WHERE level = 'WARN'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    let info_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_logs WHERE level = 'INFO'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    let debug_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_logs WHERE level = 'DEBUG'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    Ok(LogStats {
        total,
        today,
        error_count,
        warn_count,
        info_count,
        debug_count,
    })
}

/// 清空所有日志
#[tauri::command]
pub async fn clear_logs(pool: State<'_, DbPool>) -> Result<i64, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let deleted = conn.execute("DELETE FROM app_logs", []).map_err(|e| e.to_string())?;
    log::info!("Cleared {} log entries", deleted);
    Ok(deleted as i64)
}

/// 导出日志为 JSON 字符串
#[tauri::command]
pub async fn export_logs(
    pool: State<'_, DbPool>,
    format: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut conditions = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref start) = start_time {
        if !start.is_empty() {
            conditions.push(format!("created_at >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(start.clone()));
        }
    }

    if let Some(ref end) = end_time {
        if !end.is_empty() {
            conditions.push(format!("created_at <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(end.clone()));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT id, trace_id, level, module, action, status, params, result, error_msg, duration_ms, source_file, source_line, created_at \
         FROM app_logs {} ORDER BY created_at ASC",
        where_clause
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let logs: Vec<AppLog> = stmt.query_map(refs.as_slice(), |row| {
        Ok(AppLog {
            id: row.get("id")?,
            trace_id: row.get("trace_id")?,
            level: row.get("level")?,
            module: row.get("module")?,
            action: row.get("action")?,
            status: row.get("status")?,
            params: row.get("params")?,
            result: row.get("result")?,
            error_msg: row.get("error_msg")?,
            duration_ms: row.get("duration_ms")?,
            source_file: row.get("source_file")?,
            source_line: row.get("source_line")?,
            created_at: row.get("created_at")?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let format = format.unwrap_or_else(|| "json".to_string());

    if format == "text" {
        // 纯文本格式
        let mut output = String::new();
        output.push_str("EasyWork 日志导出\n");
        output.push_str("==================\n\n");

        for log in &logs {
            output.push_str(&format!(
                "[{}] {} {} | {} | {} | {}\n",
                log.created_at,
                log.level,
                log.module,
                log.action.as_deref().unwrap_or("-"),
                log.status.as_deref().unwrap_or("-"),
                log.params.as_deref().unwrap_or("-"),
            ));
            if let Some(ref err) = log.error_msg {
                output.push_str(&format!("  错误: {}\n", err));
            }
            if let Some(trace) = &log.trace_id {
                output.push_str(&format!("  trace: {}\n", trace));
            }
            output.push('\n');
        }

        Ok(output)
    } else {
        // JSON 格式
        serde_json::to_string_pretty(&logs).map_err(|e| e.to_string())
    }
}

/// 获取可用的模块列表（用于前端过滤下拉）
#[tauri::command]
pub async fn get_log_modules(pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT DISTINCT module FROM app_logs ORDER BY module")
        .map_err(|e| e.to_string())?;

    let modules: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(modules)
}
