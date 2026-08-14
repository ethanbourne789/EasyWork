-- 笔记模块

-- note_folders 表
create table if not exists public.note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.note_folders(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.note_folders enable row level security;
drop policy if exists "note_folders_select" on public.note_folders; create policy "note_folders_select" on public.note_folders for select using (auth.uid() = user_id);
drop policy if exists "note_folders_insert" on public.note_folders; create policy "note_folders_insert" on public.note_folders for insert with check (auth.uid() = user_id);
drop policy if exists "note_folders_update" on public.note_folders; create policy "note_folders_update" on public.note_folders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "note_folders_delete" on public.note_folders; create policy "note_folders_delete" on public.note_folders for delete using (auth.uid() = user_id);

drop trigger if exists update_note_folders_updated_at on public.note_folders;
create trigger update_note_folders_updated_at before update on public.note_folders for each row execute function public.update_updated_at();

-- notes 表（使用 simple 文本搜索配置，支持中文）
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.note_folders(id) on delete set null,
  title text not null default '无标题',
  content jsonb not null default '{}'::jsonb,
  content_text text,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_text, ''))
  ) stored,
  is_pinned boolean not null default false,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_search_idx on public.notes using gin(search_vector);

alter table public.notes enable row level security;
drop policy if exists "notes_select" on public.notes; create policy "notes_select" on public.notes for select using (auth.uid() = user_id);
drop policy if exists "notes_insert" on public.notes; create policy "notes_insert" on public.notes for insert with check (auth.uid() = user_id);
drop policy if exists "notes_update" on public.notes; create policy "notes_update" on public.notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notes_delete" on public.notes; create policy "notes_delete" on public.notes for delete using (auth.uid() = user_id);

drop trigger if exists update_notes_updated_at on public.notes;
create trigger update_notes_updated_at before update on public.notes for each row execute function public.update_updated_at();

-- note_tags 表
create table if not exists public.note_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.note_tags enable row level security;
drop policy if exists "note_tags_select" on public.note_tags; create policy "note_tags_select" on public.note_tags for select using (auth.uid() = user_id);
drop policy if exists "note_tags_insert" on public.note_tags; create policy "note_tags_insert" on public.note_tags for insert with check (auth.uid() = user_id);
drop policy if exists "note_tags_update" on public.note_tags; create policy "note_tags_update" on public.note_tags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "note_tags_delete" on public.note_tags; create policy "note_tags_delete" on public.note_tags for delete using (auth.uid() = user_id);

-- note_note_tags 关联表
create table if not exists public.note_note_tags (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id uuid not null references public.note_tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

alter table public.note_note_tags enable row level security;
drop policy if exists "note_note_tags_select" on public.note_note_tags; create policy "note_note_tags_select" on public.note_note_tags for select using (exists (select 1 from public.notes where notes.id = note_note_tags.note_id and notes.user_id = auth.uid()));
drop policy if exists "note_note_tags_insert" on public.note_note_tags; create policy "note_note_tags_insert" on public.note_note_tags for insert with check (exists (select 1 from public.notes where notes.id = note_note_tags.note_id and notes.user_id = auth.uid()));
drop policy if exists "note_note_tags_delete" on public.note_note_tags; create policy "note_note_tags_delete" on public.note_note_tags for delete using (exists (select 1 from public.notes where notes.id = note_note_tags.note_id and notes.user_id = auth.uid()));
