-- 0019_mail_cron.sql
-- 定时后台收信：每 5 分钟触发 fetch-mail Edge Function。
-- fetch-mail 在 { "scheduled": true } 时由函数内部用 SERVICE_ROLE_KEY 遍历所有 sync_enabled 账号，
-- 网关鉴权只需一个有效密钥（anon key 为公开密钥，前端同样内置），故此处用 anon key。
--
-- 前置（部署本项目前执行一次）：
--   supabase secrets set SUPABASE_URL=<project-url> SUPABASE_ANON_KEY=<anon-key>
--   这两个值会写入 Vault，供下方 vault.get_secret 读取。
-- 可选替代方案（无需本迁移）：Supabase Dashboard → Edge Functions → fetch-mail → 添加 Cron 任务（*/5 * * * *）。
--
-- 幂等：重复执行不会报错。

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('fetch-mail-every-5min');
exception
  when others then null;
end $$;

select cron.schedule(
  'fetch-mail-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select vault.get_secret('SUPABASE_URL')) || '/functions/v1/fetch-mail',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select vault.get_secret('SUPABASE_ANON_KEY')),
      'Content-Type', 'application/json'
    ),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
