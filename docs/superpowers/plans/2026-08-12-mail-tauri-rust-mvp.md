# 邮箱模块重构 MVP 实施计划（P0-P12）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将邮箱模块从 Supabase Edge Function + Postgres 架构迁移到 Tauri 2 + Rust 原生实现（Windows 桌面），具备多账户统一收件箱、HTML 签名、响应式 UI。

**Architecture:** Tauri Rust 后端承载 IMAP/SMTP 协议 + 本地 SQLite 存储 + OS Keychain 凭证；前端仅新增 mailApi.ts 适配层，UI 组件零改动；Supabase 仅保留 Auth。

**Tech Stack:** Tauri 2, Rust (async-imap, lettre, mail-parser, rusqlite, keyring), React, TypeScript, TanStack Query, shadcn/ui

**Design Spec:** `docs/superpowers/specs/2026-08-12-mail-tauri-rust-redesign-design.md`

---

## 文件结构

### Rust 后端（src-tauri/）

| 文件 | 职责 | 操作 |
|------|------|------|
| `Cargo.toml` | 依赖声明 | 修改 |
| `src/lib.rs` | 入口 + 命令注册 | 修改 |
| `src/mail/mod.rs` | 模块声明 | 新建 |
| `src/mail/types.rs` | DTO 结构体（serde 序列化） | 新建 |
| `src/mail/error.rs` | MailError 枚举 | 新建 |
| `src/mail/db.rs` | SQLite 连接 + DDL + 迁移 | 新建 |
| `src/mail/db_queries.rs` | DAO 查询函数 | 新建 |
| `src/mail/creds.rs` | keyring 凭证存储 | 新建 |
| `src/mail/imap.rs` | IMAP adapter（async-imap 封装） | 新建 |
| `src/mail/smtp.rs` | SMTP adapter（lettre 封装） | 新建 |
| `src/mail/mime.rs` | MIME 解析（mail-parser） | 新建 |
| `src/mail/service.rs` | 领域服务（编排同步/发送/文件夹） | 新建 |
| `src/mail/scheduler.rs` | tokio 定时调度 | 新建 |
| `src/mail/events.rs` | 事件总线（app.emit） | 新建 |
| `src/commands.rs` | Tauri invoke 命令处理 | 新建 |
| `capabilities/default.json` | 桌面权限 | 修改 |
| `capabilities/mobile.json` | Android 权限（预留） | 新建 |
| `tauri.conf.json` | CSP 收紧 | 修改 |

### 前端（src/features/mail/）

| 文件 | 职责 | 操作 |
|------|------|------|
| `mailApi.ts` | invoke() 适配层 | 新建 |
| `useMail.ts` | 数据源从 supabase 切到 mailApi | 修改 |
| `useEmailTemplates.ts` | 模板/签名数据源切换 | 修改 |
| `MailAccountTree.tsx` | 统一收件箱虚拟节点 + 响应式抽屉 | 修改 |
| `MailComposer.tsx` | 签名预览/选择 | 修改 |
| `Mail.tsx` | 响应式布局（平板/手机断点） | 修改 |
| `EmailSignatureDialog.tsx` | 富文本编辑器 | 修改 |
| `MailList.tsx` | 来源账户标签 | 修改 |
| `MailReader.tsx` | 附件路径改本地 | 修改 |

### 配置

| 文件 | 操作 |
|------|------|
| `package.json` | 添加 @tauri-apps/plugin-dialog, plugin-notification |
| `src/lib/supabase.ts` | 移除邮件本地中继 hack |
| `src/features/realtime/useRealtimeSync.ts` | 移除 easywork-mail channel |

---

## P0: 依赖接入

### Task 1: 更新 Cargo.toml 添加 Rust 依赖

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 读取当前 Cargo.toml**

Run: `Read src-tauri/Cargo.toml`

- [ ] **Step 2: 替换 dependencies 段**

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"

tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "time", "sync", "fs", "io-util"] }

async-imap = { version = "0.10", default-features = false, features = ["runtime-tokio"] }
lettre = { version = "0.11", default-features = false, features = ["tokio1", "tokio1-rustls-tls", "smtp-transport", "builder", "hostname", "pool"] }
mail-parser = "0.11"

rustls = { version = "0.23", default-features = false, features = ["ring", "logging", "std", "tls12"] }
tokio-rustls = { version = "0.26", default-features = false, features = ["ring", "logging", "tls12"] }
rustls-platform-verifier = "0.5"

rusqlite = { version = "0.32", features = ["bundled"] }
keyring = "3"
ammonia = "4"

tracing = "0.1"
tracing-subscriber = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }

[target.'cfg(target_os = "android")'.dependencies]
tauri-plugin-background-service = "1"
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 依赖下载并编译通过（首次较慢）

- [ ] **Step 4: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(mail): P0 添加 Rust 邮件依赖"
```

### Task 2: 更新前端依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 Tauri 插件 JS 包**

Run: `pnpm add @tauri-apps/plugin-dialog @tauri-apps/plugin-notification`

- [ ] **Step 2: 验证 package.json**

Run: `Read package.json` — 确认 dependencies 中含 `@tauri-apps/plugin-dialog` 和 `@tauri-apps/plugin-notification`

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(mail): P0 添加前端 Tauri 插件依赖"
```

### Task 3: 配置 Tauri capabilities

**Files:**
- Modify: `src-tauri/capabilities/default.json`
- Create: `src-tauri/capabilities/mobile.json`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 更新桌面 capabilities**

`src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "notification:default"
  ]
}
```

- [ ] **Step 2: 创建 mobile capabilities**

`src-tauri/capabilities/mobile.json`:
```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "notification:default"
  ]
}
```

- [ ] **Step 3: 提交**

```bash
git add src-tauri/capabilities/
git commit -m "feat(mail): P0 配置 Tauri capabilities"
```

---

## P1: SQLite 数据层

### Task 4: 创建 mail 模块骨架

**Files:**
- Create: `src-tauri/src/mail/mod.rs`
- Create: `src-tauri/src/mail/error.rs`
- Create: `src-tauri/src/mail/types.rs`

- [ ] **Step 1: 创建模块声明**

`src-tauri/src/mail/mod.rs`:
```rust
pub mod db;
pub mod db_queries;
pub mod creds;
pub mod imap;
pub mod smtp;
pub mod mime;
pub mod service;
pub mod scheduler;
pub mod events;
pub mod error;
pub mod types;
```

- [ ] **Step 2: 创建错误类型**

`src-tauri/src/mail/error.rs`:
```rust
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct MailError {
    pub code: String,
    pub message: String,
}

impl MailError {
    pub fn new(code: &str, message: &str) -> Self {
        Self { code: code.to_string(), message: message.to_string() }
    }
}

impl From<rusqlite::Error> for MailError {
    fn from(e: rusqlite::Error) -> Self {
        MailError::new("DB_ERROR", &format!("数据库错误: {}", e))
    }
}

impl From<std::io::Error> for MailError {
    fn from(e: std::io::Error) -> Self {
        MailError::new("IO_ERROR", &format!("IO错误: {}", e))
    }
}

impl From<lettre::transport::smtp::Error> for MailError {
    fn from(e: lettre::transport::smtp::Error) -> Self {
        MailError::new("SMTP_ERROR", &format!("SMTP错误: {}", e))
    }
}

impl From<Box<dyn std::error::Error>> for MailError {
    fn from(e: Box<dyn std::error::Error>) -> Self {
        MailError::new("UNKNOWN", &format!("{}", e))
    }
}

pub type MailResult<T> = Result<T, MailError>;
```

- [ ] **Step 3: 创建 DTO 类型**

`src-tauri/src/mail/types.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAccount {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub username: Option<String>,
    pub imap_host: String,
    pub imap_port: i64,
    pub smtp_host: String,
    pub smtp_port: i64,
    pub use_ssl: bool,
    pub auth_type: String,
    pub signature_id: Option<String>,
    pub signature_auto_append_new: bool,
    pub signature_auto_append_reply: bool,
    pub last_synced_at: Option<String>,
    pub sync_enabled: bool,
    pub sync_interval_mins: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailFolder {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub imap_path: String,
    pub parent_path: Option<String>,
    pub is_system: bool,
    pub folder_type: String,
    pub sort_order: i64,
    pub unread_count: i64,
    pub total_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Email {
    pub id: String,
    pub account_id: String,
    pub folder_id: Option<String>,
    pub message_id: Option<String>,
    pub uid: Option<i64>,
    pub from_address: Option<String>,
    pub to_addresses: Option<String>,
    pub cc_addresses: Option<String>,
    pub subject: Option<String>,
    pub preview_text: Option<String>,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub has_attachments: bool,
    pub is_read: bool,
    pub is_starred: bool,
    pub received_at: Option<String>,
    pub created_at: String,
    pub account_email: Option<String>,
    pub account_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAttachment {
    pub id: String,
    pub email_id: String,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: Option<i64>,
    pub file_path: String,
    pub is_inline: bool,
    pub content_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailSignature {
    pub id: String,
    pub name: String,
    pub html: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailTemplate {
    pub id: String,
    pub name: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub fetched: i64,
    pub inserted: i64,
    pub folders: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase")]
pub enum SyncProgress {
    #[serde(rename = "connecting")]
    Connecting { account_id: String },
    #[serde(rename = "folder")]
    Folder { account_id: String, path: String, done: i64, total: i64 },
    #[serde(rename = "done")]
    Done { account_id: String, fetched: i64, inserted: i64 },
    #[serde(rename = "error")]
    Error { account_id: String, message: String },
    #[serde(rename = "new-mail")]
    NewMail { account_id: String, subject: String, from: String },
}
```

- [ ] **Step 4: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译通过（mod 文件暂为空，后续填充）

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/mail/
git commit -m "feat(mail): P1 创建 mail 模块骨架 + DTO + 错误类型"
```

### Task 5: 实现 SQLite DDL + 迁移

**Files:**
- Create: `src-tauri/src/mail/db.rs`

- [ ] **Step 1: 实现 DB 初始化 + DDL**

`src-tauri/src/mail/db.rs`:
```rust
use rusqlite::{Connection, params};
use std::path::Path;
use crate::mail::error::{MailError, MailResult};

