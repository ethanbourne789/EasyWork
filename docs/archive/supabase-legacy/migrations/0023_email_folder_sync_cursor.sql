-- 0023_email_folder_sync_cursor.sql
-- 为 email_folders 增加增量同步所需的游标与元数据列。
-- 这些列云端已通过 execute_sql 直接添加；此处补一份本地迁移文件以便仓库追踪
-- （均带 IF NOT EXISTS，幂等，重复执行无副作用）。

alter table public.email_folders add column if not exists last_uid bigint;
alter table public.email_folders add column if not exists uid_validity bigint;
alter table public.email_folders add column if not exists total_count integer not null default 0;
alter table public.email_folders add column if not exists synced_at timestamptz;
