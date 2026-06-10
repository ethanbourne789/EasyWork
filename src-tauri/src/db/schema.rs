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
            size INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
            message_id INTEGER NOT NULL,
            op_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
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

    Ok(())
}
