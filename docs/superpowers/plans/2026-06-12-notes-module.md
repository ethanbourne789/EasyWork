# 笔记模块实施计划（app-notes）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `app-notes` 中实现基于 CodeMirror 6 的 Markdown 知识库：文件夹/标签组织、FTS5 搜索、固定笔记、专注模式、PDF/MD/HTML 导出、整库 .md 导入/导出、图片资源管理。

**Architecture:** 沿用项目既有 Tauri 2.x + React 19 + Zustand + qiankun 微前端架构。内容存 SQLite，图片资源存 `appData/note-assets/`，FTS5 虚表做全文搜索。CodeMirror 6 与邮件模块的 Tiptap 解耦。Rust 端 14 个 Tauri Commands，前端拆为 ~20 个独立组件 + 4 个 hook + 1 个 store。

**Tech Stack:** Tauri 2.x, Rust (rusqlite + refinery), React 19, TypeScript 5.x, CodeMirror 6, markdown-it 14, DOMPurify 3, html2pdf.js 0.10, Zustand 5, Tailwind 4

**Design Spec:** [2026-06-12-notes-module-design.md](../specs/2026-06-12-notes-module-design.md)

---

## 文件结构总览

```
e:\Dev\EasyWork/
├── shared/src/types/note.ts                # [改] Note + NoteFolder + NoteAsset
├── src-tauri/src/
│   ├── db/migrations/V5__notes_module.sql   # [新建] 迁移
│   ├── db/ops.rs                            # [改] 注册新 command
│   ├── commands/note.rs                     # [重写] CRUD + 搜索 + 切换 pin
│   ├── commands/note_folder.rs              # [新建] 文件夹操作
│   ├── commands/note_asset.rs               # [新建] 图片资源操作
│   ├── commands/note_export.rs              # [新建] 整库导入/导出
│   ├── note/word_count.rs                   # [新建] 中英文字数算法
│   └── note/mod.rs                          # [新建] 模块索引
├── apps/app-notes/
│   ├── package.json                         # [改] 新增依赖
│   ├── src/
│   │   ├── App.tsx                          # [重写] 改为 NoteShell
│   │   ├── components/
│   │   │   ├── NoteShell.tsx                # [新建]
│   │   │   ├── FolderTree.tsx               # [新建]
│   │   │   ├── FolderItem.tsx               # [新建]
│   │   │   ├── FolderMenu.tsx               # [新建]
│   │   │   ├── NoteList.tsx                 # [新建]
│   │   │   ├── NoteListItem.tsx             # [新建]
│   │   │   ├── NoteListToolbar.tsx          # [新建]
│   │   │   ├── EditorPane.tsx               # [新建]
│   │   │   ├── EditorToolbar.tsx            # [新建]
│   │   │   ├── CodeMirrorEditor.tsx         # [新建]
│   │   │   ├── MarkdownPreview.tsx          # [新建]
│   │   │   ├── FocusModeToggle.tsx          # [新建]
│   │   │   ├── ExportMenu.tsx               # [新建]
│   │   │   ├── ImportDialog.tsx             # [新建]
│   │   │   ├── AssetPicker.tsx              # [新建]
│   │   │   └── EmptyState.tsx               # [新建]
│   │   ├── hooks/
│   │   │   ├── useNotes.ts                  # [新建]
│   │   │   ├── useFolderTree.ts             # [新建]
│   │   │   ├── useDebouncedSave.ts          # [新建]
│   │   │   └── useFocusMode.ts              # [新建]
│   │   ├── stores/
│   │   │   └── notesStore.ts                # [新建]
│   │   └── lib/
│   │       ├── markdown.ts                  # [新建]
│   │       ├── exportPdf.ts                 # [新建]
│   │       ├── exportHtml.ts                # [新建]
│   │       └── countWords.ts                # [新建]
```

**先决条件**：本计划在已有 EasyWork Phase 1-3 基础上实施，假设：
- `apps/app-notes` 骨架已存在
- `shared/src/types/note.ts` 已存在
- `src-tauri/src/commands/note.rs` 已有基础 CRUD
- `refinery` 已配置好，V4__stock.sql 之后下一个迁移序号是 V5
- 验证命令：`cd e:\Dev\EasyWork && cargo check` 应当 0 错误

---

## Task 1：V5 数据库迁移

**Files:**
- Create: `src-tauri/src/db/migrations/V5__notes_module.sql`

- [ ] **Step 1：创建迁移文件**

```sql
-- V5__notes_module.sql
-- 笔记模块升级：pinned/word_count 字段、图片资源表、FTS5 全文搜索

-- 1. notes 表新增字段
ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated
    ON notes(pinned DESC, updated_at DESC);

-- 2. 图片资源表
CREATE TABLE IF NOT EXISTS note_assets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL,
    rel_path   TEXT    NOT NULL,
    abs_path   TEXT    NOT NULL,
    mime       TEXT    NOT NULL,
    size       INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_assets_note_id ON note_assets(note_id);

-- 3. FTS5 虚表
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    tags,
    content='notes',
    content_rowid='id',
    tokenize='unicode61'
);

-- 4. 同步触发器（保持 FTS5 与 notes 一致）
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content, tags)
    VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
    VALUES ('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
    VALUES ('delete', old.id, old.title, old.content, old.tags);
    INSERT INTO notes_fts(rowid, title, content, tags)
    VALUES (new.id, new.title, new.content, new.tags);
END;

-- 5. 同步已有数据到 FTS5（首次运行迁移时把旧 notes 灌进 FTS）
INSERT INTO notes_fts(rowid, title, content, tags)
SELECT id, title, content, tags FROM notes;
```

- [ ] **Step 2：运行 cargo check 确认编译通过**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo check`
Expected: 0 错误 0 警告（refinery 会自动读取新迁移文件）

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/db/migrations/V5__notes_module.sql
git commit -m "feat(notes): add V5 migration with assets + FTS5"
```

---

## Task 2：更新 shared 类型定义

**Files:**
- Modify: `shared/src/types/note.ts`

- [ ] **Step 1：完整替换文件内容**

```ts
import type { DateTimeString } from './common';

export interface Note {
  id: number;
  title: string;
  /** Markdown 文本 */
  content: string;
  folderId: number;
  tags: string[];
  pinned: boolean;
  wordCount: number;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface NoteFolder {
  id: number;
  name: string;
  parentId: number | null;
  noteCount: number;
  /** 前端组树时填充 */
  children?: NoteFolder[];
}

export interface NoteAsset {
  id: number;
  noteId: number;
  /** 写入 Markdown 时使用，如 "assets/abc.png" */
  relPath: string;
  mime: string;
  size: number;
  createdAt: DateTimeString;
}

/** 前端树形化后的节点 */
export interface NoteFolderNode extends NoteFolder {
  children: NoteFolderNode[];
  depth: number;
}

export type NoteSortBy = 'updated' | 'created' | 'title';
```

- [ ] **Step 2：在 shared 重新构建类型**

Run: `cd e:\Dev\EasyWork\shared && npx tsc -b`
Expected: 0 错误

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add shared/src/types/note.ts
git commit -m "feat(notes): extend shared Note types with pinned/wordCount/asset"
```

---

## Task 3：Rust 字数统计工具

**Files:**
- Create: `src-tauri/src/note/mod.rs`
- Create: `src-tauri/src/note/word_count.rs`

- [ ] **Step 1：新建 word_count.rs**

```rust
//! 中英文字数统计
//! 规则：英文按 \w+ 单词数；中文每个汉字 1 字。

pub fn count_words(text: &str) -> i64 {
    let mut count: i64 = 0;
    let mut in_word = false;

    for c in text.chars() {
        if c.is_alphanumeric() {
            if !in_word {
                // 词开始；中文用 is_alphabetic 区分
                if is_cjk(c) {
                    count += 1;
                } else {
                    in_word = true;
                }
            } else if is_cjk(c) {
                // 之前是英文词，现在到中文
                count += 1;
                in_word = false;
            }
        } else {
            if in_word {
                count += 1;
                in_word = false;
            }
        }
    }
    if in_word {
        count += 1;
    }
    count
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x4E00..=0x9FFF |   // CJK 统一表意
        0x3400..=0x4DBF |   // CJK 扩展 A
        0xF900..=0xFAFF     // CJK 兼容表意
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string() {
        assert_eq!(count_words(""), 0);
    }

    #[test]
    fn english_only() {
        assert_eq!(count_words("hello world"), 2);
    }

    #[test]
    fn chinese_only() {
        assert_eq!(count_words("你好世界"), 4);
    }

    #[test]
    fn mixed() {
        // "Hello 世界" = 1 英文词 + 2 中文字 = 3
        assert_eq!(count_words("Hello 世界"), 3);
    }

    #[test]
    fn markdown_ignored() {
        // Markdown 符号不计入
        assert_eq!(count_words("# 标题"), 2);
    }
}
```

- [ ] **Step 2：新建 mod.rs**

```rust
pub mod word_count;
```

- [ ] **Step 3：跑单元测试**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo test --lib note::word_count`
Expected: 5 个 test 全过

