# EasyWork 项目全面严格审阅报告

> 审阅日期：2026-08-10 ｜ 代码基准：`E:\Dev\EasyWork0807`（磁盘当前状态）
> 审阅方法：四位专项 Agent 并行深读 `src/**`、`supabase/**`、`src-tauri/**`，关键 P0/P1 项由主审逐一打开源文件实测复核（已标注「已复核」）。
> 严重级别约定：**P0**=阻断／安全／数据丢失；**P1**=严重功能或正确性缺陷；**P2**=架构／体验／数据安全风险；**P3**=清理／一致性／可访问性细节。

---

## 一、执行摘要

EasyWork 已远超"空壳"——五大模块（任务 / 邮件 / 笔记 / 记账 / 仪表盘）都有真实可用的 CRUD，Supabase 后端（表结构 + RLS + Edge Functions `fetch-mail`/`send-mail` + Realtime）也已落地。但存在 **3 个 P0 级阻断／高风险问题**、一批 P1 级功能／数据正确性问题，以及架构与响应式层面的技术债务。

**严重程度统计**

| 等级 | 数量 | 代表项 |
|---|---|---|
| P0 阻断/安全 | 3 | 邮件附件下载失效、导出泄露邮箱密码、后台收信缺 pg_cron |
| P1 严重功能/数据 | 12 | 路由守卫竞态、笔记丢数据、金额浮点、异步错误静默、所有权兜底缺失、孤儿交易、邮件无附件发送、仪表盘假数据…… |
| P2 架构/体验 | 18 | 数据层无抽象、类型双源、实时同步脆弱、响应式移动端缺口…… |
| P3 清理/细节 | 20+ | tooltip 坐标系、dropdown 空壳、深色硬编码色、死代码…… |

> ⚠️ **文档时效性提醒**：`docs/finance-module-review-2026-08-10.md` 已严重过时——其列为"缺口"的分类管理、预算滚动、收据上传、CSV 导出、交易筛选等 **当前代码均已实现**，规划新迭代时请勿重复计入。

---

## 二、P0 — 阻断 / 高风险（须立即处理）

### P0-1 邮件附件下载在生产环境失效【已复核】
- **位置**：`src/features/mail/MailReader.tsx:69-105`
- **证据**：`handleDownload` 仅在 `storage_path` 以 `http`/`data:`/`blob:` 开头时才真正下载；而真实附件的 `storage_path` 形如 `<user_id>/uuid-name`（Storage 对象路径）。结果永远命中「本地演示环境，无真实文件内容」分支，下载到一个描述性 **.txt 文本文件**，`storage_path` 永不指向可用资源。对账参考：`TransactionForm.tsx:178-182` 正确使用了 `createSignedUrl`。
- **影响**：用户收到带附件的邮件却永远取不到真实文件，核心邮件能力形同虚设。
- **修复**：用 `supabase.storage.from("email-attachments").createSignedUrl(storage_path, 3600)` 取签名 URL 后下载，与记账收据实现保持一致。

### P0-2 设置导出把邮箱密码明文写入备份文件【已复核】
- **位置**：`src/features/settings/Settings.tsx:30`（DATA_TABLES 含 `email_accounts`）、`:110-123`（`handleExportData` 对所有表 `select("*")`）
- **证据**：导出遍历 `DATA_TABLES`，其中 `email_accounts` 含 `password` 列；`select("*")` 会把该明文密码整列塞进 JSON 备份并触发浏览器下载。
- **影响**：凭据泄露——任何能拿到备份文件的人都能直接读取用户邮箱密码。
- **修复**：导出时剔除 `password`/`username` 等敏感列；导入时跳过凭证列；长期应改用 Tauri keyring 存储密码（见 §功能缺口·Tauri）。

### P0-3 邮件定时后台收信从未接线（缺 pg_cron）
- **位置**：`supabase/functions/fetch-mail/index.ts:151`（支持 `{scheduled:true}` service_role 全量拉取）；`grep pg_cron` 在 `supabase/**` 无匹配。
- **证据**：全仓库没有任何迁移创建 `cron.schedule` 作业来周期性触发 `fetch-mail`。
- **影响**：邮件只能靠用户手动点「收取」才更新，"后台收信 / 新邮件通知"定位名不副实。
- **修复**：新增迁移 `SELECT cron.schedule('fetch-mail-every-5min','*/5 * * * *', ...)` 调用 `fetch-mail`；或在 App 进入邮箱页时自动触发一次 `useSyncMail` 作为兜底。

