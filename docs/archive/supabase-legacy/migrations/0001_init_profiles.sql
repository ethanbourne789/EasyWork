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
drop policy if exists "profiles_select" on public.profiles; create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert" on public.profiles; create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update" on public.profiles; create policy "profiles_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- 自动更新 updated_at
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- 新用户注册时自动创建 profile 的触发器
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
