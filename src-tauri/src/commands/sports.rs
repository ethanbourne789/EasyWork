//! 运动记录与目标管理
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 运动记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportRecord {
    pub id: i64,
    #[serde(rename = "type")]
    pub sport_type: String,
    pub duration: i32,
    pub distance: Option<f64>,
    pub calories: i32,
    pub date: String,
    pub note: Option<String>,
    pub created_at: String,
}

impl SportRecord {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(SportRecord {
            id: row.get("id")?,
            sport_type: row.get::<_, String>("type")?,
            duration: row.get("duration")?,
            distance: row.get("distance")?,
            calories: row.get("calories")?,
            date: row.get("date")?,
            note: row.get("note")?,
            created_at: row.get("created_at")?,
        })
    }
}

/// 运动目标
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportGoal {
    pub weekly_target: i32,
    pub weekly_completed: i32,
}

// ==================== 运动记录操作 ====================

/// 获取运动记录列表
#[tauri::command]
pub async fn sport_list(
    sport_type: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Vec<SportRecord>> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let rows = if let Some(ref st) = sport_type {
        let mut stmt = conn.prepare(
            "SELECT id, type, duration, distance, calories, date, note, created_at \
             FROM sports \
             WHERE type = ?1 \
             ORDER BY date DESC",
        )?;
        let rows = stmt.query_map(params![st], SportRecord::from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, type, duration, distance, calories, date, note, created_at \
             FROM sports \
             ORDER BY date DESC",
        )?;
        let rows = stmt.query_map([], SportRecord::from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    Ok(rows)
}

/// 创建运动记录
#[tauri::command]
pub async fn sport_create(
    sport_type: String,
    duration: i32,
    distance: Option<f64>,
    calories: Option<i32>,
    date: String,
    note: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<SportRecord> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    if duration <= 0 {
        return Err(AppError::InvalidInput("时长必须大于 0".into()));
    }

    conn.execute(
        "INSERT INTO sports (type, duration, distance, calories, date, note) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            sport_type,
            duration,
            distance,
            calories.unwrap_or(0),
            date,
            note,
        ],
    )?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, type, duration, distance, calories, date, note, created_at \
         FROM sports WHERE id = ?1",
    )?;

    let record = stmt
        .query_row(params![id], SportRecord::from_row)
        .map_err(|_| AppError::NotFound(format!("运动记录 {} 未找到", id)))?;

    Ok(record)
}

// ==================== 目标操作 ====================

/// 获取本周运动目标及完成情况
#[tauri::command]
pub async fn sport_goal_get(state: State<'_, DbState>) -> AppResult<SportGoal> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 获取周目标设定值，默认 3 次
    let weekly_target: i32 = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'sport_weekly_target'",
            [],
            |row| row.get::<_, String>(0).map(|s| s.parse().unwrap_or(3)),
        )
        .unwrap_or(3);

    // 统计本周已完成次数（使用 SQLite 的日期函数）
    let weekly_completed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sports \
         WHERE date >= datetime('now', 'weekday 0', '-7 days', 'localtime') \
         AND date <= datetime('now', 'localtime')",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0);

    Ok(SportGoal {
        weekly_target,
        weekly_completed: weekly_completed as i32,
    })
}

/// 设置每周运动目标
#[tauri::command]
pub async fn sport_goal_set(weekly_target: i32, state: State<'_, DbState>) -> AppResult<SportGoal> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    if weekly_target <= 0 {
        return Err(AppError::InvalidInput("目标必须大于 0".into()));
    }

    // UPSERT 设置项
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('sport_weekly_target', ?1) \
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        params![weekly_target.to_string()],
    )?;

    // 同时返回当前完成情况
    let weekly_completed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sports \
         WHERE date >= datetime('now', 'weekday 0', '-7 days', 'localtime') \
         AND date <= datetime('now', 'localtime')",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0);

    Ok(SportGoal {
        weekly_target,
        weekly_completed: weekly_completed as i32,
    })
}