---

## 三、P1 — 严重功能 / 数据正确性缺陷

### P1-1 路由守卫竞态：回访登录用户被弹回登录页【已复核】
- **位置**：`src/router.tsx:32-39`（`indexRoute.beforeLoad`）、`src/features/auth/authStore.ts:20`（初始 `loading:true`）、`src/features/auth/Login.tsx`（整文件无 `useEffect` 监听 session）、`src/features/auth/useAuth.ts:13-20`
- **证据**：应用启动瞬间 `loading===true`，`indexRoute.beforeLoad` 只要 `loading` 为真就 `throw redirect({to:"/login"})`。已登录的回访用户（持久化会话尚未被 `getSession` 解析）首屏即被弹到 `/login`；而 `Login.tsx` 没有任何"会话就绪后自动跳转 /dashboard"的逻辑，TanStack Router 也不会因 zustand store 变化重跑 `beforeLoad`。于是登录用户卡在登录页，必须手动再点一次登录。
- **修复**：① `indexRoute.beforeLoad` 中 `if (loading) return;`（loading 期间不打断）；② `Login`/`Register` 加 `useEffect`：当 `!loading && session` 时 `navigate({to:"/dashboard"})`；③ 可选：渲染 `RouterProvider` 前用 `loading` 显示启动屏。

### P1-2 笔记切换时未落盘的自动保存被丢弃 → 内容静默丢失
- **位置**：`src/features/notes/NoteEditor.tsx:15-49,63-67`
- **证据**：`NoteEditor` 切换笔记时**不卸载**，仅 `note` prop 变化触发 `setContent` → `onUpdate` → `handleContentChange` 用 `saveTimeoutRef` 做 1.5s 防抖；旧笔记在防抖窗口内尚未 flush 的编辑被 `clearTimeout` 取消，且卸载清理只在真正卸载时执行。
- **触发**：在笔记 A 输入后 **1.5 秒内**点选笔记 B，A 的最后一段输入不入库。
- **修复**：切换 `note.id` 时先 flush 待保存内容；或把防抖定时器提升到父级、在 `note.id` 变化时强制 flush。

### P1-3 记账金额使用 JS `number` 浮点参与累加与格式化
- **位置**：`src/types/index.ts:81,96`、`src/types/database.types.ts`（amount 为 `number`，DB 实为 `numeric`）；累加点 `AccountList.tsx:36-57`、`BudgetList.tsx:60-70`、`OverviewCards.tsx:25-30`、`FinanceReport.tsx`、`TransactionList.tsx:74-78` 等
- **证据**：`Number(1.005).toFixed(2)` 在 V8 结果为 `"1.00"`（二进制舍入）；长链 `reduce` 累加会缓慢漂移。
- **影响**：`x.xx5` 金额展示／比较偏低，总资产／月度汇总可能失真。
- **修复**：统一整数分（`Math.round(amount*100)`）或 Decimal.js 运算；`formatMoney` 用稳健四舍五入。

### P1-4 异步 mutation 普遍缺 `onError`，失败被静默吞掉
- **位置**：`useTasks.ts:45-159`、`useFinance.ts:60-291`、`TaskForm.tsx:106-115`、`Finance.tsx` 各表单
- **证据**：`useMutation` 几乎只配 `onSuccess`，调用处也未传 `onError`；网络异常／RLS 拒绝／唯一约束冲突时按钮仅从 pending 恢复，用户无任何提示，数据也未变却像"成功"。
- **修复**：封装统一 `useMutation` 默认 `onError` 弹 toast；或在各 `mutate` 调用处补 `onError`。

### P1-5 删除/更新仅依赖 RLS，前端未做所有权兜底
- **位置**：`useTasks.ts:147-159`、`useFinance.ts:97-108,166-179,220-233,279-291`、`useMail.ts:348-360`
- **证据**：mutation 仅按 `id` 定位行，未加 `.eq("user_id", getCurrentUserId())`。当前由 RLS 兜底，但属纵深防御缺口——RLS 误配或切换高权限 key 时可越权篡改/删除。
- **修复**：更新/删除一律补 `.eq("user_id", getCurrentUserId())`，并校验返回 `count===1`。

