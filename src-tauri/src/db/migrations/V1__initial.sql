-- ============================================
-- V1__initial.sql — EasyWork 全部表结构
-- ============================================

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

-- 交易记录表 (记账)
CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY,
    type        TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    category    TEXT    NOT NULL,
    subcategory TEXT    DEFAULT '',
    note        TEXT    DEFAULT '',
    date        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

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

-- 邮件消息表
CREATE TABLE IF NOT EXISTS mail_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER NOT NULL,
    uid           INTEGER NOT NULL,
    subject       TEXT,
    sender        TEXT,
    recipients    TEXT,
    body_text     TEXT,
    body_html     TEXT,
    folder        TEXT    DEFAULT 'INBOX',
    is_read       INTEGER DEFAULT 0,
    is_starred    INTEGER DEFAULT 0,
    received_date TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    UNIQUE(account_id, uid)
);

-- 邮件账户表
CREATE TABLE IF NOT EXISTS mail_accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    username      TEXT,
    imap_host     TEXT,
    imap_port     INTEGER,
    smtp_host     TEXT,
    smtp_port     INTEGER,
    sync_period   INTEGER DEFAULT 30,
    sync_interval INTEGER DEFAULT 15
);

-- 联系人表
CREATE TABLE IF NOT EXISTS contacts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    email    TEXT,
    phone    TEXT,
    group_id INTEGER
);

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

-- 笔记文件夹表
CREATE TABLE IF NOT EXISTS note_folders (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    parent_id INTEGER
);

-- 股票关注表
CREATE TABLE IF NOT EXISTS stocks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT    UNIQUE NOT NULL,
    name         TEXT    NOT NULL,
    alert_type   TEXT,
    target_price REAL,
    is_enabled   INTEGER DEFAULT 1
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

-- 时间线节点表
CREATE TABLE IF NOT EXISTS timelines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER,
    node_desc  TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
);
