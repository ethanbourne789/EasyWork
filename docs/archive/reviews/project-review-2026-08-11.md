# EasyWork 项目严格审阅报告

> 审阅日期：2026-08-11
> 范围：前端 `src/`、Rust/Tauri 后端 `src-tauri/`、Supabase 迁移与 Edge Functions、构建/配置/CI/仓库卫生
> 方法：4 路并行深度探查 + 对最高危项（已验证标记 ✅）逐条回读源码交叉核对

---

## 0. 结论先行（Executive Summary）

EasyWork 是一个功能面已经相当完整的 Tauri 2 + React 19 生产力工作台，但本次审阅发现 **1 个架构级致命缺陷、4 个安全/数据高危项、以及大量中低风险的技术债与半成品功能**。总体判断：

- **架构层面**：桌面原生层（Rust）实际上是一个"空壳"——唯一的手写命令 `app_version` 因 `withGlobalTauri` 缺失而**完全不可达**（✅ 已验证），所有业务（含邮件收发）都绕开 Tauri 直连 Supabase。注释声称"修复空壳"并不属实。
- **安全层面**：邮箱明文密码落库（✅）、调试脚手架关闭 RLS 并授权匿名读取全量用户 PII（✅）、`fetch-mail` 定时分支用公开 anon key 鉴权可被任意人触发全量同步——这三项必须优先处理。
- **数据完整性**：跨表外键归属校验不一致（可把子任务/交易挂到他人名下）、`database.types.ts` 与迁移漂移（缺 `email_folders` 4 列，✅）。
- **工程卫生**：无 CI、关键构建输入未纳入版本控制、双锁文件矛盾、仓库根散落 137MB 临时文件与日志、Vitest 与 Vite 7 不兼容。

**最该立刻做的 5 件事**：
1. `tauri.conf.json` 补 `app.withGlobalTauri: true`（或引入 `@tauri-apps/api`）——否则原生桥接全废。
2. `email_accounts.password` 加密存储，并清理调试迁移 0012–0018。
3. `fetch-mail` 的 `scheduled` 分支增加 cron 专属密钥校验。
4. 重跑 `supabase gen types`，消除全量 `as unknown as` 强转。
5. 补 `.gitignore` + CI 门禁，把 `pnpm-lock.yaml` / `scripts/` / `.cargo/` / `icons/` 纳入仓库。

---

## 1. 严重程度图例

| 级别 | 含义 |
|------|------|
| 🔴 Critical | 数据泄露 / 不可逆丢失 / 应用不可用，需立即处理 |
| 🟠 High | 安全或数据正确性的高危缺口，应本迭代内修复 |
| 🟡 Medium | 功能缺陷、体验问题或隐患，计划内修复 |
| ⚪ Low | 代码卫生、一致性，择机处理 |

---

## 2. 架构与原生层

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| A1 | 🔴 Critical | `withGlobalTauri` 缺失导致原生桥接彻底失效 | `src-tauri/tauri.conf.json:12-24`（无该键）✅ | `src/lib/tauri.ts:15` 依赖 `window.__TAURI__`，该全局对象仅在 `app.withGlobalTauri: true` 时注入（默认 false）。结果：`isTauri()` 永远 false，`app_version` 命令永远不可达，桌面端等同于一个内嵌网页。修复：加 `"withGlobalTauri": true`，随后复核 CSP `script-src`。 |
| A2 | 🟠 High | Rust 后端为空壳，邮件未实现为原生命令 | `src-tauri/src/lib.rs` ✅ | 手写 Rust 仅 3 文件约 35 行，`invoke_handler` 只注册 `app_version`；邮件 `send/fetch/manage-folder` 全部走 Supabase Edge Function（`useMail.ts:198/226/376`），与 Rust 零接线。注释"修复空壳"误导。决策：要么落地原生 IMAP/SMTP 命令（密钥留在原生侧），要么在注释/文档中如实说明这是"纯 Supabase WebView 壳"。 |
| A3 | 🟡 Medium | `app_version` 版本来源与注释不符、会漂移 | `lib.rs:5` ✅ | `env!("CARGO_PKG_VERSION")` 来自 `Cargo.toml`，注释却说来自 `tauri.conf.json`。两文件现同为 0.1.0 一致；改 `tauri.conf.json` 版本后显示版本不会变。修复：运行时读 `tauri::Config` 的 `package.version`，或 build.rs 注入。 |
| A4 | ⚪ Low | 启动 `expect()` 可 panic | `lib.rs:14` | 标准样板，但初始化失败直接崩溃且无根因。可改为 `if let Err(e)=run(){eprintln!("{e}");exit(1)}`。 |
| A5 | ⚪ Low | 空 `setup` 闭包 | `lib.rs:11` | 占位死代码，删除或放入真实初始化。 |
| A6 | ⚪ Low | 未使用的 `serde_json` 直接依赖 | `Cargo.toml:16` | 无引用，移除。 |
| A7 | 🟡 Medium | 三处版本号无同步机制 | `Cargo.toml` / `tauri.conf.json` / `tauri.ts:19` fallback | 统一以 `tauri.conf.json` 为唯一来源，其余通过构建脚本注入。 |
| A8 | ⚪ Low | capability 仅 `core:default` | `capabilities/default.json` | 当前够用；一旦按 A2 补命令，必须显式声明对应 `allow`，否则 403。 |

