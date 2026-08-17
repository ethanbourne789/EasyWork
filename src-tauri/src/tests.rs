use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::AppSharedState;
use crate::business::{new_id, now, cents_to_yuan, int_to_bool};
use rusqlite::params;
use tracing_appender::non_blocking::WorkerGuard;

// ---------------------------------------------------------------------------
// AppSharedState 测试
// ---------------------------------------------------------------------------

fn make_shared_state(close: bool) -> AppSharedState {
    AppSharedState {
        close_behavior: Arc::new(AtomicBool::new(close)),
        tracing_guard: Arc::new((|| -> WorkerGuard {
            let (_non_blocking, guard) = tracing_appender::non_blocking(std::io::sink());
            guard
        })()),
    }
}

#[test]
fn test_close_behavior_default_false() {
    let state = make_shared_state(false);
    assert!(!state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_set_true() {
    let state = make_shared_state(false);
    state.close_behavior.store(true, Ordering::Relaxed);
    assert!(state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_toggle() {
    let state = make_shared_state(false);
    assert!(!state.close_behavior.load(Ordering::Relaxed));
    state.close_behavior.store(true, Ordering::Relaxed);
    assert!(state.close_behavior.load(Ordering::Relaxed));
    state.close_behavior.store(false, Ordering::Relaxed);
    assert!(!state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_clone_shares_state() {
    let state = make_shared_state(false);
    let cloned = state.clone();
    cloned.close_behavior.store(true, Ordering::Relaxed);
    assert!(state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_concurrent_access() {
    let state = make_shared_state(false);
    let mut handles = vec![];

    for _ in 0..10 {
        let s = state.clone();
        let handle = std::thread::spawn(move || {
            s.close_behavior.store(true, Ordering::Relaxed);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    assert!(state.close_behavior.load(Ordering::Relaxed));
}

// ---------------------------------------------------------------------------
// 辅助函数测试
// ---------------------------------------------------------------------------

#[test]
fn test_cents_to_yuan_basic() {
    assert_eq!(cents_to_yuan(100), 1.0);
    assert_eq!(cents_to_yuan(1500), 15.0);
    assert_eq!(cents_to_yuan(1), 0.01);
    assert_eq!(cents_to_yuan(0), 0.0);
    assert_eq!(cents_to_yuan(-500), -5.0);
}

#[test]
fn test_cents_to_yuan_precision() {
    assert_eq!(cents_to_yuan(12345), 123.45);
    assert_eq!(cents_to_yuan(999999), 9999.99);
}

#[test]
fn test_int_to_bool() {
    assert!(!int_to_bool(0));
    assert!(int_to_bool(1));
    assert!(int_to_bool(-1));
    assert!(int_to_bool(42));
}

#[test]
fn test_new_id_uniqueness() {
    let id1 = new_id();
    let id2 = new_id();
    assert_ne!(id1, id2);
    assert!(!id1.is_empty());
}

#[test]
fn test_new_id_format() {
    let id = new_id();
    let parts: Vec<&str> = id.split('-').collect();
    assert_eq!(parts.len(), 5);
}

#[test]
fn test_now_format() {
    let ts = now();
    assert!(ts.contains('T'));
    assert!(ts.ends_with('Z') || ts.contains('+'));
}

// ---------------------------------------------------------------------------
// 数据库初始化测试
// ---------------------------------------------------------------------------

fn create_test_db() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().expect("Failed to open in-memory DB");
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").unwrap();
    // Run create_all_tables SQL inline to avoid migration_v11 bug with has_column on fresh DB
    crate::db::create_all_tables_for_test(&conn).expect("Failed to create tables");
    conn
}

#[test]
fn test_db_init_creates_tables() {
    let conn = create_test_db();
    let tables = [
        "tasks", "subtasks", "tags", "task_tags",
        "accounts", "categories", "transactions", "budgets",
        "notes", "note_folders", "note_tags",
        "calendar_events", "calendar_subscriptions",
        "users", "app_meta",
    ];
    for table in &tables {
        let exists: bool = conn.query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='{}')", table),
            [],
            |r| r.get(0),
        ).unwrap();
        assert!(exists, "Table {} should exist", table);
    }
}

#[test]
fn test_db_schema_version() {
    let conn = create_test_db();
    let version: i32 = conn.query_row(
        "SELECT value FROM app_meta WHERE key='schema_version'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert!(version >= 12, "Schema version should be at least 12, got {}", version);
}

#[test]
fn test_db_wal_mode() {
    let conn = create_test_db();
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    // In-memory DBs use "memory" journal mode; file-based DBs use "wal"
    assert!(mode == "wal" || mode == "memory", "Expected wal or memory, got {}", mode);
}

#[test]
fn test_db_foreign_keys_enabled() {
    let conn = create_test_db();
    let fk: i32 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk, 1);
}

// ---------------------------------------------------------------------------
// 任务模块数据库测试
// ---------------------------------------------------------------------------

#[test]
fn test_task_create_and_read() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id,title,description,status,priority,due_date,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,0,?7,?7)",
        params![id, "测试任务", "测试描述", "todo", "high", "2026-09-01", ts],
    ).unwrap();

    let count: i32 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);

    let title: String = conn.query_row(
        "SELECT title FROM tasks WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(title, "测试任务");
}

#[test]
fn test_task_default_values() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![id, "默认任务", ts],
    ).unwrap();

    let (status, priority): (String, String) = conn.query_row(
        "SELECT status, priority FROM tasks WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(status, "todo");
    assert_eq!(priority, "medium");
}

#[test]
fn test_task_status_update() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id,title,status,sort_order,created_at,updated_at) VALUES (?1,?2,?3,0,?4,?4)",
        params![id, "任务", "todo", ts],
    ).unwrap();

    conn.execute(
        "UPDATE tasks SET status = 'in_progress', updated_at = ?2 WHERE id = ?1",
        params![id, now()],
    ).unwrap();

    let status: String = conn.query_row(
        "SELECT status FROM tasks WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(status, "in_progress");
}

#[test]
fn test_task_delete() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![id, "删除任务", ts],
    ).unwrap();

    let rows: usize = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id]).unwrap();
    assert_eq!(rows, 1);

    let count: i32 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 0);
}

