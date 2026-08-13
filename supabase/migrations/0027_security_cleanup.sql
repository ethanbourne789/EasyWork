-- ============================================================
-- 0027 安全清理迁移
-- 内容：
--   1. 撤销 0017 对 anon 角色的全表 DML 授权（RLS 已兜底，但减少攻击面）
--   2. 撤销 calendar_subscriptions.password 列的 SELECT 权限（CalDAV 专用密码保护）
--   3. 修正 0026 中关于 calendar_subscriptions.password 的错误注释
--   4. 补充 calendar_events(subscription_id) 单列索引，优化清理删除查询
--   5. 撤销 anon 对日历表的 DML 权限（RLS 已兜底，减少攻击面）
-- ============================================================

-- ---------- 1. 撤销 0017 对 anon 角色的全表 DML 授权（RLS 已兜底，但减少攻击面） ----------
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
-- 保留 authenticated 的权限
-- 注意：service_role 仍有全部权限（通过 BYPASSRLS）

-- ---------- 2. 撤销 calendar_subscriptions.password 列的 SELECT 权限（CalDAV 专用密码保护） ----------
REVOKE SELECT (password) ON public.calendar_subscriptions FROM anon, authenticated;

-- ---------- 3. 修正说明 ----------
-- 修正说明：calendar_subscriptions.password 仍为明文 text 存储（CalDAV 协议需要还原密码做 Basic Auth）
-- 已通过列级 REVOKE 阻止浏览器侧读取；DB 备份/service_role 仍可访问
-- 后续如需加密，需在 Edge Function 层用对称加密+env 密钥

-- ---------- 4. 补充 calendar_events 索引，优化清理删除查询 ----------
CREATE INDEX IF NOT EXISTS idx_calendar_events_subscription ON public.calendar_events(subscription_id);

-- ---------- 5. 撤销 anon 对日历表的 DML 权限（RLS 已兜底，减少攻击面） ----------
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.calendar_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.calendar_subscriptions FROM anon;