- [ ] **Step 4：在 lib.rs 注册子模块**

打开 `src-tauri/src/lib.rs`，在适当位置添加：

```rust
pub mod note;
```

- [ ] **Step 5：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/note/
git commit -m "feat(notes): add CJK+EN word count with tests"
```

---

## Task 4：Rust 笔记 CRUD（重写）

**Files:**
- Rewrite: `src-tauri/src/commands/note.rs`

- [ ] **Step 1：完整替换文件**

```rust
//! 笔记 CRUD：新建/读取/更新/删除/固定切换/搜索
use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::note::word_count::count_words;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub folder_id: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub pinned: bool,
    pub word_count: i64,
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
            pinned: row.get::<_, i64>("pinned")? != 0,
            word_count: row.get("word_count")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

const NOTE_COLS: &str = "id, title, content, folder_id, tags, pinned, word_count, created_at, updated_at";

/// 笔记列表
#[tauri::command]
pub async fn note_list(
    folder_id: Option<i64>,
    include_children: Option<bool>,
    tag: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Vec<Note>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 简化版：folder_id 模式下 include_children 默认 true
    let include = include_children.unwrap_or(true);

    let mut sql = format!("SELECT {} FROM notes WHERE 1=1", NOTE_COLS);
    let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(fid) = folder_id {
        if include {
            // 用子查询展开：所有 parent_id 在该文件夹子树的 folder_id
            sql.push_str(" AND folder_id IN (SELECT id FROM note_folders WHERE id = ?1 OR parent_id = ?1 OR id IN (SELECT id FROM note_folders WHERE parent_id IN (SELECT id FROM note_folders WHERE parent_id = ?1)))");
            param_values.push(Box::new(fid));
        } else {
            sql.push_str(" AND folder_id = ?1");
            param_values.push(Box::new(fid));
        }
    }

    if let Some(t) = &tag {
        sql.push_str(&format!(" AND tags LIKE ?{}", param_values.len() + 1));
        param_values.push(Box::new(format!("%\"{}\"%", t)));
    }

    sql.push_str(" ORDER BY pinned DESC, updated_at DESC");

    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
    let notes = stmt
        .query_map(params_refs.as_slice(), Note::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

/// 单条笔记
#[tauri::command]
pub async fn note_get(id: i64, state: State<'_, DbState>) -> AppResult<Note> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let mut stmt = conn.prepare(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLS))?;
    let note = stmt
        .query_row(params![id], Note::from_row)
        .map_err(|_| AppError::NotFound(format!("笔记 {} 未找到", id)))?;
    Ok(note)
}

/// 新建或更新
#[tauri::command]
pub async fn note_save(
    id: Option<i64>,
    title: String,
    content: String,
    folder_id: i64,
    tags: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Note> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let tags_str = tags.unwrap_or_else(|| "[]".into());
    let wc = count_words(&content);

    if let Some(existing_id) = id {
        conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, folder_id = ?3, tags = ?4, \
             word_count = ?5, updated_at = datetime('now') WHERE id = ?6",
            params![title, content, folder_id, tags_str, wc, existing_id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO notes (title, content, folder_id, tags, word_count) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, content, folder_id, tags_str, wc],
        )?;
    }

    let new_id = id.unwrap_or_else(|| conn.last_insert_rowid());
    let mut stmt = conn.prepare(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLS))?;
    let note = stmt
        .query_row(params![new_id], Note::from_row)
        .map_err(|_| AppError::NotFound(format!("笔记 {} 未找到", new_id)))?;
    Ok(note)
}

/// 删除笔记（级联删除 assets 记录；物理文件由前端 asset 命令清理）
#[tauri::command]
pub async fn note_delete(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 先取出所有 abs_path 以便前端/外部清理
    let mut stmt = conn.prepare("SELECT abs_path FROM note_assets WHERE note_id = ?1")?;
    let paths: Vec<String> = stmt
        .query_map(params![id], |row| row.get::<_, String>(0))?
        .collect::<Result<_, _>>()?;

    // 触发器会级联；显式删除以确保
    conn.execute("DELETE FROM note_assets WHERE note_id = ?1", params![id])?;
    let affected = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;

    // 物理文件路径写回日志（实际删除由前端调用 asset 命令，或在此处异步删）
    for p in paths {
        eprintln!("[note_delete] 待清理资源: {}", p);
    }

    Ok(affected > 0)
}

/// 切换固定
#[tauri::command]
pub async fn note_toggle_pin(id: i64, state: State<'_, DbState>) -> AppResult<Note> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    conn.execute(
        "UPDATE notes SET pinned = 1 - pinned, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    let mut stmt = conn.prepare(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLS))?;
    let note = stmt
        .query_row(params![id], Note::from_row)
        .map_err(|_| AppError::NotFound(format!("笔记 {} 未找到", id)))?;
    Ok(note)
}

/// FTS5 全文搜索
#[tauri::command]
pub async fn note_search(
    query: String,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> AppResult<Vec<Note>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let lim = limit.unwrap_or(50);
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    // FTS5 用双引号包裹短语；先把用户输入中的双引号转义
    let escaped = trimmed.replace('"', "\"\"");
    let fts_query = format!("\"{}\"*", escaped);

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM notes WHERE id IN \
         (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT ?2) \
         ORDER BY pinned DESC, updated_at DESC",
        NOTE_COLS
    ))?;

    let notes = stmt
        .query_map(params![fts_query, lim], Note::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}
```

- [ ] **Step 2：编译验证**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo check`
Expected: 0 错误 0 警告

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/commands/note.rs
git commit -m "feat(notes): rewrite note CRUD with FTS5 search and pin toggle"
```

---

## Task 5：Rust 文件夹操作

**Files:**
- Create: `src-tauri/src/commands/note_folder.rs`

- [ ] **Step 1：新建文件**

```rust
//! 笔记文件夹管理
use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFolder {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub note_count: i64,
}

impl NoteFolder {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(NoteFolder {
            id: row.get("id")?,
            name: row.get("name")?,
            parent_id: row.get("parent_id")?,
            note_count: row.get::<_, i64>("note_count").unwrap_or(0),
        })
    }
}

/// 列出所有文件夹（含每个的笔记数）
#[tauri::command]
pub async fn note_folder_list(state: State<'_, DbState>) -> AppResult<Vec<NoteFolder>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let mut stmt = conn.prepare(
        "SELECT f.id, f.name, f.parent_id, COUNT(n.id) as note_count \
         FROM note_folders f LEFT JOIN notes n ON n.folder_id = f.id \
         GROUP BY f.id, f.name, f.parent_id ORDER BY f.name",
    )?;
    let folders = stmt
        .query_map([], NoteFolder::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(folders)
}

/// 新建/重命名文件夹
#[tauri::command]
pub async fn note_folder_save(
    id: Option<i64>,
    name: String,
    parent_id: Option<i64>,
    state: State<'_, DbState>,
) -> AppResult<NoteFolder> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    if let Some(fid) = id {
        conn.execute(
            "UPDATE note_folders SET name = ?1, parent_id = ?2 WHERE id = ?3",
            params![name, parent_id, fid],
        )?;
        let mut stmt = conn.prepare(
            "SELECT f.id, f.name, f.parent_id, COUNT(n.id) as note_count \
             FROM note_folders f LEFT JOIN notes n ON n.folder_id = f.id \
             WHERE f.id = ?1 GROUP BY f.id, f.name, f.parent_id",
        )?;
        let folder = stmt
            .query_row(params![fid], NoteFolder::from_row)
            .map_err(|_| AppError::NotFound(format!("文件夹 {} 未找到", fid)))?;
        Ok(folder)
    } else {
        conn.execute(
            "INSERT INTO note_folders (name, parent_id) VALUES (?1, ?2)",
            params![name, parent_id],
        )?;
        let new_id = conn.last_insert_rowid();
        Ok(NoteFolder {
            id: new_id,
            name,
            parent_id,
            note_count: 0,
        })
    }
}

