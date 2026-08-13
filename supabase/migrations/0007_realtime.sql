-- 开启 Supabase Realtime：将业务表加入 supabase_realtime 发布，
-- 使客户端能通过 postgres_changes 订阅数据变更（跨设备/多标签页实时同步）。
-- 幂等：已加入的表跳过。

do $$
declare
  t text;
  tables text[] := array[
    'profiles',
    'tasks',
    'subtasks',
    'tags',
    'task_tags',
    'transactions',
    'accounts',
    'categories',
    'budgets',
    'note_folders',
    'notes',
    'note_tags',
    'note_note_tags',
    'email_accounts',
    'email_folders',
    'emails',
    'email_attachments'
  ];
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