---

## 3. 安全与数据（Security）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| S1 | 🟠 High | 邮箱明文密码落库 | `0008_email_credentials.sql:7` ✅ | `email_accounts.password text` 明文存储。库/备份一旦泄漏，所有用户邮箱凭据暴露。修复：用 `pgsodium`/Supabase Vault 或 `pgcrypto.pgp_sym_encrypt` 加密列，仅 service role 解密。 |
| S2 | 🟠 High | `fetch-mail` 定时分支仅用公开 anon key 鉴权 | `0019_mail_cron.sql` + `fetch-mail/index.ts`（scheduled 分支）✅ | cron 用 anon key POST `{"scheduled":true}`，函数在该分支**不校验调用者身份**，用 `SERVICE_ROLE_KEY` 遍历所有账号同步。任何拿到 URL+anon key（公开）的人都能触发全量 IMAP 同步 → 资源耗尽/出网成本/对邮件服务器 DoS。修复：scheduled 分支加 cron 专属密钥（`X-Scheduled-Secret` 比对 Supabase Secret）。 |
| S3 | 🟠 High | 调试表 `_diag` 关闭 RLS 并授权匿名读取全量用户 PII | `0012`(disable RLS) ✅、`0013`(grant anon) ✅、`0014/0015`(dump auth.users) | **最终状态表已被 0018 drop，故生产最终态无暴露**；但风险在于：① 迁移链里长期留有这套高危调试脚手架，重放/补跑任意一步都会复现；② 团队调试习惯（直接读 auth.users、明文 dump）本身高危。修复：从生产迁移历史剔除 0012–0018，调试改用临时 `set local row_security=off` 且仅限 postgres 会话。 |
| S4 | 🟠 High | `database.types.ts` 缺 `email_folders` 0023 四列（类型漂移） | `0023_email_folder_sync_cursor.sql` vs `database.types.ts:236-276` ✅ | `last_uid/uid_validity/total_count/synced_at` 未进入生成类型，`fetch-mail`/前端对这些列的类型化查询会编译或运行时不一致。修复：重跑 `supabase gen types typescript`，并把类型生成纳入 CI。 |
| S5 | 🟡 Medium | `subtasks` 策略不校验 `task_id` 归属 | `0002_tasks.sql:41-42` | 仅校验 `user_id`，可把子任务挂到他人 `task_id` 下。修复：INSERT/UPDATE 加 `exists(select 1 from tasks t where t.id=task_id and t.user_id=auth.uid())`。 |
| S6 | 🟡 Medium | `transactions` 外键可指向他人账户/分类 | `0003_finance.sql:61-63` | `account_id/to_account_id/category_id` 无"同用户"约束，脏引用破坏一致性。建议应用层/策略层校验。 |
| S7 | 🟡 Medium | `email_folders`/`emails` 的 `email_account_id` 可指向他人 | `0005_email.sql:43-46,73-75` | 子表策略不校验父账户归属。修复：加 `exists(...email_accounts where id=email_account_id and user_id=auth.uid())`。 |
| S8 | 🟡 Medium | `categories`/`note_folders` 父级可指向他人 | `0003_finance.sql:39` / `0004_notes.sql:15` | 自引用父级无 user 一致性校验。修复：策略或触发器校验 `parent_id` 归属。 |
| S9 | 🟡 Medium | anon key 打包进客户端，安全 100% 依赖 RLS | `src/lib/supabase.ts:5` | 无原生层代理/密钥保护，所有读写靠 anon key+JWT 直连。任一 RLS 疏漏即泄露。修复：敏感操作收口到原生命令/严控 Edge Function，并审计全部 RLS。 |
| S10 | 🟡 Medium | CSP `connect-src` 过宽且缺 `wss:` | `tauri.conf.json:22` | `https:` 通配任意 HTTPS 源（过大）；且**不含 `wss:`**，Supabase Realtime(WebSocket) 会被 CSP 拦截→实时订阅全失败。修复：`connect-src 'self' wss://<ref>.supabase.co https://<ref>.supabase.co`。 |
| S11 | 🟡 Medium | `send-mail` 可作受控 SMTP 中继 | `send-mail/index.ts:95-103` | 校验账号归属后向客户端传入的任意 `to` 发信，服务端持密码。建议收件人白名单/频控/审计。 |
| S12 | 🟡 Medium | SMTP STARTTLS 失败降级明文发凭据 | `_shared/mail.ts:230-242` | 非 465 端口若 STARTTLS 协商失败，catch 后继续明文发 `AUTH LOGIN`（base64 即明文）。修复：STARTTLS 未建立应拒绝发送。 |
| S13 | 🟡 Medium | `manage-folder` 删目录无事务/补偿 | `manage-folder/index.ts:180-189` | 先删远端 IMAP 再删本地，两步非原子，失败会不一致。修复：本地删除用事务语义 + 失败补偿/重试。 |
| S14 | 🟡 Medium | 三个 Edge Function 缺 CORS/OPTIONS 处理 | `fetch-mail`/`send-mail`/`manage-folder` index.ts | 无 `Access-Control-Allow-Origin`，也不处理预检。桌面 WebView 跨域调用可能被浏览器拦截。修复：定义 `corsHeaders` 并在所有响应附带、处理 `OPTIONS`。 |
| S15 | ⚪ Low | `send-mail` 回传内部 SMTP 错误 | `send-mail/index.ts:133-137` | 错误信息可能含内部主机名。修复：对外返回通用错误，内部 `console.error`。 |
| S16 | ⚪ Low | `avatars` 公开桶全可读 | `0022_avatars_bucket.sql` | 可评估是否收紧路径。 |
| S17 | ⚪ Low | `tlsCa` 列不存在（死代码） | `_shared/mail.ts` 引用 `account.tlsCa`，但 `0008` 未加该列 | 自签 CA 支持永远不生效。修复：加列+UI，或删除该字段避免误导。 |

