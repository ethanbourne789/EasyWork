-- ============================================
-- V2__indexes.sql — 索引优化
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_time ON tasks(due_time);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_calendars_start ON calendars(start_at);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder, account_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_uid   ON mail_messages(uid, account_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_sports_records_date ON sports_records(date);
CREATE INDEX IF NOT EXISTS idx_logs_level  ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_module ON logs(module);
