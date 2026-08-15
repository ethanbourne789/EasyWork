use rusqlite::{Connection, params};
use std::path::Path;
use crate::mail::error::MailResult;

const SCHEMA_VERSION: &str = "4";

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

    if current == "0" {
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS mail_meta (key TEXT PRIMARY KEY, value TEXT);
        "#)?;
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

    if current.as_str() < "2" {
        conn.execute_batch(r#"
            ALTER TABLE email_accounts ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
            ALTER TABLE email_accounts ADD COLUMN sync_device_id TEXT;
        "#).ok();

        conn.execute_batch(r#"
            CREATE TRIGGER IF NOT EXISTS email_accounts_sync_touch AFTER UPDATE ON email_accounts
            BEGIN
                UPDATE email_accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;
        "#).ok();
    }

    if current.as_str() < "3" {
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                emails TEXT NOT NULL DEFAULT '[]', phones TEXT NOT NULL DEFAULT '[]',
                company TEXT, title TEXT, notes TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

            CREATE TABLE IF NOT EXISTS contact_groups (
                id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contact_group_members (
                contact_id TEXT NOT NULL, group_id TEXT NOT NULL,
                PRIMARY KEY (contact_id, group_id)
            );
            CREATE INDEX IF NOT EXISTS idx_cgm_group ON contact_group_members(group_id);
        "#)?;
    }

    // v4：联系人/模板/签名纳入云端 PG 增量同步（同步列 + UPDATE 触发器 + FTS 触发器）。
    // 条件兼容半迁移状态（上次崩溃留下的部分列），幂等重跑。
    if current.as_str() < "4" || !has_column(conn, "email_signatures", "sync_modified_at") {
        // ⚠️ 同步列一律「无 DEFAULT 的 NULL 列 + 存量回填」：
        //    `ADD COLUMN ... DEFAULT (strftime(...))` 在【非空表】上非法
        //    （Cannot add a column with non-constant default）会导致迁移崩溃（实测 email_signatures）。
        let sync_columns: &[(&str, &[&str])] = &[
            ("email_templates", &["updated_at", "sync_modified_at", "sync_device_id"]),
            ("email_signatures", &["sync_modified_at", "sync_device_id"]),
            ("contacts", &["sync_modified_at", "sync_device_id"]),
            ("contact_groups", &["sync_modified_at", "sync_device_id"]),
            ("contact_group_members", &["sync_modified_at", "sync_device_id"]),
        ];
        for (table, cols) in sync_columns {
            for col in *cols {
                if !has_column(conn, table, col) {
                    conn.execute(&format!("ALTER TABLE {} ADD COLUMN {} TEXT", table, col), [])?;
                }
            }
        }

        // 存量回填（幂等）
        conn.execute_batch(r#"
            UPDATE email_templates SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL;
            UPDATE email_templates SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
            UPDATE email_signatures SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
            UPDATE contacts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
            UPDATE contact_groups SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
            UPDATE contact_group_members SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;
        "#)?;

        conn.execute_batch(r#"
            CREATE TRIGGER IF NOT EXISTS email_templates_sync_touch AFTER UPDATE ON email_templates
            BEGIN
                UPDATE email_templates SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;
            CREATE TRIGGER IF NOT EXISTS email_signatures_sync_touch AFTER UPDATE ON email_signatures
            BEGIN
                UPDATE email_signatures SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;
            CREATE TRIGGER IF NOT EXISTS contacts_sync_touch AFTER UPDATE ON contacts
            BEGIN
                UPDATE contacts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;
            CREATE TRIGGER IF NOT EXISTS contact_groups_sync_touch AFTER UPDATE ON contact_groups
            BEGIN
                UPDATE contact_groups SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;
            CREATE TRIGGER IF NOT EXISTS contact_group_members_sync_touch AFTER UPDATE ON contact_group_members
            BEGIN
                UPDATE contact_group_members SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE contact_id = NEW.contact_id AND group_id = NEW.group_id;
            END;

            -- emails_fts 全文索引触发器（外链表 content='emails'，需手动同步 rowid）
            CREATE TRIGGER IF NOT EXISTS emails_fts_insert AFTER INSERT ON emails BEGIN
                INSERT INTO emails_fts(rowid, subject, from_address, preview_text, body_text)
                VALUES (new.rowid, new.subject, new.from_address, new.preview_text, new.body_text);
            END;
            CREATE TRIGGER IF NOT EXISTS emails_fts_delete AFTER DELETE ON emails BEGIN
                INSERT INTO emails_fts(emails_fts, rowid, subject, from_address, preview_text, body_text)
                VALUES('delete', old.rowid, old.subject, old.from_address, old.preview_text, old.body_text);
            END;
            CREATE TRIGGER IF NOT EXISTS emails_fts_update AFTER UPDATE ON emails BEGIN
                INSERT INTO emails_fts(emails_fts, rowid, subject, from_address, preview_text, body_text)
                VALUES('delete', old.rowid, old.subject, old.from_address, old.preview_text, old.body_text);
                INSERT INTO emails_fts(rowid, subject, from_address, preview_text, body_text)
                VALUES (new.rowid, new.subject, new.from_address, new.preview_text, new.body_text);
            END;
        "#)?;

        // 存量邮件回填 FTS（delete-all 后 rebuild，幂等）
        conn.execute_batch(r#"
            INSERT INTO emails_fts(emails_fts) VALUES('delete-all');
            INSERT INTO emails_fts(emails_fts) VALUES('rebuild');
        "#)?;
    }

    // crate::sync::config::create_sync_tables(conn)?;

    conn.execute(
        "INSERT OR REPLACE INTO mail_meta (key, value) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION]
    )?;
    Ok(())
}

/// 幂等迁移辅助：检查某表是否已存在某列
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