---

## 4. 数据库与迁移卫生（DB Hygiene）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| D1 | 🟠 High | 演示数据/已知弱口令作为迁移发布 | `0011`/`0021`/`seed.sql` | `demo@easywork.app / Demo123456!` 写死仓库，每个环境（含生产）都注入已知口令演示账号。修复：演示数据仅保留在 `seed.sql` 供本地 `db reset`，生产不执行 seed；或设随机口令。 |
| D2 | 🟡 Medium | 调试脚手架 0012–0018 应清出生产迁移链 | `0012`–`0018` | 见 S3。即便 0018 删表，文件仍留链中，重放即重现危险操作。剔除。 |
| D3 | 🟡 Medium | `budgets` 缺 `scope⇔category_id` 一致性 CHECK | `0009_budget_overall_rollover.sql` | 可插 `scope='category' 但 category_id=NULL`（唯一索引对 NULL 互异→可无限重复同类预算），或 `scope='overall' 却带 category_id`。修复：加 `check ((scope='overall' and category_id is null) or (scope='category' and category_id is not null))`。 |
| D4 | 🟡 Medium | 用 `pgcrypto` 但未显式 `create extension` | `0011`/`seed.sql:25` | 干净/非 Supabase 托管的 Postgres 上 `0011` 会失败，破坏可移植性。修复：开头加 `create extension if not exists pgcrypto;`。 |
| D5 | 🟡 Medium | 缺失高频查询索引 | `0006_storage_and_indexes.sql` | 缺 `email_folders(email_account_id)`、`emails(email_account_id)`、`tasks(status/due_date/priority)`。补充索引。 |
| D6 | 🟡 Medium | `subtasks.user_id` 无 FK 到 `auth.users` | `0002_tasks.sql:31-32` | 同模块其他表都有 FK 级联。修复：加 `references auth.users(id) on delete cascade`。 |
| D7 | 🟡 Medium | `profiles` 缺 DELETE 策略 | `0001_init_profiles.sql:14-16` | 用户无法客户端注销/删profile（GDPR）。修复：补 `profiles_delete` 策略。 |
| D8 | 🟡 Medium | 邮件 cron 无并发锁、5s 超时偏短 | `0019_mail_cron.sql` | 全量同步超 5 分钟会重叠重复拉取；`pg_net` fire-and-forget 的 timeout 不代表函数执行。修复：`fetch-mail` 内对账号加 `pg_advisory_lock`，或改为每账号独立调度。 |
| D9 | ⚪ Low | `tags`/`note_tags` 唯一约束大小写敏感 | `0002_tasks.sql:52` / `0004_notes.sql:58` | `unique(user_id,name)` 允许 "Work"/"work" 并存。建议 `lower(name)` 唯一。 |
| D10 | ⚪ Low | `transactions.amount` 等缺 CHECK | `0003_finance.sql:47-57` | 缺 `amount>0`、transfer 专用约束。补充。 |
| D11 | ⚪ Low | Realtime 广播邮件正文 | `0007_realtime.sql` | `emails.body_html/text` 入 `supabase_realtime`，大体量走实时通道有带宽开销，确认必要。 |
| D12 | 🟢 Good | 迁移幂等性、RLS 基础归属、触发器 search_path 规范 | 全局 | 全部用 `if not exists`/`on conflict do nothing`；17 张表均启用 RLS 且以 `auth.uid()` 归属；`handle_new_user` 等设 `search_path`，写法规范。这是做得好的地方。 |

