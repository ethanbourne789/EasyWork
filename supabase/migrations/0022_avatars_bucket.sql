-- 0022: 头像存储桶 avatars + RLS
-- 个人资料表 profiles 自带 avatar_url 列（见 0001），这里补齐存放头像文件的存储桶。
-- 头像需在导航栏等「可能未登录/跨会话」场景直接展示，因此设为公开桶（public）。

-- 1) 公开桶
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2) 公开读：任何人均可读取头像对象（公开桶语义）
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- 3) 写：仅本人可写自己前缀 <user_id>/... 下的对象（与现有桶约定一致）
drop policy if exists "avatars_user_write" on storage.objects;
create policy "avatars_user_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