### P1-6 删除账户未处理关联交易 → 孤儿数据 / 总资产失真
- **位置**：`src/features/finance/AccountList.tsx:124-128`（仅 `deleteAccount.mutate(account.id)`）、`:36-57`
- **证据**：删除账户后其 `transactions` 仍在（无级联）；`getAccount(id)` 返回 `undefined` 显示"—"，交易金额仍计入 `accountBalances[deletedId]` 却不出现在"总资产"中。
- **修复**：删除前确认关联交易，提示转移/归档，或 DB 层 `ON DELETE SET NULL` + 前端同步。

### P1-7 邮件发送不支持附件；回复/转发吞错
- **位置**：`useMail.ts:184-216`（`useSendEmail` 无附件字段）、`MailComposer.tsx`（无附件控件）、`MailReader.tsx:50-67,107-115`（catch 静默）
- **证据**：撰写框无文件输入，Edge Function 调用也未携带附件；回复/转发失败被 `catch{}` 吞掉。
- **修复**：`MailComposer` 增附件选择与上传（复用 storage 桶），`useSendEmail` 增 `attachments`；回复/转发失败 `toast.error` 并保留编辑内容。

### P1-8 收件人无邮箱格式校验 / 多地址解析
- **位置**：`MailComposer.tsx:70-99`、`useMail.ts:195-208`
- **证据**：仅 `if(!to.trim())` 非空校验，不拆分多地址、不校验每个地址合法性。
- **修复**：按逗号拆分后逐项正则校验，错误给字段级提示；发送传数组。

### P1-9 仪表盘"趋势"是硬编码假数据【已复核】
- **位置**：`src/features/dashboard/OverviewCards.tsx:37,43,49,55`（`trend.text` 为常量 `"▼ 2 较昨日"`、`"▲ 6% 超预算"` 等）；`Dashboard.tsx:11-15`（问候语"下午好，Ethan"、日期"8月7日"写死）
- **证据**：卡片主数值（待办数/未读/支出）是动态的，但趋势涨跌数字与文字均为固定文案，与真实数据无关，甚至可能方向相反。
- **修复**：由真实数据计算环比；问候按时段/用户动态生成。

### P1-10 设置页"数据存储"描述与实现不符（误导）
- **位置**：`src/features/settings/Settings.tsx:374`（"本地优先(localStorage)"）、`:110-124`（实际 `supabase.from(...)`）、About 文案
- **证据**：业务数据实际存 Supabase（受 RLS 约束），并非 localStorage。
- **修复**：统一文案为"云端（Supabase，受 RLS 保护）"。

### P1-11 删除文件夹/笔记成功反馈依赖原生 `window.confirm`；通知偏好"本地优先"措辞
- **位置**：`NoteSidebar.tsx:245-250`、`NoteList.tsx:60-66`、`Settings.tsx`
- **修复**：统一用 Tauri 原生对话框；同步文案。

### P1-12 任务 `sort_order` / 账户排序并发竞态
- **位置**：`useTasks.ts:57-68`、`useFinance.ts:106-122`
- **证据**：`sort_order` 取"当前行数"，快速连点/并发时多行拿到相同值，排序错乱、看板顺序不稳。
- **修复**：服务端 `MAX(sort_order)+1` 或用时间戳兜底。

---

## 四、P2 — 架构 / 体验 / 数据安全风险

