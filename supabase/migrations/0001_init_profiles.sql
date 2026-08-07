-- profiles 表：扩展 auth.users 的用户资料
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS 启用
alter table public.profiles enable row level security;

-- 策略：用户只能读写自己的 profile
create policy "用户可读自己的 profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "用户可插入自己的 profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "用户可更新自己的 profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 新用户注册时自动创建 profile 的触发器
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();