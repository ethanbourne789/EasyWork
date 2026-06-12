use rusqlite::{Connection, Result};

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mail_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            provider TEXT NOT NULL DEFAULT 'imap',
            imap_host TEXT NOT NULL,
            imap_port INTEGER NOT NULL DEFAULT 993,
            smtp_host TEXT NOT NULL,
            smtp_port INTEGER NOT NULL DEFAULT 465,
            username TEXT NOT NULL,
            encrypted_password BLOB,
            use_tls INTEGER NOT NULL DEFAULT 1,
            sync_state TEXT NOT NULL DEFAULT '{}',
            sync_interval_secs INTEGER NOT NULL DEFAULT 300,
            sync_period_days INTEGER NOT NULL DEFAULT 30,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mail_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            remote_id TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT '',
            folder_type TEXT NOT NULL DEFAULT 'user',
            uid_validity INTEGER,
            highest_modseq INTEGER DEFAULT 0,
            last_uid INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE,
            UNIQUE(account_id, remote_id)
        );

        CREATE TABLE IF NOT EXISTS mail_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            remote_uid INTEGER NOT NULL,
            message_id_header TEXT NOT NULL DEFAULT '',
            subject TEXT NOT NULL DEFAULT '',
            from_name TEXT NOT NULL DEFAULT '',
            from_email TEXT NOT NULL DEFAULT '',
            to_list TEXT NOT NULL DEFAULT '[]',
            cc_list TEXT NOT NULL DEFAULT '[]',
            date TEXT NOT NULL DEFAULT '',
            body_text TEXT NOT NULL DEFAULT '',
            body_html TEXT NOT NULL DEFAULT '',
            is_read INTEGER NOT NULL DEFAULT 0,
            is_starred INTEGER NOT NULL DEFAULT 0,
            has_attachment INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            thread_id TEXT NOT NULL DEFAULT '',
            size INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mail_message_folders (
            message_id INTEGER NOT NULL,
            folder_id INTEGER NOT NULL,
            PRIMARY KEY (message_id, folder_id),
            FOREIGN KEY (message_id) REFERENCES mail_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (folder_id) REFERENCES mail_folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mail_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
            size INTEGER NOT NULL DEFAULT 0,
            local_path TEXT NOT NULL DEFAULT '',
            content_id TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (message_id) REFERENCES mail_messages(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mail_pending_ops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            message_id INTEGER,
            op_type TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mail_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            group_name TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
        );

        -- Indexes for columns created in the main DDL.
        -- Indexes on columns added via ALTER TABLE migration MUST be created
        -- after the migration block, not here.
        CREATE INDEX IF NOT EXISTS idx_mail_messages_account_id ON mail_messages(account_id);
        CREATE INDEX IF NOT EXISTS idx_mail_pending_ops_status ON mail_pending_ops(status);
        CREATE INDEX IF NOT EXISTS idx_mail_contacts_account_id ON mail_contacts(account_id);

        -- App config (key-value store)
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );

        -- FTS5 full-text search index
        CREATE VIRTUAL TABLE IF NOT EXISTS mail_fts USING fts5(
            subject, from_name, from_email, body_text,
            content='mail_messages',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
        );
        "
    )?;

    // Migration: add sync_period_days column if not exists
    let has_col: bool = conn
        .prepare("SELECT sync_period_days FROM mail_accounts LIMIT 0")
        .is_ok();
    if !has_col {
        conn.execute_batch(
            "ALTER TABLE mail_accounts ADD COLUMN sync_period_days INTEGER NOT NULL DEFAULT 30;"
        )?;
    }

    // Migration: add is_deleted, deleted_at, thread_id, content_hash columns
    for (col, def) in [
        ("is_deleted", "INTEGER NOT NULL DEFAULT 0"),
        ("deleted_at", "TEXT"),
        ("thread_id", "TEXT NOT NULL DEFAULT ''"),
        ("updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))"),
        ("content_hash", "TEXT NOT NULL DEFAULT ''"),
        ("date_sort", "TEXT NOT NULL DEFAULT ''"),
    ] {
        let has = conn
            .prepare(&format!("SELECT {} FROM mail_messages LIMIT 0", col))
            .is_ok();
        if !has {
            conn.execute_batch(&format!(
                "ALTER TABLE mail_messages ADD COLUMN {} {};", col, def
            ))?;
        }
    }

    // Migration: add payload, last_error columns to pending ops
    for (col, def) in [
        ("payload", "TEXT NOT NULL DEFAULT '{}'"),
        ("last_error", "TEXT"),
    ] {
        let has = conn
            .prepare(&format!("SELECT {} FROM mail_pending_ops LIMIT 0", col))
            .is_ok();
        if !has {
            conn.execute_batch(&format!(
                "ALTER TABLE mail_pending_ops ADD COLUMN {} {};", col, def
            ))?;
        }
    }

    // Migration: add folder cursor fields (uid_validity, highest_modseq, last_uid)
    for (col, def) in [
        ("uid_validity", "INTEGER"),
        ("highest_modseq", "INTEGER DEFAULT 0"),
        ("last_uid", "INTEGER DEFAULT 0"),
    ] {
        let has = conn
            .prepare(&format!("SELECT {} FROM mail_folders LIMIT 0", col))
            .is_ok();
        if !has {
            conn.execute_batch(&format!(
                "ALTER TABLE mail_folders ADD COLUMN {} {};", col, def
            ))?;
        }
    }

    // ↑ All ALTER TABLE migrations must run BEFORE these indexes.
    // The columns below may not exist in old versions of the DB,
    // so the index creation is placed here, after the migration block.
    let _ = conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_mail_messages_thread_id ON mail_messages(thread_id);
         CREATE INDEX IF NOT EXISTS idx_mail_messages_is_deleted ON mail_messages(is_deleted);
         CREATE INDEX IF NOT EXISTS idx_mail_messages_content_hash ON mail_messages(content_hash);
         CREATE INDEX IF NOT EXISTS idx_mail_messages_date_sort ON mail_messages(date_sort);
         CREATE INDEX IF NOT EXISTS idx_mail_messages_account_date ON mail_messages(account_id, date_sort);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_messages_msgid ON mail_messages(account_id, message_id_header)
             WHERE message_id_header != '';"
    );

    // ── New column migrations for v2 features (Combined inbox / Notifications) ──
    for (col, def) in [
        ("color", "TEXT NOT NULL DEFAULT ''"),
        ("is_default", "INTEGER NOT NULL DEFAULT 0"),
        ("notifications_enabled", "INTEGER NOT NULL DEFAULT 1"),
        ("display_name", "TEXT NOT NULL DEFAULT ''"),
    ] {
        let has = conn
            .prepare(&format!("SELECT {} FROM mail_accounts LIMIT 0", col))
            .is_ok();
        if !has {
            let _ = conn.execute_batch(&format!(
                "ALTER TABLE mail_accounts ADD COLUMN {} {};", col, def
            ));
        }
    }

    Ok(())
}
