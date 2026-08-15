use tokio_postgres::Client;

pub async fn init_cloud_schema(client: &Client) -> Result<(), String> {
    let schema = r#"
        CREATE TABLE IF NOT EXISTS devices (
            device_id TEXT PRIMARY KEY,
            device_name TEXT NOT NULL,
            last_seen_at TEXT NOT NULL DEFAULT now()::text,
            created_at TEXT NOT NULL DEFAULT now()::text
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            device_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            last_synced_at TEXT NOT NULL,
            PRIMARY KEY (device_id, table_name)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT NOT NULL DEFAULT 'medium',
            due_date TEXT,
            recurrence_rule TEXT,
            recurrence_next TEXT,
            parent_task_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_sync_modified ON tasks(sync_modified_at);

        CREATE TABLE IF NOT EXISTS subtasks (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            title TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_subtasks_sync_modified ON subtasks(sync_modified_at);

        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tags_sync_modified ON tags(sync_modified_at);

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL,
            PRIMARY KEY (task_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_task_tags_sync_modified ON task_tags(sync_modified_at);

        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            "type" TEXT NOT NULL,
            balance_cents INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'CNY',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_accounts_sync_modified ON accounts(sync_modified_at);

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            "type" TEXT NOT NULL,
            icon TEXT,
            parent_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_categories_sync_modified ON categories(sync_modified_at);

        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            "type" TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CNY',
            category_id TEXT,
            account_id TEXT NOT NULL,
            transfer_account_id TEXT,
            date TEXT NOT NULL,
            description TEXT,
            receipt_path TEXT,
            task_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_sync_modified ON transactions(sync_modified_at);

        CREATE TABLE IF NOT EXISTS budgets (
            id TEXT PRIMARY KEY,
            category_id TEXT,
            amount_cents INTEGER NOT NULL,
            period TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            rollover INTEGER NOT NULL DEFAULT 0,
            carry_over_cents INTEGER NOT NULL DEFAULT 0,
            scope TEXT DEFAULT 'category',
            year_month TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_budgets_sync_modified ON budgets(sync_modified_at);

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            folder_id TEXT,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            content_text TEXT,
            cover_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_sync_modified ON notes(sync_modified_at);

        CREATE TABLE IF NOT EXISTS note_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            parent_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_note_folders_sync_modified ON note_folders(sync_modified_at);

        CREATE TABLE IF NOT EXISTS note_tags (
            note_id TEXT NOT NULL,
            tag_name TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL,
            PRIMARY KEY (note_id, tag_name)
        );
        CREATE INDEX IF NOT EXISTS idx_note_tags_sync_modified ON note_tags(sync_modified_at);

        CREATE TABLE IF NOT EXISTS note_tag_master (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_note_tag_master_sync_modified ON note_tag_master(sync_modified_at);

        CREATE TABLE IF NOT EXISTS note_note_tags (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL,
            UNIQUE (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_note_tags_sync_modified ON note_note_tags(sync_modified_at);

        CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            subscription_id TEXT,
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
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_events_sync_modified ON calendar_events(sync_modified_at);

        CREATE TABLE IF NOT EXISTS calendar_subscriptions (
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
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_sync_modified ON calendar_subscriptions(sync_modified_at);

        CREATE TABLE IF NOT EXISTS email_accounts (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            display_name TEXT,
            username TEXT,
            credential_ref TEXT NOT NULL,
            imap_host TEXT NOT NULL,
            imap_port INTEGER NOT NULL DEFAULT 993,
            smtp_host TEXT NOT NULL,
            smtp_port INTEGER NOT NULL DEFAULT 465,
            use_ssl INTEGER NOT NULL DEFAULT 1,
            auth_type TEXT NOT NULL DEFAULT 'password',
            signature_id TEXT,
            signature_auto_append_new INTEGER DEFAULT 1,
            signature_auto_append_reply INTEGER DEFAULT 1,
            last_synced_at TEXT,
            last_synced_uid INTEGER,
            sync_enabled INTEGER NOT NULL DEFAULT 1,
            sync_interval_mins INTEGER DEFAULT 5,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_accounts_sync_modified ON email_accounts(sync_modified_at);

        CREATE TABLE IF NOT EXISTS email_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            subject TEXT,
            body TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_templates_sync_modified ON email_templates(sync_modified_at);

        CREATE TABLE IF NOT EXISTS email_signatures (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            html TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_signatures_sync_modified ON email_signatures(sync_modified_at);

        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            emails TEXT NOT NULL DEFAULT '[]',
            phones TEXT NOT NULL DEFAULT '[]',
            company TEXT,
            title TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_sync_modified ON contacts(sync_modified_at);

        CREATE TABLE IF NOT EXISTS contact_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contact_groups_sync_modified ON contact_groups(sync_modified_at);

        CREATE TABLE IF NOT EXISTS contact_group_members (
            contact_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            sync_modified_at TEXT NOT NULL,
            sync_device_id TEXT NOT NULL,
            PRIMARY KEY (contact_id, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_contact_group_members_sync_modified ON contact_group_members(sync_modified_at);
    "#;

    client.batch_execute(schema).await
        .map_err(|e| format!("初始化云端 Schema 失败: {}", e))?;
    Ok(())
}