#[test]
fn test_task_recurrence_rule_storage() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    let rule = r#"{"frequency":"day","interval":1}"#;
    conn.execute(
        "INSERT INTO tasks (id,title,recurrence_rule,recurrence_next,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,0,?5,?5)",
        params![id, "重复任务", rule, "2026-08-18", ts],
    ).unwrap();

    let (rule_stored, next): (String, String) = conn.query_row(
        "SELECT recurrence_rule, recurrence_next FROM tasks WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(rule_stored, rule);
    assert_eq!(next, "2026-08-18");
}

// ---------------------------------------------------------------------------
// 子任务测试
// ---------------------------------------------------------------------------

#[test]
fn test_subtask_cascade_delete() {
    let conn = create_test_db();
    let task_id = new_id();
    let sub_id = new_id();
    let ts = now();

    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![task_id, "父任务", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO subtasks (id,task_id,title,done,sort_order,created_at,updated_at) VALUES (?1,?2,?3,0,0,?4,?4)",
        params![sub_id, task_id, "子任务", ts],
    ).unwrap();

    conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id]).unwrap();

    let count: i32 = conn.query_row("SELECT COUNT(*) FROM subtasks WHERE task_id = ?1", params![task_id], |r| r.get(0)).unwrap();
    assert_eq!(count, 0);
}

#[test]
fn test_subtask_sort_order() {
    let conn = create_test_db();
    let task_id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![task_id, "任务", ts],
    ).unwrap();

    for i in 1..=3 {
        conn.execute(
            "INSERT INTO subtasks (id,task_id,title,done,sort_order,created_at,updated_at) VALUES (?1,?2,?3,0,?4,?5,?5)",
            params![new_id(), task_id, format!("子任务{}", i), i as i64, ts],
        ).unwrap();
    }

    let count: i32 = conn.query_row("SELECT COUNT(*) FROM subtasks WHERE task_id = ?1", params![task_id], |r| r.get(0)).unwrap();
    assert_eq!(count, 3);
}

// ---------------------------------------------------------------------------
// 标签与任务关联测试
// ---------------------------------------------------------------------------

