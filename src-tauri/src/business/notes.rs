use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::commands::AppState;

use super::{int_to_bool, new_id, now, parse_json_or};

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