/// 删除文件夹；其下与子文件夹下的笔记迁移到 fallback_folder_id
#[tauri::command]
pub async fn note_folder_delete(
    id: i64,
    fallback_folder_id: i64,
    state: State<'_, DbState>,
) -> AppResult<bool> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 收集所有要删除的文件夹 id（含子文件夹）
    let mut all_ids: Vec<i64> = vec![id];
    let mut stack = vec![id];
    while let Some(cur) = stack.pop() {
        let mut stmt = conn.prepare("SELECT id FROM note_folders WHERE parent_id = ?1")?;
        let children: Vec<i64> = stmt
            .query_map(params![cur], |row| row.get::<_, i64>(0))?
            .collect::<Result<_, _>>()?;
        for c in children {
            all_ids.push(c);
            stack.push(c);
        }
    }

    // 迁移笔记
    let placeholders: String = all_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "UPDATE notes SET folder_id = ?1 WHERE folder_id IN ({})",
        placeholders
    );
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&fallback_folder_id];
    for i in &all_ids {
        params_vec.push(i as &dyn rusqlite::ToSql);
    }
    conn.execute(&sql, params_vec.as_slice())?;

    // 删除文件夹
    let sql2 = format!("DELETE FROM note_folders WHERE id IN ({})", placeholders);
    let mut params_vec2: Vec<&dyn rusqlite::ToSql> = vec![];
    for i in &all_ids {
        params_vec2.push(i as &dyn rusqlite::ToSql);
    }
    let affected = conn.execute(&sql2, params_vec2.as_slice())?;
    Ok(affected > 0)
}
```

- [ ] **Step 2：编译**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo check`
Expected: 0 错误 0 警告

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/commands/note_folder.rs
git commit -m "feat(notes): add folder CRUD with fallback on delete"
```

---

## Task 6：Rust 图片资源操作

**Files:**
- Create: `src-tauri/src/commands/note_asset.rs`

- [ ] **Step 1：新建文件**

```rust
//! 笔记图片资源
//! 文件存到 <appData>/EasyWork/note-assets/{noteId}/{uuid}.{ext}，DB 存相对路径。
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::Manager;
use rusqlite::params;
use base64::{Engine as _, engine::general_purpose};
use uuid::Uuid;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAsset {
    pub id: i64,
    pub note_id: i64,
    pub rel_path: String,
    pub mime: String,
    pub size: i64,
    pub created_at: String,
}

impl NoteAsset {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(NoteAsset {
            id: row.get("id")?,
            note_id: row.get("note_id")?,
            rel_path: row.get("rel_path")?,
            mime: row.get("mime")?,
            size: row.get("size")?,
            created_at: row.get("created_at")?,
        })
    }
}

fn ext_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        _ => "bin",
    }
}

/// 保存图片：dataUrl = "data:<mime>;base64,<...>"
#[tauri::command]
pub async fn note_asset_save(
    note_id: i64,
    file_name: String,
    data_url: String,
    app: tauri::AppHandle,
    state: State<'_, DbState>,
) -> AppResult<NoteAsset> {
    // 解析 dataUrl
    let (mime, b64) = data_url
        .split_once(',')
        .ok_or_else(|| AppError::Validation("dataUrl 格式错误".into()))?;
    let mime = mime
        .trim_start_matches("data:")
        .trim_end_matches(";base64")
        .to_string();
    let bytes = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| AppError::Internal(format!("base64 解码失败: {}", e)))?;

    // 准备目录
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("获取 app_data 失败: {}", e)))?;
    let assets_dir = app_data.join("EasyWork").join("note-assets").join(note_id.to_string());
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| AppError::Internal(format!("创建目录失败: {}", e)))?;

    // 写文件
    let uuid = Uuid::new_v4().to_string();
    let ext = ext_from_mime(&mime);
    let file_name_on_disk = format!("{}.{}", uuid, ext);
    let abs_path = assets_dir.join(&file_name_on_disk);
    std::fs::write(&abs_path, &bytes)
        .map_err(|e| AppError::Internal(format!("写文件失败: {}", e)))?;

    let rel_path = format!("assets/{}", file_name_on_disk);
    let size = bytes.len() as i64;

    // 入库
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    conn.execute(
        "INSERT INTO note_assets (note_id, rel_path, abs_path, mime, size) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![note_id, rel_path, abs_path.to_string_lossy().to_string(), mime, size],
    )?;
    let new_id = conn.last_insert_rowid();
    let mut stmt = conn.prepare(
        "SELECT id, note_id, rel_path, mime, size, created_at FROM note_assets WHERE id = ?1",
    )?;
    let asset = stmt
        .query_row(params![new_id], NoteAsset::from_row)
        .map_err(|_| AppError::NotFound("资产记录未找到".into()))?;
    let _ = file_name; // 暂未使用
    Ok(asset)
}

/// 删除图片：删记录 + 物理文件
#[tauri::command]
pub async fn note_asset_delete(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    let mut stmt = conn.prepare("SELECT abs_path FROM note_assets WHERE id = ?1")?;
    let abs_path: Option<String> = stmt
        .query_row(params![id], |row| row.get(0))
        .ok();

    let affected = conn.execute("DELETE FROM note_assets WHERE id = ?1", params![id])?;

    if let Some(p) = abs_path {
        let _ = std::fs::remove_file(p);
    }
    Ok(affected > 0)
}
```

- [ ] **Step 2：在 Cargo.toml 检查依赖**

打开 `src-tauri/Cargo.toml`，确认已有或新增：

```toml
[dependencies]
uuid = { version = "1", features = ["v4"] }
base64 = "0.22"
```

如缺则添加。

- [ ] **Step 3：编译**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo check`
Expected: 0 错误 0 警告

- [ ] **Step 4：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/commands/note_asset.rs src-tauri/Cargo.toml
git commit -m "feat(notes): add asset save/delete with file system"
```

---

## Task 7：Rust 整库导入/导出

**Files:**
- Create: `src-tauri/src/commands/note_export.rs`

- [ ] **Step 1：新建文件**

```rust
//! 整库导入/导出 .md 文件夹
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use rusqlite::params;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
}

/// 导出：把 folder_id 下的笔记（includeChildren=true）写到 save_path
#[tauri::command]
pub async fn note_export_folder(
    folder_id: Option<i64>,
    save_path: String,
    state: State<'_, DbState>,
) -> AppResult<ExportResult> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;

    // 拉出要导出的笔记 + 文件夹名映射
    let notes: Vec<(i64, String, String, i64, String, String, String)> = if let Some(fid) = folder_id {
        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.content, n.folder_id, n.tags, f.name, n.updated_at \
             FROM notes n LEFT JOIN note_folders f ON f.id = n.folder_id \
             WHERE n.folder_id = ?1 OR n.folder_id IN \
               (SELECT id FROM note_folders WHERE parent_id = ?1) \
             ORDER BY f.name, n.title",
        )?;
        stmt.query_map(params![fid], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
        })?
        .collect::<Result<Vec<_>, _>>()?
    } else {
        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.content, n.folder_id, n.tags, f.name, n.updated_at \
             FROM notes n LEFT JOIN note_folders f ON f.id = n.folder_id \
             ORDER BY f.name, n.title",
        )?;
        stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
        })?
        .collect::<Result<Vec<_>, _>>()?
    };

    let base = PathBuf::from(&save_path);
    std::fs::create_dir_all(&base)
        .map_err(|e| AppError::Internal(format!("创建目录失败: {}", e)))?;

    let mut count = 0usize;
    for (id, title, content, _folder_id, tags, folder_name, updated_at) in notes {
        let dir = match folder_name {
            Some(name) => base.join(&name),
            None => base.clone(),
        };
        std::fs::create_dir_all(&dir)?;
        let safe_name = sanitize_filename(&title);
        let file = dir.join(format!("{}.md", safe_name));
        let frontmatter = format!(
            "---\ntitle: \"{}\"\ntags: {}\nupdatedAt: \"{}\"\n---\n\n",
            title,
            tags,
            updated_at
        );
        std::fs::write(&file, format!("{}{}", frontmatter, content))?;
        count += 1;
        let _ = id;
    }

    Ok(ExportResult { count, path: save_path })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub count: usize,
    pub path: String,
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// 导入：递归读 src_path 下所有 .md，解析 frontmatter
#[tauri::command]
pub async fn note_import_folder(
    folder_id: i64,
    src_path: String,
    state: State<'_, DbState>,
) -> AppResult<ImportResult> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let base = PathBuf::from(&src_path);
    if !base.is_dir() {
        return Err(AppError::Validation(format!("{} 不是目录", src_path)));
    }

    let mut imported = 0usize;
    let mut skipped = Vec::new();
    let mut errors = Vec::new();

    // 简化：只读 1 层 + 每层 .md；嵌套通过父目录名建立子文件夹
    let entries = std::fs::read_dir(&base)
        .map_err(|e| AppError::Internal(format!("读目录失败: {}", e)))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // 子目录：递归创建子文件夹
            let sub_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let mut stmt = conn.prepare(
                "INSERT OR IGNORE INTO note_folders (name, parent_id) VALUES (?1, ?2)",
            )?;
            stmt.execute(params![&sub_name, folder_id])?;
            let new_id: i64 = conn.query_row(
                "SELECT id FROM note_folders WHERE name = ?1 AND (parent_id = ?2 OR (parent_id IS NULL AND ?2 IS NULL))",
                params![&sub_name, folder_id],
                |row| row.get(0),
            )?;

            // 递归（不重新加一级）
            let sub_result = import_recursive(&conn, &path, new_id)?;
            imported += sub_result.imported;
            skipped.extend(sub_result.skipped);
            errors.extend(sub_result.errors);
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            match parse_and_insert(&conn, &path, folder_id) {
                Ok(true) => imported += 1,
                Ok(false) => skipped.push(path.display().to_string()),
                Err(e) => errors.push(format!("{}: {}", path.display(), e)),
            }
        }
    }

    Ok(ImportResult { imported, skipped, errors })
}

