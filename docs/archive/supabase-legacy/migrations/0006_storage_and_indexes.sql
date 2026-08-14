-- 0006: Storage 桶 + 桶 RLS + 业务表 user_id 性能索引
-- 设计稿要求的 receipt-photos / note-images / email-attachments 三个桶，原 0001-0005 未创建。

-- 1) Storage 桶（私有，不公开）
insert into storage.buckets (id, name, public)
values
  ('receipt-photos', 'receipt-photos', false),
  ('note-images', 'note-images', false),
  ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

-- 若历史已存在 note-images（旧 lineage 曾设为 public），这里统一收敛为私有，与另外两个桶一致。
update storage.buckets set public = false where id = 'note-images';

-- 桶 RLS：登录用户只能读写自己路径前缀下的对象（约定路径 <user_id>/...）。
-- storage.objects 的 RLS 默认开启；以下策略按桶隔离，并用首段路径 = auth.uid() 校验归属。
drop policy if exists "receipt_photos_user" on storage.objects; create policy "receipt_photos_user" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "note_images_user" on storage.objects; create policy "note_images_user" on storage.objects
  for all to authenticated
  using (bucket_id = 'note-images' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'note-images' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "email_attachments_user" on storage.objects; create policy "email_attachments_user" on storage.objects
  for all to authenticated
  using (bucket_id = 'email-attachments' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'email-attachments' and split_part(name, '/', 1) = auth.uid()::text);

-- 2) 业务表 user_id B-tree 索引：RLS 命中 auth.uid() 时避免全表扫描。
--    同时补充高频过滤/排序列索引（transactions.date、emails.folder_id）。
create index if not exists tasks_user_idx on public.tasks(user_id);
create index if not exists subtasks_user_idx on public.subtasks(user_id);
create index if not exists tags_user_idx on public.tags(user_id);
create index if not exists accounts_user_idx on public.accounts(user_id);
create index if not exists categories_user_idx on public.categories(user_id);
create index if not exists transactions_user_idx on public.transactions(user_id);
create index if not exists transactions_date_idx on public.transactions(date);
create index if not exists budgets_user_idx on public.budgets(user_id);
create index if not exists note_folders_user_idx on public.note_folders(user_id);
create index if not exists notes_user_idx on public.notes(user_id);
create index if not exists note_tags_user_idx on public.note_tags(user_id);
create index if not exists email_accounts_user_idx on public.email_accounts(user_id);
create index if not exists email_folders_user_idx on public.email_folders(user_id);
create index if not exists emails_user_idx on public.emails(user_id);
create index if not exists emails_folder_idx on public.emails(folder_id);
create index if not exists email_attachments_user_idx on public.email_attachments(user_id);