---

## 5. 前端 Bug（Frontend Bugs）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| F1 | 🟠 High | 设置"重置为演示数据"只删除不恢复，文案误导且不可逆 | `Settings.tsx:230-247` 实现 / `:482` 文案 ✅ | `handleResetData` 仅 `delete()` 全部表，无任何回写演示数据逻辑。用户以为能回到初始态，实际是所有个人数据被清空且无法还原。修复：真正实现恢复，或改文案为"清空所有数据"+二次确认。 |
| F2 | 🟡 Medium | 财务报表趋势图忽略所选月份，永远显示最近 7 天 | `FinanceReport.tsx:14-21,46-63` | `trendData` 基于"今天"生成，依赖项无 `selectedMonth`，与上方月选择器自相矛盾。修复：基于 `selectedMonth` 生成整月序列，依赖加入 `selectedMonth`。 |
| F3 | 🟡 Medium | 任务状态 `cancelled` 误标为"待审核" | `taskConstants.ts:36` | 语义错误，看板列头显示误导。改为"已取消/已作废"。 |
| F4 | 🟡 Medium | 看板头像背景色用非法 Tailwind 类名 | `TaskBoardView.tsx:109-113` | `oklch-[...] oklch-[...]` 非标准/任意值语法，Tailwind 不生成样式。改用主题色板类或合法 `bg-[oklch(...)]`。 |
| F5 | 🟡 Medium | "写群发"是空壳按钮，与"写邮件"完全相同 | `Mail.tsx:197-198` | 两者都调 `handleCompose`，无收件人多选/群组逻辑。实现真正群发或移除入口。 |
| F6 | 🟡 Medium | 邮件发送/草稿清理错误被 `.catch(()=>null)` 静默吞掉 | `MailComposer.tsx:125,129,150,159` | 发送失败界面无提示，用户以为成功。改用 try/catch + toast，失败阻止关闭。 |
| F7 | 🟡 Medium | 未读计数走全表查询仅依赖 RLS，无显式 user_id 过滤 | `useMail.ts:74-89` | 拉取全部邮件 folder_id 客户端计数，浪费带宽且 RLS 漏则越权。改为 `eq('user_id',uid)`，或用 RPC 聚合。 |
| F8 | 🟡 Medium | "今日聚焦"勾选纯本地、不持久化 | `TodayFocus.tsx:20,31-38` | `useState` 勾选不更新任务状态、不写入存储，刷新即丢失，给用户虚假打卡反馈。修复：勾选调用 `useUpdateTask` 置 `done`。 |
| F9 | 🟡 Medium | 邮件变更统一失效宽键 `["emails"]` 造成过度刷新 | `useMail.ts:154,180,214,...` | 列表键是 `["emails",folderId]`，变更后失效 `["emails"]` 前缀会刷新每个文件夹。改为精确失效当前 folderId。 |
| F10 | ⚪ Low | 任务详情抽屉为自定义实现，缺焦点陷阱/ESC 不完整 | `TaskDetailDrawer.tsx` | 未复用已集成 `useFocusTrap` 的 `components/ui/drawer`。复用或补齐焦点/滚动锁。 |

