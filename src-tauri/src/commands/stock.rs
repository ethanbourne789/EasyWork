//! 股票关注与提醒
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 股票关注项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockItem {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub alert_type: Option<String>,
    pub target_price: Option<f64>,
    #[serde(rename = "isEnabled")]
    pub is_enabled: bool,
    pub created_at: String,
}

impl StockItem {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(StockItem {
            id: row.get("id")?,
            code: row.get("code")?,
            name: row.get("name")?,
            alert_type: row.get("alert_type")?,
            target_price: row.get("target_price")?,
            is_enabled: row.get::<_, i32>("is_enabled")? != 0,
            created_at: row.get("created_at")?,
        })
    }
}

/// 获取股票关注列表
#[tauri::command]
pub async fn stock_list(state: State<'_, DbState>) -> AppResult<Vec<StockItem>> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let mut stmt = conn.prepare(
        "SELECT id, code, name, alert_type, target_price, is_enabled, created_at \
         FROM stocks ORDER BY created_at DESC",
    )?;

    let stocks = stmt
        .query_map([], StockItem::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(stocks)
}

/// 关注股票
#[tauri::command]
pub async fn stock_subscribe(
    code: String,
    name: String,
    alert_type: Option<String>,
    target_price: Option<f64>,
    state: State<'_, DbState>,
) -> AppResult<StockItem> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 检查是否已关注
    let exists: bool = conn.query_row(
        "SELECT 1 FROM stocks WHERE code = ?1",
        params![code],
        |_| Ok(true),
    )
    .unwrap_or(false);

    if exists {
        return Err(AppError::InvalidInput(format!(
            "股票 {} 已在关注列表中",
            code
        )));
    }

    conn.execute(
        "INSERT INTO stocks (code, name, alert_type, target_price, is_enabled) \
         VALUES (?1, ?2, ?3, ?4, 1)",
        params![code, name, alert_type, target_price],
    )?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, code, name, alert_type, target_price, is_enabled, created_at \
         FROM stocks WHERE id = ?1",
    )?;

    let stock = stmt
        .query_row(params![id], StockItem::from_row)
        .map_err(|_| AppError::NotFound(format!("股票记录 {} 未找到", id)))?;

    Ok(stock)
}

/// 取消关注股票
#[tauri::command]
pub async fn stock_unsubscribe(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let affected = conn.execute("DELETE FROM stocks WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

/// 切换股票启用/禁用状态
#[tauri::command]
pub async fn stock_toggle_enabled(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 先查询当前状态
    let current: bool = conn.query_row(
        "SELECT is_enabled FROM stocks WHERE id = ?1",
        params![id],
        |row| row.get::<_, i32>(0),
    )
    .map(|v| v != 0)
    .map_err(|_| AppError::NotFound(format!("股票 {} 未找到", id)))?;

    let new_val = if current { 0 } else { 1 };
    conn.execute(
        "UPDATE stocks SET is_enabled = ?1 WHERE id = ?2",
        params![new_val, id],
    )?;

    Ok(!current)
}
