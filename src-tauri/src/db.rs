use rusqlite::{Connection, params};
use std::path::Path;

const SCHEMA_VERSION: i32 = 12;

pub fn init_db(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrate(&conn)?;
    // crate::sync::config::create_sync_tables(&conn)?; // 由 lib.rs setup 统一调用
    Ok(conn)
}

/// 读取当前 schema 版本。
/// - 全新库（无 app_meta 表）：返回 0，允许走「建表」迁移。
/// - 已有业务表但缺 app_meta 版本行（历史异常库）：返回 SCHEMA_VERSION，
///   跳过破坏性迁移，避免误删数据。
fn schema_version(conn: &Connection) -> i32 {
    match conn.query_row(
        "SELECT value FROM app_meta WHERE key='schema_version'",
        [], |row| row.get(0),
    ) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let has_tables: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('tasks','notes','accounts'))",
                [], |row| row.get(0),
            ).unwrap_or(false);
            if has_tables { SCHEMA_VERSION } else { 0 }
        }
        Err(e) => {
            tracing::warn!("读取 schema 版本失败，按全新库处理: {}", e);
            0
        }
    }
}

/// 幂等迁移辅助：检查某表是否已存在某列。
/// SQLite 无 ADD COLUMN IF NOT EXISTS，迁移前需探测，避免重复 ALTER 报错。
fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let Ok(mut stmt) = conn.prepare(&format!("PRAGMA table_info({})", table)) else {
        return false;
    };
    let names: Vec<String> = match stmt.query_map([], |row| row.get::<_, String>(1)) {
        Ok(rows) => rows.filter_map(Result::ok).collect(),
        Err(_) => return false,
    };
    names.iter().any(|c| c == column)
}

/// v7 增量迁移：note_folders 表补 updated_at 列。
/// 该列被 note_folder_create/update 的 SQL 引用，但历史建表（含 v6 全新库）遗漏了它，
/// 导致「创建笔记文件夹」报错 `no column named updated_at`。
/// 历史行回填 created_at 作为初始值（NoteFolderOut.updated_at 为 String，不可为 NULL）。
/// 对已含该列的全新库，跳过 ALTER（SQLite 无 ADD COLUMN IF NOT EXISTS）。
fn migrate_v7(conn: &Connection) -> rusqlite::Result<()> {
    let has_col: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('note_folders') WHERE name='updated_at')",
        [],
        |r| r.get(0),
    )?;
    if !has_col {
        conn.execute_batch("ALTER TABLE note_folders ADD COLUMN updated_at TEXT;")?;
    }
    conn.execute_batch("UPDATE note_folders SET updated_at = COALESCE(updated_at, created_at);")?;
    Ok(())
}

