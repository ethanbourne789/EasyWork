use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::commands::AppState;

use super::{int_to_bool, new_id, now, parse_json_or};

// ---------------------------------------------------------------------------
// 任务模块
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TaskOut {
    pub id: String,
    pub user_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_rule: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_next: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<TaskOut> {
    Ok(TaskOut {
        id: row.get(0)?,
        user_id: String::new(),
        title: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        priority: row.get(4)?,
        due_date: row.get(5)?,
        recurrence_rule: row.get::<_, Option<String>>(6)?.map(|s| parse_json_or(&s)),
        recurrence_next: row.get(7)?,
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[tauri::command]
pub async fn task_list_all(state: State<'_, AppState>) -> Result<Vec<TaskOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT id,title,description,status,priority,due_date,recurrence_rule,recurrence_next,sort_order,created_at,updated_at FROM tasks ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_task(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn task_get(state: State<'_, AppState>, id: String) -> Result<TaskOut, String> {
    let db = state.db.lock().await;
    db.query_row(
        "SELECT id,title,description,status,priority,due_date,recurrence_rule,recurrence_next,sort_order,created_at,updated_at FROM tasks WHERE id = ?1",
        params![id],
        |r| row_to_task(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn task_create(
    state: State<'_, AppState>,
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    due_date: Option<String>,
    tag_ids: Option<Vec<String>>,
    recurrence_rule: Option<serde_json::Value>,
    recurrence_next: Option<String>,
) -> Result<TaskOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let recurrence_rule_str = recurrence_rule.map(|v| v.to_string());
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO tasks (id,title,description,status,priority,due_date,recurrence_rule,recurrence_next,parent_task_id,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,?9,?10,?10)",
        params![
            id,
            title,
            description,
            status.unwrap_or_else(|| "todo".into()),
            priority.unwrap_or_else(|| "medium".into()),
            due_date,
            recurrence_rule_str,
            recurrence_next,
            chrono::Utc::now().timestamp_millis(),
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;

    if let Some(tags) = tag_ids {
        for tag_id in tags {
            tx.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                params![id, tag_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    db.query_row(
        "SELECT id,title,description,status,priority,due_date,recurrence_rule,recurrence_next,sort_order,created_at,updated_at FROM tasks WHERE id = ?1",
        params![id],
        |r| row_to_task(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn task_update(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    due_date: Option<String>,
    tag_ids: Option<Vec<String>>,
    recurrence_rule: Option<serde_json::Value>,
    null_fields: Option<Vec<String>>,
) -> Result<TaskOut, String> {
    let db = state.db.lock().await;
    let recurrence_rule_str = recurrence_rule.map(|v| v.to_string());
    let nulls = null_fields.unwrap_or_default();
    // 显式置 NULL 的字段（Tauri IPC 无法区分「未传」与「显式 null」，故用字段名列表表达）
    let due_clause = if nulls.iter().any(|f| f == "due_date") {
        "due_date = NULL"
    } else {
        "due_date = COALESCE(?6, due_date)"
    };
    let rec_clause = if nulls.iter().any(|f| f == "recurrence_rule") {
        "recurrence_rule = NULL"
    } else {
        "recurrence_rule = COALESCE(?7, recurrence_rule)"
    };
    let sql = format!(
        "UPDATE tasks SET \
         title = COALESCE(?2, title), \
         description = COALESCE(?3, description), \
         status = COALESCE(?4, status), \
         priority = COALESCE(?5, priority), \
         {}, \
         {}, \
         updated_at = ?8 WHERE id = ?1",
        due_clause, rec_clause
    );
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        &sql,
        params![id, title, description, status, priority, due_date, recurrence_rule_str, now()],
    )
    .map_err(|e| e.to_string())?;

    if let Some(tags) = tag_ids {
        tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        for tag_id in tags {
            tx.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                params![id, tag_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    db.query_row(
        "SELECT id,title,description,status,priority,due_date,recurrence_rule,recurrence_next,sort_order,created_at,updated_at FROM tasks WHERE id = ?1",
        params![id],
        |r| row_to_task(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn task_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Subtask ----

#[derive(Serialize)]
pub struct SubtaskOut {
    pub id: String,
    pub task_id: String,
    pub user_id: String,
    pub title: String,
    pub done: bool,
    pub sort_order: i64,
    pub created_at: String,
}

fn row_to_subtask(row: &rusqlite::Row) -> rusqlite::Result<SubtaskOut> {
    Ok(SubtaskOut {
        id: row.get(0)?,
        task_id: row.get(1)?,
        user_id: String::new(),
        title: row.get(2)?,
        done: int_to_bool(row.get(3)?),
        sort_order: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub async fn subtask_list(state: State<'_, AppState>, task_id: String) -> Result<Vec<SubtaskOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT id,task_id,title,done,sort_order,created_at FROM subtasks WHERE task_id = ?1 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![task_id], |r| row_to_subtask(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn subtask_create(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
) -> Result<SubtaskOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let sort_order = db
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM subtasks WHERE task_id = ?1",
            params![task_id],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    db.execute(
        "INSERT INTO subtasks (id,task_id,title,done,sort_order,created_at,updated_at) VALUES (?1,?2,?3,0,?4,?5,?5)",
        params![id, task_id, title, sort_order, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id,task_id,title,done,sort_order,created_at FROM subtasks WHERE id = ?1",
        params![id],
        |r| row_to_subtask(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn subtask_update(
    state: State<'_, AppState>,
    id: String,
    task_id: String,
    done: Option<bool>,
    title: Option<String>,
) -> Result<SubtaskOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE subtasks SET done = COALESCE(?2, done), title = COALESCE(?3, title), updated_at = ?5 WHERE id = ?1 AND task_id = ?4",
        params![id, done.map(|b| b as i64), title, task_id, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id,task_id,title,done,sort_order,created_at FROM subtasks WHERE id = ?1",
        params![id],
        |r| row_to_subtask(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn subtask_delete(
    state: State<'_, AppState>,
    id: String,
    task_id: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM subtasks WHERE id = ?1 AND task_id = ?2", params![id, task_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Tag ----

#[derive(Serialize)]
pub struct TagOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub created_at: String,
}

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<TagOut> {
    Ok(TagOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
    })
}

#[tauri::command]
pub async fn tag_list_all(state: State<'_, AppState>) -> Result<Vec<TagOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT id,name,color,created_at FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_tag(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn tag_create(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> Result<TagOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO tags (id,name,color,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![id, name, color, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row("SELECT id,name,color,created_at FROM tags WHERE id = ?1", params![id], |r| row_to_tag(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<TagOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE tags SET name = COALESCE(?2, name), color = COALESCE(?3, color), updated_at = ?4 WHERE id = ?1",
        params![id, name, color, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row("SELECT id,name,color,created_at FROM tags WHERE id = ?1", params![id], |r| row_to_tag(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM tags WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Task-Tag relations ----

#[tauri::command]
pub async fn task_tag_list(state: State<'_, AppState>, task_id: String) -> Result<Vec<TagOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(
            "SELECT t.id,t.name,t.color,t.created_at FROM tags t \
             JOIN task_tags tt ON tt.tag_id = t.id WHERE tt.task_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![task_id], |r| row_to_tag(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn task_tag_set(
    state: State<'_, AppState>,
    task_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let ts = now();
    tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![task_id])
        .map_err(|e| e.to_string())?;
    for tag_id in tag_ids {
        tx.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id, updated_at) VALUES (?1, ?2, ?3)",
            params![task_id, tag_id, ts],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