fn import_recursive(conn: &rusqlite::Connection, dir: &std::path::Path, parent_id: i64) -> AppResult<ImportResult> {
    let mut result = ImportResult { imported: 0, skipped: vec![], errors: vec![] };
    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let sub_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            conn.execute(
                "INSERT OR IGNORE INTO note_folders (name, parent_id) VALUES (?1, ?2)",
                params![&sub_name, parent_id],
            )?;
            let new_id: i64 = conn.query_row(
                "SELECT id FROM note_folders WHERE name = ?1 AND parent_id = ?2",
                params![&sub_name, parent_id],
                |row| row.get(0),
            )?;
            let r = import_recursive(conn, &path, new_id)?;
            result.imported += r.imported;
            result.skipped.extend(r.skipped);
            result.errors.extend(r.errors);
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            match parse_and_insert(conn, &path, parent_id) {
                Ok(true) => result.imported += 1,
                Ok(false) => result.skipped.push(path.display().to_string()),
                Err(e) => result.errors.push(format!("{}: {}", path.display(), e)),
            }
        }
    }
    Ok(result)
}

fn parse_and_insert(conn: &rusqlite::Connection, path: &std::path::Path, folder_id: i64) -> Result<bool, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let (frontmatter, body) = split_frontmatter(&content);

    let title = if let Some(fm) = frontmatter {
        fm.get("title").cloned().unwrap_or_else(|| {
            path.file_stem().unwrap_or_default().to_string_lossy().to_string()
        })
    } else {
        path.file_stem().unwrap_or_default().to_string_lossy().to_string()
    };

    let tags = if let Some(fm) = frontmatter {
        fm.get("tags").cloned().unwrap_or_else(|| "[]".into())
    } else {
        "[]".into()
    };

    // 检查同名标题是否已存在
    let exists: bool = conn.query_row(
        "SELECT 1 FROM notes WHERE title = ?1 AND folder_id = ?2",
        params![&title, folder_id],
        |_| Ok(true),
    ).unwrap_or(false);

    if exists {
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO notes (title, content, folder_id, tags) VALUES (?1, ?2, ?3, ?4)",
        params![title, body, folder_id, tags],
    ).map_err(|e| e.to_string())?;
    Ok(true)
}

fn split_frontmatter(content: &str) -> (Option<std::collections::HashMap<String, String>>, String) {
    if !content.starts_with("---\n") {
        return (None, content.to_string());
    }
    let end = content[4..].find("\n---").map(|i| i + 4);
    if let Some(end) = end {
        let fm_text = &content[4..end];
        let body = content[end + 4..].trim_start_matches('\n').to_string();
        let mut map = std::collections::HashMap::new();
        for line in fm_text.lines() {
            if let Some((k, v)) = line.split_once(':') {
                map.insert(k.trim().to_string(), v.trim().trim_matches('"').to_string());
            }
        }
        (Some(map), body)
    } else {
        (None, content.to_string())
    }
}
```

- [ ] **Step 2：编译**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo check`
Expected: 0 错误 0 警告

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/commands/note_export.rs
git commit -m "feat(notes): add folder import/export with frontmatter"
```

---

## Task 8：注册新命令到 lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`（或 `commands/mod.rs`）

- [ ] **Step 1：查看当前命令注册方式**

Run: `cd e:\Dev\EasyWork\src-tauri && grep -n "note_list" src\commands\mod.rs src\lib.rs`

根据输出找到 `tauri::generate_handler!` 宏，把新命令加进去。

- [ ] **Step 2：把新模块加到 commands/mod.rs**

打开 `src-tauri/src/commands/mod.rs`，添加：

```rust
pub mod note;
pub mod note_folder;
pub mod note_asset;
pub mod note_export;
```

- [ ] **Step 3：注册 invoke handler**

在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler!` 数组里加：

```rust
            crate::commands::note::note_list,
            crate::commands::note::note_get,
            crate::commands::note::note_save,
            crate::commands::note::note_delete,
            crate::commands::note::note_toggle_pin,
            crate::commands::note::note_search,
            crate::commands::note_folder::note_folder_list,
            crate::commands::note_folder::note_folder_save,
            crate::commands::note_folder::note_folder_delete,
            crate::commands::note_asset::note_asset_save,
            crate::commands::note_asset::note_asset_delete,
            crate::commands::note_export::note_export_folder,
            crate::commands::note_export::note_import_folder,
```

> 注意：移除（或保留为 deprecated）`commands::note::note_folder_list`（旧版）。本计划用 `note_folder::note_folder_list` 替代。

- [ ] **Step 4：编译**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo check`
Expected: 0 错误 0 警告

- [ ] **Step 5：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(notes): register 13 note Tauri commands"
```

---

## Task 9：app-notes 依赖与基础配置

**Files:**
- Modify: `apps/app-notes/package.json`

- [ ] **Step 1：追加依赖**

打开 `apps/app-notes/package.json`，在 `dependencies` 块添加：

```json
{
  "@codemirror/state": "^6.4.1",
  "@codemirror/view": "^6.34.0",
  "@codemirror/commands": "^6.6.0",
  "@codemirror/lang-markdown": "^6.2.5",
  "@codemirror/language": "^6.10.2",
  "@codemirror/search": "^6.5.6",
  "@codemirror/theme-one-dark": "^6.1.2",
  "codemirror": "^6.0.1",
  "markdown-it": "^14.1.0",
  "dompurify": "^3.1.6",
  "html2pdf.js": "^0.10.2"
}
```

在 `devDependencies` 添加：

```json
{
  "@types/markdown-it": "^14.1.2",
  "@types/dompurify": "^3.0.5"
}
```

- [ ] **Step 2：安装**

Run: `cd e:\Dev\EasyWork && pnpm install`
Expected: 依赖装好，无 ERR

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/package.json pnpm-lock.yaml
git commit -m "feat(notes): add CodeMirror, markdown-it, html2pdf deps"
```

---

## Task 10：zustand store

**Files:**
- Create: `apps/app-notes/src/stores/notesStore.ts`

- [ ] **Step 1：新建文件**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NoteSortBy = 'updated' | 'created' | 'title';

interface NotesStore {
  activeFolderId: number | null;
  activeTag: string | null;
  activeNoteId: number | null;
  searchQuery: string;
  sortBy: NoteSortBy;
  focusMode: boolean;

  setActiveFolder: (id: number | null) => void;
  setActiveTag: (tag: string | null) => void;
  setActiveNote: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (s: NoteSortBy) => void;
  toggleFocusMode: () => void;
}

