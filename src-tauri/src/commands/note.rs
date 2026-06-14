//! 笔记 CRUD
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 笔记
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub folder_id: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Note {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        let tags_json: Option<String> = row.get("tags")?;
        let tags: Vec<String> = tags_json
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        Ok(Note {
            id: row.get("id")?,
            title: row.get("title")?,
            content: row.get("content")?,
            folder_id: row.get("folder_id")?,
            tags,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// 笔记文件夹
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFolder {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub note_count: i64,
}

impl NoteFolder {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(NoteFolder {
            id: row.get("id")?,
            name: row.get("name")?,
            note_count: row.get("note_count").unwrap_or(0),
        })
    }
}

// ==================== 笔记操作 ====================

/// 获取笔记列表
#[tauri::command]
pub async fn note_list(
    folder_id: Option<i64>,
    pool: State<'_, DbPool>,
) -> AppResult<Vec<Note>> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let rows = if let Some(fid) = folder_id {
        let mut stmt = conn.prepare(
            "SELECT id, title, content, folder_id, tags, created_at, updated_at \
             FROM notes WHERE folder_id = ?1 ORDER BY updated_at DESC",
        )?;
        stmt.query_map(params![fid], Note::from_row)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, content, folder_id, tags, created_at, updated_at \
             FROM notes ORDER BY updated_at DESC",
        )?;
        stmt.query_map([], Note::from_row)?
            .collect::<Result<Vec<_>, _>>()?
    };

    Ok(rows)
}

/// 获取单条笔记详情
#[tauri::command]
pub async fn note_get(id: i64, pool: State<'_, DbPool>) -> AppResult<Note> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT id, title, content, folder_id, tags, created_at, updated_at \
         FROM notes WHERE id = ?1",
    )?;

    let note = stmt
        .query_row(params![id], Note::from_row)
        .map_err(|_| AppError::NotFound(format!("笔记 {} 未找到", id)))?;

    Ok(note)
}

/// 保存笔记（新建或更新）
#[tauri::command]
pub async fn note_save(
    id: Option<i64>,
    title: String,
    content: String,
    folder_id: i64,
    tags: Option<String>,
    pool: State<'_, DbPool>,
) -> AppResult<Note> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let tags_str = tags.unwrap_or_else(|| "[]".into());

    if let Some(existing_id) = id {
        // 更新已有笔记
        conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, folder_id = ?3, tags = ?4, \
             updated_at = datetime('now') WHERE id = ?5",
            params![title, content, folder_id, tags_str, existing_id],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, title, content, folder_id, tags, created_at, updated_at \
             FROM notes WHERE id = ?1",
        )?;
        let note = stmt
            .query_row(params![existing_id], Note::from_row)
            .map_err(|_| AppError::NotFound(format!("笔记 {} 未找到", existing_id)))?;
        Ok(note)
    } else {
        // 创建新笔记
        conn.execute(
            "INSERT INTO notes (title, content, folder_id, tags) VALUES (?1, ?2, ?3, ?4)",
            params![title, content, folder_id, tags_str],
        )?;

        let new_id = conn.last_insert_rowid();

        let mut stmt = conn.prepare(
            "SELECT id, title, content, folder_id, tags, created_at, updated_at \
             FROM notes WHERE id = ?1",
        )?;
        let note = stmt
            .query_row(params![new_id], Note::from_row)
            .map_err(|_| AppError::NotFound(format!("笔记 {} 未找到", new_id)))?;
        Ok(note)
    }
}

/// 删除笔记
#[tauri::command]
pub async fn note_delete(id: i64, pool: State<'_, DbPool>) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let affected = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ==================== 文件夹操作 ====================

/// 获取笔记文件夹列表（含每个文件夹的笔记数量）
#[tauri::command]
pub async fn note_folder_list(pool: State<'_, DbPool>) -> AppResult<Vec<NoteFolder>> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT f.id, f.name, COUNT(n.id) as note_count \
         FROM note_folders f \
         LEFT JOIN notes n ON n.folder_id = f.id \
         GROUP BY f.id, f.name \
         ORDER BY f.name",
    )?;

    let folders = stmt
        .query_map([], NoteFolder::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(folders)
}