### 架构与技术债务
- **P2-A 数据层无抽象层**：`useTasks/useFinance/useMail/useNotes` 直接耦合 Supabase 并混合业务职责（S2-1）。建议抽 `src/lib/api/*` 仓储层。
- **P2-B 双份「表 → query key」映射**：手动失效（各 hook `onSuccess`）与 `useRealtimeSync.TABLE_TO_KEYS` 各写一遍，易失同步（S2-2）。建议收敛 `invalidateByTable()`。
- **P2-C 类型双源 + `as unknown as` 掩盖字段不匹配**：业务类型用枚举、生成类型用 `string`，逼迫每个查询强转，`Note.content: any` 放弃类型（S2-3）。建议以 `database.types.ts` 为唯一真相源派生类型。
- **P2-D 实时同步健壮性**：`useRealtimeSync.ts:38-59` 无订阅 status 回调（失败静默）、StrictMode 下孤儿订阅、未判断登录态即订阅（S2-4）。
- **P2-E `getCurrentUserId()` 返回空串隐患**：`authStore.ts:33-35`，未登录/loading 期写入 `user_id:""`，RLS WITH CHECK 会直接报错抛给用户（S2-5）。mutation 内应先校验 `if(!uid) throw`。
- **P2-F 预算跨月滚动无事务**：`BudgetList.tsx:163-185` 循环 `mutateAsync`，部分成功留中间态（S2-8）。建议 DB RPC 事务内完成。
- **P2-G 未使用依赖 `dayjs`**（与 `date-fns` 并存，`src` 内 0 引用）（S2-6）。删。
- **P2-H 路由无 code-splitting**：`router.tsx` 全量静态 import，业务特性代码进主 chunk（S3-1）。建议 `Route.lazyComponent`。
- **P2-I `tsconfig.node.json` 缺 `noEmit`** → 根目录残留 `vite.config.js/.d.ts/.timestamp-*.mjs`（S3-2）。加 `noEmit`，清理并 `.gitignore`。
- **P2-J 缺独立 `typecheck` 脚本，ESLint 关闭 `no-explicit-any` 等**（S3-6）。加 `"typecheck":"tsc -b --noEmit"`。
- **P2-K 失效/脆弱测试**：`useUpdateTask.test.tsx`（3 用例全挂，mock 旧 mockStore 路径）、`notify.test.ts`（1 挂）套件变红（S1-2）。实测 `npm test`：2 文件失败、4 用例失败、28 通过。
- **P2-L `mockStore.ts` 运行期死代码**（仅测试引用）及其专用测试（S3-3）。删。

### 响应式 UI 与布局
- **P2-M 邮箱移动端无法切换文件夹**【功能缺失】：`Mail.tsx:85` 账号/文件夹树仅 `md:block`，移动端无入口，用户被锁死在收件箱（S2-1）。建议抽屉/顶部下拉承载，参照 notes 模块。
- **P2-N 全局搜索移动端不可触达**：搜索按钮在 `hidden md:flex` 侧边栏，`GlobalSearchDialog` 仅由 `ew:search` 事件打开，移动端侧边栏不渲染 → 事件永不派发（S2-2）。
- **P2-O `MailComposer` 是"假模态"**：自行 `fixed inset-0` 写遮罩，无焦点陷阱 / Esc / `aria-modal` / 背景滚动锁（S2-3）。建议复用 `Dialog`/`Drawer` 或接入 `useFocusTrap`。
- **P2-P 新增邮箱账号对话框无 `max-h`**：含 ~10 字段，矮窗口下底部按钮可能永远不可见（S2-4）。建议 `DialogContent` 默认 `max-h-[90vh] overflow-y-auto`。

### 其他体验缺陷
- **P2-Q 深色模式硬编码色**：多处 `text-green-600/red-600/blue-600`、`border-l-red-500`、`border-gray-300` 等在深色下对比违和（S3-9）。统一用 `text-success/text-destructive/border-border`。
- **P2-R Finance 移动端记账弹窗提交后不关闭**：`Finance.tsx:98-105` 未传 `onSuccess`（S3-12）。
- **P2-S FAB 动作未预设记账类型**：`Finance.tsx:88-95` 转账/收入/支出都开默认"支出"表单（S3-13）。
- **P2-T 任务详情可保存空标题**：`TaskDetailDrawer.tsx:47-54` 无校验（S3-14）。
- **P2-U `TaskListView` 伪造 `MouseEvent`**：`:48` 用类型断言构造假事件绕过签名（S3-15）。
- **P2-V 数据库导入未重映射 `user_id` 且整页 reload**：`Settings.tsx:125-150`（S3-20）。导入前改写 `user_id`，后用 queryClient 失效刷新。
- **P2-W 笔记导入丢富文本**：`Notes.tsx:25-34` 仅 `slice(0,2000)` 纯文本（S3-21）。
- **P2-X 草稿正文 HTML 入库未经 sanitize**：`useMail.ts:258-279`（S3-22）。入库前也过 `sanitizeHtml`。
- **P2-Y ThemeToggle 未接入主界面且未处理 system**：仅在测试出现，桌面常驻入口缺失（S3-10）。
- **P2-Z 多处原生 `alert/confirm/prompt`**：Tauri 桌面端体验割裂，且 `MailComposer.tsx:96-98` 的 `err` 未展示（S3-24）。

