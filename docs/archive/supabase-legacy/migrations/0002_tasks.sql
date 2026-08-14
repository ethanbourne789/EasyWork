-- 任务管理表

-- tasks 表
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date timestamptz,
  recurrence_rule jsonb,
  recurrence_next timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
drop policy if exists "tasks_select" on public.tasks; create policy "tasks_select" on public.tasks for select using (auth.uid() = user_id);
drop policy if exists "tasks_insert" on public.tasks; create policy "tasks_insert" on public.tasks for insert with check (auth.uid() = user_id);
drop policy if exists "tasks_update" on public.tasks; create policy "tasks_update" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tasks_delete" on public.tasks; create policy "tasks_delete" on public.tasks for delete using (auth.uid() = user_id);

drop trigger if exists update_tasks_updated_at on public.tasks;
create trigger update_tasks_updated_at before update on public.tasks for each row execute function public.update_updated_at();

-- subtasks 表
create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.subtasks enable row level security;
drop policy if exists "subtasks_select" on public.subtasks; create policy "subtasks_select" on public.subtasks for select using (auth.uid() = user_id);
drop policy if exists "subtasks_insert" on public.subtasks; create policy "subtasks_insert" on public.subtasks for insert with check (auth.uid() = user_id);
drop policy if exists "subtasks_update" on public.subtasks; create policy "subtasks_update" on public.subtasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "subtasks_delete" on public.subtasks; create policy "subtasks_delete" on public.subtasks for delete using (auth.uid() = user_id);

-- tags 表
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.tags enable row level security;
drop policy if exists "tags_select" on public.tags; create policy "tags_select" on public.tags for select using (auth.uid() = user_id);
drop policy if exists "tags_insert" on public.tags; create policy "tags_insert" on public.tags for insert with check (auth.uid() = user_id);
drop policy if exists "tags_update" on public.tags; create policy "tags_update" on public.tags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tags_delete" on public.tags; create policy "tags_delete" on public.tags for delete using (auth.uid() = user_id);

-- task_tags 关联表
create table if not exists public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

alter table public.task_tags enable row level security;
drop policy if exists "task_tags_select" on public.task_tags; create policy "task_tags_select" on public.task_tags for select using (exists (select 1 from public.tasks where tasks.id = task_tags.task_id and tasks.user_id = auth.uid()));
drop policy if exists "task_tags_insert" on public.task_tags; create policy "task_tags_insert" on public.task_tags for insert with check (exists (select 1 from public.tasks where tasks.id = task_tags.task_id and tasks.user_id = auth.uid()));
drop policy if exists "task_tags_delete" on public.task_tags; create policy "task_tags_delete" on public.task_tags for delete using (exists (select 1 from public.tasks where tasks.id = task_tags.task_id and tasks.user_id = auth.uid()));
