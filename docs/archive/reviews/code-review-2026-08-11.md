# EasyWork 代码审阅报告

> 审阅日期：2026-08-11
> 审阅范围：前端业务代码（`src/`）、Supabase Edge Functions（`supabase/functions/`）、数据库迁移（`supabase/migrations/`）
> 审阅方式：逐文件静态审阅 + `tsc -b`（0 错误）+ `eslint .`（0 错误 / 3 警告）
> 技术栈：React 19 + TypeScript 5.9 + Vite 7 + Tailwind v4 + TanStack Router/Query + Zustand + Supabase + Tauri 2 + Tiptap + Recharts

---

## 0. 总体结论

代码整体**质量高于一般个人项目**：类型系统在编译期通过（`tsc -b` 零错误），ESLint 仅 3 个 `react-hooks/exhaustive-deps` 警告；Supabase 已正确启用 RLS 按 `auth.uid()` 隔离；邮件正文经 DOMPurify 净化防 XSS；Edge Function 均做了 JWT 校验；query key 与 realtime 失效映射**经核对完全自洽**（finance `['finance']`、notes `['note-folders']`/`['note-tags']`、tasks、mail 均命中）。

但存在若干**生产级隐患与半成品**：最严重的是邮件 IMAP/SMTP 关闭了 TLS 证书校验（MITM 风险），以及多处类型逃逸（`as unknown as` / `any`）削弱了类型安全。另有 4 处明显的"占位死链"（通知铃铛、任务/邮件的 FAB 子项）。

---

## 一、技术债务（硬编码 / 重复 / 不良架构）

| # | 文件 / 模块 | 严重程度 | 问题 | 改进建议 |
|---|---|---|---|---|
| T1 | `src/features/tasks/TaskBoardView.tsx` `extractTags()` | 🟠 中 | 看板卡片标签通过**硬编码中文关键词**（设计/代码/后端/邮件/周会/采购/交付）做字符串匹配生成，与业务数据无关联、不可配置、易误判。 | 改为基于任务已有的 `Tag`/`priority` 数据驱动展示；若需语义标签，提取为可配置规则表或交由后端分类。 |
| T2 | `src/features/tasks/useTasks.ts`、`useFinance.ts`、`useNotes.ts`、`src/lib/notify.ts`、`src/types/index.ts:120` | 🟠 中 | 大量 `as unknown as X[]`、`(t: any)`、`content: any` 绕过类型检查，把编译期错误推迟到运行期。 | 优先使用 `src/types/database.types.ts` 中 `Database['public']['Tables'][...]['Row']`；`Note.content` 改用 Tiptap 的 `JSONContent` 类型；`notify.ts` 用生成类型替代 `any`。 |
| T3 | `src/types/index.ts:143-157` `EmailAccount` | 🟠 中 | 手写 `EmailAccount` 接口**缺少 `username` / `password` / `sync_enabled`**（迁移 0008 已加），与 `database.types.ts:138-191` 的 `email_accounts` 表定义**漂移**。运行时 `useMail.ts:316` 读写 `password` 但类型无此字段。 | 统一以生成的 `Database` 类型为准（如 `type EmailAccount = Database['public']['Tables']['email_accounts']['Row']`），删除手写重复定义。 |
| T4 | `Login.tsx` / `Register.tsx`、多处 | 🟡 低 | UI 一致性差：`Login`/`Register` 用原生 `<input>`（非 shadcn `Input`）；`TaskDetailDrawer`、`GlobalSearch`、`FinanceReport`(`type=month`)、`NoteEditor`(标题) 也用裸原生控件，与项目其余 `Input/Select` 封装不一致。 | 统一使用 `src/components/ui/input.tsx`、`select.tsx` 等封装，降低样式/可访问性漂移。 |
| T5 | 全模块（NoteList、TaskDetailDrawer、TransactionList、AccountList、NoteSidebar） | 🟡 低 | 删除/危险操作一律 `window.confirm()`，原生弹窗与 App 设计语言割裂，且无 loading/异步态、移动端体验差。 | 抽一个 `ConfirmDialog`（复用现有 `Dialog`），提供 `Promise<boolean>` 接口与 loading 态。 |
| T6 | `src/types/index.ts:13-24,128-140` | 🟡 低 | `RecurrenceRule` / `recurrence_next`（Task）、`NoteTag` / `NoteNoteTag`（Note）类型已定义但**全项目无任何 UI 或逻辑使用**，属于死 schema。 | 要么补实现（周期任务、笔记标签），要么在文档中标注为"暂未启用"，避免维护者误以为已支持。 |

