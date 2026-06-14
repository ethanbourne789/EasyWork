-- ============================================
-- V5__app_logs.sql — 应用日志表（增强版）
-- ============================================

-- 应用日志表（替代原有 logs 表）
CREATE TABLE IF NOT EXISTS app_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id    TEXT,           -- 调用链追踪 ID
    level       TEXT NOT NULL,  -- DEBUG/INFO/WARN/ERROR
    module      TEXT NOT NULL,  -- 模块名：mail/accounting/note/settings/system
    action      TEXT,           -- 操作：add_account/sync/send_mail/txn_create
    status      TEXT,           -- 状态：START/SUCCESS/FAILED
    params      TEXT,           -- JSON 格式的参数（脱敏）
    result      TEXT,           -- JSON 格式的结果摘要
    error_msg   TEXT,           -- 错误信息
    duration_ms INTEGER,        -- 耗时（毫秒）
    source_file TEXT,           -- 源文件名
    source_line INTEGER,        -- 源文件行号
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引：优化查询性能
CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_module ON app_logs(module);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_trace ON app_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_action ON app_logs(module, action);