---

## 6. 前端技术债与类型安全（Tech Debt & Types）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| T1 | 🟠 High | `database.types.ts` 枚举全为 `string`，全代码库散落 `as unknown as` | `database.types.ts` 多处 / `useTasks.ts`(8处) / `useFinance.ts`(4处) | `status/priority/scope/type` 是 `string`，与业务字面量联合不匹配，每个写入点强转，类型系统形同虚设，非法枚举能直接写库。修复：类型生成用真实 `Enums`，删除全部 `as unknown as`。 |
| T2 | 🟡 Medium | `Note.content` 类型为 `any` | `types/index.ts:120` | Tiptap JSON 失去约束。定义 `TiptapJSON` 类型替代 `any`。 |
| T3 | 🟡 Medium | 所有单条插入用 `.single()`，RLS 返回 0 行时抛错 | `useTasks.ts:76/138/258/286` 等 | `.single()` 在恰好 0 行报错，多未分支处理。改用 `.select()` 取首行，或对错误分支处理。 |
| T4 | 🟡 Medium | `useRealtimeSync` 单 channel 订阅全表、粗粒度失效 | `useRealtimeSync.ts:9-27,38-75` | `transactions/accounts/categories/budgets` 全映射到 `["finance"]`，任一变更使整个模块失效重拉。拆分 channel / 精确 key / 加 debounce。 |
| T5 | 🟡 Medium | `recurrence_rule` 类型不一致：`Json`(DB) vs `RecurrenceRule`(业务) | `database.types.ts:624` vs `types/index.ts` | 强转跳过 JSON 解析校验。修复：用 `JSON.stringify/parse` + zod 封装。 |
| T6 | 🟡 Medium | zod schema 与 DB/类型枚举无一致性校验 | `TaskForm.tsx` / `types/index.ts` | 新增状态值易只改一边。修复：以单一枚举源生成 zod（`z.enum(TASK_STATUSES)`）。 |
| T7 | ⚪ Low | 残留 `console.error` 调试 | `App.tsx:54` / `useAuth.ts:25` | 生产仍输出内部栈。用 `import.meta.env.DEV &&` 包裹或接日志上报。 |
| T8 | ⚪ Low | `main.tsx` 非空断言 `getElementById("root")!` | `main.tsx` | 判空或 `?? throw`。 |
| T9 | ⚪ Low | `applyRollover` 循环无并发上限 | `BudgetList.tsx:166-186` | 大量预算一次性 `Promise.all`。分批（每 5 个一组）。 |
| T10 | ⚪ Low | 测试代码 `as any` 掩盖类型问题 | `src/__tests__/*.ts` | 用真实类型或 `vi.mocked`。 |
| T11 | ⚪ Low | `mail` 查询 `as EmailAccount[]` 裸断言 | `useMail.ts:47` | 用映射函数 + 类型兼容声明替代裸断言。 |