const SCHEMA_VERSION: &str = "1";

pub fn init_db(db_path: &Path) -> MailResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_many("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> MailResult<()> {
    let current: String = conn.query_row(
        "SELECT value FROM mail_meta WHERE key='schema_version'",
        [], |row| row.get(0)
    ).unwrap_or_else(|_| "0".to_string());

    if current == SCHEMA_VERSION {
        return Ok(());
    }

    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS mail_meta (key TEXT PRIMARY KEY, value TEXT);

        CREATE TABLE IF NOT EXISTS email_accounts (
            id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT, username TEXT,
            credential_ref TEXT NOT NULL, imap_host TEXT NOT NULL, imap_port INTEGER NOT NULL DEFAULT 993,
            smtp_host TEXT NOT NULL, smtp_port INTEGER NOT NULL DEFAULT 465, use_ssl INTEGER NOT NULL DEFAULT 1,
            auth_type TEXT NOT NULL DEFAULT 'password', signature_id TEXT,
            signature_auto_append_new INTEGER DEFAULT 1, signature_auto_append_reply INTEGER DEFAULT 1,
            last_synced_at TEXT, last_synced_uid INTEGER, sync_enabled INTEGER NOT NULL DEFAULT 1,
            sync_interval_mins INTEGER DEFAULT 5, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_folders (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, imap_path TEXT NOT NULL,
            parent_path TEXT, is_system INTEGER NOT NULL DEFAULT 0, folder_type TEXT NOT NULL DEFAULT 'other',
            sort_order INTEGER NOT NULL DEFAULT 0, last_uid INTEGER, uid_validity INTEGER,
            unread_count INTEGER NOT NULL DEFAULT 0, total_count INTEGER NOT NULL DEFAULT 0,
            synced_at TEXT, created_at TEXT NOT NULL, UNIQUE (account_id, imap_path)
        );
        CREATE INDEX IF NOT EXISTS idx_folders_account ON email_folders(account_id);

        CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, folder_id TEXT, message_id TEXT, uid INTEGER,
            from_address TEXT, to_addresses TEXT, cc_addresses TEXT, subject TEXT, preview_text TEXT,
            body_text TEXT, body_html TEXT, has_attachments INTEGER DEFAULT 0, is_read INTEGER DEFAULT 0,
            is_starred INTEGER DEFAULT 0, sync_state INTEGER DEFAULT 0, received_at TEXT, created_at TEXT NOT NULL,
            UNIQUE (account_id, message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder_id, received_at DESC);
        CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id, received_at DESC);

        CREATE TABLE IF NOT EXISTS email_attachments (
            id TEXT PRIMARY KEY, email_id TEXT NOT NULL, filename TEXT, mime_type TEXT, size INTEGER,
            file_path TEXT NOT NULL, is_inline INTEGER DEFAULT 0, content_id TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_att_email ON email_attachments(email_id);

        CREATE TABLE IF NOT EXISTS mail_sync_state (
            account_id TEXT NOT NULL, folder_id TEXT NOT NULL, last_uid INTEGER, uid_validity INTEGER,
            syncing INTEGER DEFAULT 0, last_error TEXT, updated_at TEXT,
            PRIMARY KEY (account_id, folder_id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
            subject, from_address, preview_text, body_text,
            content='emails', content_rowid='rowid'
        );

        CREATE TABLE IF NOT EXISTS email_templates (
            id TEXT PRIMARY KEY, name TEXT, subject TEXT, body TEXT, created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS email_signatures (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, html TEXT NOT NULL, is_default INTEGER DEFAULT 0,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
    "#)?;

    conn.execute(
        "INSERT OR REPLACE INTO mail_meta (key, value) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION]
    )?;
    Ok(())
}
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mail/db.rs
git commit -m "feat(mail): P1 SQLite DDL + 迁移"
```

### Task 6: 实现 DAO 查询函数

**Files:**
- Create: `src-tauri/src/mail/db_queries.rs`

- [ ] **Step 1: 实现账户/文件夹查询**

`src-tauri/src/mail/db_queries.rs`:
```rust
use rusqlite::{Connection, params};
use crate::mail::error::{MailError, MailResult};
use crate::mail::types::*;

pub fn list_accounts(conn: &Connection) -> MailResult<Vec<EmailAccount>> {
    let mut stmt = conn.prepare("SELECT * FROM email_accounts ORDER BY created_at")?;
    let rows = stmt.query_map([], |row| {
        Ok(EmailAccount {
            id: row.get("id")?, email: row.get("email")?, display_name: row.get("display_name")?,
            username: row.get("username")?, credential_ref: row.get("credential_ref")?,
            imap_host: row.get("imap_host")?, imap_port: row.get("imap_port")?,
            smtp_host: row.get("smtp_host")?, smtp_port: row.get("smtp_port")?,
            use_ssl: row.get::<_, i64>("use_ssl")? != 0, auth_type: row.get("auth_type")?,
            signature_id: row.get("signature_id")?,
            signature_auto_append_new: row.get::<_, i64>("signature_auto_append_new")? != 0,
            signature_auto_append_reply: row.get::<_, i64>("signature_auto_append_reply")? != 0,
            last_synced_at: row.get("last_synced_at")?, sync_enabled: row.get::<_, i64>("sync_enabled")? != 0,
            sync_interval_mins: row.get("sync_interval_mins")?, created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn get_account(conn: &Connection, id: &str) -> MailResult<EmailAccount> {
    let mut stmt = conn.prepare("SELECT * FROM email_accounts WHERE id = ?1")?;
    let account = stmt.query_row(params![id], |row| {
        Ok(EmailAccount {
            id: row.get("id")?, email: row.get("email")?, display_name: row.get("display_name")?,
            username: row.get("username")?, credential_ref: row.get("credential_ref")?,
            imap_host: row.get("imap_host")?, imap_port: row.get("imap_port")?,
            smtp_host: row.get("smtp_host")?, smtp_port: row.get("smtp_port")?,
            use_ssl: row.get::<_, i64>("use_ssl")? != 0, auth_type: row.get("auth_type")?,
            signature_id: row.get("signature_id")?,
            signature_auto_append_new: row.get::<_, i64>("signature_auto_append_new")? != 0,
            signature_auto_append_reply: row.get::<_, i64>("signature_auto_append_reply")? != 0,
            last_synced_at: row.get("last_synced_at")?, sync_enabled: row.get::<_, i64>("sync_enabled")? != 0,
            sync_interval_mins: row.get("sync_interval_mins")?, created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }).map_err(MailError::from)?;
    Ok(account)
}

pub fn list_folders(conn: &Connection, account_id: Option<&str>) -> MailResult<Vec<EmailFolder>> {
    let mut stmt = if account_id.is_some() {
        conn.prepare("SELECT * FROM email_folders WHERE account_id = ?1 ORDER BY sort_order, name")?
    } else {
        conn.prepare("SELECT * FROM email_folders ORDER BY sort_order, name")?
    };
    let rows = if account_id.is_some() {
        stmt.query_map(params![account_id], map_folder)?
    } else {
        stmt.query_map([], map_folder)?
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

fn map_folder(row: &rusqlite::Row) -> rusqlite::Result<EmailFolder> {
    Ok(EmailFolder {
        id: row.get("id")?, account_id: row.get("account_id")?, name: row.get("name")?,
        imap_path: row.get("imap_path")?, parent_path: row.get("parent_path")?,
        is_system: row.get::<_, i64>("is_system")? != 0, folder_type: row.get("folder_type")?,
        sort_order: row.get("sort_order")?, unread_count: row.get("unread_count")?,
        total_count: row.get("total_count")?, created_at: row.get("created_at")?,
    })
}

pub fn insert_account(conn: &Connection, account: &EmailAccount) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_accounts (id, email, display_name, username, credential_ref, imap_host, imap_port,
         smtp_host, smtp_port, use_ssl, auth_type, sync_enabled, sync_interval_mins, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![account.id, account.email, account.display_name, account.username,
                account.credential_ref, account.imap_host, account.imap_port,
                account.smtp_host, account.smtp_port, account.use_ssl as i64, account.auth_type,
                account.sync_enabled as i64, account.sync_interval_mins, account.created_at, account.updated_at],
    )?;
    Ok(())
}

pub fn insert_folder(conn: &Connection, folder: &EmailFolder) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_folders (id, account_id, name, imap_path, parent_path, is_system, folder_type,
         sort_order, unread_count, total_count, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![folder.id, folder.account_id, folder.name, folder.imap_path, folder.parent_path,
                folder.is_system as i64, folder.folder_type, folder.sort_order,
                folder.unread_count, folder.total_count, folder.created_at],
    )?;
    Ok(())
}
```

- [ ] **Step 2: 实现邮件查询**

追加到 `db_queries.rs`:
```rust
pub fn list_messages(conn: &Connection, folder_id: &str, limit: i64, offset: i64) -> MailResult<Vec<Email>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails e LEFT JOIN email_accounts a ON e.account_id = a.id
         WHERE e.folder_id = ?1 ORDER BY e.received_at DESC LIMIT ?2 OFFSET ?3"
    )?;
    let rows = stmt.query_map(params![folder_id, limit, offset], map_email)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn list_unified_inbox(conn: &Connection, limit: i64, offset: i64) -> MailResult<Vec<Email>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails e
         JOIN email_folders f ON e.folder_id = f.id
         JOIN email_accounts a ON e.account_id = a.id
         WHERE f.folder_type = 'inbox'
         ORDER BY e.received_at DESC LIMIT ?1 OFFSET ?2"
    )?;
    let rows = stmt.query_map(params![limit, offset], map_email)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn unified_unread_count(conn: &Connection) -> MailResult<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM emails e JOIN email_folders f ON e.folder_id = f.id
         WHERE f.folder_type = 'inbox' AND e.is_read = 0",
        [], |row| row.get(0)
    )?;
    Ok(count)
}

pub fn get_message(conn: &Connection, id: &str) -> MailResult<Email> {
    conn.query_row(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails e LEFT JOIN email_accounts a ON e.account_id = a.id WHERE e.id = ?1",
        params![id], map_email
    ).map_err(MailError::from)
}

fn map_email(row: &rusqlite::Row) -> rusqlite::Result<Email> {
    Ok(Email {
        id: row.get("id")?, account_id: row.get("account_id")?, folder_id: row.get("folder_id")?,
        message_id: row.get("message_id")?, uid: row.get("uid")?,
        from_address: row.get("from_address")?, to_addresses: row.get("to_addresses")?,
        cc_addresses: row.get("cc_addresses")?, subject: row.get("subject")?,
        preview_text: row.get("preview_text")?, body_text: row.get("body_text")?,
        body_html: row.get("body_html")?, has_attachments: row.get::<_, i64>("has_attachments")? != 0,
        is_read: row.get::<_, i64>("is_read")? != 0, is_starred: row.get::<_, i64>("is_starred")? != 0,
        received_at: row.get("received_at")?, created_at: row.get("created_at")?,
        account_email: row.get("account_email")?, account_name: row.get("account_name")?,
    })
}

pub fn upsert_email(conn: &Connection, email: &Email) -> MailResult<()> {
    conn.execute(
        "INSERT INTO emails (id, account_id, folder_id, message_id, uid, from_address, to_addresses,
         cc_addresses, subject, preview_text, body_text, body_html, has_attachments, is_read, is_starred,
         received_at, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
         ON CONFLICT(account_id, message_id) DO UPDATE SET
         folder_id=excluded.folder_id, uid=excluded.uid, from_address=excluded.from_address,
         subject=excluded.subject, preview_text=excluded.preview_text, has_attachments=excluded.has_attachments",
        params![email.id, email.account_id, email.folder_id, email.message_id, email.uid,
                email.from_address, email.to_addresses, email.cc_addresses, email.subject,
                email.preview_text, email.body_text, email.body_html, email.has_attachments as i64,
                email.is_read as i64, email.is_starred as i64, email.received_at, email.created_at],
    )?;
    Ok(())
}

pub fn mark_read(conn: &Connection, id: &str, is_read: bool) -> MailResult<()> {
    conn.execute("UPDATE emails SET is_read = ?1, sync_state = 1 WHERE id = ?2",
        params![is_read as i64, id])?;
    Ok(())
}

pub fn toggle_star(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("UPDATE emails SET is_starred = NOT is_starred, sync_state = 1 WHERE id = ?1",
        params![id])?;
    Ok(())
}

pub fn delete_message(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM emails WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn folder_unread_counts(conn: &Connection, account_id: Option<&str>) -> MailResult<Vec<(String, i64)>> {
    let mut stmt = if account_id.is_some() {
        conn.prepare("SELECT id, unread_count FROM email_folders WHERE account_id = ?1")?
    } else {
        conn.prepare("SELECT id, unread_count FROM email_folders")?
    };
    let rows = if account_id.is_some() {
        stmt.query_map(params![account_id], |row| Ok((row.get(0)?, row.get(1)?)))?
    } else {
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}
```

- [ ] **Step 3: 实现签名/模板查询**

追加到 `db_queries.rs`:
```rust
pub fn list_signatures(conn: &Connection) -> MailResult<Vec<EmailSignature>> {
    let mut stmt = conn.prepare("SELECT * FROM email_signatures ORDER BY is_default DESC, name")?;
    let rows = stmt.query_map([], |row| {
        Ok(EmailSignature {
            id: row.get("id")?, name: row.get("name")?, html: row.get("html")?,
            is_default: row.get::<_, i64>("is_default")? != 0,
            created_at: row.get("created_at")?, updated_at: row.get("updated_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn save_signature(conn: &Connection, sig: &EmailSignature) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_signatures (id, name, html, is_default, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, html=excluded.html,
         is_default=excluded.is_default, updated_at=excluded.updated_at",
        params![sig.id, sig.name, sig.html, sig.is_default as i64, sig.created_at, sig.updated_at],
    )?;
    if sig.is_default {
        conn.execute("UPDATE email_signatures SET is_default = 0 WHERE id != ?1", params![sig.id])?;
    }
    Ok(())
}

pub fn delete_signature(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM email_signatures WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_account_signature(conn: &Connection, account_id: &str, signature_id: Option<&str>,
    auto_new: Option<bool>, auto_reply: Option<bool>) -> MailResult<()> {
    conn.execute(
        "UPDATE email_accounts SET signature_id = ?1,
         signature_auto_append_new = COALESCE(?2, signature_auto_append_new),
         signature_auto_append_reply = COALESCE(?3, signature_auto_append_reply),
         updated_at = ?4 WHERE id = ?5",
        params![signature_id, auto_new.map(|b| b as i64), auto_reply.map(|b| b as i64),
                chrono::Utc::now().to_rfc3339(), account_id],
    )?;
    Ok(())
}

pub fn list_templates(conn: &Connection) -> MailResult<Vec<EmailTemplate>> {
    let mut stmt = conn.prepare("SELECT * FROM email_templates ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(EmailTemplate {
            id: row.get("id")?, name: row.get("name")?, subject: row.get("subject")?,
            body: row.get("body")?, created_at: row.get("created_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}
```

- [ ] **Step 4: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/mail/db_queries.rs
git commit -m "feat(mail): P1 DAO 查询函数（账户/文件夹/邮件/签名/统一收件箱）"
```

---

## P2: 凭证存储

### Task 7: 实现 keyring 凭证存储

**Files:**
- Create: `src-tauri/src/mail/creds.rs`

- [ ] **Step 1: 实现 CredentialStore**

`src-tauri/src/mail/creds.rs`:
```rust
use keyring::Entry;
use crate::mail::error::{MailError, MailResult};

const SERVICE_NAME: &str = "easywork-mail";

pub struct CredentialStore;

impl CredentialStore {
    pub fn save_password(account_id: &str, password: &str) -> MailResult<()> {
        let entry = Entry::new(SERVICE_NAME, account_id)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法访问密钥库: {}", e)))?;
        entry.set_password(password)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法保存密码: {}", e)))?;
        Ok(())
    }

    pub fn get_password(account_id: &str) -> MailResult<String> {
        let entry = Entry::new(SERVICE_NAME, account_id)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法访问密钥库: {}", e)))?;
        entry.get_password()
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法读取密码: {}", e)))
    }

    pub fn delete_password(account_id: &str) -> MailResult<()> {
        let entry = Entry::new(SERVICE_NAME, account_id)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法访问密钥库: {}", e)))?;
        entry.delete_credential()
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法删除密码: {}", e)))?;
        Ok(())
    }

    pub fn credential_ref(account_id: &str) -> String {
        format!("{}:{}", SERVICE_NAME, account_id)
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mail/creds.rs
git commit -m "feat(mail): P2 keyring 凭证存储"
```

---

## P3: IMAP Adapter + 同步引擎

### Task 8: 实现 MIME 解析

**Files:**
- Create: `src-tauri/src/mail/mime.rs`

- [ ] **Step 1: 实现 MIME 解析 + 文件夹类型推断**

`src-tauri/src/mail/mime.rs`:
```rust
use mail_parser::{MessageParser, MimeHeaders, PartType};
use crate::mail::error::MailResult;

pub struct ParsedMail {
    pub subject: Option<String>,
    pub from_address: Option<String>,
    pub to_addresses: Vec<String>,
    pub cc_addresses: Vec<String>,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub preview_text: Option<String>,
    pub message_id: Option<String>,
    pub has_attachments: bool,
}

pub fn parse_message(raw: &[u8]) -> MailResult<ParsedMail> {
    let parsed = MessageParser::default().parse(raw)
        .ok_or_else(|| crate::mail::error::MailError::new("PARSE_ERROR", "无法解析邮件"))?;

    let from_address = parsed.from()
        .and_then(|a| a.first())
        .map(|addr| addr.address.clone().unwrap_or_default());

    let to_addresses = parsed.to()
        .map(|a| a.iter().filter_map(|addr| addr.address.clone()).collect())
        .unwrap_or_default();

    let cc_addresses = parsed.cc()
        .map(|a| a.iter().filter_map(|addr| addr.address.clone()).collect())
        .unwrap_or_default();

    let body_text = parsed.body_text(0).map(|s| s.to_string());
    let body_html = parsed.body_html(0).map(|s| s.to_string());

    let preview_text = body_text.as_ref()
        .map(|t| t.chars().take(200).collect())
        .or_else(|| body_html.as_ref().map(|h| h.chars().take(200).collect()));

    let has_attachments = parsed.attachments().iter().any(|a| {
        a.attachment_content_type().is_some()
    });

    Ok(ParsedMail {
        subject: parsed.subject().map(|s| s.to_string()),
        from_address,
        to_addresses,
        cc_addresses,
        body_text,
        body_html,
        preview_text,
        message_id: parsed.message_id().map(|s| s.to_string()),
        has_attachments,
    })
}

pub fn sanitize_html(html: &str) -> String {
    ammonia::Builder::default()
        .add_tags(&["style"])
        .add_tag_attribute_values("img", "loading", "lazy")
        .clean(html)
        .to_string()
}

pub fn infer_folder_type(imap_path: &str, flags: &[String]) -> &'static str {
    let path_upper = imap_path.to_uppercase();
    if flags.iter().any(|f| f.to_uppercase().contains("INBOX")) || path_upper == "INBOX" {
        return "inbox";
    }
    match path_upper.as_str() {
        "SENT" | "SENT ITEMS" | "SENT MESSAGES" | "已发送" => "sent",
        "DRAFTS" | "DRAFT" | "草稿" | "草稿箱" => "drafts",
        "TRASH" | "DELETED" | "DELETED ITEMS" | "已删除" | "垃圾箱" => "trash",
        "JUNK" | "SPAM" | "JUNK EMAIL" | "垃圾邮件" => "spam",
        _ => "other",
    }
}

pub fn folder_display_name(imap_path: &str, folder_type: &str) -> String {
    let mapping: &[(&str, &str)] = &[
        ("INBOX", "收件箱"), ("SENT", "已发送"), ("SENT ITEMS", "已发送"),
        ("SENT MESSAGES", "已发送"), ("DRAFTS", "草稿箱"), ("DRAFT", "草稿箱"),
        ("TRASH", "已删除"), ("DELETED", "已删除"), ("JUNK", "垃圾邮件"),
        ("SPAM", "垃圾邮件"),
    ];
    let path_upper = imap_path.to_uppercase();
    for (key, name) in mapping {
        if path_upper == *key { return name.to_string(); }
    }
    if folder_type == "inbox" { return "收件箱".to_string(); }
    imap_path.to_string()
}
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mail/mime.rs
git commit -m "feat(mail): P3 MIME 解析 + 文件夹类型推断"
```

### Task 9: 实现 IMAP Adapter

**Files:**
- Create: `src-tauri/src/mail/imap.rs`

- [ ] **Step 1: 实现 IMAP 连接 + 同步**

`src-tauri/src/mail/imap.rs`:
```rust
use async_imap::Session;
use async_imap::TlsStream;
use tokio::net::TcpStream;
use crate::mail::error::{MailError, MailResult};
use crate::mail::types::*;

type ImapSession = Session<TlsStream<TcpStream>>;

pub struct ImapAdapter {
    session: ImapSession,
}

const WINDOW: u32 = 200;
const HARD_CAP: u32 = 1000;

impl ImapAdapter {
    pub async fn connect(host: &str, port: u16, username: &str, password: &str) -> MailResult<Self> {
        let tls = async_native_tls::TlsConnector::new();
        let client = async_imap::connect((host, port), host, tls).await
            .map_err(|e| MailError::new("IMAP_CONNECT", &format!("IMAP连接失败: {}", e)))?;
        let session = client.login(username, password).await
            .map_err(|e| MailError::new("IMAP_AUTH", &format!("IMAP认证失败: {:?}", e.0)))?;
        Ok(Self { session })
    }

    pub async fn list_folders(&mut self) -> MailResult<Vec<(String, Vec<String>)>> {
        let mailboxes = self.session.list(None, Some("*")).await
            .map_err(|e| MailError::new("IMAP_LIST", &format!("列出文件夹失败: {}", e)))?;
        let mut result = Vec::new();
        for mbox in mailboxes {
            if let Ok(m) = mbox {
                if m.flags().iter().any(|f| matches!(f, async_imap::MailboxName::Atom(s) if s == "Noselect" || s == "NonExistent")) {
                    continue;
                }
                let path = m.name().to_string();
                let flags: Vec<String> = m.flags().map(|f| format!("{:?}", f)).collect();
                result.push((path, flags));
            }
        }
        Ok(result)
    }

    pub async fn select_folder(&mut self, path: &str) -> MailResult<(u32, u32)> {
        let mailbox = self.session.select(path).await
            .map_err(|e| MailError::new("IMAP_SELECT", &format!("选择文件夹失败: {}", e)))?;
        Ok((mailbox.uid_next.unwrap_or(0), mailbox.uid_validity.unwrap_or(0)))
    }

    pub async fn fetch_range(&mut self, start: u32, end: u32) -> MailResult<Vec<(u32, Vec<u8>, Vec<String>)>> {
        let range = format!("{}:{}", start, end);
        let mut stream = self.session.uid_fetch(range, "(UID FLAGS RFC822)").await
            .map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", e)))?;
        let mut result = Vec::new();
        while let Some(msg) = stream.next().await {
            if let Ok(msg) = msg {
                let uid = msg.uid.unwrap_or(0);
                let flags: Vec<String> = msg.flags().map(|f| format!("{:?}", f)).collect();
                if let Some(body) = msg.body() {
                    result.push((uid, body.to_vec(), flags));
                }
            }
        }
        Ok(result)
    }

    pub async fn search_alive_uids(&mut self, from_uid: u32) -> MailResult<Vec<u32>> {
        let criteria = format!("{}", from_uid);
        let uids = self.session.uid_search(criteria).await
            .map_err(|e| MailError::new("IMAP_SEARCH", &format!("搜索UID失败: {}", e)))?;
        Ok(uids)
    }

    pub async fn store_flag(&mut self, uid: u32, flag: &str, add: bool) -> MailResult<()> {
        let range = format!("{}", uid);
        let op = if add { "+FLAGS" } else { "-FLAGS" };
        let query = format!("({})", op);
        self.session.uid_store(range, &query, flag).await
            .map_err(|e| MailError::new("IMAP_STORE", &format!("设置标记失败: {}", e)))?;
        Ok(())
    }

    pub async fn append_to_sent(&mut self, raw_mail: &[u8]) -> MailResult<()> {
        self.session.append("Sent", raw_mail).await
            .map_err(|e| MailError::new("IMAP_APPEND", &format!("追加到已发送失败: {}", e)))?;
        Ok(())
    }

    pub async fn create_mailbox(&mut self, name: &str) -> MailResult<()> {
        self.session.create(name).await
            .map_err(|e| MailError::new("IMAP_CREATE", &format!("创建文件夹失败: {}", e)))?;
        Ok(())
    }

    pub async fn rename_mailbox(&mut self, from: &str, to: &str) -> MailResult<()> {
        self.session.rename(from, to).await
            .map_err(|e| MailError::new("IMAP_RENAME", &format!("重命名文件夹失败: {}", e)))?;
        Ok(())
    }

    pub async fn delete_mailbox(&mut self, name: &str) -> MailResult<()> {
        self.session.delete(name).await
            .map_err(|e| MailError::new("IMAP_DELETE", &format!("删除文件夹失败: {}", e)))?;
        Ok(())
    }
}

pub fn calc_fetch_range(last_uid: Option<u32>, uid_next: u32) -> (u32, u32) {
    match last_uid {
        Some(last) => {
            let start = last + 1;
            let end = uid_next.saturating_sub(1).max(start);
            let capped = (end - start + 1).min(HARD_CAP);
            (start, start + capped - 1)
        }
        None => {
            let end = uid_next.saturating_sub(1);
            let start = end.saturating_sub(WINDOW) + 1;
            (start, end)
        }
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mail/imap.rs
git commit -m "feat(mail): P3 IMAP adapter + 游标范围计算"
```

### Task 10: 实现同步服务

**Files:**
- Create: `src-tauri/src/mail/service.rs`
- Create: `src-tauri/src/mail/events.rs`

- [ ] **Step 1: 实现事件总线**

`src-tauri/src/mail/events.rs`:
```rust
use tauri::{AppHandle, Emitter};
use crate::mail::types::SyncProgress;

pub fn emit_progress(app: &AppHandle, progress: SyncProgress) {
    let _ = app.emit("mail://sync-progress", &progress);
}
```

- [ ] **Step 2: 实现同步服务**

`src-tauri/src/mail/service.rs`:
```rust
use rusqlite::Connection;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use crate::mail::creds::CredentialStore;
use crate::mail::db_queries;
use crate::mail::events::emit_progress;
use crate::mail::imap::{ImapAdapter, calc_fetch_range};
use crate::mail::mime::{parse_message, infer_folder_type, folder_display_name};
use crate::mail::types::*;
use crate::mail::error::{MailError, MailResult};

pub struct MailService {
    pub db: Arc<Mutex<Connection>>,
    pub attachments_dir: Box<Path>,
    pub locks: Arc<Mutex<std::collections::HashMap<String, bool>>>,
}

impl MailService {
    pub async fn sync_account(&self, app: &AppHandle, account_id: &str) -> MailResult<SyncResult> {
        let lock_key = account_id.to_string();
        {
            let mut locks = self.locks.lock().await;
            if locks.get(&lock_key).copied().unwrap_or(false) {
                return Ok(SyncResult { fetched: 0, inserted: 0, folders: 0, error: Some("同步进行中".into()) });
            }
            locks.insert(lock_key.clone(), true);
        }

        let result = self.do_sync(app, account_id).await;

        {
            let mut locks = self.locks.lock().await;
            locks.insert(lock_key, false);
        }
        result
    }

    async fn do_sync(&self, app: &AppHandle, account_id: &str) -> MailResult<SyncResult> {
        emit_progress(app, SyncProgress::Connecting { account_id: account_id.into() });

        let account = {
            let db = self.db.lock().await;
            db_queries::get_account(&db, account_id)?
        };
        let password = CredentialStore::get_password(account_id)?;
        let username = account.username.as_deref().unwrap_or(&account.email);

        let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

        let folders = imap.list_folders().await?;
        let mut fetched = 0i64;
        let mut inserted = 0i64;

        for (path, flags) in &folders {
            let folder_type = infer_folder_type(path, flags);
            let display_name = folder_display_name(path, folder_type);

            let folder_id = {
                let db = self.db.lock().await;
                ensure_folder(&db, account_id, path, &display_name, folder_type)?
            };

            if let Ok((uid_next, uid_validity)) = imap.select_folder(path).await {
                let last_uid = get_folder_last_uid(&self.db.lock().await, &folder_id)?;
                let (start, end) = calc_fetch_range(last_uid, uid_next);

                if start <= end {
                    let messages = imap.fetch_range(start, end).await?;
                    let total = messages.len() as i64;
                    let mut done = 0i64;

                    for (uid, body, msg_flags) in messages {
                        let parsed = parse_message(&body)?;
                        let is_read = msg_flags.iter().any(|f| f.contains("Seen"));
                        let is_starred = msg_flags.iter().any(|f| f.contains("Flagged"));

                        let email = Email {
                            id: uuid::Uuid::new_v4().to_string(),
                            account_id: account_id.into(),
                            folder_id: Some(folder_id.clone()),
                            message_id: parsed.message_id.clone(),
                            uid: Some(uid as i64),
                            from_address: parsed.from_address.clone(),
                            to_addresses: Some(serde_json::to_string(&parsed.to_addresses).unwrap_or_default()),
                            cc_addresses: Some(serde_json::to_string(&parsed.cc_addresses).unwrap_or_default()),
                            subject: parsed.subject.clone(),
                            preview_text: parsed.preview_text.clone(),
                            body_text: parsed.body_text.clone(),
                            body_html: parsed.body_html.as_ref().map(|h| crate::mail::mime::sanitize_html(h)),
                            has_attachments: parsed.has_attachments,
                            is_read, is_starred,
                            received_at: Some(chrono::Utc::now().to_rfc3339()),
                            created_at: chrono::Utc::now().to_rfc3339(),
                            account_email: Some(account.email.clone()),
                            account_name: account.display_name.clone(),
                        };

                        let db = self.db.lock().await;
                        db_queries::upsert_email(&db, &email)?;
                        inserted += 1;
                        fetched += 1;
                        done += 1;
                        emit_progress(app, SyncProgress::Folder {
                            account_id: account_id.into(), path: path.clone(), done, total
                        });
                    }

                    update_folder_cursor(&self.db.lock().await, &folder_id, end, uid_validity)?;
                }
            }
        }

        emit_progress(app, SyncProgress::Done {
            account_id: account_id.into(), fetched, inserted
        });

        Ok(SyncResult { fetched, inserted, folders: folders.len() as i64, error: None })
    }
}

fn ensure_folder(conn: &Connection, account_id: &str, imap_path: &str, name: &str, folder_type: &str) -> MailResult<String> {
    let existing: Option<String> = conn.query_row(
        "SELECT id FROM email_folders WHERE account_id = ?1 AND imap_path = ?2",
        rusqlite::params![account_id, imap_path],
        |row| row.get(0)
    ).ok();
    if let Some(id) = existing { return Ok(id); }
    let id = uuid::Uuid::new_v4().to_string();
    let is_system = matches!(folder_type, "inbox" | "sent" | "drafts" | "trash" | "spam");
    db_queries::insert_folder(conn, &EmailFolder {
        id: id.clone(), account_id: account_id.into(), name: name.into(),
        imap_path: imap_path.into(), parent_path: None, is_system,
        folder_type: folder_type.into(), sort_order: 0, unread_count: 0, total_count: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
    })?;
    Ok(id)
}

fn get_folder_last_uid(conn: &Connection, folder_id: &str) -> MailResult<Option<u32>> {
    let uid: Option<i64> = conn.query_row(
        "SELECT last_uid FROM mail_sync_state WHERE folder_id = ?1",
        rusqlite::params![folder_id], |row| row.get(0)
    ).ok();
    Ok(uid.map(|u| u as u32))
}

fn update_folder_cursor(conn: &Connection, folder_id: &str, last_uid: u32, uid_validity: u32) -> MailResult<()> {
    conn.execute(
        "INSERT INTO mail_sync_state (folder_id, last_uid, uid_validity, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(folder_id) DO UPDATE SET last_uid=excluded.last_uid, uid_validity=excluded.uid_validity, updated_at=excluded.updated_at",
        rusqlite::params![folder_id, last_uid as i64, uid_validity as i64, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/mail/service.rs src-tauri/src/mail/events.rs
git commit -m "feat(mail): P3 同步服务 + 事件总线"
```

---

## P4: SMTP Adapter + 发信

### Task 11: 实现 SMTP 发信

**Files:**
- Create: `src-tauri/src/mail/smtp.rs`

- [ ] **Step 1: 实现 SMTP 发送**

`src-tauri/src/mail/smtp.rs`:
```rust
use lettre::message::header::ContentType;
use lettre::message::{MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use crate::mail::error::{MailError, MailResult};

pub struct SmtpParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub from_name: Option<String>,
}

pub async fn send_mail(params: &SmtpParams, to: &[String], cc: &[String],
    subject: &str, body_html: &str, body_text: &str) -> MailResult<Vec<u8>> {
    let mut builder = Message::builder();
    let from_addr = match &params.from_name {
        Some(name) => format!("{} <{}>", name, params.from_email).parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("发件人解析失败: {}", e)))?,
        None => params.from_email.parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("发件人解析失败: {}", e)))?,
    };
    builder = builder.from(from_addr);

    for addr in to {
        builder = builder.to(addr.parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("收件人解析失败: {}", e)))?);
    }
    for addr in cc {
        builder = builder.cc(addr.parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("抄送解析失败: {}", e)))?);
    }

    let email = builder.subject(subject)
        .multipart(MultiPart::alternative()
            .singlepart(SinglePart::builder()
                .header(ContentType::TEXT_PLAIN)
                .body(body_text.to_string()))
            .singlepart(SinglePart::builder()
                .header(ContentType::TEXT_HTML)
                .body(body_html.to_string())))
        .map_err(|e| MailError::new("MIME_ERROR", &format!("构建MIME失败: {}", e)))?;

    let transport = if params.port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&params.host)
            .map_err(|e| MailError::new("SMTP_ERROR", &format!("SMTP配置失败: {}", e)))?
            .port(params.port)
            .credentials(Credentials::new(params.username.clone(), params.password.clone()))
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&params.host)
            .map_err(|e| MailError::new("SMTP_ERROR", &format!("SMTP配置失败: {}", e)))?
            .port(params.port)
            .credentials(Credentials::new(params.username.clone(), params.password.clone()))
            .build()
    };

    transport.send(&email).await
        .map_err(|e| MailError::new("SMTP_SEND", &format!("发送失败: {}", e)))?;

    Ok(email.formatted())
}
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mail/smtp.rs
git commit -m "feat(mail): P4 SMTP 发信 + MIME 构建"
```

---

## P5: 文件夹管理

### Task 12: 在 service.rs 中添加文件夹操作

**Files:**
- Modify: `src-tauri/src/mail/service.rs`

- [ ] **Step 1: 追加文件夹管理方法**

在 `MailService impl` 块中追加:
```rust
pub async fn create_folder(&self, account_id: &str, name: &str) -> MailResult<EmailFolder> {
    let account = {
        let db = self.db.lock().await;
        db_queries::get_account(&db, account_id)?
    };
    let password = CredentialStore::get_password(account_id)?;
    let username = account.username.as_deref().unwrap_or(&account.email);
    let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

    imap.create_mailbox(name).await?;

    let folder = EmailFolder {
        id: uuid::Uuid::new_v4().to_string(),
        account_id: account_id.into(),
        name: name.into(),
        imap_path: name.into(),
        parent_path: None,
        is_system: false,
        folder_type: "other",
        sort_order: 0,
        unread_count: 0,
        total_count: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let db = self.db.lock().await;
    db_queries::insert_folder(&db, &folder)?;
    Ok(folder)
}

pub async fn rename_folder(&self, folder_id: &str, new_name: &str) -> MailResult<EmailFolder> {
    let folder = {
        let db = self.db.lock().await;
        let f: Option<EmailFolder> = db.query_row(
            "SELECT * FROM email_folders WHERE id = ?1",
            rusqlite::params![folder_id], |row| {
                Ok(EmailFolder {
                    id: row.get("id")?, account_id: row.get("account_id")?, name: row.get("name")?,
                    imap_path: row.get("imap_path")?, parent_path: row.get("parent_path")?,
                    is_system: row.get::<_, i64>("is_system")? != 0, folder_type: row.get("folder_type")?,
                    sort_order: row.get("sort_order")?, unread_count: row.get("unread_count")?,
                    total_count: row.get("total_count")?, created_at: row.get("created_at")?,
                })
            }
        ).ok();
        f
    };
    let folder = folder.ok_or_else(|| MailError::new("NOT_FOUND", "文件夹不存在"))?;
    if folder.is_system {
        return Err(MailError::new("FORBIDDEN", "系统文件夹不可重命名"));
    }

    let account = {
        let db = self.db.lock().await;
        db_queries::get_account(&db, &folder.account_id)?
    };
    let password = CredentialStore::get_password(&folder.account_id)?;
    let username = account.username.as_deref().unwrap_or(&account.email);
    let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

    imap.rename_mailbox(&folder.imap_path, new_name).await?;

    let db = self.db.lock().await;
    db.execute("UPDATE email_folders SET name = ?1, imap_path = ?2 WHERE id = ?3",
        rusqlite::params![new_name, new_name, folder_id])?;

    let mut updated = folder;
    updated.name = new_name.into();
    updated.imap_path = new_name.into();
    Ok(updated)
}

pub async fn delete_folder(&self, folder_id: &str) -> MailResult<()> {
    let folder = {
        let db = self.db.lock().await;
        let f: Option<EmailFolder> = db.query_row(
            "SELECT * FROM email_folders WHERE id = ?1",
            rusqlite::params![folder_id], |row| {
                Ok(EmailFolder {
                    id: row.get("id")?, account_id: row.get("account_id")?, name: row.get("name")?,
                    imap_path: row.get("imap_path")?, parent_path: row.get("parent_path")?,
                    is_system: row.get::<_, i64>("is_system")? != 0, folder_type: row.get("folder_type")?,
                    sort_order: row.get("sort_order")?, unread_count: row.get("unread_count")?,
                    total_count: row.get("total_count")?, created_at: row.get("created_at")?,
                })
            }
        ).ok();
        f
    };
    let folder = folder.ok_or_else(|| MailError::new("NOT_FOUND", "文件夹不存在"))?;
    if folder.is_system {
        return Err(MailError::new("FORBIDDEN", "系统文件夹不可删除"));
    }

    let db = self.db.lock().await;
    db.execute("DELETE FROM emails WHERE folder_id = ?1", rusqlite::params![folder_id])?;
    db.execute("DELETE FROM email_folders WHERE id = ?1", rusqlite::params![folder_id])?;

    let account = db_queries::get_account(&db, &folder.account_id)?;
    drop(db);

    let password = CredentialStore::get_password(&folder.account_id)?;
    let username = account.username.as_deref().unwrap_or(&account.email);
    let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;
    let _ = imap.delete_mailbox(&folder.imap_path).await; // 失败仅告警
    Ok(())
}
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mail/service.rs
git commit -m "feat(mail): P5 文件夹管理（创建/重命名/删除 + 系统保护）"
```

---

## P6: Command 层 + 命令注册

### Task 13: 实现 Tauri 命令处理

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 实现命令处理函数**

`src-tauri/src/commands.rs`:
```rust
use std::path::PathBuf;
use std::sync::Arc;
use rusqlite::Connection;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;
use crate::mail::creds::CredentialStore;
use crate::mail::db_queries;
use crate::mail::error::MailError;
use crate::mail::service::MailService;
use crate::mail::smtp::{SmtpParams, send_mail};
use crate::mail::types::*;

pub struct AppState {
    pub service: MailService,
}

fn now() -> String { chrono::Utc::now().to_rfc3339() }

#[tauri::command]
pub async fn mail_list_accounts(state: State<'_, AppState>) -> Result<Vec<EmailAccount>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_accounts(&db)
}

#[tauri::command]
pub async fn mail_list_folders(state: State<'_, AppState>, account_id: Option<String>) -> Result<Vec<EmailFolder>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_folders(&db, account_id.as_deref())
}

#[tauri::command]
pub async fn mail_list_messages(state: State<'_, AppState>, folder_id: String, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<Email>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_messages(&db, &folder_id, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn mail_unified_inbox(state: State<'_, AppState>, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<Email>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_unified_inbox(&db, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn mail_unified_unread(state: State<'_, AppState>) -> Result<i64, MailError> {
    let db = state.service.db.lock().await;
    db_queries::unified_unread_count(&db)
}

#[tauri::command]
pub async fn mail_get_message(state: State<'_, AppState>, id: String) -> Result<Email, MailError> {
    let db = state.service.db.lock().await;
    db_queries::get_message(&db, &id)
}

#[tauri::command]
pub async fn mail_folder_unread(state: State<'_, AppState>, account_id: Option<String>) -> Result<Vec<(String, i64)>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::folder_unread_counts(&db, account_id.as_deref())
}

#[tauri::command]
pub async fn mail_add_account(state: State<'_, AppState>, email: String, display_name: Option<String>,
    username: Option<String>, password: String, imap_host: String, imap_port: i64,
    smtp_host: String, smtp_port: i64, use_ssl: Option<bool>) -> Result<EmailAccount, MailError> {
    let id = uuid::Uuid::new_v4().to_string();
    CredentialStore::save_password(&id, &password)?;
    let account = EmailAccount {
        id: id.clone(), email, display_name, username, credential_ref: CredentialStore::credential_ref(&id),
        imap_host, imap_port, smtp_host, smtp_port, use_ssl: use_ssl.unwrap_or(true),
        auth_type: "password".into(), signature_id: None,
        signature_auto_append_new: true, signature_auto_append_reply: true,
        last_synced_at: None, sync_enabled: true, sync_interval_mins: 5,
        created_at: now(), updated_at: now(),
    };
    let db = state.service.db.lock().await;
    db_queries::insert_account(&db, &account)?;
    Ok(account)
}

#[tauri::command]
pub async fn mail_sync(state: State<'_, AppState>, app: AppHandle, account_id: Option<String>) -> Result<SyncResult, MailError> {
    let accounts: Vec<EmailAccount> = {
        let db = state.service.db.lock().await;
        db_queries::list_accounts(&db)?
    };
    let target = match account_id {
        Some(id) => vec![db_queries::get_account(&state.service.db.lock().await, &id)?],
        None => accounts,
    };
    let mut total = SyncResult { fetched: 0, inserted: 0, folders: 0, error: None };
    for account in target {
        let r = state.service.sync_account(&app, &account.id).await?;
        total.fetched += r.fetched;
        total.inserted += r.inserted;
        total.folders += r.folders;
    }
    Ok(total)
}

#[tauri::command]
pub async fn mail_send(state: State<'_, AppState>, account_id: String, to: Vec<String>, cc: Vec<String>,
    subject: String, body_html: String, body_text: String) -> Result<Email, MailError> {
    if to.len() > 50 { return Err(MailError::new("VALIDATION", "收件人不能超过50个")); }
    let account = {
        let db = state.service.db.lock().await;
        db_queries::get_account(&db, &account_id)?
    };
    let password = CredentialStore::get_password(&account_id)?;
    let username = account.username.clone().unwrap_or(account.email.clone());

    let params = SmtpParams {
        host: account.smtp_host, port: account.smtp_port as u16,
        username, password, from_email: account.email.clone(), from_name: account.display_name,
    };
    let raw_mail = send_mail(&params, &to, &cc, &subject, &body_html, &body_text).await?;

    // 插入已发送副本
    let sent_folder = {
        let db = state.service.db.lock().await;
        let f: Option<String> = db.query_row(
            "SELECT id FROM email_folders WHERE account_id = ?1 AND folder_type = 'sent'",
            rusqlite::params![account_id], |row| row.get(0)
        ).ok();
        f
    };

    let email = Email {
        id: uuid::Uuid::new_v4().to_string(), account_id: account_id.clone(),
        folder_id: sent_folder, message_id: Some(format!("sent-{}", uuid::Uuid::new_v4())),
        uid: None, from_address: Some(account.email.clone()),
        to_addresses: Some(serde_json::to_string(&to).unwrap_or_default()),
        cc_addresses: Some(serde_json::to_string(&cc).unwrap_or_default()),
        subject: Some(subject), preview_text: Some(body_text.chars().take(200).collect()),
        body_text: Some(body_text), body_html: Some(body_html), has_attachments: false,
        is_read: true, is_starred: false, received_at: Some(now()),
        created_at: now(), account_email: Some(account.email), account_name: None,
    };
    let db = state.service.db.lock().await;
    db_queries::upsert_email(&db, &email)?;
    Ok(email)
}

#[tauri::command]
pub async fn mail_mark_read(state: State<'_, AppState>, id: String, is_read: bool) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::mark_read(&db, &id, is_read)
}

#[tauri::command]
pub async fn mail_toggle_star(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::toggle_star(&db, &id)
}

#[tauri::command]
pub async fn mail_delete_message(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::delete_message(&db, &id)
}

#[tauri::command]
pub async fn mail_create_folder(state: State<'_, AppState>, account_id: String, name: String) -> Result<EmailFolder, MailError> {
    state.service.create_folder(&account_id, &name).await
}

#[tauri::command]
pub async fn mail_rename_folder(state: State<'_, AppState>, id: String, name: String) -> Result<EmailFolder, MailError> {
    state.service.rename_folder(&id, &name).await
}

#[tauri::command]
pub async fn mail_delete_folder(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    state.service.delete_folder(&id).await
}

#[tauri::command]
pub async fn mail_list_signatures(state: State<'_, AppState>) -> Result<Vec<EmailSignature>, MailError> {
    let db = state.service.db.lock().await;
    db_queries::list_signatures(&db)
}

#[tauri::command]
pub async fn mail_save_signature(state: State<'_, AppState>, id: Option<String>, name: String, html: String, is_default: Option<bool>) -> Result<EmailSignature, MailError> {
    let sig = EmailSignature {
        id: id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name, html, is_default: is_default.unwrap_or(false),
        created_at: now(), updated_at: now(),
    };
    let db = state.service.db.lock().await;
    db_queries::save_signature(&db, &sig)?;
    Ok(sig)
}

#[tauri::command]
pub async fn mail_delete_signature(state: State<'_, AppState>, id: String) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::delete_signature(&db, &id)
}

#[tauri::command]
pub async fn mail_set_account_signature(state: State<'_, AppState>, account_id: String,
    signature_id: Option<String>, auto_new: Option<bool>, auto_reply: Option<bool>) -> Result<(), MailError> {
    let db = state.service.db.lock().await;
    db_queries::set_account_signature(&db, &account_id, signature_id.as_deref(), auto_new, auto_reply)
}
```

- [ ] **Step 2: 更新 lib.rs 注册命令**

修改 `src-tauri/src/lib.rs`:
```rust
mod mail;
mod commands;

use std::path::PathBuf;
use std::sync::Arc;
use rusqlite::Connection;
use tauri::Manager;
use commands::*;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");
            let mail_dir = app_data_dir.join("mail");
            std::fs::create_dir_all(&mail_dir)?;
            std::fs::create_dir_all(mail_dir.join("attachments"))?;

            let db_path = mail_dir.join("easywork-mail.db");
            let conn = mail::db::init_db(&db_path)
                .expect("无法初始化邮件数据库");

            let service = mail::service::MailService {
                db: Arc::new(tokio::sync::Mutex::new(conn)),
                attachments_dir: mail_dir.join("attachments").into_boxed_path(),
                locks: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
            };

            app.manage(commands::AppState { service });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            mail_list_accounts,
            mail_list_folders,
            mail_list_messages,
            mail_unified_inbox,
            mail_unified_unread,
            mail_get_message,
            mail_folder_unread,
            mail_add_account,
            mail_sync,
            mail_send,
            mail_mark_read,
            mail_toggle_star,
            mail_delete_message,
            mail_create_folder,
            mail_rename_folder,
            mail_delete_folder,
            mail_list_signatures,
            mail_save_signature,
            mail_delete_signature,
            mail_set_account_signature
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(mail): P6 Command 层 + 命令注册"
```

---

## P7: 前端 mailApi 适配层

### Task 14: 创建 mailApi.ts + 改写 useMail.ts

**Files:**
- Create: `src/features/mail/mailApi.ts`
- Modify: `src/features/mail/useMail.ts`

- [ ] **Step 1: 创建 mailApi 适配层**

`src/features/mail/mailApi.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core';
import type { Email, EmailFolder, EmailAccount, EmailSignature, EmailTemplate } from '@/types';

export const mailApi = {
  listAccounts: () => invoke<EmailAccount[]>('mail_list_accounts'),
  listFolders: (accountId?: string) => invoke<EmailFolder[]>('mail_list_folders', { accountId }),
  listMessages: (folderId: string, limit = 50, offset = 0) =>
    invoke<Email[]>('mail_list_messages', { folderId, limit, offset }),
  unifiedInbox: (limit = 50, offset = 0) =>
    invoke<Email[]>('mail_unified_inbox', { limit, offset }),
  unifiedUnread: () => invoke<number>('mail_unified_unread'),
  getMessage: (id: string) => invoke<Email>('mail_get_message', { id }),
  folderUnread: (accountId?: string) => invoke<Record<string, number>>('mail_folder_unread', { accountId }),
  addAccount: (params: {
    email: string; displayName?: string; username?: string; password: string;
    imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; useSsl?: boolean;
  }) => invoke<EmailAccount>('mail_add_account', {
    email: params.email, displayName: params.displayName, username: params.username,
    password: params.password, imapHost: params.imapHost, imapPort: params.imapPort,
    smtpHost: params.smtpHost, smtpPort: params.smtpPort, useSsl: params.useSsl,
  }),
  sync: (accountId?: string) => invoke('mail_sync', { accountId }),
  send: (params: {
    accountId: string; to: string[]; cc: string[]; subject: string; bodyHtml: string; bodyText: string;
  }) => invoke<Email>('mail_send', params),
  markRead: (id: string, isRead: boolean) => invoke('mail_mark_read', { id, isRead }),
  toggleStar: (id: string) => invoke('mail_toggle_star', { id }),
  deleteMessage: (id: string) => invoke('mail_delete_message', { id }),
  createFolder: (accountId: string, name: string) => invoke<EmailFolder>('mail_create_folder', { accountId, name }),
  renameFolder: (id: string, name: string) => invoke<EmailFolder>('mail_rename_folder', { id, name }),
  deleteFolder: (id: string) => invoke('mail_delete_folder', { id }),
  listSignatures: () => invoke<EmailSignature[]>('mail_list_signatures'),
  saveSignature: (params: { id?: string; name: string; html: string; isDefault?: boolean }) =>
    invoke<EmailSignature>('mail_save_signature', params),
  deleteSignature: (id: string) => invoke('mail_delete_signature', { id }),
  setAccountSignature: (params: {
    accountId: string; signatureId?: string; autoNew?: boolean; autoReply?: boolean;
  }) => invoke('mail_set_account_signature', params),
};
```

- [ ] **Step 2: 改写 useMail.ts 数据源**

逐个替换 `useMail.ts` 中所有 `supabase.from(...)` / `supabase.functions.invoke(...)` / `supabase.rpc(...)` 调用为 `mailApi.*`。保留所有 `useQuery`/`useMutation` 结构和 `onSuccess` 缓存失效逻辑不变。

关键替换：
- `useEmailAccounts` 的 queryFn: `supabase.from('email_accounts').select()` → `mailApi.listAccounts()`
- `useCreateEmailAccount` 的 mutationFn: `supabase.from('email_accounts').insert()` → `mailApi.addAccount()`
- `useEmailFolders` 的 queryFn: `supabase.from('email_folders').select()` → `mailApi.listFolders(accountId)`
- `useEmails` 的 queryFn: `supabase.from('emails').select()` → `mailApi.listMessages(folderId)`
- `useEmail` 的 queryFn: `supabase.from('emails').select().eq('id', id)` → `mailApi.getMessage(id)`
- `useSyncMail` 的 mutationFn: `supabase.functions.invoke('fetch-mail')` → `mailApi.sync(accountId)`
- `useSendEmail` 的 mutationFn: `supabase.functions.invoke('send-mail')` → `mailApi.send(params)`
- `useCreateFolder`/`useRenameFolder`/`useDeleteFolder` → `mailApi.createFolder/renameFolder/deleteFolder`
- `useMarkAsRead` → `mailApi.markRead`
- `useToggleStar` → `mailApi.toggleStar`
- `useDeleteEmail` → `mailApi.deleteMessage`
- `useFolderUnreadCounts` → `mailApi.folderUnread()` 或 `mailApi.unifiedUnread()`

移除 `import { supabase } from '@/lib/supabase'`，改为 `import { mailApi } from './mailApi'`。

- [ ] **Step 3: 同步改写 useEmailTemplates.ts**

同样将 `useEmailTemplates.ts` 中的 `supabase.from('email_templates')` / `supabase.from('email_signatures')` 替换为 `mailApi.listSignatures()` / `mailApi.saveSignature()` / `mailApi.deleteSignature()` 等。

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误（可能有少量 `as any` 需调整）

- [ ] **Step 5: 提交**

```bash
git add src/features/mail/mailApi.ts src/features/mail/useMail.ts src/features/mail/useEmailTemplates.ts
git commit -m "feat(mail): P7 前端 mailApi 适配层 + 数据源切换"
```

---

## P8: 统一收件箱 UI

### Task 15: 在 MailAccountTree 中添加统一收件箱虚拟节点

**Files:**
- Modify: `src/features/mail/MailAccountTree.tsx`

- [ ] **Step 1: 添加统一收件箱节点**

在 `MailAccountTree` 组件的账户树顶部新增"统一收件箱"区块：
```tsx
// 在账户列表上方添加
<div className="mb-2 pb-2 border-b">
  <div className="text-xs font-semibold text-muted-foreground px-2 py-1">统一收件箱</div>
  <button
    onClick={() => onSelectFolder('unified-inbox')}
    className={cn(
      "w-full text-left px-3 py-1.5 text-sm rounded flex items-center gap-2",
      selectedFolderId === 'unified-inbox' && "bg-accent"
    )}
  >
    <Inbox className="h-4 w-4" />
    <span>全部收件箱</span>
    {unifiedUnread > 0 && (
      <span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5">
        {unifiedUnread}
      </span>
    )}
  </button>
  <button
    onClick={() => onSelectFolder('starred')}
    className={cn(
      "w-full text-left px-3 py-1.5 text-sm rounded flex items-center gap-2",
      selectedFolderId === 'starred' && "bg-accent"
    )}
  >
    <Star className="h-4 w-4" />
    <span>待办（标星）</span>
  </button>
</div>
```

- [ ] **Step 2: 在 MailList 中处理统一收件箱查询**

修改 `MailList.tsx` 的数据获取逻辑：
```tsx
// 当 folderId === 'unified-inbox' 时调用 mailApi.unifiedInbox()
// 当 folderId === 'starred' 时调用 mailApi.listMessages 但过滤 is_starred
const { data: emails } = useQuery({
  queryKey: ['mail-messages', folderId],
  queryFn: () => {
    if (folderId === 'unified-inbox') return mailApi.unifiedInbox();
    if (folderId === 'starred') return mailApi.unifiedInbox().then(list => list.filter(e => e.is_starred));
    return mailApi.listMessages(folderId);
  },
});
```

- [ ] **Step 3: 邮件列表项添加来源账户标签**

在 `MailListItem` 中显示来源账户：
```tsx
<div className="flex items-center gap-1 text-xs text-muted-foreground">
  <span>{email.account_name || email.account_email}</span>
  <span>·</span>
  <span>{formatTime(email.received_at)}</span>
</div>
```

- [ ] **Step 4: 验证编译**

Run: `pnpm tsc --noEmit`

- [ ] **Step 5: 提交**

```bash
git add src/features/mail/MailAccountTree.tsx src/features/mail/MailList.tsx
git commit -m "feat(mail): P8 统一收件箱虚拟节点 + 来源标签"
```

---

## P9: 签名功能

### Task 16: 实现 HTML 富文本签名编辑器

**Files:**
- Modify: `src/features/mail/EmailSignatureDialog.tsx`
- Modify: `src/features/mail/MailComposer.tsx`

- [ ] **Step 1: 升级 EmailSignatureDialog 为富文本编辑器**

在 `EmailSignatureDialog` 中添加 contentEditable 富文本编辑区域：
```tsx
<div
  ref={editorRef}
  contentEditable
  suppressContentEditableWarning
  className="min-h-[120px] border rounded p-3 prose prose-sm max-w-none focus:outline-none focus:ring-2 focus:ring-primary"
  dangerouslySetInnerHTML={{ __html: signature?.html || '' }}
  onInput={(e) => {
    const html = e.currentTarget.innerHTML;
    // 更新表单值
    form.setValue('html', html);
  }}
/>
{/* 富文本工具栏 */}
<div className="flex gap-1 border-t pt-2">
  <Button size="sm" variant="ghost" onClick={() => document.execCommand('bold')}>B</Button>
  <Button size="sm" variant="ghost" onClick={() => document.execCommand('italic')}>I</Button>
  <Button size="sm" variant="ghost" onClick={() => document.execCommand('insertUnorderedList')}>•</Button>
  <Button size="sm" variant="ghost" onClick={() => document.execCommand('insertLink', false, prompt('链接URL:'))}>🔗</Button>
</div>
```

- [ ] **Step 2: MailComposer 签名预览 + 自动追加**

在 `MailComposer` 中添加签名预览和选择：
```tsx
// 根据当前选中账户读取签名配置
const { data: signatures } = useQuery({
  queryKey: ['mail-signatures'],
  queryFn: () => mailApi.listSignatures(),
});
const { data: account } = useQuery({
  queryKey: ['mail-account', selectedAccountId],
  queryFn: () => mailApi.listAccounts().then(list => list.find(a => a.id === selectedAccountId)),
  enabled: !!selectedAccountId,
});

// 构建邮件正文时自动追加签名
const buildBody = () => {
  let html = bodyHtml;
  if (account?.signature_id && account.signature_auto_append_new) {
    const sig = signatures?.find(s => s.id === account.signature_id);
    if (sig) {
      html = `${html}<br><br>${sig.html}`;
    }
  }
  return html;
};
```

- [ ] **Step 3: 验证编译**

Run: `pnpm tsc --noEmit`

- [ ] **Step 4: 提交**

```bash
git add src/features/mail/EmailSignatureDialog.tsx src/features/mail/MailComposer.tsx
git commit -m "feat(mail): P9 HTML 富文本签名 + 自动追加"
```

---

## P10: 响应式 UI

### Task 17: 实现平板/手机响应式布局

**Files:**
- Modify: `src/features/mail/Mail.tsx`
- Modify: `src/features/mail/MailAccountTree.tsx`

- [ ] **Step 1: Mail.tsx 添加响应式断点**

修改 `Mail.tsx` 的三栏布局，添加平板抽屉和手机底部操作栏：
```tsx
// 新增 state
const [drawerOpen, setDrawerOpen] = useState(false);
const [mobileView, setMobileView] = useState<'list' | 'reader'>('list');

return (
  <div className="flex flex-col h-full">
    {/* 标题栏 */}
    <div className="flex items-center justify-between px-4 py-2 border-b">
      <div className="flex items-center gap-2">
        {/* 平板/手机显示菜单按钮 */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawerOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">邮箱</h1>
        <span className="text-sm text-muted-foreground">{unreadCount} 未读</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => mailApi.sync()}>
          <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">收取</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>
          <PenSquare className="h-4 w-4" /> <span className="hidden sm:inline">写信</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>

    {/* 主体 */}
    <div className="flex flex-1 overflow-hidden relative">
      {/* 桌面左栏 */}
      <aside className="hidden md:block w-[200px] shrink-0 border-r">
        <MailAccountTree />
      </aside>

      {/* 平板/手机抽屉 */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setDrawerOpen(false)}>
          <div className="w-[260px] h-full bg-background" onClick={e => e.stopPropagation()}>
            <MailAccountTree onSelect={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* 中栏（列表） */}
      <div className={cn(
        "w-full md:w-[360px] shrink-0 border-r",
        mobileView === 'reader' && "hidden md:block"
      )}>
        <MailList onSelect={() => setMobileView('reader')} />
      </div>

      {/* 右栏（阅读） */}
      <main className={cn(
        "flex-1 overflow-hidden",
        mobileView === 'list' && "hidden md:block"
      )}>
        <MailReader onBack={() => setMobileView('list')} />
      </main>
    </div>

    {/* 手机底部操作栏 */}
    <div className="sm:hidden flex items-center justify-around border-t py-1">
      <Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>
        <PenSquare className="h-4 w-4" /> 写信
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
        <Folder className="h-4 w-4" /> 文件夹
      </Button>
      <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
        <Settings className="h-4 w-4" /> 设置
      </Button>
    </div>
  </div>
);
```

- [ ] **Step 2: 验证编译**

Run: `pnpm tsc --noEmit`

- [ ] **Step 3: 提交**

```bash
git add src/features/mail/Mail.tsx src/features/mail/MailAccountTree.tsx
git commit -m "feat(mail): P10 响应式布局（平板抽屉 + 手机底部操作栏）"
```

---

## P11: 凭据迁移

### Task 18: 首启动从 Supabase 迁移账号密码

**Files:**
- Create: `src/features/mail/migrateFromSupabase.ts`

- [ ] **Step 1: 创建迁移脚本**

`src/features/mail/migrateFromSupabase.ts`:
```typescript
import { supabase } from '@/lib/supabase';
import { mailApi } from './mailApi';

export async function migrateAccountsFromSupabase(): Promise<{ migrated: number; skipped: number }> {
  // 检查是否已迁移
  const existing = await mailApi.listAccounts();
  if (existing.length > 0) {
    return { migrated: 0, skipped: existing.length };
  }

  // 用 service_role 读取（前端用 anon key 读不到 password 列，需后端辅助）
  // 注意：此函数需要在有 Supabase session 的环境下执行
  const { data: accounts, error } = await supabase
    .from('email_accounts')
    .select('*');

  if (error || !accounts || accounts.length === 0) {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  for (const account of accounts) {
    // 密码需要通过特殊 RPC 或 Edge Function 解密读取
    // 如果密码是明文（历史数据），直接可用
    // 如果是加密的，需要 EMAIL_ENC_KEY 解密
    // 简化处理：引导用户重新输入密码
    try {
      await mailApi.addAccount({
        email: account.email,
        displayName: account.display_name,
        username: account.username,
        password: account.password || '', // 可能需要用户重新输入
        imapHost: account.imap_host,
        imapPort: account.imap_port,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        useSsl: account.use_ssl,
      });
      migrated++;
    } catch (e) {
      console.error(`迁移账号 ${account.email} 失败:`, e);
    }
  }

  return { migrated, skipped: 0 };
}
```

- [ ] **Step 2: 在应用启动时调用迁移**

在 `Mail.tsx` 的 useEffect 中：
```tsx
useEffect(() => {
  migrateAccountsFromSupabase().then(result => {
    if (result.migrated > 0) {
      console.log(`已从 Supabase 迁移 ${result.migrated} 个邮箱账号`);
      queryClient.invalidateQueries({ queryKey: ['mail-accounts'] });
    }
  }).catch(console.error);
}, []);
```

- [ ] **Step 3: 提交**

```bash
git add src/features/mail/migrateFromSupabase.ts src/features/mail/Mail.tsx
git commit -m "feat(mail): P11 凭据迁移（首启动从 Supabase 读取）"
```

---

## P12: 退役 Supabase 邮件

### Task 19: 清理前端 Supabase 邮件依赖

**Files:**
- Modify: `src/lib/supabase.ts` — 移除邮件本地中继 hack
- Modify: `src/features/realtime/useRealtimeSync.ts` — 移除 easywork-mail channel
- Modify: `src/features/mail/MailReader.tsx` — 附件下载改用本地路径

- [ ] **Step 1: 移除邮件本地中继**

删除 `src/lib/supabase.ts` 中的 `VITE_LOCAL_FUNCTIONS_URL` 重定向逻辑（第 11-44 行的邮件中继部分）。

- [ ] **Step 2: 移除 Realtime 邮件订阅**

在 `useRealtimeSync.ts` 中移除 `easywork-mail` channel 相关代码：
```typescript
// 删除以下部分：
// const mailChannel = supabase.channel('easywork-mail')
//   .on('postgres_changes', { event: '*', schema: 'public', table: 'email_accounts' }, ...)
//   .on('postgres_changes', { event: '*', schema: 'public', table: 'email_folders' }, ...)
//   .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, ...)
//   .on('postgres_changes', { event: '*', schema: 'public', table: 'email_attachments' }, ...)
//   .subscribe();
```

改为监听 Tauri 事件：
```typescript
import { listen } from '@tauri-apps/api/event';

// 替换为 Tauri 事件监听
listen('mail://sync-progress', (event) => {
  queryClient.invalidateQueries({ queryKey: ['mail'] });
});
listen('mail://new-mail', (event) => {
  queryClient.invalidateQueries({ queryKey: ['mail-messages'] });
});
```

- [ ] **Step 3: 附件下载改用本地路径**

修改 `MailReader.tsx` 中的 `resolveAttachmentUrl` 和 `handleDownload`：
```typescript
// 旧：supabase.storage.from('email-attachments').createSignedUrl(path, 3600)
// 新：invoke('mail_get_attachment', { id }) 返回本地文件路径
const handleDownload = async (attachmentId: string, filename: string) => {
  const filePath = await invoke<string>('mail_get_attachment', { id: attachmentId });
  // 使用 tauri-plugin-dialog 保存文件
  const savePath = await save({ defaultPath: filename });
  if (savePath) {
    await invoke('copy_file', { src: filePath, dst: savePath });
  }
};
```

- [ ] **Step 4: 验证编译**

Run: `pnpm tsc --noEmit`

- [ ] **Step 5: 提交**

```bash
git add src/lib/supabase.ts src/features/realtime/useRealtimeSync.ts src/features/mail/MailReader.tsx
git commit -m "feat(mail): P12 退役 Supabase 邮件依赖（中继/Realtime/Storage）"
```

### Task 20: 删除 Supabase 邮件后端资源

**Files:**
- Delete: `supabase/functions/fetch-mail/`
- Delete: `supabase/functions/send-mail/`
- Delete: `supabase/functions/manage-folder/`
- Delete: `supabase/functions/_shared/mail.ts`
- Create: `supabase/migrations/0031_drop_mail_tables.sql`

- [ ] **Step 1: 归档 Edge Functions**

```bash
# 移动到归档目录而非直接删除（保留参考）
mkdir -p supabase/functions/_archived
mv supabase/functions/fetch-mail supabase/functions/_archived/
mv supabase/functions/send-mail supabase/functions/_archived/
mv supabase/functions/manage-folder supabase/functions/_archived/
mv supabase/functions/_shared/mail.ts supabase/functions/_archived/mail.ts.bak
```

- [ ] **Step 2: 创建 drop 表迁移**

`supabase/migrations/0031_drop_mail_tables.sql`:
```sql
-- 退役邮件模块的 Supabase 资源
-- 注意：仅在确认本地迁移完成后执行

-- 删除表
DROP TABLE IF EXISTS email_attachments CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS email_folders CASCADE;
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_signatures CASCADE;
DROP TABLE IF EXISTS mail_sync_locks CASCADE;

-- 删除 RPC
DROP FUNCTION IF EXISTS unread_email_counts();
DROP FUNCTION IF EXISTS claim_mail_sync_lock(uuid);
DROP FUNCTION IF EXISTS release_mail_sync_lock(uuid);
DROP FUNCTION IF EXISTS encrypt_email_password(text, text);
DROP FUNCTION IF EXISTS decrypt_email_password(text, text);

-- 删除 Storage 桶
INSERT INTO storage.buckets (id, name) VALUES ('email-attachments', 'email-attachments-to-delete')
ON CONFLICT (id) DO NOTHING;
DELETE FROM storage.objects WHERE bucket_id = 'email-attachments';
DELETE FROM storage.buckets WHERE id = 'email-attachments';

-- 删除 pg_cron 任务
SELECT cron.unschedule('fetch-mail-every-5min');

-- 从 realtime 发布移除
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS email_accounts;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS email_folders;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS emails;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS email_attachments;
```

- [ ] **Step 3: 提交**

```bash
git add supabase/functions/_archived/ supabase/migrations/0031_drop_mail_tables.sql
git rm -r supabase/functions/fetch-mail supabase/functions/send-mail supabase/functions/manage-folder
git commit -m "feat(mail): P12 退役 Supabase 邮件后端（归档 Edge Function + drop 表迁移）"
```

---

## 验收检查清单

- [ ] `cargo check` 通过
- [ ] `pnpm tsc --noEmit` 通过
- [ ] `pnpm tauri dev` 启动后邮箱页面正常渲染
- [ ] 添加 QQ/网易邮箱账号成功（密码存入 keyring）
- [ ] 手动收取邮件成功，邮件列表显示
- [ ] 统一收件箱显示所有账户邮件，含来源标签
- [ ] 邮件阅读区显示正文（HTML 经消毒）
- [ ] 撰写邮件自动追加签名
- [ ] 发送邮件成功，已发送副本出现
- [ ] 文件夹创建/重命名/删除正常
- [ ] 搜索功能正常（FTS5）
- [ ] 平板尺寸下抽屉式账户树正常
- [ ] 手机尺寸下底部操作栏正常
- [ ] 断网状态下可读已缓存邮件
- [ ] SQLite 数据库文件位于 `<app_data_dir>/mail/easywork-mail.db`
- [ ] 密码不出现在 SQLite 或日志中
