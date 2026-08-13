use rusqlite::{Connection, params};
use std::path::Path;
use crate::mail::error::{MailError, MailResult};

const SCHEMA_VERSION: &str = "1";

pub fn init_db(db_path: &Path) -> MailResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
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