---

## 二、潜在 Bug 与安全隐患

| # | 文件 / 模块 | 严重程度 | 问题 | 改进建议 |
|---|---|---|---|---|
| S1 | `supabase/functions/_shared/mail.ts` IMAP/SMTP 连接 | 🔴 高 | `tls: { rejectUnauthorized: false }` **关闭了 TLS 证书校验**。攻击者在网络层（公共 WiFi、企业代理）可发动中间人攻击，窃取邮箱账号密码与邮件内容。 | 使用系统 CA（`Deno` 默认即校验证书，移除该选项）；如需自签，显式传入 `ca` 证书，切勿全局关闭校验。 |
| S2 | `src/features/auth/authStore.ts` | 🟠 中 | **硬编码演示账号密码** `DEMO_CREDENTIALS = { email:"demo@easywork.app", password:"Demo123456!" }` 进入源码仓库。虽为公开演示账号，但凭据落库仍是不良实践。 | 改为读取环境变量 / 仅在登录页提供"演示账号"按钮并提示用户密码；或将密码移出仓库（如 `.env` + 运行时注入）。 |
| S3 | `src/features/dashboard/TodayFocus.tsx:64-69` | 🟠 中 | "查看全部" 使用 `<a href="/tasks">`，触发**整页刷新**（丢失 SPA 状态、重跑 `getSession`、白屏闪烁）。 | 改用 `<Link to="/tasks">` 或 `useNavigate()`，保持 SPA 导航。 |
| S4 | `src/features/dashboard/RecentFinance.tsx:71` | 🟡 低 | `navigate({ to: "/finance" as never })` 用 `as never` 掩盖类型，弱化路由类型安全。 | 使用正确的 `to: "/finance"` 并让 TanStack Router 推断 search 类型，去掉 `as never`。 |
| S5 | `src/features/finance/AccountList.tsx:80-87` | 🟡 低 | 删除账户时仅 `window.confirm` 警告"交易将失去归属"，仍直接删除，导致交易记录 `account_id` 悬空、不再计入账户余额（数据完整性受损）。 | 删除前提供"转移交易到其它账户"选项；或禁止删除仍有交易的账户。 |
| S6 | `src/features/notes/NoteEditor.tsx:53-56` | 🟡 低 | Tiptap `Image.configure({ allowBase64: true })` 允许粘贴 base64 图片，会以 JSON 内联进 `content`，**单篇笔记可能膨胀到数 MB**，拖慢加载与存储。 | 关闭 `allowBase64`，改为上传到 `receipt-photos` 等存储桶后引用 URL（工具栏已支持 http(s) 外链）。 |
| S7 | `src/features/mail/MailReader.tsx`（与 `src/lib/utils.ts` `sanitizeHtml`） | 🟢 已防护 | 邮件正文 `dangerouslySetInnerHTML` 经 DOMPurify 净化（已禁用危险标签/属性），XSS 防护到位。 | 维持现状；注意若未来放开 `allowBase64` 图片需同步净化。 |
| S8 | 会话/鉴权（`src/lib/supabase.ts`、`authStore.ts`） | 🟢 已防护 | 缺 `VITE_SUPABASE_URL/ANON_KEY` 时启动即 `throw`；登录失败不再静默回退演示会话，统一走 `friendlyAuthError`。 | 维持现状。 |

> 说明：`fireBudgetWarnings()`（`src/lib/notify.ts`）会对当前用户**全量拉取 expense 交易**再做客户端按月过滤（无 SQL 分区），在用户数据量很大时有性能/带宽隐患，但 RLS 已保证只取本人数据，非安全漏洞，归为性能项（见第六节）。

