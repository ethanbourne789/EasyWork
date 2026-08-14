-- 0024_mail_cron_service_auth.sql
-- 修复 S2：fetch-mail 的定时分支此前仅由公开 anon key 触发（{ "scheduled": true }），
-- 任何拿到 URL + anon key 的人都能触发全量 IMAP 同步（出网成本 / 资源耗尽 / 对邮件服务器 DoS）。
-- 改为：定时分支要求请求携带 SERVICE_ROLE_KEY（pg_cron 经 Vault 注入），
-- fetch-mail/index.ts 已在该分支校验 Authorization: Bearer <SERVICE_ROLE_KEY>。
-- 此处重新调度 cron，使其在请求头中带上 SERVICE_ROLE_KEY。

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
      'Authorization', 'Bearer ' || (select vault.get_secret('SUPABASE_SERVICE_ROLE_KEY')),
      'Content-Type', 'application/json'
    ),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