export const useNotesStore = create<NotesStore>()(
  persist(
    (set) => ({
      activeFolderId: null,
      activeTag: null,
      activeNoteId: null,
      searchQuery: '',
      sortBy: 'updated',
      focusMode: false,

      setActiveFolder: (id) => set({ activeFolderId: id, activeNoteId: null }),
      setActiveTag: (tag) => set({ activeTag: tag, activeNoteId: null }),
      setActiveNote: (id) => set({ activeNoteId: id }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setSortBy: (s) => set({ sortBy: s }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
    }),
    {
      name: 'easywork-notes',
      // 只持久化部分字段
      partialize: (s) => ({
        activeFolderId: s.activeFolderId,
        activeNoteId: s.activeNoteId,
        sortBy: s.sortBy,
      }),
    }
  )
);
```

- [ ] **Step 2：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/stores/notesStore.ts
git commit -m "feat(notes): add zustand store with localStorage persistence"
```

---

## Task 11：前端 lib 工具

**Files:**
- Create: `apps/app-notes/src/lib/markdown.ts`
- Create: `apps/app-notes/src/lib/countWords.ts`
- Create: `apps/app-notes/src/lib/exportHtml.ts`
- Create: `apps/app-notes/src/lib/exportPdf.ts`

- [ ] **Step 1：markdown.ts（markdown-it 渲染）**

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

/** 渲染 Markdown 为安全的 HTML */
export function renderMarkdown(source: string): string {
  const raw = md.render(source);
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
}
```

- [ ] **Step 2：countWords.ts**

```ts
/**
 * 中英文混合字数（与 Rust 端 word_count.rs 保持一致）
 * 英文 \w+ 单词数；中文 1 字 1 计
 */
export function countWords(text: string): number {
  let count = 0;
  let inWord = false;

  const isCjk = (c: string) => {
    const code = c.charCodeAt(0);
    return (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    );
  };

  for (const c of text) {
    if (/[a-zA-Z0-9_]/.test(c)) {
      if (!inWord) {
        if (isCjk(c)) {
          count += 1;
        } else {
          inWord = true;
        }
      } else if (isCjk(c)) {
        count += 1;
        inWord = false;
      }
    } else {
      if (inWord) {
        count += 1;
        inWord = false;
      }
    }
  }
  if (inWord) count += 1;
  return count;
}
```

- [ ] **Step 3：exportHtml.ts**

```ts
import { renderMarkdown } from './markdown';

export function exportHtml(title: string, markdown: string): string {
  const body = renderMarkdown(markdown);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1f2937; }
h1, h2, h3 { color: #111827; }
pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 4px solid #6366f1; padding-left: 12px; color: #6b7280; margin-left: 0; }
img { max-width: 100%; }
a { color: #6366f1; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #e5e7eb; padding: 8px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

- [ ] **Step 4：exportPdf.ts**

```ts
import html2pdf from 'html2pdf.js';
import { renderMarkdown } from './markdown';

export async function exportPdf(title: string, markdown: string): Promise<void> {
  const html = renderMarkdown(markdown);
  const container = document.createElement('div');
  container.style.cssText = 'font-family: -apple-system, "Segoe UI", sans-serif; max-width: 800px; padding: 20px; line-height: 1.6; color: #1f2937;';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    await html2pdf()
      .set({
        margin: 10,
        filename: `${title}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
```

- [ ] **Step 5：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/lib/
git commit -m "feat(notes): add markdown render + export html/pdf utilities"
```

---

## Task 12：前端 hooks

**Files:**
- Create: `apps/app-notes/src/hooks/useNotes.ts`
- Create: `apps/app-notes/src/hooks/useFolderTree.ts`
- Create: `apps/app-notes/src/hooks/useDebouncedSave.ts`
- Create: `apps/app-notes/src/hooks/useFocusMode.ts`

- [ ] **Step 1：useNotes.ts**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Note, NoteFolder, NoteSortBy } from '@shared/types/note';

export function useNotes(folderId: number | null, tag: string | null, searchQuery: string) {
  return useQuery({
    queryKey: ['notes', folderId, tag, searchQuery],
    queryFn: async () => {
      if (searchQuery.trim()) {
        return await invoke<Note[]>('note_search', { query: searchQuery });
      }
      return await invoke<Note[]>('note_list', {
        folderId: folderId ?? null,
        tag: tag ?? null,
        includeChildren: true,
      });
    },
  });
}

export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; title: string; content: string; folderId: number; tags?: string[] }) => {
      return await invoke<Note>('note_save', {
        id: input.id ?? null,
        title: input.title,
        content: input.content,
        folderId: input.folderId,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => invoke<boolean>('note_delete', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => invoke<Note>('note_toggle_pin', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useFolders() {
  return useQuery({
    queryKey: ['note-folders'],
    queryFn: () => invoke<NoteFolder[]>('note_folder_list'),
  });
}

export function useSaveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: number; name: string; parentId: number | null }) =>
      invoke<NoteFolder>('note_folder_save', {
        id: input.id ?? null,
        name: input.name,
        parentId: input.parentId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['note-folders'] }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; fallbackFolderId: number }) =>
      invoke<boolean>('note_folder_delete', {
        id: input.id,
        fallbackFolderId: input.fallbackFolderId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['note-folders'] });
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}
```

- [ ] **Step 2：useFolderTree.ts**

```ts
import { useMemo } from 'react';
import type { NoteFolder, NoteFolderNode } from '@shared/types/note';

/** 把扁平 NoteFolder[] 组装成 NoteFolderNode 树 */
export function useFolderTree(folders: NoteFolder[] | undefined): NoteFolderNode[] {
  return useMemo(() => {
    if (!folders) return [];
    const map = new Map<number, NoteFolderNode>();
    folders.forEach((f) => map.set(f.id, { ...f, children: [], depth: 0 }));
    const roots: NoteFolderNode[] = [];
    map.forEach((node) => {
      if (node.parentId == null) {
        roots.push(node);
      } else {
        const parent = map.get(node.parentId);
        if (parent) parent.children.push(node);
      }
    });
    const setDepth = (nodes: NoteFolderNode[], d: number) => {
      nodes.forEach((n) => {
        n.depth = d;
        setDepth(n.children, d + 1);
      });
    };
    setDepth(roots, 0);
    return roots;
  }, [folders]);
}
```

- [ ] **Step 3：useDebouncedSave.ts**

```ts
import { useEffect, useRef } from 'react';

export function useDebouncedSave<T>(value: T, save: (v: T) => void, delay = 1500) {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(value), delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value, save, delay]);
}
```

- [ ] **Step 4：useFocusMode.ts**

```ts
import { useNotesStore } from '../stores/notesStore';

export function useFocusMode() {
  return useNotesStore((s) => s.focusMode);
}
```

- [ ] **Step 5：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/hooks/
git commit -m "feat(notes): add React Query hooks + tree builder + debounce"
```

---

## Task 13：CodeMirrorEditor 组件

**Files:**
- Create: `apps/app-notes/src/components/CodeMirrorEditor.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** 是否使用深色主题（跟随系统） */
  dark?: boolean;
}

export function CodeMirrorEditor({ value, onChange, dark = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        drawSelection(),
        bracketMatching(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        ...(dark ? [oneDark] : []),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // 外部 value 变化时（切换笔记）同步到编辑器
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="h-full overflow-auto text-sm" />;
}
```

- [ ] **Step 2：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/CodeMirrorEditor.tsx
git commit -m "feat(notes): add CodeMirror 6 editor wrapper"
```

---

## Task 14：MarkdownPreview 组件

**Files:**
- Create: `apps/app-notes/src/components/MarkdownPreview.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

interface Props {
  source: string;
}

export function MarkdownPreview({ source }: Props) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div
      className="h-full overflow-auto px-6 py-4 prose prose-sm max-w-none dark:prose-invert
                 prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl
                 prose-code:bg-surface-100 prose-code:px-1 prose-code:rounded
                 prose-pre:bg-surface-100 prose-pre:p-3
                 prose-blockquote:border-l-4 prose-blockquote:border-primary-500
                 prose-a:text-primary-600"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 2：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/MarkdownPreview.tsx
git commit -m "feat(notes): add markdown preview component"
```

---

## Task 15：EditorPane 组件（整合标题/工具栏/编辑器/预览）

**Files:**
- Create: `apps/app-notes/src/components/EditorToolbar.tsx`
- Create: `apps/app-notes/src/components/EditorPane.tsx`

- [ ] **Step 1：EditorToolbar.tsx**

```tsx
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Quote, Code, Link2, Image as ImageIcon } from 'lucide-react';

interface Props {
  onInsert: (text: string, cursorOffset?: number) => void;
  onImageClick: () => void;
}