---

## 三、未完成功能与半成品模块

| # | 文件 / 模块 | 严重程度 | 现象 |
|---|---|---|---|
| H1 | `src/components/layout/Sidebar.tsx:123-132` | 🟠 中 | **通知铃铛按钮无 `onClick`**，点击无任何反应——纯占位死链，没有通知中心。 |
| H2 | `src/features/tasks/Tasks.tsx:124-127` | 🟠 中 | ModuleFab 的 "新建清单"、"从模板" 两个子项**均调用 `openCreate`**（等同"新建任务"），清单/模板功能未实现。 |
| H3 | `src/features/mail/Mail.tsx` ModuleFab | 🟠 中 | "写群发"、"新建文件夹" 两个 action **均调用 `handleCompose`**（未实现），属占位死链（详见上一阶段审阅，邮件模块文件夹管理与群发未落地）。 |
| H4 | `src/features/notes/Notes.tsx:188` | 🟡 低 | "从模板"只是 `createNote("未命名笔记（模板）")`，并无真正的模板内容。 |
| H5 | `src/features/auth/Login.tsx` / `Register.tsx` | 🟡 低 | **无"忘记密码 / 邮箱验证"入口**；注册成功但关闭邮箱确认时需手动去登录，无引导态。 |
| H6 | `src/types/index.ts` 死 schema | 🟡 低 | `RecurrenceRule`/`recurrence_next`、`NoteTag`/`NoteNoteTag` 类型已存在但无对应 UI/逻辑（见 T6）。 |

---

## 四、推荐新增的实用功能

- **通知中心**（对应 H1）：在 `Sidebar` 铃铛上接 `popover`/`drawer`，聚合预算超支、任务截止、邮件未读等事件。
- **任务周期规则**（对应 T6）：`RecurrenceRule` 已建表，应补齐"每日/每周/每月"重复任务生成逻辑。
- **笔记标签**（对应 T6）：`NoteTag`/`NoteNoteTag` 已建表，补齐标签 CRUD 与按标签筛选。
- **记账 CSV 导入**：当前仅有 `FinanceReport.exportCsv` 导出，缺导入（历史迁移/换软件常见需求）。
- **记账 PDF 报表导出**：月度收支、分类占比导出为 PDF，便于归档。
- **邮件草稿箱编辑 / 文件夹管理 UI / 附件预览 / 邮件内搜索**：当前邮件模块仅基础收发，缺上述能力。
- **周期交易、批量操作、多账本/家庭共享、智能记账**：working memory 中已列为历史待办，可逐步落地。
- **任务/笔记模板库**：把 H2/H4 的占位升级为真实模板。
- **数据云备份**：`Settings` 已有本地导出/导入，可加"导出到 Storage 桶"实现跨设备恢复。

---

## 五、响应式 UI 兼容与布局问题

整体响应式**良好**：`Sidebar`（`hidden md:flex`）+ 移动端 `MobileTabBar`；笔记三栏在移动端降级为 `文件夹/列表/编辑器` 三段切换（`Notes.tsx`）；邮件用 `md:hidden` 切换文件夹选择；金融分段控件移动端横向滚动。Recharts 均用固定高度容器（`h-44/48/52`）+ `ResponsiveContainer`，缩放稳定。

| # | 位置 | 严重程度 | 问题 | 建议 |
|---|---|---|---|---|
| R1 | `src/features/tasks/TaskCalendarView.tsx:81` | 🟡 低 | 周视图 `min-w-[640px]` + 横向滚动，窄屏下需手动横滑；且**仅有周视图、无月视图**。 | 窄屏可改为单列日列表；补充月视图选项。 |
| R2 | `src/features/finance/Finance.tsx` Tabs | 🟢 已处理 | 移动端 `TabsList` 已 `overflow-x-auto` 横向滚动，图标+文字自适应。 | 维持。 |
| R3 | `Dialog` / `Drawer`（`src/components/ui/`） | 🟡 低 | 弹窗缺少 `aria-labelledby`/`aria-describedby` 与 `role` 进一步关联标题；ESC/焦点陷阱/背景滚动锁已实现，可访问性基础 OK。 | 关联 `DialogTitle` 的 `id` 到 `role="dialog"` 的 `aria-labelledby`。 |
| R4 | `Popover`（`src/components/ui/popover.tsx:42`） | 🟡 低 | `(children.props as any)` 类型逃逸；且仅覆盖点击外部关闭，未处理 ESC/焦点返回。 | 用更类型安全的 `cloneElement` 签名；补充 ESC 关闭与焦点管理。 |

