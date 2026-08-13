-- 邮箱模块

-- email_accounts 表
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  imap_host text not null,
  imap_port int not null,
  smtp_host text not null,
  smtp_port int not null,
  use_ssl boolean not null default true,
  last_synced_uid int,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

alter table public.email_accounts enable row level security;
drop policy if exists "email_accounts_select" on public.email_accounts; create policy "email_accounts_select" on public.email_accounts for select using (auth.uid() = user_id);
drop policy if exists "email_accounts_insert" on public.email_accounts; create policy "email_accounts_insert" on public.email_accounts for insert with check (auth.uid() = user_id);
drop policy if exists "email_accounts_update" on public.email_accounts; create policy "email_accounts_update" on public.email_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "email_accounts_delete" on public.email_accounts; create policy "email_accounts_delete" on public.email_accounts for delete using (auth.uid() = user_id);

drop trigger if exists update_email_accounts_updated_at on public.email_accounts;
create trigger update_email_accounts_updated_at before update on public.email_accounts for each row execute function public.update_updated_at();

-- email_folders 表
create table if not exists public.email_folders (
  id uuid primary key default gen_random_uuid(),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  imap_path text not null,
  unread_count int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.email_folders enable row level security;
drop policy if exists "email_folders_select" on public.email_folders; create policy "email_folders_select" on public.email_folders for select using (auth.uid() = user_id);
drop policy if exists "email_folders_insert" on public.email_folders; create policy "email_folders_insert" on public.email_folders for insert with check (auth.uid() = user_id);
drop policy if exists "email_folders_update" on public.email_folders; create policy "email_folders_update" on public.email_folders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "email_folders_delete" on public.email_folders; create policy "email_folders_delete" on public.email_folders for delete using (auth.uid() = user_id);

-- emails 表
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  user_id uuid not null,
  folder_id uuid references public.email_folders(id),
  message_id text,
  uid int,
  from_address text,
  to_addresses text[],
  cc_addresses text[],
  subject text,
  preview_text text,
  body_html text,
  body_text text,
  has_attachments boolean default false,
  is_read boolean default false,
  is_starred boolean default false,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email_account_id, message_id)
);

alter table public.emails enable row level security;
drop policy if exists "emails_select" on public.emails; create policy "emails_select" on public.emails for select using (auth.uid() = user_id);
drop policy if exists "emails_insert" on public.emails; create policy "emails_insert" on public.emails for insert with check (auth.uid() = user_id);
drop policy if exists "emails_update" on public.emails; create policy "emails_update" on public.emails for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "emails_delete" on public.emails; create policy "emails_delete" on public.emails for delete using (auth.uid() = user_id);

-- email_attachments 表
create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  user_id uuid not null,
  filename text,
  mime_type text,
  size int,
  storage_path text,
  created_at timestamptz not null default now()
);

alter table public.email_attachments enable row level security;
drop policy if exists "email_attachments_select" on public.email_attachments; create policy "email_attachments_select" on public.email_attachments for select using (auth.uid() = user_id);
drop policy if exists "email_attachments_insert" on public.email_attachments; create policy "email_attachments_insert" on public.email_attachments for insert with check (auth.uid() = user_id);
drop policy if exists "email_attachments_delete" on public.email_attachments; create policy "email_attachments_delete" on public.email_attachments for delete using (auth.uid() = user_id);

-- 全文搜索向量
alter table if exists public.emails add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(body_text, '') || ' ' || coalesce(from_address, ''))
  ) stored;

create index if not exists emails_search_idx on public.emails using gin(search_vector);