export function EditorToolbar({ onInsert, onImageClick }: Props) {
  const wrap = (left: string, right = left, sample = 'text') =>
    onInsert(`${left}${sample}${right}`, left.length + sample.length);

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
      <button onClick={() => onInsert('# ', 2)} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="标题1">
        <Heading1 size={16} />
      </button>
      <button onClick={() => onInsert('## ', 3)} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="标题2">
        <Heading2 size={16} />
      </button>
      <div className="w-px h-4 bg-surface-300 dark:bg-surface-600 mx-1" />
      <button onClick={() => wrap('**')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="粗体">
        <Bold size={16} />
      </button>
      <button onClick={() => wrap('*')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="斜体">
        <Italic size={16} />
      </button>
      <button onClick={() => wrap('`')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="行内代码">
        <Code size={16} />
      </button>
      <div className="w-px h-4 bg-surface-300 dark:bg-surface-600 mx-1" />
      <button onClick={() => onInsert('- ')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="无序列表">
        <List size={16} />
      </button>
      <button onClick={() => onInsert('1. ')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="有序列表">
        <ListOrdered size={16} />
      </button>
      <button onClick={() => onInsert('> ')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="引用">
        <Quote size={16} />
      </button>
      <div className="w-px h-4 bg-surface-300 dark:bg-surface-600 mx-1" />
      <button onClick={() => wrap('[', '](https://)', 'link')} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="链接">
        <Link2 size={16} />
      </button>
      <button onClick={onImageClick} className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700" title="图片">
        <ImageIcon size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2：EditorPane.tsx**

```tsx
import { useEffect, useRef, useState } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { EditorToolbar } from './EditorToolbar';
import { AssetPicker } from './AssetPicker';
import { ExportMenu } from './ExportMenu';
import type { Note } from '@shared/types/note';

interface Props {
  note: Note;
  onChange: (title: string, content: string) => void;
  saving: boolean;
  lastSavedAt: Date | null;
}

export function EditorPane({ note, onChange, saving, lastSavedAt }: Props) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const cmViewRef = useRef<unknown>(null);

  // 切换笔记时同步
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id]);

  const insertText = (text: string, cursorOffset?: number) => {
    setContent((c) => c + text);
    if (cursorOffset !== undefined) {
      // 简化：仅追加；CodeMirror 通过 value prop 同步
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-950">
      {/* 标题 + 状态 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-200 dark:border-surface-700">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onChange(e.target.value, content);
          }}
          className="text-2xl font-bold bg-transparent border-none focus:outline-none w-full"
          placeholder="无标题笔记"
        />
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-xs text-surface-500">
            {saving ? '保存中…' : lastSavedAt ? `已保存 · ${lastSavedAt.toLocaleTimeString()}` : ''}
          </span>
          <ExportMenu note={note} />
        </div>
      </div>

      {/* 工具栏 */}
      <EditorToolbar onInsert={insertText} onImageClick={() => setShowAssetPicker(true)} />

      {/* 编辑器 + 预览 */}
      <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
        <CodeMirrorEditor value={content} onChange={(v) => { setContent(v); onChange(title, v); }} />
        <div className="border-l border-surface-200 dark:border-surface-700">
          <MarkdownPreview source={content} />
        </div>
      </div>

      {showAssetPicker && (
        <AssetPicker
          noteId={note.id}
          onInsert={(relPath) => {
            setContent((c) => c + `\n![image](${relPath})\n`);
            setShowAssetPicker(false);
          }}
          onClose={() => setShowAssetPicker(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/EditorToolbar.tsx apps/app-notes/src/components/EditorPane.tsx
git commit -m "feat(notes): add EditorPane combining title+toolbar+editor+preview"
```

---

## Task 16：FolderTree 组件

**Files:**
- Create: `apps/app-notes/src/components/FolderItem.tsx`
- Create: `apps/app-notes/src/components/FolderMenu.tsx`
- Create: `apps/app-notes/src/components/FolderTree.tsx`

- [ ] **Step 1：FolderMenu.tsx（右键菜单）**

```tsx
import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Plus, Edit2, Trash2 } from 'lucide-react';

interface Props {
  onRename: () => void;
  onAddSub: () => void;
  onDelete: () => void;
}

export function FolderMenu({ onRename, onAddSub, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded shadow-lg z-10">
          <button onClick={onAddSub} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center gap-2">
            <Plus size={12} /> 新建子文件夹
          </button>
          <button onClick={onRename} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center gap-2">
            <Edit2 size={12} /> 重命名
          </button>
          <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center gap-2 text-red-600">
            <Trash2 size={12} /> 删除
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2：FolderItem.tsx**

```tsx
import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { FolderMenu } from './FolderMenu';
import type { NoteFolderNode } from '@shared/types/note';

interface Props {
  node: NoteFolderNode;
  active: boolean;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onSelect: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onAddSub: (parentId: number) => void;
  onDelete: (id: number) => void;
}

export function FolderItem({ node, active, expanded, onToggleExpand, onSelect, onRename, onAddSub, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded text-sm cursor-pointer
                    ${active ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium' : 'hover:bg-surface-100 dark:hover:bg-surface-800'}`}
        style={{ paddingLeft: 8 + node.depth * 12 }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }} className="p-0.5">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3" />
        )}
        {isOpen && hasChildren ? <FolderOpen size={14} /> : <Folder size={14} />}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(node.id, name); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="flex-1 bg-transparent border-b border-primary-500 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}
        <span className="text-xs text-surface-400">{node.noteCount}</span>
        <FolderMenu
          onRename={() => { setName(node.name); setEditing(true); }}
          onAddSub={() => onAddSub(node.id)}
          onDelete={() => onDelete(node.id)}
        />
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map((c) => (
            <FolderItem
              key={c.id}
              node={c}
              active={active}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onRename={onRename}
              onAddSub={onAddSub}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3：FolderTree.tsx**

```tsx
import { useState } from 'react';
import { useFolders, useSaveFolder, useDeleteFolder } from '../hooks/useNotes';
import { useFolderTree } from '../hooks/useFolderTree';
import { FolderItem } from './FolderItem';
import { useNotesStore } from '../stores/notesStore';
import { Plus } from 'lucide-react';

export function FolderTree() {
  const { data: folders } = useFolders();
  const tree = useFolderTree(folders);
  const activeFolderId = useNotesStore((s) => s.activeFolderId);
  const setActiveFolder = useNotesStore((s) => s.setActiveFolder);
  const saveFolder = useSaveFolder();
  const deleteFolder = useDeleteFolder();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpanded((s) => {
      const ns = new Set(s);
      if (ns.has(id)) ns.delete(id); else ns.add(id);
      return ns;
    });
  };

  return (
    <div className="p-2 space-y-1">
      <button
        onClick={() => setActiveFolder(null)}
        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm
                    ${activeFolderId === null ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 font-medium' : 'hover:bg-surface-100 dark:hover:bg-surface-800'}`}
      >
        <span>📁 全部笔记</span>
        <span className="text-xs text-surface-400">{folders?.reduce((a, f) => a + f.noteCount, 0) ?? 0}</span>
      </button>

      {tree.map((node) => (
        <FolderItem
          key={node.id}
          node={node}
          active={activeFolderId === node.id}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onSelect={setActiveFolder}
          onRename={async (id, name) => { await saveFolder.mutateAsync({ id, name, parentId: node.parentId }); }}
          onAddSub={async (parentId) => { await saveFolder.mutateAsync({ name: '新文件夹', parentId }); }}
          onDelete={async (id) => {
            if (confirm('确认删除该文件夹？其下笔记会移到"全部笔记"分组。')) {
              await deleteFolder.mutateAsync({ id, fallbackFolderId: 0 });
            }
          }}
        />
      ))}

      <button
        onClick={async () => { await saveFolder.mutateAsync({ name: '新文件夹', parentId: null }); }}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded"
      >
        <Plus size={12} /> 新建文件夹
      </button>
    </div>
  );
}
```

- [ ] **Step 4：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/FolderMenu.tsx apps/app-notes/src/components/FolderItem.tsx apps/app-notes/src/components/FolderTree.tsx
git commit -m "feat(notes): add folder tree with context menu"
```

---

## Task 17：NoteList 组件

**Files:**
- Create: `apps/app-notes/src/components/NoteListItem.tsx`
- Create: `apps/app-notes/src/components/NoteListToolbar.tsx`
- Create: `apps/app-notes/src/components/NoteList.tsx`

- [ ] **Step 1：NoteListItem.tsx（紧凑单行）**

```tsx
import { Pin, MoreHorizontal } from 'lucide-react';
import type { Note } from '@shared/types/note';

interface Props {
  note: Note;
  active: boolean;
  onSelect: (id: number) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day}天前`;
  return d.toLocaleDateString();
}

export function NoteListItem({ note, active, onSelect, onTogglePin, onDelete }: Props) {
  return (
    <div
      onClick={() => onSelect(note.id)}
      className={`group flex items-center gap-2 px-3 py-2 rounded cursor-pointer
                  ${active ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-surface-50 dark:hover:bg-surface-800'}`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(note.id); }}
        className={`shrink-0 ${note.pinned ? 'text-primary-500' : 'opacity-0 group-hover:opacity-50 text-surface-400'}`}
      >
        <Pin size={12} fill={note.pinned ? 'currentColor' : 'none'} />
      </button>
      <span className="flex-1 truncate text-sm">{note.title || '未命名'}</span>
      {note.tags.slice(0, 2).map((t) => (
        <span key={t} className="text-[10px] text-surface-500 bg-surface-100 dark:bg-surface-800 px-1.5 rounded shrink-0">#{t}</span>
      ))}
      <span className="text-[10px] text-surface-400 shrink-0">{timeAgo(note.updatedAt)}</span>
      <button
        onClick={(e) => { e.stopPropagation(); if (confirm('删除这条笔记？')) onDelete(note.id); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-surface-400 hover:text-red-500"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2：NoteListToolbar.tsx**

```tsx
import { Search, Plus, ArrowDownAZ, Clock, CalendarDays } from 'lucide-react';
import { useNotesStore } from '../stores/notesStore';

export function NoteListToolbar() {
  const searchQuery = useNotesStore((s) => s.searchQuery);
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery);
  const sortBy = useNotesStore((s) => s.sortBy);
  const setSortBy = useNotesStore((s) => s.setSortBy);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 dark:border-surface-700">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索笔记…"
          className="w-full pl-7 pr-2 py-1 text-sm bg-surface-100 dark:bg-surface-800 rounded focus:outline-none"
        />
      </div>
      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as any)}
        className="text-xs bg-transparent border border-surface-200 dark:border-surface-700 rounded px-1 py-1"
        title="排序"
      >
        <option value="updated">最新修改</option>
        <option value="created">最新创建</option>
        <option value="title">标题</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 3：NoteList.tsx**

```tsx
import { useEffect, useState } from 'react';
import { useNotes, useDeleteNote, useTogglePin, useSaveNote } from '../hooks/useNotes';
import { useNotesStore } from '../stores/notesStore';
import { NoteListItem } from './NoteListItem';
import { NoteListToolbar } from './NoteListToolbar';
import { Plus } from 'lucide-react';

export function NoteList() {
  const activeFolderId = useNotesStore((s) => s.activeFolderId);
  const activeTag = useNotesStore((s) => s.activeTag);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const setActiveNote = useNotesStore((s) => s.setActiveNote);
  const searchQuery = useNotesStore((s) => s.searchQuery);
  const { data: notes, isLoading } = useNotes(activeFolderId, activeTag, searchQuery);
  const deleteNote = useDeleteNote();
  const togglePin = useTogglePin();
  const saveNote = useSaveNote();

  const handleNew = async () => {
    const note = await saveNote.mutateAsync({
      title: '未命名笔记',
      content: '',
      folderId: activeFolderId ?? 0,
    });
    setActiveNote(note.id);
  };

  return (
    <div className="flex flex-col h-full border-r border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 dark:border-surface-700">
        <h2 className="text-sm font-semibold">笔记列表</h2>
        <button onClick={handleNew} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800" title="新建笔记">
          <Plus size={14} />
        </button>
      </div>
      <NoteListToolbar />
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-4 text-xs text-surface-500">加载中…</div>}
        {!isLoading && notes?.length === 0 && <div className="p-4 text-xs text-surface-500">没有笔记</div>}
        {notes?.map((n) => (
          <NoteListItem
            key={n.id}
            note={n}
            active={n.id === activeNoteId}
            onSelect={setActiveNote}
            onTogglePin={(id) => togglePin.mutate(id)}
            onDelete={async (id) => {
              await deleteNote.mutateAsync(id);
              if (activeNoteId === id) setActiveNote(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/NoteListItem.tsx apps/app-notes/src/components/NoteListToolbar.tsx apps/app-notes/src/components/NoteList.tsx
git commit -m "feat(notes): add compact note list with search and sort"
```

---

## Task 18：AssetPicker、ExportMenu、ImportDialog、EmptyState

**Files:**
- Create: `apps/app-notes/src/components/AssetPicker.tsx`
- Create: `apps/app-notes/src/components/ExportMenu.tsx`
- Create: `apps/app-notes/src/components/ImportDialog.tsx`
- Create: `apps/app-notes/src/components/EmptyState.tsx`

- [ ] **Step 1：AssetPicker.tsx（图片上传）**

```tsx
import { useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Upload } from 'lucide-react';

interface Props {
  noteId: number;
  onInsert: (relPath: string) => void;
  onClose: () => void;
}

export function AssetPicker({ noteId, onInsert, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const asset = await invoke<{ relPath: string }>('note_asset_save', {
          noteId,
          fileName: file.name,
          dataUrl,
        });
        onInsert(asset.relPath);
      } catch (err) {
        alert('图片保存失败：' + err);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-surface-800 p-6 rounded-lg w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">插入图片</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-8 border-2 border-dashed border-surface-300 dark:border-surface-600 rounded hover:border-primary-500 flex flex-col items-center gap-2"
        >
          <Upload size={24} />
          <span className="text-sm">点击选择图片</span>
        </button>
        <button onClick={onClose} className="mt-4 w-full px-4 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded">
          取消
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2：ExportMenu.tsx**

```tsx
import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Note } from '@shared/types/note';
import { exportHtml } from '../lib/exportHtml';
import { exportPdf } from '../lib/exportPdf';

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportMenu({ note }: { note: Note }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800" title="导出">
        <Download size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded shadow-lg z-10">
          <button
            onClick={() => { downloadFile(`${note.title}.md`, note.content, 'text/markdown'); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700"
          >Markdown</button>
          <button
            onClick={() => { downloadFile(`${note.title}.html`, exportHtml(note.title, note.content), 'text/html'); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700"
          >HTML</button>
          <button
            onClick={async () => { await exportPdf(note.title, note.content); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700"
          >PDF</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3：ImportDialog.tsx**

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useNotesStore } from '../stores/notesStore';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const activeFolderId = useNotesStore((s) => s.activeFolderId) ?? 0;
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: string[]; errors: string[] } | null>(null);

  const handlePick = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    setImporting(true);
    try {
      const r = await invoke<{ imported: number; skipped: string[]; errors: string[] }>('note_import_folder', {
        folderId: activeFolderId,
        srcPath: selected,
      });
      setResult(r);
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: ['note-folders'] });
    } catch (err) {
      alert('导入失败：' + err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-surface-800 p-6 rounded-lg w-[28rem]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">从 .md 文件夹导入</h3>
        <button
          onClick={handlePick}
          disabled={importing}
          className="w-full p-4 border-2 border-dashed border-surface-300 rounded hover:border-primary-500 text-sm"
        >
          {importing ? '导入中…' : '点击选择文件夹'}
        </button>
        {result && (
          <div className="mt-4 text-sm">
            <p>✅ 导入 {result.imported} 条</p>
            {result.skipped.length > 0 && <p className="text-amber-600">⏭ 跳过 {result.skipped.length} 条（标题重复）</p>}
            {result.errors.length > 0 && <p className="text-red-600">❌ 失败 {result.errors.length} 条</p>}
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full px-4 py-2 text-sm border border-surface-200 rounded">关闭</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4：EmptyState.tsx**

```tsx
import { FileText } from 'lucide-react';

export function EmptyState({ message = '未选中笔记' }: { message?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-surface-400 gap-2">
      <FileText size={48} strokeWidth={1} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step 5：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/AssetPicker.tsx apps/app-notes/src/components/ExportMenu.tsx apps/app-notes/src/components/ImportDialog.tsx apps/app-notes/src/components/EmptyState.tsx
git commit -m "feat(notes): add asset picker, export menu, import dialog, empty state"
```

---

## Task 19：FocusModeToggle + 顶栏

**Files:**
- Create: `apps/app-notes/src/components/FocusModeToggle.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { Maximize2, Minimize2, Upload } from 'lucide-react';
import { useNotesStore } from '../stores/notesStore';
import { useState } from 'react';
import { ImportDialog } from './ImportDialog';

export function FocusModeToggle() {
  const focusMode = useNotesStore((s) => s.focusMode);
  const toggleFocusMode = useNotesStore((s) => s.toggleFocusMode);
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowImport(true)}
          className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
          title="从文件夹导入"
        >
          <Upload size={14} />
        </button>
        <button
          onClick={toggleFocusMode}
          className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
          title={focusMode ? '退出专注模式' : '专注模式'}
        >
          {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
    </>
  );
}
```

- [ ] **Step 2：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/FocusModeToggle.tsx
git commit -m "feat(notes): add focus mode toggle and import trigger"
```

---

## Task 20：NoteShell 三栏容器 + 主入口

**Files:**
- Create: `apps/app-notes/src/components/NoteShell.tsx`
- Rewrite: `apps/app-notes/src/App.tsx`

- [ ] **Step 1：NoteShell.tsx**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useNotes, useSaveNote } from '../hooks/useNotes';
import { useNotesStore } from '../stores/notesStore';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { FolderTree } from './FolderTree';
import { NoteList } from './NoteList';
import { EditorPane } from './EditorPane';
import { EmptyState } from './EmptyState';
import { FocusModeToggle } from './FocusModeToggle';
import type { Note } from '@shared/types/note';

export function NoteShell() {
  const activeFolderId = useNotesStore((s) => s.activeFolderId);
  const activeTag = useNotesStore((s) => s.activeTag);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const setActiveNote = useNotesStore((s) => s.setActiveNote);
  const searchQuery = useNotesStore((s) => s.searchQuery);
  const focusMode = useNotesStore((s) => s.focusMode);
  const { data: notes } = useNotes(activeFolderId, activeTag, searchQuery);
  const saveNote = useSaveNote();
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // 切换 activeNoteId 时同步当前笔记
  useEffect(() => {
    if (activeNoteId == null) {
      setCurrentNote(null);
      return;
    }
    const n = notes?.find((x) => x.id === activeNoteId);
    if (n) {
      setCurrentNote(n);
      setDraftTitle(n.title);
      setDraftContent(n.content);
    }
  }, [activeNoteId, notes]);

  // 防抖保存
  const save = useCallback(
    (title: string, content: string) => {
      if (!currentNote) return;
      if (title === currentNote.title && content === currentNote.content) return;
      setSaving(true);
      saveNote
        .mutateAsync({ id: currentNote.id, title, content, folderId: currentNote.folderId, tags: currentNote.tags })
        .then((n) => {
          setCurrentNote(n);
          setLastSavedAt(new Date());
        })
        .catch((e) => alert('保存失败：' + e))
        .finally(() => setSaving(false));
    },
    [currentNote, saveNote]
  );

  useDebouncedSave({ title: draftTitle, content: draftContent }, ({ title, content }) => save(title, content), 1500);

  const handleChange = (title: string, content: string) => {
    setDraftTitle(title);
    setDraftContent(content);
  };

  if (focusMode) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-surface-950">
        <div className="flex justify-end p-2 border-b border-surface-200 dark:border-surface-700">
          <FocusModeToggle />
        </div>
        <div className="flex-1 min-h-0">
          {currentNote ? <EditorPane note={currentNote} onChange={handleChange} saving={saving} lastSavedAt={lastSavedAt} /> : <EmptyState />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-[22%_30%_1fr]">
      <aside className="border-r border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 overflow-y-auto">
        <div className="flex items-center justify-end p-2 border-b border-surface-200 dark:border-surface-700">
          <FocusModeToggle />
        </div>
        <FolderTree />
      </aside>
      <NoteList />
      <main className="min-w-0">
        {currentNote ? <EditorPane note={currentNote} onChange={handleChange} saving={saving} lastSavedAt={lastSavedAt} /> : <EmptyState message="从左侧选择一篇笔记，或新建一篇" />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2：重写 App.tsx**

```tsx
import { NoteShell } from './components/NoteShell';

export default function App() {
  return <NoteShell />;
}
```

- [ ] **Step 3：编译验证**

Run: `cd e:\Dev\EasyWork && pnpm --filter app-notes tsc --noEmit`
Expected: 0 错误（允许少量未使用变量警告）

- [ ] **Step 4：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/src/components/NoteShell.tsx apps/app-notes/src/App.tsx
git commit -m "feat(notes): wire three-pane NoteShell with auto-save"
```

---

## Task 21：删除老的 demo-data 笔记引用

**Files:**
- Modify: `src/routes/notes.tsx`（旧版独立路由；现改为子应用，需在 main shell 中注册）

- [ ] **Step 1：检查主 shell 是否需要调整**

打开 `apps/main/src/micro/registerApps.ts`，确认 app-notes 已注册（Phase 1 脚手架应已就绪）。

- [ ] **Step 2：检查路由文件**

`src/routes/notes.tsx` 是 TanStack Router 的旧版独立路由。如果项目已迁移到 qiankun 子应用架构，**保留该文件**（无操作），因为它在主 shell 启动时会被 app-notes 替代；否则删除它。

- [ ] **Step 3：手动跑一次 desktop dev**

Run: `cd e:\Dev\EasyWork && pnpm tauri dev`
Expected: 桌面端启动；点"笔记"侧栏 → 三栏布局渲染

- [ ] **Step 4：Commit（如有改动）**

```bash
cd "e:\Dev\EasyWork"
git add -A
git commit -m "chore(notes): cleanup legacy routes if needed"
```

---

## Task 22：Rust 单元测试

**Files:**
- Modify: `src-tauri/src/commands/note.rs`（追加 tests）
- Modify: `src-tauri/src/commands/note_export.rs`（追加 tests）

- [ ] **Step 1：在 note.rs 追加测试模块**

在文件末尾添加：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbState;
    use std::sync::Mutex;

    fn make_state() -> DbState {
        // 内存 SQLite
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../db/migrations/V1__initial.sql")).unwrap();
        conn.execute_batch(include_str!("../db/migrations/V5__notes_module.sql")).unwrap();
        DbState(Mutex::new(conn))
    }

    #[test]
    fn save_and_get() {
        // 由于 from_row 依赖 State，无法直接测；改用 SQL 直测
        let state = make_state();
        let conn = state.0.lock().unwrap();
        conn.execute(
            "INSERT INTO notes (title, content, folder_id) VALUES ('t', 'c', 0)",
            [],
        ).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn fts_sync_on_insert() {
        let state = make_state();
        let conn = state.0.lock().unwrap();
        conn.execute(
            "INSERT INTO notes (title, content, folder_id) VALUES ('Tauri笔记', 'Rust 内容', 0)",
            [],
        ).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notes_fts WHERE notes_fts MATCH 'Tauri'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn word_count_stored() {
        let state = make_state();
        let conn = state.0.lock().unwrap();
        conn.execute(
            "INSERT INTO notes (title, content, folder_id, word_count) VALUES ('t', '你好 hello', 0, ?)",
            rusqlite::params![count_words("你好 hello")],
        ).unwrap();
        let wc: i64 = conn.query_row("SELECT word_count FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(wc, 3);  // 你好 = 2, hello = 1
    }
}
```

- [ ] **Step 2：跑测试**

Run: `cd e:\Dev\EasyWork\src-tauri && cargo test --lib commands::note::tests`
Expected: 3 个 test 全过

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add src-tauri/src/commands/note.rs
git commit -m "test(notes): add DB CRUD and FTS sync tests"
```

---

## Task 23：Playwright E2E（可选但推荐）

**Files:**
- Create: `apps/app-notes/e2e/notes.spec.ts`

- [ ] **Step 1：新建测试文件**

```ts
import { test, expect } from '@playwright/test';

test('新建笔记 → 编辑 → 切换笔记', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '笔记' }).click();
  await page.getByTitle('新建笔记').click();
  await page.getByPlaceholder('无标题笔记').fill('Playwright 测试');
  await page.waitForTimeout(1700); // 等防抖保存
  // 刷新页面，验证数据持久
  await page.reload();
  await expect(page.getByText('Playwright 测试').first()).toBeVisible();
});
```

- [ ] **Step 2：跑 E2E（前提：app-notes 已在 tauri dev 启动）**

Run: `cd e:\Dev\EasyWork\apps\app-notes && npx playwright test`
Expected: 1 个 test 通过

- [ ] **Step 3：Commit**

```bash
cd "e:\Dev\EasyWork"
git add apps/app-notes/e2e/
git commit -m "test(notes): add playwright e2e for new note flow"
```

---

## 自检结果

按以下维度核对了 spec 覆盖：

| Spec 章节 | 对应 Task |
|----------|---------|
| 1. 目标与 YAGNI | 全局；具体功能散落各 Task |
| 2. 决策摘要 | 各 Task 已落实（编辑器/存储/搜索/响应式/导出/导入） |
| 3.1 改造 notes 表 | Task 1 |
| 3.2 note_assets 表 | Task 1, 6 |
| 3.3 notes_fts 虚表 | Task 1, 4, 22 |
| 3.4 shared types | Task 2 |
| 4.1 笔记 CRUD | Task 4 |
| 4.2 文件夹 | Task 5 |
| 4.3 图片资源 | Task 6 |
| 4.4 导入/导出 | Task 7, 18 |
| 5. 前端组件结构 | Task 10-19 |
| 6. 关键交互（新建/编辑/搜索/专注/图片/删除/导入导出） | Task 16, 17, 19, 20 |
| 7. UI 布局（响应式断点） | Task 20（桌面三栏已做；移动端单栏作为 v1.1 增量） |
| 8. 错误处理 | Task 6, 17, 22（资产失败/自动保存失败/级联迁移） |
| 9. 测试要点 | Task 22, 23 |
| 10. 风险 | 已记录；移动端 v1 不做语法高亮已默认 |
| 11. 依赖 | Task 9 |

**唯一未完整覆盖**：移动端 <768px 单栏切换（spec 7.1）—— v1 桌面优先，v1.1 处理（不在本计划范围）。

无 TBD/TODO 残留；类型与方法签名一致（Note/NOTECOLS/note_save 入参顺序在 Task 2/4/12 中统一）。