---

## 六、功能短缺 / 性能 / 缺失项

| # | 类别 | 严重程度 | 说明 | 建议 |
|---|---|---|---|---|
| P1 | 性能 | 🟡 低 | `fireBudgetWarnings()` 全量拉取本人 expense 交易再客户端按月过滤（无 SQL `date` 分区）。 | 改为 `.gte('date', monthStart).lte('date', monthEnd)` 或 `.like('date', currentMonth+'%')`，减少传输量。 |
| P2 | 性能 | 🟡 低 | `GlobalSearch`、`Dashboard`、`OverviewCards` 在客户端对 tasks+notes+transactions**全量内存过滤**。个人量级可接受，数据量大时会卡顿。 | 个人规模暂不改；可加 `useDeferredValue` 或限制扫描条数。 |
| P3 | 性能/体验 | 🟡 低 | 长列表（TaskListView、NoteList、TransactionList、邮件列表）无虚拟滚动。 | 数据上千条时引入 `react-virtual` 或分页。 |
| P4 | 功能短缺 | 🟠 中 | **预算超支通知仅在 `BudgetList` 挂载时触发一次**（`fireBudgetWarnings`），离开页面即停止，无后台/定时监控。 | 在 `App` 根或定时（如 `setInterval`）周期性检查；或依赖 Supabase Realtime + Edge Function 推送。 |
| P5 | 功能短缺 | 🟡 低 | 实时同步（`useRealtimeSync`）订阅后**不处理连接断开重连 / token 过期重订阅**。 | 监听 `channel` 的 `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT` 状态，失败自动 `removeChannel` + 重试。 |
| P6 | 功能短缺 | 🟡 低 | 无"忘记密码 / 重发验证邮件"UI（见 H5）。 | 接入 Supabase `resetPasswordForEmail` 并提供页面。 |
| P7 | 一致性 | 🟡 低 | `TaskStatus='cancelled'` 在全站被语义映射为"待审核"（`TaskBoardView` 列、`statusLabels`），与原意（已取消）冲突，易误导。 | 要么新增真正的 `review` 状态，要么将 `cancelled` 改回"已取消"文案。 |

---

## 七、优先级行动建议

1. **P0（立即修）**：S1 邮件 TLS 证书校验（`rejectUnauthorized:false`）—— 安全红线。
2. **P1（本周）**：S2 演示密码出仓；S3 `<a>` 改 `<Link>`；H1/H2/H3 三处占位死链（通知中心、任务 FAB、邮件 FAB）补实现或显式禁用。
3. **P2（迭代）**：T2/T3 类型逃逸与 schema 漂移收敛；T1 关键词标签数据化；P4 预算通知常驻；S5 账户删除保护。
4. **P3（增强）**：第四节推荐功能按需排期；R1 日历月视图；P1/P2/P3 性能优化；P5 实时重连。

---

### 附：已验证为"健康"的点（避免重复劳动）

- `tsc -b` 0 错误；`eslint .` 仅 3 个 exhaustive-deps 警告（0 error）。
- RLS 按 `auth.uid()` 隔离；存储桶 `split_part(name,'/',1)=auth.uid()` 隔离正常。
- 邮件正文 DOMPurify 净化 + Edge Function JWT 校验均到位。
- `useRealtimeSync` 的 `TABLE_TO_KEYS` 与所有 hook 的实际 query key **完全自洽**（finance/notes/tasks/mail 均命中），realtime 失效逻辑正确。
- 路由树 `app`(id) 下 `/dashboard|/tasks|/mail|/notes|/finance|/settings` 路径正确，`GlobalSearch`/`useSearch({from:'/app/...'})` 用法无误。
