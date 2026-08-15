//! 本地优先（local-first）业务数据命令层。
//!
//! 任务/笔记/记账/日历全部 CRUD 直接读写本地 SQLite（`AppState.db`），
//! 不再依赖 Supabase。输出结构与前端 `src/types/index.ts` 保持字段一致
//! （金额以「元」浮点数、布尔以 bool、JSON 字段以 serde_json::Value 返回）。
//! 本地无用户隔离概念，`user_id` 统一返回空字符串以兼容前端类型。

use rusqlite::params;
use serde::Serialize;
use tauri::State;
use tauri::Manager;
use base64::Engine as _;
use crate::commands::AppState;
use argon2::Argon2;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};

// ---------------------------------------------------------------------------
// 共享辅助
// ---------------------------------------------------------------------------

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn cents_to_yuan(cents: i64) -> f64 {
    cents as f64 / 100.0
}

fn int_to_bool(v: i64) -> bool {
    v != 0
}

fn parse_json_or(s: &str) -> serde_json::Value {
    serde_json::from_str(s).unwrap_or(serde_json::Value::Null)
}

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
        "INSERT INTO subtasks (id,task_id,title,done,sort_order,created_at) VALUES (?1,?2,?3,0,?4,?5)",
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
        "UPDATE subtasks SET done = COALESCE(?2, done), title = COALESCE(?3, title) WHERE id = ?1 AND task_id = ?4",
        params![id, done.map(|b| b as i64), title, task_id],
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
        "INSERT INTO tags (id,name,color,created_at) VALUES (?1,?2,?3,?4)",
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
        "UPDATE tags SET name = COALESCE(?2, name), color = COALESCE(?3, color) WHERE id = ?1",
        params![id, name, color],
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
    tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![task_id])
        .map_err(|e| e.to_string())?;
    for tag_id in tag_ids {
        tx.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 笔记模块
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct NoteOut {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    pub title: String,
    pub content: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_text: Option<String>,
    pub is_pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const NOTE_COLS: &str =
    "id,title,content,folder_id,is_pinned,content_text,cover_url,created_at,updated_at";

fn row_to_note(row: &rusqlite::Row) -> rusqlite::Result<NoteOut> {
    Ok(NoteOut {
        id: row.get(0)?,
        user_id: String::new(),
        title: row.get(1)?,
        content: row.get::<_, String>(2).map(|s| parse_json_or(&s)).unwrap_or(serde_json::Value::Null),
        folder_id: row.get(3)?,
        is_pinned: int_to_bool(row.get(4)?),
        content_text: row.get(5)?,
        cover_url: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[tauri::command]
pub async fn note_list_all(state: State<'_, AppState>) -> Result<Vec<NoteOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM notes ORDER BY updated_at DESC", NOTE_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_note(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn note_get(state: State<'_, AppState>, id: String) -> Result<NoteOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLS), params![id], |r| row_to_note(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_create(
    state: State<'_, AppState>,
    title: String,
    content: Option<String>,
    content_text: Option<String>,
    folder_id: Option<String>,
    is_pinned: Option<bool>,
    cover_url: Option<String>,
) -> Result<NoteOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let content_str = content.unwrap_or_else(|| "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}".to_string());
    db.execute(
        "INSERT INTO notes (id,title,content,content_text,folder_id,is_pinned,cover_url,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
        params![id, title, content_str, content_text, folder_id, is_pinned.map(|b| b as i64).unwrap_or(0), cover_url, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLS), params![id], |r| row_to_note(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_update(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    content_text: Option<String>,
    folder_id: Option<String>,
    is_pinned: Option<bool>,
    cover_url: Option<String>,
    null_fields: Option<Vec<String>>,
) -> Result<NoteOut, String> {
    let db = state.db.lock().await;
    let nulls = null_fields.unwrap_or_default();
    let folder_clause = if nulls.iter().any(|f| f == "folder_id") {
        "folder_id = NULL"
    } else {
        "folder_id = COALESCE(?5, folder_id)"
    };
    let sql = format!(
        "UPDATE notes SET \
         title = COALESCE(?2, title), \
         content = COALESCE(?3, content), \
         content_text = COALESCE(?4, content_text), \
         {}, \
         is_pinned = COALESCE(?6, is_pinned), \
         cover_url = COALESCE(?7, cover_url), \
         updated_at = ?8 WHERE id = ?1",
        folder_clause
    );
    db.execute(
        &sql,
        params![id, title, content, content_text, folder_id, is_pinned.map(|b| b as i64), cover_url, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLS), params![id], |r| row_to_note(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM notes WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Note Folder ----

#[derive(Serialize)]
pub struct NoteFolderOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_note_folder(row: &rusqlite::Row) -> rusqlite::Result<NoteFolderOut> {
    Ok(NoteFolderOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        parent_id: row.get(2)?,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[tauri::command]
pub async fn note_folder_list_all(state: State<'_, AppState>) -> Result<Vec<NoteFolderOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT id,name,parent_id,sort_order,created_at,updated_at FROM note_folders ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_note_folder(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn note_folder_create(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
    sort_order: Option<i64>,
) -> Result<NoteFolderOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let sort = sort_order.unwrap_or(0);
    db.execute(
        "INSERT INTO note_folders (id,name,parent_id,sort_order,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
        params![id, name, parent_id, sort, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id,name,parent_id,sort_order,created_at,updated_at FROM note_folders WHERE id = ?1",
        params![id],
        |r| row_to_note_folder(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_folder_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    parent_id: Option<String>,
    sort_order: Option<i64>,
    null_fields: Option<Vec<String>>,
) -> Result<NoteFolderOut, String> {
    let db = state.db.lock().await;
    let nulls = null_fields.unwrap_or_default();
    let parent_clause = if nulls.iter().any(|f| f == "parent_id") {
        "parent_id = NULL"
    } else {
        "parent_id = COALESCE(?3, parent_id)"
    };
    let sql = format!(
        "UPDATE note_folders SET \
         name = COALESCE(?2, name), \
         {}, \
         sort_order = COALESCE(?4, sort_order), \
         updated_at = ?5 WHERE id = ?1",
        parent_clause
    );
    db.execute(&sql, params![id, name, parent_id, sort_order, now()])
        .map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id,name,parent_id,sort_order,created_at,updated_at FROM note_folders WHERE id = ?1",
        params![id],
        |r| row_to_note_folder(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_folder_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM note_folders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Note Tag（note_tag_master + note_note_tags）----

#[derive(Serialize)]
pub struct NoteTagOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub created_at: String,
}

fn row_to_note_tag(row: &rusqlite::Row) -> rusqlite::Result<NoteTagOut> {
    Ok(NoteTagOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
    })
}

#[tauri::command]
pub async fn note_tag_list_all(state: State<'_, AppState>) -> Result<Vec<NoteTagOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT id,name,color,created_at FROM note_tag_master ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_note_tag(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn note_tag_create(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> Result<NoteTagOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO note_tag_master (id,name,color,created_at) VALUES (?1,?2,?3,?4)",
        params![id, name, color, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row("SELECT id,name,color,created_at FROM note_tag_master WHERE id = ?1", params![id], |r| row_to_note_tag(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_tag_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<NoteTagOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE note_tag_master SET name = COALESCE(?2, name), color = COALESCE(?3, color) WHERE id = ?1",
        params![id, name, color],
    )
    .map_err(|e| e.to_string())?;
    db.query_row("SELECT id,name,color,created_at FROM note_tag_master WHERE id = ?1", params![id], |r| row_to_note_tag(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_tag_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM note_tag_master WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct NoteNoteTagOut {
    pub id: String,
    pub note_id: String,
    pub tag_id: String,
}

#[tauri::command]
pub async fn note_tag_get_by_note(
    state: State<'_, AppState>,
    note_id: String,
) -> Result<Vec<NoteTagOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(
            "SELECT t.id,t.name,t.color,t.created_at FROM note_tag_master t \
             JOIN note_note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![note_id], |r| row_to_note_tag(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn note_tag_get_ids(
    state: State<'_, AppState>,
    note_id: String,
) -> Result<Vec<String>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT tag_id FROM note_note_tags WHERE note_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![note_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn note_tag_list_all_relations(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare("SELECT note_id, tag_id FROM note_note_tags ORDER BY note_id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok());
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for (note_id, tag_id) in rows {
        map.entry(note_id).or_default().push(tag_id);
    }
    Ok(map)
}

#[tauri::command]
pub async fn note_tag_set(
    state: State<'_, AppState>,
    note_id: String,
    tag_ids: Vec<String>,
) -> Result<Vec<NoteNoteTagOut>, String> {
    let db = state.db.lock().await;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_note_tags WHERE note_id = ?1", params![note_id])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for tag_id in tag_ids {
        let rel_id = new_id();
        tx.execute(
            "INSERT OR IGNORE INTO note_note_tags (id,note_id,tag_id) VALUES (?1,?2,?3)",
            params![rel_id, note_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
        out.push(NoteNoteTagOut { id: rel_id, note_id: note_id.clone(), tag_id });
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(out)
}

// ---------------------------------------------------------------------------
// 记账模块
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TransactionOut {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub amount: f64,
    pub account_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_transaction(row: &rusqlite::Row) -> rusqlite::Result<TransactionOut> {
    Ok(TransactionOut {
        id: row.get(0)?,
        user_id: String::new(),
        r#type: row.get(1)?,
        amount: cents_to_yuan(row.get(2)?),
        account_id: row.get(3)?,
        to_account_id: row.get(4)?,
        category_id: row.get(5)?,
        date: row.get(6)?,
        note: row.get(7)?,
        receipt_url: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const TXN_COLS: &str =
    "id,type,amount_cents,account_id,transfer_account_id,category_id,date,description,receipt_path,created_at,updated_at";

#[tauri::command]
pub async fn transaction_list_all(state: State<'_, AppState>) -> Result<Vec<TransactionOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM transactions ORDER BY date DESC, created_at DESC", TXN_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn transaction_get(state: State<'_, AppState>, id: String) -> Result<TransactionOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM transactions WHERE id = ?1", TXN_COLS), params![id], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transaction_create(
    state: State<'_, AppState>,
    r#type: String,
    amount_cents: i64,
    account_id: String,
    transfer_account_id: Option<String>,
    category_id: Option<String>,
    date: String,
    description: Option<String>,
    receipt_path: Option<String>,
) -> Result<TransactionOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,category_id,account_id,transfer_account_id,date,description,receipt_path,created_at,updated_at) \
         VALUES (?1,?2,?3,'CNY',?4,?5,?6,?7,?8,?9,?10,?10)",
        params![id, r#type, amount_cents, category_id, account_id, transfer_account_id, date, description, receipt_path, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM transactions WHERE id = ?1", TXN_COLS), params![id], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transaction_update(
    state: State<'_, AppState>,
    id: String,
    r#type: Option<String>,
    amount_cents: Option<i64>,
    account_id: Option<String>,
    transfer_account_id: Option<String>,
    category_id: Option<String>,
    date: Option<String>,
    description: Option<String>,
    receipt_path: Option<String>,
) -> Result<TransactionOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE transactions SET \
         type = COALESCE(?2, type), \
         amount_cents = COALESCE(?3, amount_cents), \
         account_id = COALESCE(?4, account_id), \
         transfer_account_id = COALESCE(?5, transfer_account_id), \
         category_id = COALESCE(?6, category_id), \
         date = COALESCE(?7, date), \
         description = COALESCE(?8, description), \
         receipt_path = COALESCE(?9, receipt_path), \
         updated_at = ?10 WHERE id = ?1",
        params![id, r#type, amount_cents, account_id, transfer_account_id, category_id, date, description, receipt_path, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM transactions WHERE id = ?1", TXN_COLS), params![id], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transaction_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Account ----

#[derive(Serialize)]
pub struct AccountOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub r#type: String,
    pub initial_balance: f64,
    pub currency: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<AccountOut> {
    Ok(AccountOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        r#type: row.get(2)?,
        initial_balance: cents_to_yuan(row.get(3)?),
        currency: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const ACCOUNT_COLS: &str = "id,name,type,balance_cents,currency,sort_order,created_at,updated_at";

#[tauri::command]
pub async fn account_list_all(state: State<'_, AppState>) -> Result<Vec<AccountOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM accounts ORDER BY sort_order", ACCOUNT_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_account(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn account_get(state: State<'_, AppState>, id: String) -> Result<AccountOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM accounts WHERE id = ?1", ACCOUNT_COLS), params![id], |r| row_to_account(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn account_create(
    state: State<'_, AppState>,
    name: String,
    r#type: String,
    balance_cents: i64,
    currency: Option<String>,
) -> Result<AccountOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let sort_order = db
        .query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0);
    db.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![id, name, r#type, balance_cents, currency.unwrap_or_else(|| "CNY".into()), sort_order, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM accounts WHERE id = ?1", ACCOUNT_COLS), params![id], |r| row_to_account(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn account_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    r#type: Option<String>,
    balance_cents: Option<i64>,
    currency: Option<String>,
) -> Result<AccountOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE accounts SET \
         name = COALESCE(?2, name), \
         type = COALESCE(?3, type), \
         balance_cents = COALESCE(?4, balance_cents), \
         currency = COALESCE(?5, currency), \
         updated_at = ?6 WHERE id = ?1",
        params![id, name, r#type, balance_cents, currency, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM accounts WHERE id = ?1", ACCOUNT_COLS), params![id], |r| row_to_account(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn account_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM accounts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Category ----

#[derive(Serialize)]
pub struct CategoryOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

fn row_to_category(row: &rusqlite::Row) -> rusqlite::Result<CategoryOut> {
    Ok(CategoryOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        r#type: row.get(2)?,
        icon: row.get(3)?,
        parent_id: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const CATEGORY_COLS: &str = "id,name,type,icon,parent_id,sort_order,created_at";

#[tauri::command]
pub async fn category_list_all(state: State<'_, AppState>) -> Result<Vec<CategoryOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM categories ORDER BY sort_order", CATEGORY_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_category(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn category_create(
    state: State<'_, AppState>,
    name: String,
    r#type: String,
    icon: Option<String>,
    parent_id: Option<String>,
) -> Result<CategoryOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let sort_order = db
        .query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0);
    db.execute(
        "INSERT INTO categories (id,name,type,icon,parent_id,sort_order,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, name, r#type, icon, parent_id, sort_order, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM categories WHERE id = ?1", CATEGORY_COLS), params![id], |r| row_to_category(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn category_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    r#type: Option<String>,
    icon: Option<String>,
    parent_id: Option<String>,
) -> Result<CategoryOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE categories SET \
         name = COALESCE(?2, name), \
         type = COALESCE(?3, type), \
         icon = COALESCE(?4, icon), \
         parent_id = COALESCE(?5, parent_id), \
         sort_order = COALESCE(?6, sort_order) WHERE id = ?1",
        params![id, name, r#type, icon, parent_id, None::<i64>],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM categories WHERE id = ?1", CATEGORY_COLS), params![id], |r| row_to_category(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn category_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM categories WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Budget ----

#[derive(Serialize)]
pub struct BudgetOut {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub amount: f64,
    pub year_month: i64,
    pub scope: String,
    pub carry_over: f64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_budget(row: &rusqlite::Row) -> rusqlite::Result<BudgetOut> {
    Ok(BudgetOut {
        id: row.get(0)?,
        user_id: String::new(),
        category_id: row.get(1)?,
        amount: cents_to_yuan(row.get(2)?),
        year_month: row.get::<_, Option<String>>(3)?.and_then(|s| s.parse().ok()).unwrap_or(0),
        scope: row.get(4)?,
        carry_over: cents_to_yuan(row.get(5)?),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const BUDGET_COLS: &str =
    "id,category_id,amount_cents,year_month,scope,carry_over_cents,created_at,updated_at";

#[tauri::command]
pub async fn budget_list_all(state: State<'_, AppState>) -> Result<Vec<BudgetOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM budgets ORDER BY year_month DESC, created_at DESC", BUDGET_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_budget(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn budget_create(
    state: State<'_, AppState>,
    category_id: Option<String>,
    amount_cents: i64,
    year_month: Option<String>,
    scope: Option<String>,
    carry_over_cents: Option<i64>,
    period: Option<String>,
    period_start: Option<String>,
    period_end: Option<String>,
) -> Result<BudgetOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let ym = year_month.unwrap_or_default();
    db.execute(
        "INSERT INTO budgets (id,category_id,amount_cents,period,period_start,period_end,rollover,carry_over_cents,scope,year_month,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8,?9,?10,?10)",
        params![
            id,
            category_id,
            amount_cents,
            period.unwrap_or_else(|| "monthly".into()),
            period_start.unwrap_or_default(),
            period_end.unwrap_or_default(),
            carry_over_cents.unwrap_or(0),
            scope.unwrap_or_else(|| "category".into()),
            ym,
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM budgets WHERE id = ?1", BUDGET_COLS), params![id], |r| row_to_budget(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn budget_update(
    state: State<'_, AppState>,
    id: String,
    category_id: Option<String>,
    amount_cents: Option<i64>,
    year_month: Option<String>,
    scope: Option<String>,
    carry_over_cents: Option<i64>,
    period: Option<String>,
    period_start: Option<String>,
    period_end: Option<String>,
) -> Result<BudgetOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE budgets SET \
         category_id = COALESCE(?2, category_id), \
         amount_cents = COALESCE(?3, amount_cents), \
         year_month = COALESCE(?4, year_month), \
         scope = COALESCE(?5, scope), \
         carry_over_cents = COALESCE(?6, carry_over_cents), \
         period = COALESCE(?7, period), \
         period_start = COALESCE(?8, period_start), \
         period_end = COALESCE(?9, period_end), \
         updated_at = ?10 WHERE id = ?1",
        params![id, category_id, amount_cents, year_month, scope, carry_over_cents, period, period_start, period_end, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM budgets WHERE id = ?1", BUDGET_COLS), params![id], |r| row_to_budget(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn budget_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM budgets WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 日历模块
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct CalendarEventOut {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_uid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organizer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder_minutes: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_calendar_event(row: &rusqlite::Row) -> rusqlite::Result<CalendarEventOut> {
    Ok(CalendarEventOut {
        id: row.get(0)?,
        user_id: String::new(),
        subscription_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        location: row.get(4)?,
        start_at: row.get(5)?,
        end_at: row.get(6)?,
        all_day: int_to_bool(row.get(7)?),
        color: row.get(8)?,
        source: row.get(9)?,
        external_uid: row.get(10)?,
        organizer: row.get(11)?,
        reminder_minutes: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

const EVENT_COLS: &str = "id,subscription_id,title,description,location,start_at,end_at,all_day,color,source,external_uid,organizer,reminder_minutes,created_at,updated_at";

#[tauri::command]
pub async fn calendar_event_list_all(state: State<'_, AppState>) -> Result<Vec<CalendarEventOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM calendar_events ORDER BY start_at", EVENT_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn calendar_event_get(state: State<'_, AppState>, id: String) -> Result<CalendarEventOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM calendar_events WHERE id = ?1", EVENT_COLS), params![id], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_event_create(
    state: State<'_, AppState>,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_at: String,
    end_at: String,
    all_day: Option<bool>,
    color: Option<String>,
    reminder_minutes: Option<i64>,
    source: Option<String>,
) -> Result<CalendarEventOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO calendar_events (id,title,description,location,start_at,end_at,all_day,color,source,reminder_minutes,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)",
        params![
            id, title, description, location, start_at, end_at,
            all_day.map(|b| b as i64).unwrap_or(0),
            color,
            source.unwrap_or_else(|| "local".into()),
            reminder_minutes,
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM calendar_events WHERE id = ?1", EVENT_COLS), params![id], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_event_update(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    location: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    all_day: Option<bool>,
    color: Option<String>,
    reminder_minutes: Option<i64>,
) -> Result<CalendarEventOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE calendar_events SET \
         title = COALESCE(?2, title), \
         description = COALESCE(?3, description), \
         location = COALESCE(?4, location), \
         start_at = COALESCE(?5, start_at), \
         end_at = COALESCE(?6, end_at), \
         all_day = COALESCE(?7, all_day), \
         color = COALESCE(?8, color), \
         reminder_minutes = COALESCE(?9, reminder_minutes), \
         updated_at = ?10 WHERE id = ?1",
        params![id, title, description, location, start_at, end_at, all_day.map(|b| b as i64), color, reminder_minutes, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM calendar_events WHERE id = ?1", EVENT_COLS), params![id], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_event_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM calendar_events WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Calendar Subscription ----

#[derive(Serialize)]
pub struct CalendarSubscriptionOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub provider: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    pub color: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_synced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub event_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_calendar_subscription(row: &rusqlite::Row) -> rusqlite::Result<CalendarSubscriptionOut> {
    Ok(CalendarSubscriptionOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        provider: row.get(2)?,
        url: row.get(3)?,
        username: row.get(4)?,
        password: row.get(5)?,
        color: row.get(6)?,
        enabled: int_to_bool(row.get(7)?),
        last_synced_at: row.get(8)?,
        last_error: row.get(9)?,
        event_count: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const SUB_COLS: &str = "id,name,provider,url,username,password,color,enabled,last_synced_at,last_error,event_count,created_at,updated_at";

#[tauri::command]
pub async fn calendar_subscription_list_all(state: State<'_, AppState>) -> Result<Vec<CalendarSubscriptionOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM calendar_subscriptions ORDER BY created_at", SUB_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn calendar_subscription_get(state: State<'_, AppState>, id: String) -> Result<CalendarSubscriptionOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM calendar_subscriptions WHERE id = ?1", SUB_COLS), params![id], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_subscription_create(
    state: State<'_, AppState>,
    name: String,
    provider: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    color: Option<String>,
    enabled: Option<bool>,
) -> Result<CalendarSubscriptionOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO calendar_subscriptions (id,name,provider,url,username,password,color,enabled,event_count,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?9)",
        params![
            id, name, provider, url, username, password,
            color.unwrap_or_else(|| "#8b5cf6".into()),
            enabled.map(|b| b as i64).unwrap_or(1),
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM calendar_subscriptions WHERE id = ?1", SUB_COLS), params![id], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_subscription_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    provider: Option<String>,
    url: Option<String>,
    username: Option<String>,
    password: Option<String>,
    color: Option<String>,
    enabled: Option<bool>,
) -> Result<CalendarSubscriptionOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE calendar_subscriptions SET \
         name = COALESCE(?2, name), \
         provider = COALESCE(?3, provider), \
         url = COALESCE(?4, url), \
         username = COALESCE(?5, username), \
         password = COALESCE(?6, password), \
         color = COALESCE(?7, color), \
         enabled = COALESCE(?8, enabled), \
         updated_at = ?9 WHERE id = ?1",
        params![id, name, provider, url, username, password, color, enabled.map(|b| b as i64), now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM calendar_subscriptions WHERE id = ?1", SUB_COLS), params![id], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_subscription_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM calendar_subscriptions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct CalendarSyncResponse {
    pub results: Vec<crate::calendar_sync::SyncResult>,
}

#[tauri::command]
pub async fn calendar_sync_subscription(
    state: State<'_, AppState>,
    subscription_id: Option<String>,
) -> Result<CalendarSyncResponse, String> {
    let results = crate::calendar_sync::sync_all_subscriptions(&state.db, subscription_id).await?;
    Ok(CalendarSyncResponse { results })
}

// ---------------------------------------------------------------------------
// 本地数据备份：全量导出 / 全量导入（Settings 页「导出数据 / 导入数据」）
// ---------------------------------------------------------------------------

/// 参与备份的业务表（不含邮件库——邮件数据在独立 mail.db，见 mail 模块）。
const BACKUP_TABLES: &[&str] = &[
    "tasks", "subtasks", "tags", "task_tags",
    "accounts", "categories", "transactions", "budgets",
    "notes", "note_folders", "note_tag_master", "note_note_tags",
    "calendar_events", "calendar_subscriptions",
];

/// 清空业务表的顺序：**子表（引用他表的）必须先于父表删除**，
/// 否则在外键约束（无 ON DELETE CASCADE）下 DELETE 父表会报
/// `FOREIGN KEY constraint failed`。
/// 自引用列（categories.parent_id、note_folders.parent_id）需在删除前置 NULL。
const CLEAR_ORDER: &[&str] = &[
    "subtasks", "task_tags", "note_note_tags",
    "transactions", "budgets", "notes", "calendar_events",
    "tasks", "tags", "accounts", "categories",
    "note_folders", "note_tag_master", "calendar_subscriptions",
];

/// 导出全部业务表为 { table: rows[] }。含 sync 元数据列，便于完整恢复。
#[tauri::command]
pub async fn data_export_all(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    let mut out = serde_json::Map::new();
    for table in BACKUP_TABLES {
        let sql = format!("SELECT * FROM \"{}\"", table);
        let mut stmt = db.prepare(&sql).map_err(|e| format!("导出 {} 失败: {}", table, e))?;
        let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let rows = stmt
            .query_map([], |row| {
                let mut m = serde_json::Map::new();
                for (i, c) in col_names.iter().enumerate() {
                    let v = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                        Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::json!(n),
                        Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::json!(f),
                        Ok(rusqlite::types::ValueRef::Text(t)) => {
                            serde_json::json!(String::from_utf8_lossy(t).into_owned())
                        }
                        Ok(rusqlite::types::ValueRef::Blob(_)) => serde_json::Value::Null,
                        Err(_) => serde_json::Value::Null,
                    };
                    m.insert(c.clone(), v);
                }
                Ok(serde_json::Value::Object(m))
            })
            .map_err(|e| format!("导出 {} 失败: {}", table, e))?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        out.insert(table.to_string(), serde_json::Value::Array(rows));
    }
    Ok(serde_json::Value::Object(out))
}

/// 导入全量备份：事务内逐表「清空 + 插入」（INSERT OR REPLACE）。
/// 仅接受白名单表；行内列名按 JSON key 动态映射，跳过 user_id（本地无用户隔离）。
#[tauri::command]
pub async fn data_import_all(
    state: State<'_, AppState>,
    data: serde_json::Value,
) -> Result<i32, String> {
    let obj = data.as_object().ok_or_else(|| "备份数据格式错误".to_string())?;
    let db = state.db.lock().await;
    // 备份是导出时的快照，可能含悬空外键（如子任务引用已删除的任务）。
    // 导入期间关闭外键检查，忠实还原备份内容；否则单行失败会回滚整个事务。
    // 另外 serde_json 的 Object 是 BTreeMap（字母序），遍历 obj 会按字母序插入，
    // 导致 budgets（引用 categories）先于 categories 被插入——所以必须显式按
    // BACKUP_TABLES 顺序导入。
    db.pragma_update(None, "foreign_keys", "OFF")
        .map_err(|e| format!("关闭外键检查失败: {}", e))?;
    let result = (|| {
        let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
        // 先按子表优先顺序清空（含断开自引用），避免逐表 DELETE 顺序不当触发外键失败
        tx.execute("UPDATE categories SET parent_id = NULL", [])
            .map_err(|e| format!("断开 categories 自引用失败: {}", e))?;
        tx.execute("UPDATE note_folders SET parent_id = NULL", [])
            .map_err(|e| format!("断开 note_folders 自引用失败: {}", e))?;
        for table in CLEAR_ORDER {
            tx.execute(&format!("DELETE FROM \"{}\"", table), [])
                .map_err(|e| format!("清空 {} 失败: {}", table, e))?;
        }
        let mut total = 0i32;
        // 显式按 BACKUP_TABLES 顺序（父表在子表前），不依赖 JSON key 顺序
        for table in BACKUP_TABLES {
            let Some(rows) = obj.get(*table).and_then(|v| v.as_array()) else { continue };
            let safe_table = sanitize_ident(table);
            for row in rows {
                let o = row.as_object().ok_or_else(|| format!("{} 行数据格式错误", table))?;
                // 列名 = JSON key（排除 user_id），并做标识符净化
                let cols: Vec<String> = o
                    .keys()
                    .filter(|c| *c != "user_id")
                    .map(|c| sanitize_ident(c))
                    .collect();
                if cols.is_empty() {
                    continue;
                }
                let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
                let col_list = cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");
                let sql = format!(
                    "INSERT OR REPLACE INTO \"{}\" ({}) VALUES ({})",
                    safe_table,
                    col_list,
                    placeholders.join(", ")
                );
                let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
                for c in &cols {
                    let v = o.get(c).unwrap_or(&serde_json::Value::Null);
                    match v {
                        serde_json::Value::Null => params.push(Box::new(None::<String>)),
                        serde_json::Value::String(s) => params.push(Box::new(s.clone())),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                params.push(Box::new(i));
                            } else if let Some(f) = n.as_f64() {
                                params.push(Box::new(f));
                            } else {
                                params.push(Box::new(n.to_string()));
                            }
                        }
                        serde_json::Value::Bool(b) => params.push(Box::new(*b as i64)),
                        // JSON 对象/数组列（notes.content、tasks.recurrence_rule 等）序列化存储
                        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                            params.push(Box::new(v.to_string()));
                        }
                    }
                }
                tx.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
                    .map_err(|e| format!("导入 {} 行失败: {}", table, e))?;
                total += 1;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(total)
    })();
    // 无论成败都恢复外键检查
    let _ = db.pragma_update(None, "foreign_keys", "ON");
    result
}

/// 标识符净化：移除引号与语句分隔符，防注入。
fn sanitize_ident(name: &str) -> String {
    name.replace('"', "").replace('\'', "").replace(";", "").replace("--", "")
}

/// 清空全部业务表（Settings「清除所有数据」）。
/// 删除顺序子表优先，并先断开自引用，避免外键约束失败。
#[tauri::command]
pub async fn data_clear_all(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    // 自引用列先断开（无 ON DELETE CASCADE，父行未删时子行引用会违反外键）
    tx.execute("UPDATE categories SET parent_id = NULL", [])
        .map_err(|e| format!("断开 categories 自引用失败: {}", e))?;
    tx.execute("UPDATE note_folders SET parent_id = NULL", [])
        .map_err(|e| format!("断开 note_folders 自引用失败: {}", e))?;
    for table in CLEAR_ORDER {
        tx.execute(&format!("DELETE FROM \"{}\"", table), [])
            .map_err(|e| format!("清空 {} 失败: {}", table, e))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 收据本地存储（记账模块 receipt-photos 本地化）
// ---------------------------------------------------------------------------

/// 保存收据图片到应用数据目录 receipts/，返回净化后的文件名（存于 receipt_url 字段）。
#[tauri::command]
pub async fn receipt_save(
    app: tauri::AppHandle,
    data_base64: String,
    filename: String,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("图片数据解码失败: {}", e))?;
    let safe_name = sanitize_ident(&filename);
    if safe_name.is_empty() || !safe_name.contains('.') {
        return Err("文件名不合法".to_string());
    }
    let dir = app
        .state::<crate::DataRoot>()
        .0
        .join("receipts");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建收据目录失败: {}", e))?;
    let path = dir.join(&safe_name);
    std::fs::write(&path, bytes).map_err(|e| format!("保存收据失败: {}", e))?;
    Ok(safe_name)
}

/// 用系统默认程序打开本地收据文件。
#[tauri::command]
pub async fn receipt_open(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let safe_name = sanitize_ident(&filename);
    let path = app
        .state::<crate::DataRoot>()
        .0
        .join("receipts")
        .join(&safe_name);
    if !path.exists() {
        return Err("收据文件不存在".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("打开收据失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开收据失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开收据失败: {}", e))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 本地认证（local-first，替代 Supabase Auth）
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AuthUserOut {
    pub id: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_data: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_auth_user(row: &rusqlite::Row) -> rusqlite::Result<AuthUserOut> {
    Ok(AuthUserOut {
        id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        avatar_data: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

const AUTH_USER_COLS: &str = "id,email,display_name,avatar_data,created_at,updated_at";

/// 注册本地账号（邮箱唯一，argon2 哈希密码）。注册成功即返回用户信息，由前端自动登录。
#[tauri::command]
pub async fn auth_register(
    state: State<'_, AppState>,
    email: String,
    password: String,
    display_name: Option<String>,
) -> Result<AuthUserOut, String> {
    let email = email.trim().to_lowercase();
    if !email.contains('@') {
        return Err("邮箱格式不正确".to_string());
    }
    if password.len() < 6 {
        return Err("密码长度至少 6 位".to_string());
    }
    let salt = argon2::password_hash::SaltString::generate(
        &mut argon2::password_hash::rand_core::OsRng,
    );
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("密码哈希失败: {}", e))?
        .to_string();

    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let result = db.execute(
        "INSERT INTO users (id,email,password_hash,display_name,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
        params![id, email, hash, display_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()), ts],
    );
    if let Err(e) = result {
        if e.to_string().contains("UNIQUE") {
            return Err("该邮箱已注册".to_string());
        }
        return Err(e.to_string());
    }
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 本地账号密码登录。成功返回用户信息；失败返回中文错误。
#[tauri::command]
pub async fn auth_login(
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<AuthUserOut, String> {
    let email = email.trim().to_lowercase();
    let db = state.db.lock().await;
    let row: Option<(String, String)> = db
        .query_row(
            "SELECT id, password_hash FROM users WHERE email = ?1",
            params![email],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let Some((id, hash)) = row else {
        return Err("邮箱或密码错误".to_string());
    };
    let parsed = argon2::password_hash::PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| "邮箱或密码错误".to_string())?;
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 根据 id 获取本地用户（前端启动时恢复会话）。
#[tauri::command]
pub async fn auth_get_user(state: State<'_, AppState>, user_id: String) -> Result<AuthUserOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![user_id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 更新本地用户资料（显示名称 / 头像 base64 data URL）。
#[tauri::command]
pub async fn auth_update_profile(
    state: State<'_, AppState>,
    user_id: String,
    display_name: Option<String>,
    avatar_data: Option<String>,
    clear_avatar: Option<bool>,
) -> Result<AuthUserOut, String> {
    let db = state.db.lock().await;
    // 头像有大小上限（约 2MB base64），防库膨胀
    if let Some(av) = &avatar_data {
        if av.len() > 2_800_000 {
            return Err("头像图片过大，请使用小于 2MB 的图片".to_string());
        }
    }
    let avatar_clause = if clear_avatar.unwrap_or(false) {
        "avatar_data = NULL"
    } else {
        "avatar_data = COALESCE(?3, avatar_data)"
    };
    let sql = format!(
        "UPDATE users SET display_name = COALESCE(?2, display_name), {}, updated_at = ?4 WHERE id = ?1",
        avatar_clause
    );
    db.execute(&sql, params![user_id, display_name, avatar_data, now()])
        .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![user_id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 修改本地账号密码（校验当前密码）。
#[tauri::command]
pub async fn auth_change_password(
    state: State<'_, AppState>,
    user_id: String,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("新密码长度至少 6 位".to_string());
    }
    let db = state.db.lock().await;
    let hash: String = db
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let parsed = argon2::password_hash::PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    Argon2::default()
        .verify_password(current_password.as_bytes(), &parsed)
        .map_err(|_| "当前密码不正确".to_string())?;
    let salt = argon2::password_hash::SaltString::generate(
        &mut argon2::password_hash::rand_core::OsRng,
    );
    let new_hash = Argon2::default()
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("密码哈希失败: {}", e))?
        .to_string();
    db.execute(
        "UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE id = ?1",
        params![user_id, new_hash, now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 演示账号（"以演示账号进入"）：确保演示用户存在并返回，前端据此建立本地会话。
// 演示数据本身由前端 seedDemoData 在每次进入/打开时重新生成（日期相对 now），
// 因此本命令只负责"演示用户"这一身份，不触碰业务数据。
// ---------------------------------------------------------------------------

/// 演示账号固定邮箱与密码（前端 seedDemoData 直接登录，无需校验密码）。
const DEMO_EMAIL: &str = "demo@easywork.app";
const DEMO_PASSWORD: &str = "demo123456";

/// 确保演示账号存在（INSERT OR 忽略），返回该用户信息。
/// 供前端 `以演示账号进入` 建立本地会话；业务数据由前端另行播种。
#[tauri::command]
pub async fn demo_enter(state: State<'_, AppState>) -> Result<AuthUserOut, String> {
    let db = state.db.lock().await;
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE email = ?1)",
            params![DEMO_EMAIL],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !exists {
        let salt = argon2::password_hash::SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
        let hash = Argon2::default()
            .hash_password(DEMO_PASSWORD.as_bytes(), &salt)
            .map_err(|e| format!("演示账号密码哈希失败: {}", e))?
            .to_string();
        let id = new_id();
        let ts = now();
        db.execute(
            "INSERT INTO users (id,email,password_hash,display_name,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
            params![id, DEMO_EMAIL, hash, "演示用户", ts],
        )
        .map_err(|e| e.to_string())?;
    }
    db.query_row(
        &format!("SELECT {} FROM users WHERE email = ?1", AUTH_USER_COLS),
        params![DEMO_EMAIL],
        |r| row_to_auth_user(r),
    )
    .map_err(|e| e.to_string())
}