---

## 五、P3 — 清理 / 一致性 / 可访问性

| # | 问题 | 位置 |
|---|---|---|
| 1 | Tooltip 坐标系错误（`getBoundingClientRect` 已视口坐标又叠加 scrollY/X，滚动后错位；仅 hover 无 focus/aria） | `components/ui/tooltip.tsx:21-23` |
| 2 | Popover 绝对定位无边缘翻转 / 无 Portal | `components/ui/popover.tsx:67-74` |
| 3 | `DropdownMenu` 是空壳原语（无 open/定位/portal），业务未引用但属陷阱 | `components/ui/dropdown-menu.tsx` |
| 4 | 日历表头窄屏不换行、7 列 `min-w-[640px]` 强制横滚 | `TaskCalendarView.tsx:61-81` |
| 5 | Dialog 缺 `aria-labelledby/describedby` 关联 | `components/ui/dialog.tsx:58-63` |
| 6 | 各页头部极端窄屏可能拥挤（缺 `flex-wrap`） | `Tasks.tsx:49`、`Mail.tsx:65`、`Notes.tsx:70`、`Finance.tsx:22` |
| 7 | 看板卡片 `hover:border-border-strong` 类未定义（no-op） | `TaskBoardView.tsx:132` |
| 8 | 笔记移动端无"返回列表"按钮 | `Notes.tsx:169-173` |
| 9 | `prose` 依赖 `@tailwindcss/typography` 但依赖未声明 | `MailReader.tsx:187`、`NoteEditor.tsx:119`、`package.json` |
| 10 | 未使用 hook 导出（`useTask`/`useNoteTags`/`useEmail`） | `useTasks.ts:29` 等 |
| 11 | `useNotes.ts:220` 死本地变量（`void userId`） | — |
| 12 | 登录页预填真实感凭据 `test@example.com/Test123456!` | `Login.tsx:16-17` |
| 13 | 邮件页未读数写死 "3 账户·12 未读" | `Mail.tsx:69` |
| 14 | 创建交易成功后未重置 `category_id/account_id` | `TransactionForm.tsx:142-154` |
| 15 | `Tasks.tsx` 重复实现 `cn` | `Tasks.tsx:133-135` |
| 16 | `useMail.ts:264` 硬编码兜底邮箱 `demo@example.com` | — |
| 17 | `TaskTrendChart` 组件已写但未挂载（死代码） | `dashboard/TaskTrendChart.tsx` |
| 18 | `note-images` 存储桶未使用（笔记图片走 base64 内联） | `migrations/0006`、NoteEditor |
| 19 | 任务/笔记 FAB "从模板" 实为占位 | `Tasks.tsx:120-127`、`Notes.tsx:187-189` |
| 20 | 诊断类迁移冗余（0011-0018 diag/grant/demo）污染生产 | `supabase/migrations/0011-0018` |

---

## 六、功能完整性 / 待办缺口（按模块）

### 任务 ✅ 较完整
- ❌ **标签管理 UI**（只能选既有标签，无法新建/改色）——`TaskForm.tsx:179-205`、`useTasks.ts` 无 `createTag`（P1）
- ❌ 模块内筛选/排序/搜索（仅全局搜索）
- ❌ **重复任务**（DB 有 `recurrence_rule` 但前端无录入/生成）（P1）
- ❌ **到期提醒/通知**（`task_reminder` 开关无消费逻辑）（P1）
- ❌ 任务依赖、导出

### 记账 ✅ 高度完整（旧评审文档已过时）
已实现：收支/转账/账户/预算/报表、分类多级+图标、总预算+跨月滚动、CSV 导出、收据上传、交易筛选。
- ❌ **周期/模板交易**（交易表无 `recurrence_rule`）——P1
- ❌ CSV 导入、PDF 报表导出 ——P2
- ⚠️ decimal 精度（P1-3）、多币种/汇率（创建时硬 `CNY`）、多账本/家庭共享、智能记账 ——P2

