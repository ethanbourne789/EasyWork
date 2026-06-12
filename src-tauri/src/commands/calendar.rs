//! 日历事件 CRUD
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 日历事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub start_at: String,
    pub end_at: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub color: Option<String>,
    #[serde(rename = "isAllDay")]
    pub is_all_day: bool,
    pub created_at: String,
}

impl CalendarEvent {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(CalendarEvent {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            start_at: row.get("start_at")?,
            end_at: row.get("end_at")?,
            event_type: row.get::<_, String>("type")?,
            color: row.get("color")?,
            is_all_day: row.get::<_, i32>("is_all_day")? != 0,
            created_at: row.get("created_at")?,
        })
    }
}

/// 获取事件列表
#[tauri::command]
pub async fn event_list(
    year: Option<i32>,
    month: Option<i32>,
    state: State<'_, DbState>,
) -> AppResult<Vec<CalendarEvent>> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let rows = if year.is_some() && month.is_some() {
        let y = year.unwrap();
        let m = month.unwrap();
        // 按年月筛选：匹配 YYYY-MM 格式
        let pattern = format!("{:04}-{:02}", y, m);
        let mut stmt = conn.prepare(
            "SELECT id, title, description, start_at, end_at, type, color, is_all_day, created_at \
             FROM events \
             WHERE substr(start_at, 1, 7) = ?1 \
             ORDER BY start_at ASC",
        )?;
        let rows = stmt.query_map(params![pattern], CalendarEvent::from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, description, start_at, end_at, type, color, is_all_day, created_at \
             FROM events \
             ORDER BY start_at ASC",
        )?;
        let rows = stmt.query_map([], CalendarEvent::from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    Ok(rows)
}

/// 创建事件
#[tauri::command]
pub async fn event_create(
    title: String,
    description: Option<String>,
    start_at: String,
    end_at: String,
    event_type: Option<String>,
    color: Option<String>,
    is_all_day: Option<bool>,
    state: State<'_, DbState>,
) -> AppResult<CalendarEvent> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let all_day = is_all_day.unwrap_or(false);

    conn.execute(
        "INSERT INTO events (title, description, start_at, end_at, type, color, is_all_day) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            title,
            description.unwrap_or_default(),
            start_at,
            end_at,
            event_type.unwrap_or_else(|| "event".into()),
            color,
            if all_day { 1 } else { 0 },
        ],
    )?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, title, description, start_at, end_at, type, color, is_all_day, created_at \
         FROM events WHERE id = ?1",
    )?;

    let event = stmt
        .query_row(params![id], CalendarEvent::from_row)
        .map_err(|_| AppError::NotFound(format!("事件 {} 未找到", id)))?;

    Ok(event)
}

/// 更新事件
#[tauri::command]
pub async fn event_update(
    id: i64,
    title: Option<String>,
    description: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    event_type: Option<String>,
    color: Option<String>,
    is_all_day: Option<bool>,
    state: State<'_, DbState>,
) -> AppResult<CalendarEvent> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref v) = title {
        sets.push("title = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = description {
        sets.push("description = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = start_at {
        sets.push("start_at = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = end_at {
        sets.push("end_at = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = event_type {
        sets.push("type = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = color {
        sets.push("color = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(v) = is_all_day {
        sets.push("is_all_day = ?");
        values.push(Box::new(if v { 1 } else { 0 }));
    }

    if sets.is_empty() {
        return Err(AppError::InvalidInput("没有提供要更新的字段".into()));
    }

    let sql = format!("UPDATE events SET {} WHERE id = ?", sets.join(", "));
    values.push(Box::new(id));

    let ref_values: Vec<&dyn rusqlite::types::ToSql> =
        values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, ref_values.as_slice())?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, start_at, end_at, type, color, is_all_day, created_at \
         FROM events WHERE id = ?1",
    )?;

    let event = stmt
        .query_row(params![id], CalendarEvent::from_row)
        .map_err(|_| AppError::NotFound(format!("事件 {} 未找到", id)))?;

    Ok(event)
}

/// 删除事件
#[tauri::command]
pub async fn event_delete(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let affected = conn.execute("DELETE FROM events WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}