---

## 7. 功能完整度与缺口（Feature Completeness）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| G1 | 🟡 Medium | `FinanceOverview` 接收 `onAdd` 却从未使用，"记一笔"入口缺失 | `FinanceOverview.tsx:47-51` / `Finance.tsx:58` | 父组件特意传 `onAdd` 期望提供 CTA，但内部丢弃、无新增按钮。渲染按钮或移除 prop。 |
| G2 | 🟡 Medium | 笔记导入被截断到前 2000 字符 | `Notes.tsx` | `slice(0,2000)` 静默截断长文档。分块插入或放开限制并提示。 |
| G3 | 🟡 Medium | 预算告警每次进页面都弹系统通知（`useEffect([])`） | `BudgetList.tsx:192-194` | 无"已提示"去重，桌面端频繁打扰。改为仅新超支+冷却后才弹，或页面内 inline 警示。 |
| G4 | ⚪ Low | 实时同步未把 `folder-unread-counts` 纳入统一失效 | `useRealtimeSync.ts:25` + `useMail.ts` | 某处遗漏 invalidate 时未读角标失真。纳入统一映射。 |
| G5 | ⚪ Low | 邮件多账号/多文件夹的高级筛选、搜索缺失 | 整体 | 仅基础列表。建议补全文检索（已有 `search_vector` 列但未充分利用）。 |
| G6 | ⚪ Low | 设置页功能单薄 | `Settings.tsx` | 仅有主题/重置，缺：数据导出导入、通知偏好开关、关于页真实版本（受 A1/A3 影响当前版本不对）。 |

---

## 8. 响应式 UI（Responsive）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| R1 | 🟡 Medium | 看板视图窄屏缺最小宽度约束与横向滚动，列易挤压溢出 | `TaskBoardView.tsx` | 容器加 `flex overflow-x-auto`，每列 `min-w-[260px]`。 |
| R2 | ⚪ Low | 日历 `min-w-[560px]` 依赖父级横向滚动，部分容器未声明 | `TaskCalendarView.tsx` | 明确包裹 `overflow-x-auto`。 |
| R3 | ⚪ Low | `AccountList` 总资产 `text-4xl` 极窄屏可能溢出 | `AccountList.tsx:112` | 加 `break-words` / 断点缩放。 |
| R4 | ⚪ Low | `ModuleFab` 固定定位小屏可能遮挡内容 | `ModuleFab.tsx` | 含底部 Tab 页面降低 `bottom` 或动态隐藏。 |
| R5 | ⚪ Low | 图表容器高度写死，窄屏信息密度差 | 多处 Recharts | 按断点设置高度或允许折叠。 |
| R6 | ⚪ Low | 窗口固定 1200x800 仅 `minWidth:360` | `tauri.conf.json:13-19` | 加 `minHeight:480`，显式 `label:"main"`。 |

---

## 9. 错误与加载状态（Error & Loading States）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| E1 | 🟡 Medium | 多数查询只判 `isLoading`，缺 `isError` 兜底 | 跨 `useTasks/useFinance/useMail/useNotes` | RLS 失败/网络异常时 `data=[]` 被误认为"无数据"。统一加 `isError` 分支（错误文案+重试），抽 `<QueryState>` 包装。 |
| E2 | 🟡 Medium | Query 层错误无统一处理（仅 Mutation 有 `useSafeMutation`） | `lib/mutation.ts` vs 各 `useQuery` | "读"路径错误对用户透明。在 QueryClient 配全局 `onError` 或列表统一处理。 |
| E3 | ⚪ Low | `RootErrorBoundary` 仅 console + 重置，无上报/无错误详情 | `App.tsx:54` | 展示 `error.message` 摘要 + 上报钩子。 |
| E4 | ⚪ Low | 实时同步断线重试无 UI 提示 | `useRealtimeSync.ts:58-64` | 断线时显示"实时同步已断开，重连中…"。 |

---

## 10. 构建 / 配置 / CI / 仓库卫生（Build & Repo Hygiene）

