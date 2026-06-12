//! 应用设置管理（基于 SQLite key-value 存储）
use std::collections::HashMap;
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 获取单个设置项
#[tauri::command]
pub async fn settings_get(key: String, state: State<'_, DbState>) -> AppResult<Option<String>> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

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
pub async fn settings_set(
    key: String,
    value: String,
    state: State<'_, DbState>,
) -> AppResult<()> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

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
pub async fn settings_get_all(state: State<'_, DbState>) -> AppResult<HashMap<String, String>> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    let map: HashMap<String, String> = rows.into_iter().collect();
    Ok(map)
}
