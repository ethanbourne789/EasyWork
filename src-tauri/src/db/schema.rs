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

    // ── v3 migration: contacts / contact groups (V1.1 PR4) ──
    // 创建 mail_contact_groups 表（IF NOT EXISTS 保护）
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mail_contact_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6366f1',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(account_id, name),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mail_contact_groups_account_id
            ON mail_contact_groups(account_id);"
    );
    // 检查 mail_contacts 是否需要升级 (group_name 字符串 → group_id 外键)
    let needs_contact_upgrade = conn
        .prepare("SELECT group_id FROM mail_contacts LIMIT 0")
        .is_err();

    if needs_contact_upgrade {
        log::info!("Migrating mail_contacts: string group_name → integer group_id FK");

        // 1. 收集现有 (account_id, group_name) distinct → 自动建分组
        //    颜色按 name 哈希到 12 色调色板
        let palette = [
            "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
            "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
            "#a855f7", "#d946ef",
        ];
        let mut stmt = conn
            .prepare("SELECT DISTINCT account_id, group_name FROM mail_contacts WHERE group_name != ''")
            .unwrap();
        let rows: Vec<(i64, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);

        // 2. 事务内：建新表 + 迁移数据 + 删旧表
        let tx = conn.unchecked_transaction().unwrap();
        for (idx, (account_id, group_name)) in rows.iter().enumerate() {
            let color = palette[idx % palette.len()];
            let sort_order = idx as i32;
            tx.execute(
                "INSERT OR IGNORE INTO mail_contact_groups (account_id, name, color, sort_order) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![account_id, group_name, color, sort_order],
            ).ok();
        }
        // 复制到临时表（带 group_id 回填 + display_name 默认 name）
        tx.execute_batch(
            "CREATE TABLE mail_contacts_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                group_id INTEGER REFERENCES mail_contact_groups(id) ON DELETE SET NULL,
                display_name TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
            );
            INSERT INTO mail_contacts_new
                (id, account_id, name, email, phone, group_id, display_name, notes, created_at)
            SELECT
                mc.id, mc.account_id, mc.name, mc.email, mc.phone,
                (SELECT g.id FROM mail_contact_groups g
                 WHERE g.account_id = mc.account_id AND g.name = mc.group_name LIMIT 1),
                mc.name AS display_name,
                mc.notes, mc.created_at
            FROM mail_contacts mc;
            DROP TABLE mail_contacts;
            ALTER TABLE mail_contacts_new RENAME TO mail_contacts;
            CREATE INDEX IF NOT EXISTS idx_mail_contacts_account_id ON mail_contacts(account_id);
            CREATE INDEX IF NOT EXISTS idx_mail_contacts_group_id ON mail_contacts(group_id);
            CREATE INDEX IF NOT EXISTS idx_mail_contacts_email ON mail_contacts(email);"
        ).map_err(|e| {
            log::error!("Contact migration failed: {}", e);
            e
        })?;
        // 3. (account_id, email) 唯一约束
        // SQLite 不支持直接 ADD CONSTRAINT，用唯一索引
        tx.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_contacts_account_email
             ON mail_contacts(account_id, email COLLATE NOCASE)",
            [],
        ).ok();
        tx.commit().map_err(|e| {
            log::error!("Contact migration commit failed: {}", e);
            e
        })?;
        log::info!("mail_contacts migration complete: {} contact groups created", rows.len());
    }

    // ── v4 migration: 股票模块（自选股 / 交易 / 预警） ──
    //   旧 `stocks` 表（含 alert_type / target_price）已废弃，本 init 不再创建。
    //   DDL 集中放在 src-tauri/src/db/migrations/V4__stock.sql 作为参考文档。
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stock_watchlist (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT    NOT NULL,
            name        TEXT    NOT NULL,
            market_type TEXT    NOT NULL DEFAULT 'a_stock'
                                CHECK(market_type IN ('a_stock','crypto')),
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            UNIQUE(symbol, market_type)
        );
        CREATE INDEX IF NOT EXISTS idx_stock_watchlist_symbol
            ON stock_watchlist(symbol);
        CREATE INDEX IF NOT EXISTS idx_stock_watchlist_sort_order
            ON stock_watchlist(sort_order, id);

        CREATE TABLE IF NOT EXISTS stock_trades (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol     TEXT    NOT NULL,
            trade_type TEXT    NOT NULL CHECK(trade_type IN ('buy','sell')),
            price      REAL    NOT NULL CHECK(price > 0),
            quantity   REAL    NOT NULL CHECK(quantity > 0),
            fee        REAL    NOT NULL DEFAULT 0 CHECK(fee >= 0),
            traded_at  TEXT    NOT NULL,
            note       TEXT,
            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_stock_trades_symbol_date
            ON stock_trades(symbol, traded_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_stock_trades_traded_at
            ON stock_trades(traded_at);

        CREATE TABLE IF NOT EXISTS stock_alerts (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol             TEXT    NOT NULL,
            market_type        TEXT    NOT NULL DEFAULT 'a_stock'
                                        CHECK(market_type IN ('a_stock','crypto')),
            alert_type         TEXT    NOT NULL
                                        CHECK(alert_type IN ('price_above','price_below','pct_change_up','pct_change_down')),
            target_value       REAL    NOT NULL,
            is_enabled         INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
            cooldown_minutes   INTEGER NOT NULL DEFAULT 30 CHECK(cooldown_minutes >= 0),
            last_triggered_at  TEXT,
            trigger_count      INTEGER NOT NULL DEFAULT 0,
            note               TEXT,
            created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_stock_alerts_enabled
            ON stock_alerts(is_enabled, symbol);

        -- 老库可能没有 updated_at 列；缺则补上（与其它表保持一致）
        "
    );
    for (table, def) in [
        ("stock_watchlist", "TEXT NOT NULL DEFAULT (datetime('now'))"),
        ("stock_trades",    "TEXT NOT NULL DEFAULT (datetime('now'))"),
        ("stock_alerts",    "TEXT NOT NULL DEFAULT (datetime('now'))"),
    ] {
        let has = conn
            .prepare(&format!("SELECT updated_at FROM {} LIMIT 0", table))
            .is_ok();
        if !has {
            let _ = conn.execute_batch(&format!(
                "ALTER TABLE {} ADD COLUMN updated_at {};",
                table, def
            ));
        }
    }

    // 历史遗留：早期 stock_watchlist 缺 UNIQUE(symbol, market_type)，
    // 导致相同股票可重复插入。补建唯一索引以依赖 DB 约束防竞态。
    let _ = conn.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_watchlist_symbol_market
            ON stock_watchlist(symbol, market_type);"
    );

    // ── v5 migration: 补全其他模块表结构（V1 SQL 迁移文件中的表） ──
    // 这些表在 V1__initial.sql 中定义，但 schema.rs 之前未创建
    let _ = conn.execute_batch(
        "
        -- 任务表 (看板)
        CREATE TABLE IF NOT EXISTS tasks (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT    NOT NULL,
            description     TEXT    DEFAULT '',
            status          TEXT    NOT NULL DEFAULT 'todo',
            priority        TEXT    DEFAULT 'medium',
            urgency         TEXT    DEFAULT 'medium',
            difficulty      TEXT    DEFAULT 'medium',
            assignee        TEXT    DEFAULT '',
            start_time      TEXT,
            due_time        TEXT,
            completed_at    TEXT,
            rating          INTEGER DEFAULT 0,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_time ON tasks(due_time);

        -- 交易记录表 (记账)
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            type        TEXT    NOT NULL,
            amount      REAL    NOT NULL,
            category    TEXT    NOT NULL,
            subcategory TEXT    DEFAULT '',
            note        TEXT    DEFAULT '',
            date        TEXT    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

        -- 日历事件表
        CREATE TABLE IF NOT EXISTS calendars (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT    DEFAULT '',
            start_at    TEXT    NOT NULL,
            end_at      TEXT    NOT NULL,
            type        TEXT    DEFAULT 'event',
            color       TEXT    DEFAULT '#5BCFC4',
            is_all_day  INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_calendars_start ON calendars(start_at);

        -- 笔记表
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT    NOT NULL,
            content    TEXT    DEFAULT '',
            folder_id  INTEGER DEFAULT 0,
            tags       TEXT    DEFAULT '[]',
            created_at TEXT    DEFAULT (datetime('now')),
            updated_at TEXT    DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);

        -- 笔记文件夹表
        CREATE TABLE IF NOT EXISTS note_folders (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT    NOT NULL,
            parent_id INTEGER
        );

        -- 运动记录表
        CREATE TABLE IF NOT EXISTS sports_records (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            type       TEXT    NOT NULL,
            duration   INTEGER NOT NULL,
            distance   REAL,
            calories   INTEGER,
            date       TEXT    NOT NULL,
            note       TEXT    DEFAULT '',
            created_at TEXT    DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sports_records_date ON sports_records(date);

        -- 设置键值表
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );

        -- 日志表
        CREATE TABLE IF NOT EXISTS logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            level      TEXT    NOT NULL DEFAULT 'INFO',
            module     TEXT    NOT NULL DEFAULT 'app',
            message    TEXT    NOT NULL,
            created_at TEXT    DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
        CREATE INDEX IF NOT EXISTS idx_logs_module ON logs(module);

        -- 时间线节点表
        CREATE TABLE IF NOT EXISTS timelines (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id    INTEGER,
            node_desc  TEXT    NOT NULL,
            created_at TEXT    DEFAULT (datetime('now'))
        );
        "
    );

    // ── v6 migration: 邮件签名 ──
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mail_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            signature_text TEXT NOT NULL DEFAULT '',
            signature_html TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mail_signatures_account_id ON mail_signatures(account_id);"
    );

    // ── v7 migration: 记账模块完善 ──
    // 1. 为 transactions 表添加 updated_at 字段
    let has_txn_updated_at = conn
        .prepare("SELECT updated_at FROM transactions LIMIT 0")
        .is_ok();
    if !has_txn_updated_at {
        let _ = conn.execute_batch(
            "ALTER TABLE transactions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));"
        );
    }

    // 2. 创建 categories 表
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income','expense','investment','transfer')),
            icon TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            parent_id INTEGER DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
        CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);"
    );

    // 3. 创建 budgets 表
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL DEFAULT '',
            amount REAL NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_budgets_year_month ON budgets(year, month);"
    );

    // 4. 创建 import_logs 表
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            total_count INTEGER NOT NULL DEFAULT 0,
            success_count INTEGER NOT NULL DEFAULT 0,
            fail_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    );

    // 5. 插入默认分类（仅在表为空时）
    let category_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
        .unwrap_or(0);
    if category_count == 0 {
        let _ = conn.execute_batch(
            "INSERT INTO categories (name, type, icon, sort_order) VALUES
                ('工资', 'income', '💰', 1),
                ('兼职', 'income', '💼', 2),
                ('理财', 'income', '📈', 3),
                ('其他收入', 'income', '💵', 4),
                ('餐饮', 'expense', '🍔', 10),
                ('交通', 'expense', '🚗', 11),
                ('购物', 'expense', '🛒', 12),
                ('娱乐', 'expense', '🎮', 13),
                ('医疗', 'expense', '🏥', 14),
                ('教育', 'expense', '📚', 15),
                ('住房', 'expense', '🏠', 16),
                ('通讯', 'expense', '📱', 17),
                ('其他支出', 'expense', '📦', 18),
                ('投资', 'investment', '📊', 20),
                ('转账', 'transfer', '🔄', 30);"
        );
    }

    // ── v8 migration: app_logs 增强日志表 ──
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trace_id    TEXT,
            level       TEXT NOT NULL DEFAULT 'INFO',
            module      TEXT NOT NULL DEFAULT 'system',
            action      TEXT,
            status      TEXT,
            params      TEXT,
            result      TEXT,
            error_msg   TEXT,
            duration_ms INTEGER,
            source_file TEXT,
            source_line INTEGER,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_app_logs_module ON app_logs(module);
        CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
        CREATE INDEX IF NOT EXISTS idx_app_logs_trace ON app_logs(trace_id);
        CREATE INDEX IF NOT EXISTS idx_app_logs_action ON app_logs(module, action);"
    );

    // ── v9 migration: 云同步追踪字段 ──
    // 为需要同步的表添加 sync_version 和 sync_status 字段
    let sync_tables = [
        "transactions",
        "categories",
        "budgets",
        "sports_records",
        "stock_watchlist",
        "stock_trades",
        "stock_alerts",
        "mail_accounts",
        "mail_folders",
        "mail_signatures",
        "mail_contacts",
        "mail_contact_groups",
        "notes",
        "note_folders",
        "calendars",
        "tasks",
        "timelines",
        "settings",
        "app_config",
    ];

    for table in sync_tables {
        // 添加 sync_version 字段
        let has_sync_version = conn
            .prepare(&format!("SELECT sync_version FROM {} LIMIT 0", table))
            .is_ok();
        if !has_sync_version {
            let _ = conn.execute_batch(&format!(
                "ALTER TABLE {} ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0;",
                table
            ));
        }

        // 添加 sync_status 字段
        let has_sync_status = conn
            .prepare(&format!("SELECT sync_status FROM {} LIMIT 0", table))
            .is_ok();
        if !has_sync_status {
            let _ = conn.execute_batch(&format!(
                "ALTER TABLE {} ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';",
                table
            ));
        }
    }

    // 创建同步版本追踪表
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sync_global_version (
            table_name TEXT PRIMARY KEY,
            last_synced_version INTEGER NOT NULL DEFAULT 0,
            last_synced_at TEXT
        );"
    );

    Ok(())
}