| 编号 | 级别 | 问题 | 位置 | 说明 / 修复 |
|------|------|------|------|------------|
| B1 | 🔴 Critical | `withGlobalTauri` 缺失（同 A1，原生桥接失效） | `tauri.conf.json` | 见 A1。 |
| B2 | 🟠 High | 核心构建输入未纳入版本控制 | `scripts/`、`.cargo/config.toml`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`src-tauri/icons/` | `git ls-files` 均为 0 条。绿色构建依赖 `.cargo` 的 `+crt-static`，脚本本身未跟踪→干净克隆无法复现构建。立即 `git add`。 |
| B3 | 🟠 High | Vitest 2.1.9 与 Vite 7 不兼容 | `package.json:60-61` | Vitest 2 仅支持 Vite 5/6，`lock` 里解析到 vite 5.0.0，与顶层 7.3.6 分裂，`npm run test` 不可信。升级 `vitest@^3` 或锁 `vite@^6`，跑一次 `pnpm test` 验证。 |
| B4 | 🟠 High | 安卓重打包脚本硬编码绝对 Windows 路径 | `repackage_apk_icons.py:8-10`、`repackage_apk_16kb.py:7-9`、`arm64-link-wrap.cmd:2` | 写死 `E:\Dev\EasyWork0807\...` 与用户专属 NDK 路径，他人/CI 直接 `FileNotFoundError`。改仓库根推导 + `ANDROID_NDK_HOME` 环境变量，孤儿脚本归档。 |
| B5 | 🟠 High | 完全没有 CI（无 `.github/workflows`） | 仓库根 | Tauri+React 无任何 lint/test/build 门禁，破坏性改动可直入。新增 `ci.yml`：frozen-lockfile install → lint → typecheck → test →（可选）build:green。 |
| B6 | 🟠 High | 双锁文件矛盾：`package-lock.json` 已跟踪、`pnpm-lock.yaml` 未跟踪 | 仓库根 | 规范是 pnpm，却提交了 npm 锁。修复：`git rm package-lock.json` + `git add pnpm-lock.yaml`，加 `.npmrc`。 |
| B7 | 🟠 High | `.gitignore` 未覆盖大量二进制/日志/生成物，随时误提交 | 仓库根 | 仓库现存未忽略：`gradle-8.14.3-bin.zip`(137MB)、`android-*.log`/`build-green.log`/`cargo-build.log`/`pnpm-install.log`、`_tmp_*`、`android-release/`(APK+idsig)、`release-green/`、`src-tauri/gen/`。追加到 `.gitignore`。 |
| B8 | 🟡 Medium | 安卓重打包脚本是孤儿，无任何脚本引用 | `scripts/*.py` / `*.cmd` | `package.json` 与 `build-green.ps1` 均未调用。增加 `build:android` 串联或 README 写明步骤。 |
| B9 | 🟡 Medium | `tauri.conf.json` 用 `npm run` 但规范包管理器是 pnpm | `tauri.conf.json:9-10` | 改 `pnpm run dev`/`pnpm run build`。 |
| B10 | 🟡 Medium | `build-green.ps1` 注释写 Node 18+，与 Vite 7 不兼容 | `build-green.ps1:12` | 更新为 Node 20.19+/22.12+。 |
| B11 | 🟡 Medium | `@tanstack/react-router` 与 `router-devtools` 版本错位 | `package.json:25,46` | devtools `1.167.1` vs router `1.170.21`。对齐到 `^1.170.0`。 |
| B12 | ⚪ Low | `bundle.active:false` + `targets:[]` → `tauri build` 不产出安装包 | `tauri.conf.json:25-27` | 若刻意只做绿色版，README/AGENTS.md 说明，避免他人误用 `tauri build`。 |
| B13 | ⚪ Low | `release-green/` 注释"整个文件夹"措辞误导 | `build-green.ps1:136` | 实为单 exe，无害。 |
| B14 | ⚪ Low | `@types/node ^26` 偏新 | `package.json:50` | 与运行时 Node 对齐以免 API 误用。 |
| B15 | ⚪ Low | `scripts/verify-demo.mjs` 内嵌凭据、`lucide-react@1.29.0` 来源需确认 | 脚本 / package.json | 凭据改 `.env` 读取；确认 lucide 1.x 非分叉包。 |
| B16 | 🟢 Good | tsconfig 严格模式与路径别名一致、Tailwind v4 配置正确、`.env` 正确忽略 | `tsconfig*.json`、`vite.config.ts`、`src/index.css` | 构建门禁正确，配置规范，这是做得好的地方。 |

