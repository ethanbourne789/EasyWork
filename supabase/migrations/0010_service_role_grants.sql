-- 授予 service_role 对邮件相关表的完整权限。
-- Edge Function 使用 SERVICE_ROLE_KEY 读写数据（绕过 RLS），但 service_role
-- 默认仅 BYPASSRLS，仍需要表级 GRANT 才能 SELECT/INSERT/UPDATE。
-- 幂等：重复 GRANT 无害。

grant usage on schema public to service_role;

grant all privileges on table public.email_accounts to service_role;
grant all privileges on table public.email_folders to service_role;
grant all privileges on table public.emails to service_role;
grant all privileges on table public.email_attachments to service_role;