### 邮件 ⚠️ 收发链路真实，客户端体验多处是壳
- ✅ 多账户、IMAP 收信、SMTP 发信、附件接收入库
- ❌ **附件下载**（P0-1）、**附件发送**（P1-7）、**文件夹管理 CRUD**（FAB 占位）、**联系人/群组**（P2）
- ❌ 定时后台收信（P0-3）、签名、POP3
- ⚠️ 搜索仅 client 端（DB `emails_search_idx` 未用）

### 笔记 ✅ 编辑器强，元数据能力缺
- ✅ 富文本全工具栏、多级文件夹、client 全文搜索
- ❌ **标签 UI**（`note_tags` schema 已有但无分配/展示 UI）——P1
- ❌ 导出（MD/PDF）、版本历史、Markdown 富文本导入

### 仪表盘 ⚠️ 维度偏少 + 含假数据
- ⚠️ 趋势文案假数据（P1-9）、今日聚焦勾选仅本地 `useState` 不持久化（`TodayFocus.tsx`）
- ❌ `TaskTrendChart` 未挂载、缺预算执行率/净资产曲线等卡片

### 设置 ⚠️ 描述与实现不一致 + 隐患
- ⚠️ "本地优先" 文案过时（P1-10）、导出泄露密码（P0-2）、通知开关部分无消费（P1-11）
- ⚠️ 显示名仅存 localStorage 未写 `profiles`、邮箱写死 `demo@example.com` 禁用

### 后端 / Tauri 集成缺口
- ❌ **系统托盘**（P1）、**原生通知**（P1）、**凭据 keyring 存储**（P1）、自动更新、文件对话框、全局快捷键
- ⚠️ 缺表：邮件联系人、任务依赖、交易 `recurrence_rule`、笔记版本、共享账本 `group_id`
- ⚠️ 诊断类迁移（0011-0018）应清理归档

---

## 七、推荐新增功能（高价值、可落地）

**P0（先止血/打通闭环）**
1. 修复邮件附件下载（签名 URL）
2. 设置导出剔除邮箱密码
3. 配置邮件定时拉取（pg_cron）

**P1（核心体验补全）**
4. 任务标签管理 UI + 模块内筛选/排序
5. 任务到期提醒 + 通知设置真正消费（接 Tauri 原生通知）
6. 笔记标签 UI
7. 邮件文件夹管理 + 撰写带附件
8. 仪表盘数据真实化 + 挂载 `TaskTrendChart` + 今日聚焦落库
9. 周期/模板交易（自动派生工资/房租）
10. Tauri 系统托盘 + 原生通知 + 凭据 keyring

**P2（差异化增强）**
11. 全局搜索纳入邮件
12. 记账 CSV 导入 / PDF 报表 / 多币种汇率 / 多账本共享 / 智能记账
13. 笔记导出（MD/PDF）+ 版本历史 + Markdown 富文本导入
14. 设置页文案与实现对齐、显示名写 `profiles`
15. Tauri 自动更新 + 文件对话框 + 全局快捷键
16. 任务依赖 / 任务与记账跨模块联动
17. 清理诊断类迁移
18. 账户多币种放开 + decimal 精度治理

---

## 八、优先级修复路线图（冲刺建议）

| 冲刺 | 目标 | 关键项 |
|---|---|---|
| **Sprint 0（止血）** | 消除阻断/安全 | P0-1、P0-2、P0-3 |
| **Sprint 1（正确性）** | 数据与流程正确 | P1-1 路由竞态、P1-2 笔记丢数据、P1-3 金额精度、P1-4 异步错误、P1-5 所有权兜底、P1-9 仪表盘假数据 |
| **Sprint 2（闭环）** | 邮件/记账完整度 | P1-6 孤儿交易、P1-7 附件发送、P1-8 收件人校验、§任务标签/提醒、§周期交易 |
| **Sprint 3（架构）** | 可持续维护 | P2-A/B/C 抽象层与类型、P2-D 实时同步、P2-K 测试、P2-L 死代码、路由分包 |
| **Sprint 4（体验/响应式）** | 桌面→移动一致 | P2-M/N/O/P 移动端缺口、P2-Q 深色、P2-Y 主题入口、P3 可访问性 |

---

_本报告由自动化专项审阅生成，P0/P1 关键项已逐条打开源码复核。建议从 Sprint 0 立即开始，P0 三项均属"对外可见且高风险"，优先于一切新功能。_
