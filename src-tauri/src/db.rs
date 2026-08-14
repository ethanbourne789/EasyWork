use rusqlite::{Connection, params};
use std::path::Path;

const SCHEMA_VERSION: i32 = 6;

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
    conn.query_row(
        "SELECT value FROM app_meta WHERE key='schema_version'",
        [], |row| row.get(0),
    ).unwrap_or_else(|_| {
        let has_tables: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('tasks','notes','accounts'))",
            [], |row| row.get(0),
        ).unwrap_or(false);
        if has_tables { SCHEMA_VERSION } else { 0 }
    })
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

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION],
    )?;
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
            created_at TEXT NOT NULL
        );
        CREATE INDEX idx_subtasks_task ON subtasks(task_id, sort_order);

        CREATE TABLE tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE task_tags (
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
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
            created_at TEXT NOT NULL
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
    conn.execute_batch(r#"
        ALTER TABLE tasks ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE tasks ADD COLUMN sync_device_id TEXT;
        ALTER TABLE subtasks ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE subtasks ADD COLUMN sync_device_id TEXT;
        ALTER TABLE tags ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE tags ADD COLUMN sync_device_id TEXT;
        ALTER TABLE task_tags ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE task_tags ADD COLUMN sync_device_id TEXT;
        ALTER TABLE accounts ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE accounts ADD COLUMN sync_device_id TEXT;
        ALTER TABLE categories ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE categories ADD COLUMN sync_device_id TEXT;
        ALTER TABLE transactions ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE transactions ADD COLUMN sync_device_id TEXT;
        ALTER TABLE budgets ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE budgets ADD COLUMN sync_device_id TEXT;
        ALTER TABLE notes ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE notes ADD COLUMN sync_device_id TEXT;
        ALTER TABLE note_folders ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE note_folders ADD COLUMN sync_device_id TEXT;
        ALTER TABLE note_tags ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE note_tags ADD COLUMN sync_device_id TEXT;
        ALTER TABLE calendar_events ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE calendar_events ADD COLUMN sync_device_id TEXT;
        ALTER TABLE calendar_subscriptions ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        ALTER TABLE calendar_subscriptions ADD COLUMN sync_device_id TEXT;
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
