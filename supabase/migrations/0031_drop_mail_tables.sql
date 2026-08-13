-- 退役邮件模块的 Supabase 资源
-- 邮件模块已迁移到 Tauri 2 + Rust 原生实现（本地 SQLite + keyring）
-- 仅在所有用户完成本地迁移后执行

-- 删除表
DROP TABLE IF EXISTS email_attachments CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS email_folders CASCADE;
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_signatures CASCADE;
DROP TABLE IF EXISTS mail_sync_locks CASCADE;

-- 删除 RPC
DROP FUNCTION IF EXISTS unread_email_counts();
DROP FUNCTION IF EXISTS claim_mail_sync_lock(uuid);
DROP FUNCTION IF EXISTS release_mail_sync_lock(uuid);
DROP FUNCTION IF EXISTS encrypt_email_password(text, text);
DROP FUNCTION IF EXISTS decrypt_email_password(text, text);

-- 删除 Storage 桶
DELETE FROM storage.objects WHERE bucket_id = 'email-attachments';
DELETE FROM storage.buckets WHERE id = 'email-attachments';