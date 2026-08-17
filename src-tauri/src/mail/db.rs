use rusqlite::{Connection, params};
use std::path::Path;
use crate::mail::error::MailResult;

const SCHEMA_VERSION: &str = "7";

pub fn init_db(db_path: &Path) -> MailResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> MailResult<()> {
    let current: String = match conn.query_row(
        "SELECT value FROM mail_meta WHERE key='schema_version'",
        [], |row| row.get(0)
    ) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => "0".to_string(),
        Err(e) => {
            tracing::warn!("读取 mail schema 版本失败，按全新库处理: {}", e);
            "0".to_string()
        }
    };

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

        CREATE TABLE IF NOT EXISTS sync_mute_triggers (
            id INTEGER PRIMARY KEY CHECK (id = 0),
            muted INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO sync_mute_triggers (id, muted) VALUES (0, 0);

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
            file_path TEXT NOT NULL, is_inline INTEGER DEFAULT 0, content_id TEXT, created_at TEXT NOT NULL,
            part_id TEXT, pending_download INTEGER DEFAULT 0
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
        // 幂等添加同步列：先检查避免重复 ALTER 报错。
        // ⚠️ 禁止「ADD COLUMN ... NOT NULL DEFAULT (strftime(...))」：SQLite 的 ADD COLUMN
        //    不允许括号表达式作为默认值（Cannot add a column with non-constant default），
        //    全新库（current=0 也会走本分支）与旧库升级都会崩溃（实测崩溃点）。改用
        //    「无 DEFAULT 的 NULL 列 + 存量回填」，与 v4 同步列迁移一致；同步引擎已兜底 NULL。
        if !has_column(conn, "email_accounts", "sync_modified_at") {
            conn.execute(
                "ALTER TABLE email_accounts ADD COLUMN sync_modified_at TEXT",
                []
            )?;
        }
        if !has_column(conn, "email_accounts", "sync_device_id") {
            conn.execute(
                "ALTER TABLE email_accounts ADD COLUMN sync_device_id TEXT",
                []
            )?;
        }
        conn.execute_batch(r#"
            UPDATE email_accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_modified_at IS NULL;

            CREATE TRIGGER IF NOT EXISTS email_accounts_sync_touch AFTER UPDATE ON email_accounts
            BEGIN
                UPDATE email_accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;
        "#)?;
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

    // v5：邮件库同步触发器增加 mute 开关，与业务库保持一致。
    if current.as_str() < "5" {
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS sync_mute_triggers (
                id INTEGER PRIMARY KEY CHECK (id = 0),
                muted INTEGER NOT NULL DEFAULT 0
            );
            INSERT OR IGNORE INTO sync_mute_triggers (id, muted) VALUES (0, 0);

            DROP TRIGGER IF EXISTS email_accounts_sync_touch;
            DROP TRIGGER IF EXISTS email_templates_sync_touch;
            DROP TRIGGER IF EXISTS email_signatures_sync_touch;
            DROP TRIGGER IF EXISTS contacts_sync_touch;
            DROP TRIGGER IF EXISTS contact_groups_sync_touch;
            DROP TRIGGER IF EXISTS contact_group_members_sync_touch;

            CREATE TRIGGER IF NOT EXISTS email_accounts_sync_touch AFTER UPDATE ON email_accounts
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                UPDATE email_accounts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS email_templates_sync_touch AFTER UPDATE ON email_templates
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                UPDATE email_templates SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS email_signatures_sync_touch AFTER UPDATE ON email_signatures
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                UPDATE email_signatures SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS contacts_sync_touch AFTER UPDATE ON contacts
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                UPDATE contacts SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS contact_groups_sync_touch AFTER UPDATE ON contact_groups
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                UPDATE contact_groups SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS contact_group_members_sync_touch AFTER UPDATE ON contact_group_members
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                UPDATE contact_group_members SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE contact_id = NEW.contact_id AND group_id = NEW.group_id;
            END;
        "#)?;
    }

    // v6：新增 sync_tombstones 表与 DELETE 触发器，支持删除传播。
    if current.as_str() < "6" {
        conn.execute_batch(r#"
            -- 触发器 WHEN 子句依赖此表，需在创建触发器前确保存在。
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

            CREATE TRIGGER IF NOT EXISTS email_accounts_sync_tombstone AFTER DELETE ON email_accounts
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
                VALUES ('email_accounts', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
            END;

            CREATE TRIGGER IF NOT EXISTS email_templates_sync_tombstone AFTER DELETE ON email_templates
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
                VALUES ('email_templates', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
            END;

            CREATE TRIGGER IF NOT EXISTS email_signatures_sync_tombstone AFTER DELETE ON email_signatures
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
                VALUES ('email_signatures', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
            END;

            CREATE TRIGGER IF NOT EXISTS contacts_sync_tombstone AFTER DELETE ON contacts
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
                VALUES ('contacts', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
            END;

            CREATE TRIGGER IF NOT EXISTS contact_groups_sync_tombstone AFTER DELETE ON contact_groups
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
                VALUES ('contact_groups', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
            END;

            CREATE TRIGGER IF NOT EXISTS contact_group_members_sync_tombstone AFTER DELETE ON contact_group_members
            WHEN (SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0) = 0
            BEGIN
                INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id)
                VALUES ('contact_group_members', json_array(OLD.contact_id, OLD.group_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
            END;
        "#)?;
    }

    // v7：email_attachments 支持大附件按需下载——记录 MIME part 编号与待下载标记。
    // 幂等添加列（CREATE TABLE IF NOT EXISTS 已含新列，仅对旧库执行 ALTER）。
    if current.as_str() < "7" {
        if !has_column(conn, "email_attachments", "part_id") {
            conn.execute("ALTER TABLE email_attachments ADD COLUMN part_id TEXT", [])?;
        }
        if !has_column(conn, "email_attachments", "pending_download") {
            conn.execute(
                "ALTER TABLE email_attachments ADD COLUMN pending_download INTEGER DEFAULT 0",
                [],
            )?;
        }
    }

    // crate::sync::config::create_sync_tables(conn)?;

    conn.execute(
        "INSERT OR REPLACE INTO mail_meta (key, value) VALUES ('schema_version', ?1)",
        params![SCHEMA_VERSION]
    )?;
    Ok(())
}

/// 迁移完整性校验：验证邮件数据库关键表结构是否符合当前 schema 版本预期。
/// 校验失败时记录警告日志但不阻断启动，保证应用可用性。
pub fn verify_schema(conn: &Connection) {
    let version: Result<String, _> = conn.query_row(
        "SELECT value FROM mail_meta WHERE key='schema_version'",
        [], |row| row.get(0),
    );

    let version_str = match version {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("mail schema 校验失败：无法读取版本信息 - {}", e);
            return;
        }
    };

    let version: u32 = version_str.parse().unwrap_or(0);
    let mut errors = Vec::new();

    // 1. 校验必需业务表是否存在
    let required_tables = [
        "email_accounts", "email_folders", "emails", "email_attachments",
        "mail_sync_state", "emails_fts", "mail_meta",
    ];

    for table in &required_tables {
        if !table_exists(conn, table) {
            errors.push(format!("缺少必需表: {}", table));
        }
    }

    // 2. 校验 v3+ 必需的联系人表
    if version >= 3 {
        let contact_tables = ["contacts", "contact_groups", "contact_group_members"];
        for table in &contact_tables {
            if !table_exists(conn, table) {
                errors.push(format!("v3 必需表缺失: {}", table));
            }
        }
    }

    // 3. 校验 v4+ 必需的模板和签名表
    if version >= 4 {
        let template_tables = ["email_templates", "email_signatures"];
        for table in &template_tables {
            if !table_exists(conn, table) {
                errors.push(format!("v4 必需表缺失: {}", table));
            }
        }
    }

    // 4. 校验 v5+ 必需的 mute 开关表
    if version >= 5 {
        if !table_exists(conn, "sync_mute_triggers") {
            errors.push("v5 必需表缺失: sync_mute_triggers".to_string());
        }
    }

    // 5. 校验 v6+ 必需的 tombstone 表
    if version >= 6 {
        if !table_exists(conn, "sync_tombstones") {
            errors.push("v6 必需表缺失: sync_tombstones".to_string());
        }
    }

    // 6. 校验关键表的核心列（抽样检查）
    let critical_columns: Vec<(&str, Vec<&str>)> = vec![
        ("email_accounts", vec!["id", "email", "credential_ref", "created_at"]),
        ("emails", vec!["id", "account_id", "subject", "received_at"]),
        ("email_attachments", vec!["id", "email_id", "file_path"]),
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

    // 7. 校验 FTS 触发器（v4+）
    if version >= 4 {
        let fts_triggers = [
            "emails_fts_insert", "emails_fts_delete", "emails_fts_update",
        ];

        for trigger in &fts_triggers {
            if !trigger_exists(conn, trigger) {
                errors.push(format!("缺少 FTS 触发器: {}", trigger));
            }
        }
    }

    // 8. 校验同步触发器（v5+）
    if version >= 5 {
        let sync_triggers = [
            "email_accounts_sync_touch", "email_templates_sync_touch",
            "email_signatures_sync_touch", "contacts_sync_touch",
        ];

        for trigger in &sync_triggers {
            if !trigger_exists(conn, trigger) {
                errors.push(format!("缺少同步触发器: {}", trigger));
            }
        }
    }

    // 9. 校验 tombstone 触发器（v6+）
    if version >= 6 {
        let tombstone_triggers = [
            "email_accounts_sync_tombstone", "email_templates_sync_tombstone",
            "contacts_sync_tombstone",
        ];

        for trigger in &tombstone_triggers {
            if !trigger_exists(conn, trigger) {
                errors.push(format!("缺少 tombstone 触发器: {}", trigger));
            }
        }
    }

    // 输出校验结果
    if errors.is_empty() {
        tracing::info!("mail schema 完整性校验通过 (v{})", version_str);
    } else {
        tracing::warn!(
            "mail schema 完整性校验发现 {} 个问题 (v{}):\n  {}",
            errors.len(),
            version_str,
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
