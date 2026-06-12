//! 看板任务 CRUD
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 看板任务
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub urgency: String,
    pub difficulty: String,
    pub assignee: String,
    pub start_time: Option<String>,
    pub due_time: Option<String>,
    pub completed_at: Option<String>,
    pub rating: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl Task {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Task {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            status: row.get("status")?,
            priority: row.get("priority")?,
            urgency: row.get("urgency")?,
            difficulty: row.get("difficulty")?,
            assignee: row.get("assignee")?,
            start_time: row.get("start_time")?,
            due_time: row.get("due_time")?,
            completed_at: row.get("completed_at")?,
            rating: row.get("rating")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// 获取任务列表
#[tauri::command]
pub async fn task_list(
    status: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Vec<Task>> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, urgency, difficulty, \
         assignee, start_time, due_time, completed_at, rating, created_at, updated_at \
         FROM tasks \
         WHERE 1=1 \
         ORDER BY created_at DESC",
    )?;

        let rows = if let Some(ref s) = status {
        // 动态构建带状态筛选的查询
        drop(stmt);
        let mut s2 = conn.prepare(
            "SELECT id, title, description, status, priority, urgency, difficulty, \
             assignee, start_time, due_time, completed_at, rating, created_at, updated_at \
             FROM tasks \
             WHERE status = ?1 \
             ORDER BY created_at DESC",
        )?;
        let rows = s2.query_map(params![s], Task::from_row)?.collect::<Result<Vec<_>, _>>()?;
        rows
    } else {
        let rows = stmt.query_map([], Task::from_row)?.collect::<Result<Vec<_>, _>>()?;
        rows
    };

    Ok(rows)
}

/// 创建任务
#[tauri::command]
pub async fn task_create(
    title: String,
    description: Option<String>,
    priority: Option<String>,
    urgency: Option<String>,
    difficulty: Option<String>,
    assignee: Option<String>,
    due_time: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Task> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    conn.execute(
        "INSERT INTO tasks (title, description, status, priority, urgency, difficulty, assignee, due_time) \
         VALUES (?1, ?2, 'todo', ?3, ?4, ?5, ?6, ?7)",
        params![
            title,
            description.unwrap_or_default(),
            priority.unwrap_or_else(|| "medium".into()),
            urgency.unwrap_or_else(|| "normal".into()),
            difficulty.unwrap_or_else(|| "normal".into()),
            assignee.unwrap_or_default(),
            due_time,
        ],
    )?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, urgency, difficulty, \
         assignee, start_time, due_time, completed_at, rating, created_at, updated_at \
         FROM tasks WHERE id = ?1",
    )?;

    let task = stmt
        .query_row(params![id], Task::from_row)
        .map_err(|_| AppError::NotFound(format!("任务 {} 未找到", id)))?;

    Ok(task)
}

/// 更新任务
#[tauri::command]
pub async fn task_update(
    id: i64,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    urgency: Option<String>,
    difficulty: Option<String>,
    assignee: Option<String>,
    start_time: Option<String>,
    due_time: Option<String>,
    completed_at: Option<String>,
    rating: Option<i32>,
    state: State<'_, DbState>,
) -> AppResult<Task> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 构建动态 UPDATE 语句
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
    if let Some(ref v) = status {
        sets.push("status = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = priority {
        sets.push("priority = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = urgency {
        sets.push("urgency = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = difficulty {
        sets.push("difficulty = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = assignee {
        sets.push("assignee = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = start_time {
        sets.push("start_time = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = due_time {
        sets.push("due_time = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = completed_at {
        sets.push("completed_at = ?");
        values.push(Box::new(v.clone()));
    }
    if let Some(v) = rating {
        sets.push("rating = ?");
        values.push(Box::new(v));
    }

    if sets.is_empty() {
        return Err(AppError::InvalidInput("没有提供要更新的字段".into()));
    }

    sets.push("updated_at = datetime('now')");

    let sql = format!(
        "UPDATE tasks SET {} WHERE id = ?",
        sets.join(", ")
    );
    values.push(Box::new(id));

    // 使用位置参数执行
    let ref_values: Vec<&dyn rusqlite::types::ToSql> =
        values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, ref_values.as_slice())?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, urgency, difficulty, \
         assignee, start_time, due_time, completed_at, rating, created_at, updated_at \
         FROM tasks WHERE id = ?1",
    )?;

    let task = stmt
        .query_row(params![id], Task::from_row)
        .map_err(|_| AppError::NotFound(format!("任务 {} 未找到", id)))?;

    Ok(task)
}

/// 删除任务
#[tauri::command]
pub async fn task_delete(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let affected = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

/// 批量更新任务状态
#[tauri::command]
pub async fn task_batch_update(
    updates: Vec<TaskBatchUpdate>,
    state: State<'_, DbState>,
) -> AppResult<usize> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let mut total_affected = 0;
    for update in &updates {
        if let Some(ref status) = update.status {
            let affected = conn.execute(
                "UPDATE tasks SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![status, update.id],
            )?;
            total_affected += affected;
        }
    }

    Ok(total_affected)
}

/// 批量更新参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskBatchUpdate {
    pub id: i64,
    pub status: Option<String>,
}