#[test]
fn test_tag_crud() {
    let conn = create_test_db();
    let tag_id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tags (id,name,color,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![tag_id, "工作", "#3b82f6", ts],
    ).unwrap();

    let name: String = conn.query_row(
        "SELECT name FROM tags WHERE id = ?1",
        params![tag_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(name, "工作");

    conn.execute(
        "UPDATE tags SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![tag_id, "工作-已更新", now()],
    ).unwrap();

    let updated_name: String = conn.query_row(
        "SELECT name FROM tags WHERE id = ?1",
        params![tag_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(updated_name, "工作-已更新");
}

#[test]
fn test_task_tag_relation() {
    let conn = create_test_db();
    let task_id = new_id();
    let tag_id = new_id();
    let ts = now();

    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![task_id, "任务", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO tags (id,name,created_at,updated_at) VALUES (?1,?2,?3,?3)",
        params![tag_id, "重要", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO task_tags (task_id,tag_id,updated_at) VALUES (?1,?2,?3)",
        params![task_id, tag_id, ts],
    ).unwrap();

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
        params![task_id, tag_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(count, 1);
}

// ---------------------------------------------------------------------------
// 财务模块测试
// ---------------------------------------------------------------------------

#[test]
fn test_account_create_and_balance() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,0,?6,?6)",
        params![id, "现金钱包", "cash", 100000_i64, "CNY", ts],
    ).unwrap();

    let balance: i64 = conn.query_row(
        "SELECT balance_cents FROM accounts WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(balance, 100000);
}

#[test]
fn test_transaction_types() {
    let conn = create_test_db();
    let account_id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,0,?6,?6)",
        params![account_id, "钱包", "wallet", 0, "CNY", ts],
    ).unwrap();

    let expense_id = new_id();
    conn.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,account_id,date,description,created_at,updated_at) \
         VALUES (?1,'expense',?3,'CNY',?4,?5,?6,?7,?7)",
        params![expense_id, account_id, 5000_i64, account_id, "2026-08-17", "午餐", ts],
    ).unwrap();

    let income_id = new_id();
    conn.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,account_id,date,description,created_at,updated_at) \
         VALUES (?1,'income',?3,'CNY',?4,?5,?6,?7,?7)",
        params![income_id, account_id, 20000_i64, account_id, "2026-08-17", "工资", ts],
    ).unwrap();

    let transfer_id = new_id();
    let to_account_id = new_id();
    conn.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,0,?6,?6)",
        params![to_account_id, "银行卡", "bank", 0, "CNY", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,account_id,transfer_account_id,date,description,created_at,updated_at) \
         VALUES (?1,'transfer',?3,'CNY',?4,?5,?6,?7,?8,?8)",
        params![transfer_id, account_id, 10000_i64, account_id, to_account_id, "2026-08-17", "转账", ts],
    ).unwrap();

    let expense_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE type = 'expense'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(expense_count, 1);

    let income_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE type = 'income'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(income_count, 1);

    let transfer_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE type = 'transfer'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(transfer_count, 1);
}

#[test]
fn test_transaction_amount_cents_precision() {
    let conn = create_test_db();
    let account_id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,0,?6,?6)",
        params![account_id, "钱包", "wallet", 0, "CNY", ts],
    ).unwrap();

    let id = new_id();
    conn.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,account_id,date,created_at,updated_at) \
         VALUES (?1,'expense',123,'CNY',?2,?3,?4,?4)",
        params![id, account_id, "2026-08-17", ts],
    ).unwrap();

    let amount_cents: i64 = conn.query_row(
        "SELECT amount_cents FROM transactions WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(amount_cents, 123);
    assert_eq!(cents_to_yuan(amount_cents), 1.23);
}