/// v4 增量迁移（local-first 业务模型）：
/// - budgets 结转金额列（分，可负；旧 rollover bool 保留兼容）
/// - notes 补 content_text / cover_url
/// - 新建独立笔记标签表 note_tag_master 与关联表 note_note_tags
fn migrate_v4(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        ALTER TABLE budgets ADD COLUMN carry_over_cents INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE notes ADD COLUMN content_text TEXT;
        ALTER TABLE notes ADD COLUMN cover_url TEXT;

        CREATE TABLE IF NOT EXISTS note_tag_master (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT
        );

        CREATE TABLE IF NOT EXISTS note_note_tags (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES note_tag_master(id) ON DELETE CASCADE,
            sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT,
            UNIQUE (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_note_tags_note ON note_note_tags(note_id);
        CREATE INDEX IF NOT EXISTS idx_note_note_tags_tag ON note_note_tags(tag_id);
    "#)?;
    Ok(())
}

/// v6 增量迁移：budgets 表补 updated_at 列（Rust 端 budget_* 命令读取/更新该列）。
/// ALTER ADD COLUMN 对历史库安全；全新库 create_all_tables 同步包含该列。
fn migrate_v6(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        ALTER TABLE budgets ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    "#)?;
    Ok(())
}

/// v5 增量迁移：本地用户表（local-first 认证）。
/// - id 由 Rust 生成 UUID；password_hash 为 argon2 PHC 字符串；avatar_data 存 base64 data URL。
/// - 业务数据为单机本地库，多个本地账号共享同一份业务数据。
fn migrate_v5(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            avatar_data TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT
        );
    "#)?;
    Ok(())
}

/// 全新库：删除可能存在的残留表并重建全部业务表（不含 sync 元数据列）。
/// 仅在 schema_version() == 0（无 app_meta 且无业务表）时调用。
#[cfg(test)]
pub(crate) fn create_all_tables_for_test(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value INTEGER);",
    )?;
    create_all_tables(conn)?;
    // Skip versioned migration path (which has ALTER bugs on fresh DB).
    // Directly add sync columns, triggers, tombstones, and metadata tables.
    // All columns that might be added by migrations are already in create_all_tables.
    // We only need: sync columns, triggers, sync_mute_triggers, sync_tombstones, users, note_tag_master, note_note_tags, calendar_event_reminders
    conn.execute_batch(r#"
        -- Sync columns for tables that create_all_tables already defines
        ALTER TABLE tasks ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE tasks ADD COLUMN sync_device_id TEXT;
        ALTER TABLE subtasks ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE subtasks ADD COLUMN sync_device_id TEXT;
        ALTER TABLE tags ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE tags ADD COLUMN sync_device_id TEXT;
        ALTER TABLE task_tags ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE task_tags ADD COLUMN sync_device_id TEXT;
        ALTER TABLE accounts ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE accounts ADD COLUMN sync_device_id TEXT;
        ALTER TABLE categories ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE categories ADD COLUMN sync_device_id TEXT;
        ALTER TABLE transactions ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE transactions ADD COLUMN sync_device_id TEXT;
        ALTER TABLE budgets ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE budgets ADD COLUMN sync_device_id TEXT;
        ALTER TABLE notes ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE notes ADD COLUMN sync_device_id TEXT;
        ALTER TABLE note_folders ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE note_folders ADD COLUMN sync_device_id TEXT;
        ALTER TABLE note_tags ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE note_tags ADD COLUMN sync_device_id TEXT;
        ALTER TABLE calendar_events ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE calendar_events ADD COLUMN sync_device_id TEXT;
        ALTER TABLE calendar_subscriptions ADD COLUMN sync_modified_at TEXT;
        ALTER TABLE calendar_subscriptions ADD COLUMN sync_device_id TEXT;

        -- note_tag_master and note_note_tags (from v4)
        CREATE TABLE IF NOT EXISTS note_tag_master (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT
        );
        CREATE TABLE IF NOT EXISTS note_note_tags (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES note_tag_master(id) ON DELETE CASCADE,
            sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT,
            UNIQUE (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_note_tags_note ON note_note_tags(note_id);
        CREATE INDEX IF NOT EXISTS idx_note_note_tags_tag ON note_note_tags(tag_id);

        -- users table (from v5)
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            avatar_data TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT
        );

        -- sync_mute_triggers (from v10)
        CREATE TABLE IF NOT EXISTS sync_mute_triggers (
            id INTEGER PRIMARY KEY CHECK (id = 0),
            muted INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO sync_mute_triggers (id, muted) VALUES (0, 0);

        -- sync_tombstones (from v10)
        CREATE TABLE IF NOT EXISTS sync_tombstones (
            table_name TEXT NOT NULL,
            pk_value TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT,
            synced_at TEXT,
            PRIMARY KEY (table_name, pk_value)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_sync_tombstones_synced_at ON sync_tombstones(synced_at);

        -- calendar_event_reminders (from v12)
        CREATE TABLE IF NOT EXISTS calendar_event_reminders (
            event_id TEXT PRIMARY KEY,
            reminded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    "#)?;

    // Add sync triggers (simplified version without tombstone triggers)
    add_sync_triggers_for_test(conn)?;

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION],
    )?;
    Ok(())
}

#[cfg(test)]
fn add_sync_triggers_for_test(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        CREATE TRIGGER IF NOT EXISTS tasks_sync_touch AFTER UPDATE ON tasks
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN UPDATE tasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

        CREATE TRIGGER IF NOT EXISTS accounts_sync_touch AFTER UPDATE ON accounts
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN UPDATE accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

        CREATE TRIGGER IF NOT EXISTS transactions_sync_touch AFTER UPDATE ON transactions
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN UPDATE transactions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

        CREATE TRIGGER IF NOT EXISTS notes_sync_touch AFTER UPDATE ON notes
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN UPDATE notes SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

        CREATE TRIGGER IF NOT EXISTS calendar_events_sync_touch AFTER UPDATE ON calendar_events
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN UPDATE calendar_events SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
    "#)?;
    Ok(())
}

fn create_all_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        DROP TABLE IF EXISTS calendar_events;
        DROP TABLE IF EXISTS calendar_subscriptions;
        DROP TABLE IF EXISTS note_tags;
        DROP TABLE IF EXISTS note_folders;
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS budgets;
        DROP TABLE IF EXISTS task_tags;
        DROP TABLE IF EXISTS subtasks;
        DROP TABLE IF EXISTS transactions;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS accounts;
        DROP TABLE IF EXISTS tasks;
        DROP TABLE IF EXISTS tags;

        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT NOT NULL DEFAULT 'medium',
            due_date TEXT,
            recurrence_rule TEXT,
            recurrence_next TEXT,
            parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_tasks_status ON tasks(status, sort_order);
        CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;

        CREATE TABLE subtasks (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_subtasks_task ON subtasks(task_id, sort_order);

        CREATE TABLE tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE task_tags (
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            balance_cents INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'CNY',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            icon TEXT,
            parent_id TEXT REFERENCES categories(id),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE transactions (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CNY',
            category_id TEXT REFERENCES categories(id),
            account_id TEXT NOT NULL REFERENCES accounts(id),
            transfer_account_id TEXT REFERENCES accounts(id),
            date TEXT NOT NULL,
            description TEXT,
            receipt_path TEXT,
            task_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_transactions_date ON transactions(date DESC);
        CREATE INDEX idx_transactions_account ON transactions(account_id, date DESC);
        CREATE INDEX idx_transactions_category ON transactions(category_id, date DESC);

        CREATE TABLE budgets (
            id TEXT PRIMARY KEY,
            category_id TEXT REFERENCES categories(id),
            amount_cents INTEGER NOT NULL,
            period TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            rollover INTEGER NOT NULL DEFAULT 0,
            scope TEXT DEFAULT 'category',
            year_month TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX idx_budgets_year_month ON budgets(year_month DESC);

        CREATE TABLE note_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            parent_id TEXT REFERENCES note_folders(id),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            folder_id TEXT REFERENCES note_folders(id),
            is_pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_notes_folder ON notes(folder_id);
        CREATE INDEX idx_notes_updated ON notes(updated_at DESC);

        CREATE TABLE note_tags (
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_name TEXT NOT NULL,
            PRIMARY KEY (note_id, tag_name)
        );

        CREATE TABLE calendar_subscriptions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'ics',
            url TEXT NOT NULL,
            username TEXT,
            password TEXT,
            color TEXT NOT NULL DEFAULT '#8b5cf6',
            enabled INTEGER NOT NULL DEFAULT 1,
            last_synced_at TEXT,
            last_error TEXT,
            event_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE calendar_events (
            id TEXT PRIMARY KEY,
            subscription_id TEXT REFERENCES calendar_subscriptions(id),
            title TEXT NOT NULL,
            description TEXT,
            start_at TEXT NOT NULL,
            end_at TEXT NOT NULL,
            all_day INTEGER NOT NULL DEFAULT 0,
            location TEXT,
            color TEXT,
            source TEXT NOT NULL DEFAULT 'local',
            external_uid TEXT,
            organizer TEXT,
            reminder_minutes INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_calendar_events_start ON calendar_events(start_at);
    "#)?;
    Ok(())
}

/// v3 增量迁移：为既有业务表补充云端同步元数据列与 UPDATE 触发器。
/// 使用 ADD COLUMN 而非重建表，保证旧库数据不丢失。
fn add_sync_columns_and_triggers(conn: &Connection) -> rusqlite::Result<()> {
    // ⚠️ 同步列一律用「无 DEFAULT 的 NULL 列 + 存量回填」：
    //    SQLite 的 ADD COLUMN 不允许括号表达式作为默认值（Cannot add a column with
    //    non-constant default）。旧代码的 `NOT NULL DEFAULT (strftime(...))` 在全新库
    //    （current=0 也走本分支）与旧库升级时都会崩溃（实测邮件库 email_accounts 崩溃，
    //    本库 v3 同源）。同步引擎已兜底 NULL sync_modified_at（上传按纪元时间、冲突检测视为未改）。
    const SYNC_TABLES: &[&str] = &[
        "tasks", "subtasks", "tags", "task_tags", "accounts", "categories",
        "transactions", "budgets", "notes", "note_folders", "note_tags",
        "calendar_events", "calendar_subscriptions",
    ];
    for table in SYNC_TABLES {
        if !has_column(conn, table, "sync_modified_at") {
            conn.execute(&format!("ALTER TABLE {} ADD COLUMN sync_modified_at TEXT", table), [])?;
        }
        if !has_column(conn, table, "sync_device_id") {
            conn.execute(&format!("ALTER TABLE {} ADD COLUMN sync_device_id TEXT", table), [])?;
        }
    }

    // 存量回填（幂等）：仅对旧库已有数据生效；全新库表为空，语句为空操作。
    conn.execute_batch(r#"
        UPDATE tasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE subtasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE task_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE categories SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE transactions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE budgets SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE notes SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE note_folders SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE note_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE calendar_events SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        UPDATE calendar_subscriptions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
    "#)?;

    conn.execute_batch(r#"
        CREATE TRIGGER IF NOT EXISTS tasks_sync_touch AFTER UPDATE ON tasks
        BEGIN
            UPDATE tasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS subtasks_sync_touch AFTER UPDATE ON subtasks
        BEGIN
            UPDATE subtasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS tags_sync_touch AFTER UPDATE ON tags
        BEGIN
            UPDATE tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS accounts_sync_touch AFTER UPDATE ON accounts
        BEGIN
            UPDATE accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS categories_sync_touch AFTER UPDATE ON categories
        BEGIN
            UPDATE categories SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS transactions_sync_touch AFTER UPDATE ON transactions
        BEGIN
            UPDATE transactions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS notes_sync_touch AFTER UPDATE ON notes
        BEGIN
            UPDATE notes SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS note_folders_sync_touch AFTER UPDATE ON note_folders
        BEGIN
            UPDATE note_folders SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS calendar_events_sync_touch AFTER UPDATE ON calendar_events
        BEGIN
            UPDATE calendar_events SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS calendar_subscriptions_sync_touch AFTER UPDATE ON calendar_subscriptions
        BEGIN
            UPDATE calendar_subscriptions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;
    "#)?;
    Ok(())
}

/// v8 增量迁移：补齐 5 张表的 UPDATE 触发器。
/// v3 只建了 10 张业务表触发器，但 budgets / task_tags / note_tags 已有 sync 列却无触发器；
/// v4 新建的 note_tag_master / note_note_tags 也无触发器。
fn migrate_v8(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        CREATE TRIGGER IF NOT EXISTS budgets_sync_touch AFTER UPDATE ON budgets
        BEGIN
            UPDATE budgets SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS task_tags_sync_touch AFTER UPDATE ON task_tags
        BEGIN
            UPDATE task_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE task_id = NEW.task_id AND tag_id = NEW.tag_id;
        END;

        CREATE TRIGGER IF NOT EXISTS note_tags_sync_touch AFTER UPDATE ON note_tags
        BEGIN
            UPDATE note_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE note_id = NEW.note_id AND tag_name = NEW.tag_name;
        END;

        CREATE TRIGGER IF NOT EXISTS note_tag_master_sync_touch AFTER UPDATE ON note_tag_master
        BEGIN
            UPDATE note_tag_master SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS note_note_tags_sync_touch AFTER UPDATE ON note_note_tags
        BEGIN
            UPDATE note_note_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE note_id = NEW.note_id AND tag_id = NEW.tag_id;
        END;
    "#)?;

    // 将日历订阅密码从 SQLite 明文迁移到系统密钥库（仅对历史库执行一次）。
    // keyring 写入失败时保留原值，避免阻断升级。
    if let Ok(mut stmt) = conn.prepare("SELECT id, password FROM calendar_subscriptions WHERE password IS NOT NULL AND password != ''") {
        let rows: Vec<(String, String)> = {
            if let Ok(rows) = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))) {
                rows.filter_map(|r| r.ok()).collect()
            } else {
                Vec::new()
            }
        };
        drop(stmt);
        for (id, password) in rows {
            if crate::calendar_creds::save_password(&id, &password).is_ok() {
                let _ = conn.execute(
                    "UPDATE calendar_subscriptions SET password = '' WHERE id = ?1",
                    params![id],
                );
            }
        }
    }

    // 将同步配置连接串从 SQLite 明文迁移到系统密钥库。
    if let Ok(cs) = conn.query_row(
        "SELECT connection_string FROM sync_config WHERE id = 'default' AND connection_string IS NOT NULL AND connection_string != ''",
        [],
        |row| row.get::<_, String>(0),
    ) {
        if crate::sync::creds::save_connection_string(&cs).is_ok() {
            let _ = conn.execute(
                "UPDATE sync_config SET connection_string = '' WHERE id = 'default'",
                [],
            );
        }
    }

    Ok(())
}

/// v9 增量迁移：业务表 UPDATE 触发器增加 mute 开关。
/// 同步下载时临时禁用触发器，使云端 sync_modified_at 能原样写回本地，避免下载回环。
fn migrate_v9(conn: &Connection) -> rusqlite::Result<()> {
    // 先删除历史无 mute 条件的触发器。
    for trigger in [
        "tasks_sync_touch", "subtasks_sync_touch", "tags_sync_touch",
        "accounts_sync_touch", "categories_sync_touch", "transactions_sync_touch",
        "notes_sync_touch", "note_folders_sync_touch",
        "calendar_events_sync_touch", "calendar_subscriptions_sync_touch",
        "budgets_sync_touch", "task_tags_sync_touch", "note_tags_sync_touch",
        "note_tag_master_sync_touch", "note_note_tags_sync_touch",
    ] {
        conn.execute(
            &format!("DROP TRIGGER IF EXISTS {}", trigger),
            [],
        )?;
    }

    // 创建带 WHEN 条件的触发器：sync_mute_triggers.muted = 0 时才刷新 sync_modified_at。
    conn.execute_batch(r#"
        CREATE TRIGGER IF NOT EXISTS tasks_sync_touch AFTER UPDATE ON tasks
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE tasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS subtasks_sync_touch AFTER UPDATE ON subtasks
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE subtasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS tags_sync_touch AFTER UPDATE ON tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS accounts_sync_touch AFTER UPDATE ON accounts
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS categories_sync_touch AFTER UPDATE ON categories
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE categories SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS transactions_sync_touch AFTER UPDATE ON transactions
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE transactions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS budgets_sync_touch AFTER UPDATE ON budgets
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE budgets SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS notes_sync_touch AFTER UPDATE ON notes
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE notes SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS note_folders_sync_touch AFTER UPDATE ON note_folders
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE note_folders SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS note_tags_sync_touch AFTER UPDATE ON note_tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE note_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE note_id = NEW.note_id AND tag_name = NEW.tag_name;
        END;

        CREATE TRIGGER IF NOT EXISTS note_tag_master_sync_touch AFTER UPDATE ON note_tag_master
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE note_tag_master SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS note_note_tags_sync_touch AFTER UPDATE ON note_note_tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE note_note_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE note_id = NEW.note_id AND tag_id = NEW.tag_id;
        END;

        CREATE TRIGGER IF NOT EXISTS task_tags_sync_touch AFTER UPDATE ON task_tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE task_tags SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE task_id = NEW.task_id AND tag_id = NEW.tag_id;
        END;

        CREATE TRIGGER IF NOT EXISTS calendar_events_sync_touch AFTER UPDATE ON calendar_events
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE calendar_events SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS calendar_subscriptions_sync_touch AFTER UPDATE ON calendar_subscriptions
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            UPDATE calendar_subscriptions SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = NEW.id;
        END;
    "#)?;
    Ok(())
}

/// v10 增量迁移：删除传播的 tombstone 机制。
/// - 本地业务表 DELETE 时写入 sync_tombstones（记录表名与主键）。
/// - 同步上传/下载时额外处理 tombstones，使删除能传播到其他设备。
fn migrate_v10(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        -- 触发器 WHEN 子句依赖此表，需在创建触发器前确保存在（create_sync_tables 会在之后再次确保）。
        CREATE TABLE IF NOT EXISTS sync_mute_triggers (
            id INTEGER PRIMARY KEY CHECK (id = 0),
            muted INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO sync_mute_triggers (id, muted) VALUES (0, 0);

        CREATE TABLE IF NOT EXISTS sync_tombstones (
            table_name TEXT NOT NULL,
            pk_value TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_device_id TEXT,
            synced_at TEXT,
            PRIMARY KEY (table_name, pk_value)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_sync_tombstones_synced_at ON sync_tombstones(synced_at);

        CREATE TRIGGER IF NOT EXISTS tasks_sync_tombstone AFTER DELETE ON tasks
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('tasks', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS subtasks_sync_tombstone AFTER DELETE ON subtasks
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('subtasks', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS tags_sync_tombstone AFTER DELETE ON tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('tags', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS task_tags_sync_tombstone AFTER DELETE ON task_tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('task_tags', json_array(OLD.task_id, OLD.tag_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS accounts_sync_tombstone AFTER DELETE ON accounts
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('accounts', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS categories_sync_tombstone AFTER DELETE ON categories
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('categories', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS transactions_sync_tombstone AFTER DELETE ON transactions
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('transactions', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS budgets_sync_tombstone AFTER DELETE ON budgets
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('budgets', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_sync_tombstone AFTER DELETE ON notes
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('notes', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS note_folders_sync_tombstone AFTER DELETE ON note_folders
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('note_folders', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS note_tags_sync_tombstone AFTER DELETE ON note_tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('note_tags', json_array(OLD.note_id, OLD.tag_name), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS note_tag_master_sync_tombstone AFTER DELETE ON note_tag_master
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('note_tag_master', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS note_note_tags_sync_tombstone AFTER DELETE ON note_note_tags
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('note_note_tags', json_array(OLD.note_id, OLD.tag_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS calendar_events_sync_tombstone AFTER DELETE ON calendar_events
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('calendar_events', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;

        CREATE TRIGGER IF NOT EXISTS calendar_subscriptions_sync_tombstone AFTER DELETE ON calendar_subscriptions
        WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
        BEGIN
            INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
            VALUES ('calendar_subscriptions', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
        END;
    "#)?;
    Ok(())
}

/// v11 增量迁移：为 subtasks / tags / task_tags 补 updated_at 列，
/// 使云同步冲突解决从「无条件覆盖」升级为「last-write-wins」。
fn migrate_v11(conn: &Connection) -> rusqlite::Result<()> {
    // SQLite 无 ADD COLUMN IF NOT EXISTS；先探测再 ALTER。
    let has_subtasks_updated_at: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('subtasks') WHERE name='updated_at')",
        [], |r| r.get(0),
    )?;
    if !has_subtasks_updated_at {
        conn.execute_batch("ALTER TABLE subtasks ADD COLUMN updated_at TEXT;")?;
    }
    conn.execute_batch("UPDATE subtasks SET updated_at = COALESCE(updated_at, created_at);")?;

    let has_tags_updated_at: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tags') WHERE name='updated_at')",
        [], |r| r.get(0),
    )?;
    if !has_tags_updated_at {
        conn.execute_batch("ALTER TABLE tags ADD COLUMN updated_at TEXT;")?;
    }
    conn.execute_batch("UPDATE tags SET updated_at = COALESCE(updated_at, created_at);")?;

    let has_task_tags_updated_at: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('task_tags') WHERE name='updated_at')",
        [], |r| r.get(0),
    )?;
    if !has_task_tags_updated_at {
        conn.execute_batch("ALTER TABLE task_tags ADD COLUMN updated_at TEXT;")?;
    }
    conn.execute_batch("UPDATE task_tags SET updated_at = COALESCE(updated_at, sync_modified_at);")?;

    Ok(())
}

/// v12 增量迁移：日历事件提醒。
/// - 为历史库补全 reminder_minutes 列（全新库 create_all_tables 已包含）。
/// - 已有事件未设置提醒时，默认提前 15 分钟提醒。
/// - 新建 calendar_event_reminders 表，记录已发送提醒，防止重复通知。
fn migrate_v12(conn: &Connection) -> rusqlite::Result<()> {
    let has_col: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('calendar_events') WHERE name='reminder_minutes')",
        [], |r| r.get(0),
    )?;
    if !has_col {
        conn.execute_batch("ALTER TABLE calendar_events ADD COLUMN reminder_minutes INTEGER;")?;
    }
    conn.execute_batch("UPDATE calendar_events SET reminder_minutes = 15 WHERE reminder_minutes IS NULL;")?;

    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS calendar_event_reminders (
            event_id TEXT PRIMARY KEY,
            reminded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    "#)?;
    Ok(())
}

/// 版本化迁移入口（M1 修复）：
/// - 仅全新库（version=0）执行 DROP + CREATE 建表；
/// - 已有数据库一律走增量迁移（ALTER），绝不再 DROP 业务表；
/// - 未来 schema 变更：在此追加 `if current < N { ... }` 块并提升 SCHEMA_VERSION。
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let current = schema_version(conn);
    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    if current == 0 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value INTEGER);",
        )?;
        create_all_tables(conn)?;
    }

    // v3：为业务表补充云端同步元数据列与更新触发器（历史库 ALTER-only）
    if current < 3 {
        add_sync_columns_and_triggers(conn)?;
    }

    // v4：local-first 业务迁移
    //  - budgets.carry_over_cents：结转金额（分，可负），替代旧 rollover bool 语义
    //  - notes.content_text / cover_url：全文预览与封面（前端 Note 模型需要）
    //  - note_tag_master / note_note_tags：独立笔记标签 + 关联表（前端 NoteTag/NoteNoteTag 模型）
    if current < 4 {
        migrate_v4(conn)?;
    }

    // v5：本地账号体系（local-first 认证，替代 Supabase Auth）
    if current < 5 {
        migrate_v5(conn)?;
    }

    // v6：budgets 表补 updated_at 列（budget_list_all/budget_update SQL 引用）
    if current < 6 {
        migrate_v6(conn)?;
    }

    // v7：note_folders 表补 updated_at 列（note_folder_create/update SQL 引用）
    if current < 7 {
        migrate_v7(conn)?;
    }

    // v8：为 v3/v4 遗漏的 5 张表补 UPDATE 触发器，否则本地更新不会刷新 sync_modified_at，云同步漏数据。
    if current < 8 {
        migrate_v8(conn)?;
    }

    // v9：业务表 UPDATE 触发器增加 mute 开关，同步下载时临时禁触发，避免下载回环。
    if current < 9 {
        migrate_v9(conn)?;
    }

    // v10：新增 sync_tombstones 表与 DELETE 触发器，实现删除传播的 tombstone 机制。
    if current < 10 {
        migrate_v10(conn)?;
    }

    // v11：subtasks / tags / task_tags 补 updated_at 列，实现 LWW 冲突解决。
    if current < 11 {
        migrate_v11(conn)?;
    }

    // v12：日历事件提醒列与提醒记录表。
    if current < 12 {
        migrate_v12(conn)?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION],
    )?;
    Ok(())
}

/// 迁移完整性校验：验证关键表结构是否符合当前 schema 版本预期。
/// 校验失败时记录警告日志但不阻断启动，保证应用可用性。
pub fn verify_schema(conn: &Connection) {
    let version: Result<i32, _> = conn.query_row(
        "SELECT value FROM app_meta WHERE key='schema_version'",
        [], |row| row.get(0),
    );

    let version = match version {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("schema 校验失败：无法读取版本信息 - {}", e);
            return;
        }
    };

    let mut errors = Vec::new();

    // 1. 校验必需业务表是否存在
    let required_tables = [
        "tasks", "subtasks", "tags", "task_tags",
        "accounts", "categories", "transactions", "budgets",
        "notes", "note_folders", "note_tags",
        "calendar_events", "calendar_subscriptions",
        "users", "app_meta",
    ];

    for table in &required_tables {
        if !table_exists(conn, table) {
            errors.push(format!("缺少必需表: {}", table));
        }
    }

    // 2. 校验 v4+ 必需的笔记标签表
    if version >= 4 {
        for table in &["note_tag_master", "note_note_tags"] {
            if !table_exists(conn, table) {
                errors.push(format!("v4 必需表缺失: {}", table));
            }
        }
    }

    // 3. 校验 v10+ 必需的 tombstone 表
    if version >= 10 {
        if !table_exists(conn, "sync_tombstones") {
            errors.push("v10 必需表缺失: sync_tombstones".to_string());
        }
        if !table_exists(conn, "sync_mute_triggers") {
            errors.push("v10 必需表缺失: sync_mute_triggers".to_string());
        }
    }

    // 4. 校验 v12+ 必需的日历提醒表
    if version >= 12 {
        if !table_exists(conn, "calendar_event_reminders") {
            errors.push("v12 必需表缺失: calendar_event_reminders".to_string());
        }
    }

    // 5. 校验关键表的核心列（抽样检查）
    let critical_columns: Vec<(&str, Vec<&str>)> = vec![
        ("tasks", vec!["id", "title", "status", "created_at", "updated_at", "sync_modified_at"]),
        ("accounts", vec!["id", "name", "balance_cents", "created_at", "updated_at"]),
        ("transactions", vec!["id", "amount_cents", "date", "account_id"]),
        ("notes", vec!["id", "title", "content", "created_at", "updated_at"]),
    ];

    for (table, columns) in &critical_columns {
        if table_exists(conn, table) {
            for column in columns {
                if !has_column(conn, table, column) {
                    errors.push(format!("{} 表缺少关键列: {}", table, column));
                }
            }
        }
    }

    // 6. 校验同步触发器是否存在（v9+）
    if version >= 9 {
        let key_triggers = [
            "tasks_sync_touch", "accounts_sync_touch", "transactions_sync_touch",
            "notes_sync_touch", "calendar_events_sync_touch",
        ];

        for trigger in &key_triggers {
            if !trigger_exists(conn, trigger) {
                errors.push(format!("缺少关键触发器: {}", trigger));
            }
        }
    }

    // 7. 校验 tombstone 触发器（v10+）
    if version >= 10 {
        let tombstone_triggers = [
            "tasks_sync_tombstone", "accounts_sync_tombstone",
            "transactions_sync_tombstone", "notes_sync_tombstone",
        ];

        for trigger in &tombstone_triggers {
            if !trigger_exists(conn, trigger) {
                errors.push(format!("缺少 tombstone 触发器: {}", trigger));
            }
        }
    }

    // 输出校验结果
    if errors.is_empty() {
        tracing::info!("schema 完整性校验通过 (v{})", version);
    } else {
        tracing::warn!(
            "schema 完整性校验发现 {} 个问题 (v{}):\n  {}",
            errors.len(),
            version,
            errors.join("\n  ")
        );
    }
}

/// 辅助函数：检查表是否存在
fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        &format!(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='{}')",
            table
        ),
        [],
        |row| row.get::<_, i32>(0),
    )
    .unwrap_or(0)
        == 1
}

/// 辅助函数：检查触发器是否存在
fn trigger_exists(conn: &Connection, trigger: &str) -> bool {
    conn.query_row(
        &format!(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='{}')",
            trigger
        ),
        [],
        |row| row.get::<_, i32>(0),
    )
    .unwrap_or(0)
        == 1
}
