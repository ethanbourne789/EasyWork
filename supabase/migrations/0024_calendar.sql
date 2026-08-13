-- 0024_calendar.sql
-- 日历模块：本地日程（calendar_events）+ 外部日历订阅源（calendar_subscriptions）。
--
-- 设计要点：
--   1. calendar_events 同时承载「用户手工创建的本地日程」与「从订阅源同步下来的只读事件」，
--      用 source / subscription_id 区分。订阅源删除时其事件级联删除。
--   2. 外部事件以 (subscription_id, external_uid) 唯一，供 Edge Function 幂等 upsert，
--      避免重复同步产生重复行。
--   3. 任务与收支不在此建表 —— 日历视图直接复用既有 tasks.due_date 与 transactions.date，
--      保持单一数据源，不做冗余同步。

-- ---------------------------------------------------------------------------
-- 订阅源：支持钉钉 CalDAV 与通用 ICS/webcal 链接
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null default 'ics' check (provider in ('ics', 'dingtalk_caldav', 'caldav')),
  url text not null,
  username text,
  password text,
  color text not null default '#6366f1',
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  event_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.calendar_subscriptions.provider is 'ics=通用 ICS/webcal 订阅链接；dingtalk_caldav=钉钉日历 CalDAV；caldav=其他 CalDAV 服务';
comment on column public.calendar_subscriptions.url is 'ICS 订阅地址，或 CalDAV 服务器地址（钉钉为 https://calendar.dingtalk.com）';
comment on column public.calendar_subscriptions.password is 'CalDAV 专用密码（RLS 隔离，仅本人与 service role 可见）';

alter table public.calendar_subscriptions enable row level security;
drop policy if exists "calendar_subscriptions_select" on public.calendar_subscriptions;
create policy "calendar_subscriptions_select" on public.calendar_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "calendar_subscriptions_insert" on public.calendar_subscriptions;
create policy "calendar_subscriptions_insert" on public.calendar_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "calendar_subscriptions_update" on public.calendar_subscriptions;
create policy "calendar_subscriptions_update" on public.calendar_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "calendar_subscriptions_delete" on public.calendar_subscriptions;
create policy "calendar_subscriptions_delete" on public.calendar_subscriptions for delete using (auth.uid() = user_id);

drop trigger if exists update_calendar_subscriptions_updated_at on public.calendar_subscriptions;
create trigger update_calendar_subscriptions_updated_at before update on public.calendar_subscriptions
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 日程事件
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.calendar_subscriptions(id) on delete cascade,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  color text,
  source text not null default 'local' check (source in ('local', 'ics', 'dingtalk')),
  external_uid text,
  organizer text,
  reminder_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.calendar_events.source is 'local=本地创建可编辑；ics/dingtalk=订阅同步而来，前端只读';
comment on column public.calendar_events.external_uid is '外部日历事件 UID（ICS VEVENT.UID），用于幂等同步';

-- 幂等同步键：同一订阅源下同一外部 UID 只保留一行
drop index if exists public.calendar_events_external_uniq;
create unique index calendar_events_external_uniq
  on public.calendar_events (subscription_id, external_uid)
  where subscription_id is not null and external_uid is not null;

-- 按用户 + 时间范围查询（月/周视图主查询路径）
create index if not exists calendar_events_user_start_idx
  on public.calendar_events (user_id, start_at);

alter table public.calendar_events enable row level security;
drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select" on public.calendar_events for select using (auth.uid() = user_id);
drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert" on public.calendar_events for insert with check (auth.uid() = user_id);
drop policy if exists "calendar_events_update" on public.calendar_events;
create policy "calendar_events_update" on public.calendar_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete" on public.calendar_events for delete using (auth.uid() = user_id);

drop trigger if exists update_calendar_events_updated_at on public.calendar_events;
create trigger update_calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 授权
--   anon/authenticated：0017 已设置 default privileges，此处显式再授一次以防迁移
--   执行角色不一致导致遗漏（幂等，行级安全仍由 RLS 保证）。
--   service_role：Edge Function (sync-calendar) 需绕过 RLS 写入订阅事件，
--   而 service_role 仅有 BYPASSRLS，仍需表级 GRANT（参见 0010 的同类处理）。
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table public.calendar_events to anon, authenticated;
grant select, insert, update, delete on table public.calendar_subscriptions to anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on table public.calendar_events to service_role;
grant all privileges on table public.calendar_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- 实时同步：加入 supabase_realtime 发布（幂等）
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['calendar_events', 'calendar_subscriptions'];
begin
  foreach t in array tables
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