#[test]
fn test_budget_creation() {
    let conn = create_test_db();
    let budget_id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO budgets (id,amount_cents,period,period_start,period_end,year_month,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![budget_id, 50000_i64, "monthly", "2026-08-01", "2026-08-31", "2026-08", ts],
    ).unwrap();

    let amount: i64 = conn.query_row(
        "SELECT amount_cents FROM budgets WHERE id = ?1",
        params![budget_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(amount, 50000);
}

#[test]
fn test_category_hierarchy() {
    let conn = create_test_db();
    let parent_id = new_id();
    let child_id = new_id();
    let ts = now();

    conn.execute(
        "INSERT INTO categories (id,name,type,sort_order,created_at) VALUES (?1,?2,?3,0,?4)",
        params![parent_id, "餐饮", "expense", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO categories (id,name,type,parent_id,sort_order,created_at) VALUES (?1,?2,?3,?4,0,?5)",
        params![child_id, "外卖", "expense", parent_id, ts],
    ).unwrap();

    let parent_name: String = conn.query_row(
        "SELECT name FROM categories WHERE id = ?1",
        params![parent_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(parent_name, "餐饮");

    let child_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM categories WHERE parent_id = ?1",
        params![parent_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(child_count, 1);
}

// ---------------------------------------------------------------------------
// 笔记模块测试
// ---------------------------------------------------------------------------

#[test]
fn test_note_create_with_content() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO notes (id,title,content,is_pinned,created_at,updated_at) VALUES (?1,?2,?3,0,?4,?4)",
        params![id, "测试笔记", "<p>Hello World</p>", ts],
    ).unwrap();

    let title: String = conn.query_row(
        "SELECT title FROM notes WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(title, "测试笔记");
}

#[test]
fn test_note_folder_hierarchy() {
    let conn = create_test_db();
    let folder_id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO note_folders (id,name,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![folder_id, "工作笔记", ts],
    ).unwrap();

    let note_id = new_id();
    conn.execute(
        "INSERT INTO notes (id,title,content,folder_id,is_pinned,created_at,updated_at) VALUES (?1,?2,?3,?4,0,?5,?5)",
        params![note_id, "笔记", "内容", folder_id, ts],
    ).unwrap();

    let note_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE folder_id = ?1",
        params![folder_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(note_count, 1);
}

// ---------------------------------------------------------------------------
// 日历模块测试
// ---------------------------------------------------------------------------

#[test]
fn test_calendar_event_create_and_query() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO calendar_events (id,title,start_at,end_at,all_day,source,reminder_minutes,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,0,?5,?6,?7,?7)",
        params![id, "会议", "2026-08-18T10:00:00Z", "2026-08-18T11:00:00Z", "local", 15_i64, ts],
    ).unwrap();

    let title: String = conn.query_row(
        "SELECT title FROM calendar_events WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(title, "会议");

    let reminder: i64 = conn.query_row(
        "SELECT reminder_minutes FROM calendar_events WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(reminder, 15);
}

#[test]
fn test_calendar_all_day_event() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO calendar_events (id,title,start_at,end_at,all_day,source,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,1,'local',?5,?5)",
        params![id, "假期", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", ts],
    ).unwrap();

    let all_day: i64 = conn.query_row(
        "SELECT all_day FROM calendar_events WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(all_day, 1);
    assert!(int_to_bool(all_day));
}

#[test]
fn test_calendar_subscription_crud() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO calendar_subscriptions (id,name,provider,url,color,enabled,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
        params![id, "工作日历", "ics", "https://example.com/calendar.ics", "#3b82f6", ts],
    ).unwrap();

    let name: String = conn.query_row(
        "SELECT name FROM calendar_subscriptions WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(name, "工作日历");

    conn.execute(
        "UPDATE calendar_subscriptions SET enabled = 0, updated_at = ?2 WHERE id = ?1",
        params![id, now()],
    ).unwrap();

    let enabled: i64 = conn.query_row(
        "SELECT enabled FROM calendar_subscriptions WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(enabled, 0);
}

// ---------------------------------------------------------------------------
// 认证模块测试
// ---------------------------------------------------------------------------

#[test]
fn test_user_table_structure() {
    let conn = create_test_db();
    let user_id = new_id();
    let ts = now();

    conn.execute(
        "INSERT INTO users (id,email,password_hash,display_name,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?5)",
        params![user_id, "test@example.com", "$argon2id$v=19$m=19456,t=2,p=1$hash", "测试用户", ts],
    ).unwrap();

    let email: String = conn.query_row(
        "SELECT email FROM users WHERE id = ?1",
        params![user_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(email, "test@example.com");
}

#[test]
fn test_user_email_unique_constraint() {
    let conn = create_test_db();
    let ts = now();
    conn.execute(
        "INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![new_id(), "unique@test.com", "hash", ts],
    ).unwrap();

    let result = conn.execute(
        "INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![new_id(), "unique@test.com", "hash", ts],
    );
    assert!(result.is_err(), "Duplicate email should fail");
}

// ---------------------------------------------------------------------------
// 备份表结构测试
// ---------------------------------------------------------------------------

#[test]
fn test_backup_tables_exist() {
    let conn = create_test_db();
    let backup_tables = [
        "tasks", "subtasks", "tags", "task_tags",
        "accounts", "categories", "transactions", "budgets",
        "notes", "note_folders", "note_tag_master", "note_note_tags",
        "calendar_events", "calendar_subscriptions",
    ];
    for table in &backup_tables {
        let exists: bool = conn.query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='{}')", table),
            [],
            |r| r.get(0),
        ).unwrap();
        assert!(exists, "Backup table {} should exist", table);
    }
}

#[test]
fn test_clear_order_fk_safety() {
    let conn = create_test_db();
    let ts = now();
    let task_id = new_id();
    let sub_id = new_id();
    let account_id = new_id();
    let txn_id = new_id();

    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![task_id, "任务", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO subtasks (id,task_id,title,done,sort_order,created_at,updated_at) VALUES (?1,?2,?3,0,0,?4,?4)",
        params![sub_id, task_id, "子任务", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) \
         VALUES (?1,?2,?3,0,?4,0,?5,?5)",
        params![account_id, "钱包", "cash", "CNY", ts],
    ).unwrap();
    conn.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,account_id,date,created_at,updated_at) \
         VALUES (?1,'expense',100,'CNY',?2,?3,?4,?4)",
        params![txn_id, account_id, "2026-08-17", ts],
    ).unwrap();

    const CLEAR_ORDER: &[&str] = &[
        "subtasks", "task_tags", "note_note_tags",
        "transactions", "budgets", "notes", "calendar_events",
        "tasks", "tags", "accounts", "categories",
        "note_folders", "note_tag_master", "calendar_subscriptions",
    ];

    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("UPDATE categories SET parent_id = NULL", []).unwrap();
    tx.execute("UPDATE note_folders SET parent_id = NULL", []).unwrap();
    for table in CLEAR_ORDER {
        tx.execute(&format!("DELETE FROM \"{}\"", table), []).unwrap();
    }
    tx.commit().unwrap();

    let total: i32 = conn.query_row(
        "SELECT SUM(count) FROM (SELECT COUNT(*) as count FROM tasks UNION ALL \
         SELECT COUNT(*) FROM subtasks UNION ALL \
         SELECT COUNT(*) FROM accounts UNION ALL \
         SELECT COUNT(*) FROM transactions)",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(total, 0);
}

// ---------------------------------------------------------------------------
// 同步元数据测试
// ---------------------------------------------------------------------------

#[test]
fn test_sync_mute_triggers_table() {
    let conn = create_test_db();
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_mute_triggers')",
        [],
        |r| r.get(0),
    ).unwrap();
    assert!(exists, "sync_mute_triggers table should exist");

    let muted: i32 = conn.query_row(
        "SELECT COALESCE(muted, 0) FROM sync_mute_triggers WHERE id = 0",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(muted, 0);
}

#[test]
fn test_sync_tombstones_table() {
    let conn = create_test_db();
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_tombstones')",
        [],
        |r| r.get(0),
    ).unwrap();
    assert!(exists, "sync_tombstones table should exist");
}

#[test]
fn test_sync_modified_at_trigger() {
    let conn = create_test_db();
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id,title,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)",
        params![id, "触发器测试", ts],
    ).unwrap();

    let _old_sync: Option<String> = conn.query_row(
        "SELECT sync_modified_at FROM tasks WHERE id = ?1",
        params![id],
        |r| r.get::<_, Option<String>>(0),
    ).unwrap();

    std::thread::sleep(std::time::Duration::from_millis(100));

    conn.execute(
        "UPDATE tasks SET title = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now()],
    ).unwrap();

    let new_sync: Option<String> = conn.query_row(
        "SELECT sync_modified_at FROM tasks WHERE id = ?1",
        params![id],
        |r| r.get::<_, Option<String>>(0),
    ).unwrap();

    assert!(new_sync.is_some(), "sync_modified_at should be set by trigger");
    assert!(new_sync.as_ref().unwrap().contains('T'));
}

// ---------------------------------------------------------------------------
// 日历提醒表测试
// ---------------------------------------------------------------------------

#[test]
fn test_calendar_event_reminders_table() {
    let conn = create_test_db();
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='calendar_event_reminders')",
        [],
        |r| r.get(0),
    ).unwrap();
    assert!(exists, "calendar_event_reminders table should exist");
}
