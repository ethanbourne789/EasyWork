-- 为 email_accounts 增加真实收发所需的登录凭据字段。
-- 注意：password 属敏感信息，仅通过 RLS（auth.uid() = user_id）对本人可见，
-- Edge Function 使用 service role 读取后仅在服务端用于连接 IMAP/SMTP，不对外暴露。

alter table public.email_accounts
  add column if not exists username text,
  add column if not exists password text,
  add column if not exists sync_enabled boolean not null default true;

-- 登录用户名缺省与邮箱地址一致；函数端读取时若 username 为空则回退到 email。
comment on column public.email_accounts.username is 'IMAP/SMTP 登录用户名，为空时回退到 email';
comment on column public.email_accounts.password is '邮箱密码/授权码（RLS 隔离，仅本人与 service role 可见）';
comment on column public.email_accounts.sync_enabled is '是否参与定时拉取与手动同步';
