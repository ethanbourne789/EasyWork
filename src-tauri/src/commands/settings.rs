//! 应用设置管理（基于 SQLite key-value 存储）
use std::collections::HashMap;
use tauri::State;

use crate::db::DbPool;
use crate::error::AppResult;
use rusqlite::params;

/// 获取单个设置项
#[tauri::command]
pub async fn settings_get(key: String, pool: State<'_, DbPool>) -> AppResult<Option<String>> {
    let conn = pool.get().map_err(|e| {
        crate::error::AppError::Internal(format!("Failed to get DB connection: {}", e))
    })?;

    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();

    Ok(value)
}

/// 设置单个设置项
#[tauri::command]
pub async fn settings_set(key: String, value: String, pool: State<'_, DbPool>) -> AppResult<()> {
    let conn = pool.get().map_err(|e| {
        crate::error::AppError::Internal(format!("Failed to get DB connection: {}", e))
    })?;

    // UPSERT：存在则更新，不存在则插入
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;

    Ok(())
}

/// 获取所有设置项
#[tauri::command]
pub async fn settings_get_all(pool: State<'_, DbPool>) -> AppResult<HashMap<String, String>> {
    let conn = pool.get().map_err(|e| {
        crate::error::AppError::Internal(format!("Failed to get DB connection: {}", e))
    })?;

    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    let map: HashMap<String, String> = rows.into_iter().collect();
    Ok(map)
}