---

## 11. 推荐新增功能（Recommended Features）

基于现有架构缺口与生产力工作台定位，建议优先级排序：

1. **离线优先 / 本地缓存**：当前完全依赖 Supabase 直连，断网即不可用。建议引入本地 IndexedDB 缓存 + 冲突合并（或可借 A2 把数据收口到原生层做离线存储）。
2. **数据导出/导入（备份恢复）**：记账 CSV 已有导出，但缺统一备份（全模块 JSON 导出 + 导入恢复）。直接关联 G1/F1 的"数据不可逆"风险——有了备份，"重置数据"才安全。
3. **跨模块全局搜索增强**：已有 `GlobalSearchDialog`，但仅搜任务/笔记。建议接入邮件 `search_vector` 全文检索、记账交易搜索。
4. **通知中心持久化**：`NotificationCenter` 现应为内存态，刷新丢失。建议落库（通知表 + 已读态）。
5. **键盘快捷键体系 + 命令面板增强**：⌘K 已有，但缺全局快捷键（新建任务/记账/邮件 `C`、切换模块 `1-5`、主题切换等）。
6. **i18n 国际化框架**：当前中文化写死，建议接入 i18n 便于出海。
7. **多账本 / 家庭共享（记账）**：工作记忆显示此属历史待办，建议以"共享账本邀请"实现。
8. **智能记账 / 周期性交易 / 批量操作**：工作记忆显示均属历史待办（周期交易、批量操作、CSV 导入、报表 PDF 导出、decimal 精度）——补齐后记账模块才算完整。
9. **邮件规则与过滤（按发件人/主题自动归类、自动标记）**：配合现有文件夹体系。
10. **仪表盘可定制**：当前卡片固定，建议允许用户增删/排序小组件。
11. **设置项完善**：数据导出导入、通知偏好开关、真实"关于/版本"页（依赖 A1/A3 先修）、外观细节。
12. **CI/CD 门禁**（B5）+ 自动发布（GitHub Actions 出绿色版/APK）。

---

## 12. 优先修复路线图（Roadmap）

**P0（立即，阻塞发布/安全）**
- A1/B1：`tauri.conf.json` 加 `withGlobalTauri: true`
- S1：`email_accounts.password` 加密存储
- S3/D2：剔除调试迁移 0012–0018
- S2：`fetch-mail` scheduled 分支加 cron 专属密钥
- S4：重跑类型生成消除 `email_folders` 漂移

**P1（本迭代）**
- F1：修正"重置数据"文案或实现恢复
- T1：消除全量 `as unknown as`（重跑 Enums）
- B3：升级 Vitest 兼容 Vite 7
- B2/B6/B7：纳入版本控制 + 双锁文件治理 + `.gitignore`
- B5：补 CI 门禁
- S5–S8：跨表外键归属校验
- B4：安卓脚本去硬编码路径
- S10：CSP 收敛 + 加 `wss:`

**P2（计划内）**
- F2/F3/F4/F5/F6/F8/F9：报表月份、状态标签、看板色、群发、邮件错误提示、今日聚焦持久化、精确失效
- E1/E2：统一错误兜底
- D3–D8：CHECK 约束、索引、FK、DELETE 策略、cron 锁
- R1–R6：响应式修复
- G1–G6：功能缺口
- 第 11 节推荐功能

---

## 13. 统计

| 级别 | 数量（去重后） |
|------|------|
| 🔴 Critical | 2（A1/B1 同源、B2… 实际 Critical=原生桥接 + 构建输入未跟踪，见明细） |
| 🟠 High | 约 13 |
| 🟡 Medium | 约 35 |
| ⚪ Low | 约 30 |
| 🟢 Good | 3 处正面 |

> 说明：部分高危项被多个维度（架构/构建/安全）引用但为同一根因，已去重计数。完整条目见各节表格。
