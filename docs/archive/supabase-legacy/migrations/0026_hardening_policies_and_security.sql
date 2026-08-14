-- ============================================================
-- 0026 安全与数据完整性加固（第二轮审阅修复）
-- 内容：
--   1. 撤销 authenticated 对 email_accounts.password 的 SELECT（浏览器不再能读到明文）
--   2. 子表 RLS 增加父归属校验（阻止把数据挂到他人名下）
--   3. profiles 增加 DELETE 策略
--   4. 高频查询索引
--   5. CHECK 约束（transactions.amount > 0、budgets scope 与 category_id 一致性）
--   6. subtasks.user_id 外键、pgcrypto 扩展
--   7. RPC：unread_email_counts（替代前端全量拉取统计未读数）
--   8. mail_sync_locks 表 + claim/release RPC（防定时同步并发竞态）
-- ============================================================

-- ---------- 1. 密码列不再下发给浏览器 ----------
-- 注意：calendar_subscriptions.password 仍为明文 text（CalDAV 协议需还原密码）
-- 0027 迁移已添加列级 REVOKE SELECT，阻止浏览器侧读取
REVOKE SELECT (password) ON public.email_accounts FROM anon, authenticated;

-- ---------- 2. 子表 RLS 父归属校验 ----------
-- 用辅助函数统一重建：丢弃表上全部策略再按固定规约重建。
-- 规约：SELECT/DELETE 按 user_id；INSERT/UPDATE 额外校验父记录属于本人，
-- 且父记录已不存在（历史遗留孤儿行）时也允许编辑，防止加固后无法修复脏数据。

CREATE OR REPLACE FUNCTION public.rebuild_child_rls(
  p_table text, p_role text,
  p_parent_column text, p_parent_table text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  parent_check text;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, p_table);
  END LOOP;

  -- 父列可空时允许 NULL（本地自建、无订阅来源等场景）；
  -- 父记录不存在（孤儿行）时放行；父记录存在则必须属于当前用户。
  parent_check := format(
    '((%I IS NULL) OR NOT EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I) OR EXISTS (SELECT 1 FROM public.%I p2 WHERE p2.id = %I AND p2.user_id = auth.uid()))',
    p_parent_column, p_parent_table, p_parent_column,
    p_parent_table, p_parent_column
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO %I USING (user_id = auth.uid())',
    p_table || '_select_policy', p_table, p_role
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO %I WITH CHECK (user_id = auth.uid() AND %s)',
    p_table || '_insert_policy', p_table, p_role, parent_check
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO %I USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND %s)',
    p_table || '_update_policy', p_table, p_role, parent_check
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO %I USING (user_id = auth.uid())',
    p_table || '_delete_policy', p_table, p_role
  );
END;
$$;

-- 各子表逐一重建（父列/父表名）
SELECT public.rebuild_child_rls('subtasks', 'authenticated', 'task_id', 'tasks');
SELECT public.rebuild_child_rls('email_folders', 'authenticated', 'email_account_id', 'email_accounts');
SELECT public.rebuild_child_rls('emails', 'authenticated', 'email_account_id', 'email_accounts');
SELECT public.rebuild_child_rls('email_attachments', 'authenticated', 'email_id', 'emails');
SELECT public.rebuild_child_rls('transactions', 'authenticated', 'account_id', 'accounts');
SELECT public.rebuild_child_rls('categories', 'authenticated', 'parent_id', 'categories');
SELECT public.rebuild_child_rls('note_folders', 'authenticated', 'parent_id', 'note_folders');
SELECT public.rebuild_child_rls('notes', 'authenticated', 'folder_id', 'note_folders');
SELECT public.rebuild_child_rls('budgets', 'authenticated', 'category_id', 'categories');
SELECT public.rebuild_child_rls('calendar_events', 'authenticated', 'subscription_id', 'calendar_subscriptions');

-- transactions 覆盖重建为增强版：主账户、转账转入账户、分类均须属于本人（含孤儿行放行）。
-- 上面通用重建已生成 4 个基础策略，这里丢弃 INSERT/UPDATE 后重建为增强版。
DROP POLICY IF EXISTS transactions_insert_policy ON public.transactions;
DROP POLICY IF EXISTS transactions_update_policy ON public.transactions;
CREATE POLICY transactions_insert_policy ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id) OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
    AND (to_account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts a2 WHERE a2.id = to_account_id) OR EXISTS (SELECT 1 FROM public.accounts a2 WHERE a2.id = to_account_id AND a2.user_id = auth.uid()))
    AND (category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id) OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  );
CREATE POLICY transactions_update_policy ON public.transactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id) OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
    AND (to_account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts a2 WHERE a2.id = to_account_id) OR EXISTS (SELECT 1 FROM public.accounts a2 WHERE a2.id = to_account_id AND a2.user_id = auth.uid()))
    AND (category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id) OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  );

-- ---------- 3. profiles 支持删除（profiles 主键为 id = auth.uid()） ----------
CREATE POLICY profiles_delete_policy ON public.profiles
  FOR DELETE TO authenticated USING (id = auth.uid());

-- ---------- 4. 高频查询索引 ----------
CREATE INDEX IF NOT EXISTS idx_email_folders_account ON public.email_folders (email_account_id);
CREATE INDEX IF NOT EXISTS idx_emails_account ON public.emails (email_account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks (priority);

-- ---------- 5. CHECK 约束（已核对存量数据无违规，可 VALIDATE） ----------
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0);
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_amount_positive;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_scope_category_consistency CHECK (
    (scope = 'overall' AND category_id IS NULL)
    OR (scope = 'category' AND category_id IS NOT NULL)
  );
ALTER TABLE public.budgets VALIDATE CONSTRAINT budgets_scope_category_consistency;

-- ---------- 6. 外键与扩展 ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subtasks_user_id_fkey'
  ) THEN
    ALTER TABLE public.subtasks
      ADD CONSTRAINT subtasks_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 7. 未读邮件计数 RPC（按 RLS 自然隔离到本人） ----------
CREATE OR REPLACE FUNCTION public.unread_email_counts()
RETURNS TABLE (folder_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT folder_id, count(*)::bigint
  FROM public.emails
  WHERE is_read = false
  GROUP BY folder_id
$$;

REVOKE ALL ON FUNCTION public.unread_email_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.unread_email_counts() TO authenticated;

-- ---------- 8. 邮件同步防并发锁 ----------
CREATE TABLE IF NOT EXISTS public.mail_sync_locks (
  account_id uuid PRIMARY KEY REFERENCES public.email_accounts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mail_sync_locks ENABLE ROW LEVEL SECURITY;
-- 该表仅供服务端（service role）使用，不给 anon/authenticated 任何策略
REVOKE ALL ON public.mail_sync_locks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_mail_sync_lock(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.mail_sync_locks (account_id, user_id)
  VALUES (p_account_id, (SELECT user_id FROM public.email_accounts WHERE id = p_account_id))
  ON CONFLICT (account_id) DO UPDATE
    SET locked_at = now()
    WHERE public.mail_sync_locks.locked_at < now() - interval '30 minutes'
  RETURNING true
$$;

CREATE OR REPLACE FUNCTION public.release_mail_sync_lock(p_account_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.mail_sync_locks WHERE account_id = p_account_id
$$;

REVOKE ALL ON FUNCTION public.claim_mail_sync_lock(uuid) FROM public;
REVOKE ALL ON FUNCTION public.release_mail_sync_lock(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_mail_sync_lock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_mail_sync_lock(uuid) TO service_role;
