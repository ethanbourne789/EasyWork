# EasyWork 个人效率工具 - 设计规格

- **日期**：2026-08-06
- **状态**：已补充模块详细设计
- **项目目录**：`e:\Dev\EasyWork0807`

## 1. 项目定位

云端优先的个人效率工具，Supabase 为唯一数据源，Tauri 2 作为桌面 + 移动富客户端。单用户多设备通过 Supabase Auth 登录 + Realtime 实时同步。

**架构方向决策**：放弃历史 local-first 偏好，全面采用 Supabase BaaS 架构。业务数据全部存于 Supabase Postgres，RLS 按 `auth.uid()` 隔离用户数据。

## 2. 目标平台

- 桌面：Windows / macOS / Linux
- 移动：Android / iOS
- 不做 Web 版（Tauri 2 移动端覆盖跨端需求）

## 3. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  Tauri 2 客户端 (桌面三平台 + Android/iOS)                │
│  ┌───────────────────────┐  ┌──────────────────────────┐ │
│  │ 前端 (Webview)         │  │ Rust 后端 (tauri commands)│ │
│  │ Vite+React19+TS+TWv4  │◄─►│ • IMAP/SMTP 收发邮件      │ │
│  │ shadcn/ui             │  │ • 系统密钥串存凭证        │ │
│  │ Zustand+TanStack Query│  │ • 本地通知/托盘           │ │
│  └──────────┬────────────┘  └─────────────┬────────────┘ │
│             │ supabase-js (HTTPS+Realtime WS)            │
└─────────────┼─────────────────────────────────┬──────────┘
              ▼                                 ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase 平台                          │
│  Auth(多设备会话) │ Postgres+RLS(按user_id隔离)           │
│  Realtime(多端实时同步) │ Storage(邮件附件/笔记图片)       │
│  Edge Functions(邮件webhook/定时同步/报表聚合)            │
│  pgvector(笔记语义搜索-可选增强)                          │
└─────────────────────────────────────────────────────────┘
```

### 关键架构决策

- 所有业务数据存 Supabase Postgres，RLS 策略 `using (auth.uid() = user_id)` 隔离。
- 邮件凭证（IMAP/SMTP 密码、OAuth token）存系统密钥串（Tauri keychain 插件），不进数据库。
- 邮件正文/附件缓存进 Postgres + Storage。
- 离线时前端用 TanStack Query 缓存兜底，恢复联网后 Realtime 自动对齐（不追求复杂离线写入合并）。
- 邮件收件：Rust 端 IMAP 轮询（前台实时）+ Edge Function 定时拉取（后台兜底）两者结合。

### 数据库迁移编号约定

迁移文件按实施顺序编号，存于 `supabase/migrations/`：

- `0001_init_profiles.sql` — profiles（Dashboard 骨架）
- `0002_tasks.sql` — 任务管理
- `0003_finance.sql` — 记账
- `0004_notes.sql` — 笔记
- `0005_email.sql` — 邮箱

所有业务表统一约定：
- 主键 `id uuid primary key default gen_random_uuid()`
- 外键 `user_id uuid not null references auth.users(id) on delete cascade`
- 时间戳 `created_at timestamptz not null default now()`、`updated_at timestamptz not null default now()`
- 启用 RLS，策略统一 `using (auth.uid() = user_id)`，写策略 `with check (auth.uid() = user_id)`
- `updated_at` 由触发器自动更新

## 4. 技术栈与依赖（2026 稳定版）

### 桌面/移动壳

- `Tauri 2.x`（Rust 核心 + 系统 WebView，桌面~10MB，移动原生壳）
- Rust crates：`tauri`、`lettre`（SMTP 发件）、`imap`（IMAP 收件）、`native-tls`、`tokio`、`serde`、`keyring`（凭证）

### 前端核心

- `React 19` + `TypeScript 5.x`
- `Vite 7`（构建，Tauri 官方推荐）
- `Tailwind CSS v4`（`@tailwindcss/vite` 插件，新引擎）
- `shadcn/ui`（基于 Radix + CVA，按需复制组件源码）

### 数据与状态

- `@supabase/supabase-js v2`（Auth + Postgres + Realtime + Storage 客户端）
- `TanStack Query v5`（服务端状态/缓存/乐观更新）
- `Zustand v5`（纯前端 UI 状态，如侧边栏折叠、视图切换）
- `react-hook-form` + `zod`（表单与校验）

### 路由

- `TanStack Router v1`（类型安全路由，文件式，适合多视图模块）

### 模块专属

- 笔记：`Tiptap v2`（富文本，扩展生态成熟，支持协同预留）
- 图表：`Recharts v2`（Dashboard/记账报表）
- 日期：`date-fns v3` + `dayjs`（日历视图）
- 拖拽：`@dnd-kit`（看板拖拽）

### Tauri 插件（移动端必备）

- `@tauri-apps/plugin-notification`（推送/本地通知）
- `@tauri-apps/plugin-store`（少量本地偏好设置）
- `@tauri-apps/plugin-keychain`/`stronghold`（凭证安全存储）
- `@tauri-apps/plugin-updater`（自动更新，桌面）

### 工程化

- `ESLint 9` + `Prettier 3` + `eslint-plugin-react-hooks`
- `Vitest`（单元）+ `Playwright`（E2E，Tauri WebDriver）

### 部署

- Supabase Cloud 托管（不自托管）

> 具体 patch 版本在脚手架阶段 `package.json` 与 `Cargo.toml` 锁定。

## 5. Supabase 能力使用映射

| Supabase 能力 | 本项目用途 |
|---|---|
| Auth | 邮箱密码 + 魔法链接登录，多设备会话管理，刷新 token |
| Postgres + RLS | 全部业务表，`policy` 全部 `using (auth.uid() = user_id)` |
| Realtime | 任务/笔记/记账的多设备实时同步；邮件新邮件推送 |
| Storage | 邮件附件、笔记内图片、记账票据照片 |
| Edge Functions | ① 邮件 IMAP 拉取定时任务（cron webhook）② 报表聚合 ③ 笔记全文/向量索引触发器 |
| pgvector | 笔记语义搜索（可选增强，非 MVP 必须） |
| Database Webhooks | 数据变更触发 Edge Function（如任务到期提醒邮件） |

## 6. 功能点梳理（按模块）

### 6.1 Dashboard 仪表盘

- 今日概览卡片：待办数、未读邮件、本周收支、最近笔记
- 本周任务完成趋势图、月度收支对比图
- 快捷入口 + 最近活动流
- 全局搜索（跨任务/笔记/记账）

### 6.2 任务管理

- 三视图切换：列表 / 看板（拖拽）/ 日历（周视图默认）
- 字段：标题、描述、优先级、状态、截止日、标签、子任务、重复规则
- 详情抽屉（drawer）
- 到期提醒（本地通知 + Edge Function 邮件提醒）
- MVP 支持简单重复规则：每日 / 每周 / 每月

### 6.3 邮箱

- 多账号管理（IMAP/SMTP 配置，凭证存 keychain）
- 文件夹树（收件箱/已发送/自定义）→ 列表 → 阅读区（三栏）
- 收件：Rust 端 IMAP 轮询（前台实时）+ Edge Function 定时拉取（后台兜底），新邮件 Realtime 推送
- 发件：SMTP（Rust），存已发送
- 附件上传/下载（Storage）
- 搜索（Postgres 全文检索）

### 6.4 笔记（富文本）

- 两栏：文件夹树 + 编辑器
- Tiptap 富文本：标题/列表/代码块/图片/表格/引用/任务清单
- 图片粘贴上传 Storage
- 全文搜索 + 可选语义搜索（pgvector，非 MVP）
- 标签 + 收藏

### 6.5 记账

- 单式流水账：收入/支出/转账，分类、账户、日期、备注、票据
- 预算：按分类设月度预算，超支预警
- 报表：月度收支、分类占比、趋势图
- 多账户（现金/银行卡/信用卡），账户余额汇总
- 单币种 CNY

### 6.6 全局

- 登录/注册/找回密码（邮箱密码 + 魔法链接，MVP 不加 OAuth）
- 设置：账号、邮件账号、主题（亮/暗）、通知偏好
- 自动更新（桌面）
- 数据导出：JSON/CSV（数据可移植性兜底）
- i18n：MVP 中文，预留 i18n 结构

## 7. 各模块详细设计

### 7.1 任务管理详细设计

#### 数据库表结构（`0002_tasks.sql`）

**`tasks` 表** — 任务主表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | 主键 |
| user_id | uuid | 所有者 |
| title | text not null | 标题 |
| description | text | 描述 |
| status | text not null default 'todo' | `todo` / `in_progress` / `done` / `cancelled` |
| priority | text not null default 'medium' | `low` / `medium` / `high` / `urgent` |
| due_date | timestamptz | 截止时间 |
| recurrence_rule | jsonb | 重复规则，null 表示不重复 |
| recurrence_next | timestamptz | 下次生成时间，用于 Edge Function 扫描 |
| sort_order | int not null default 0 | 看板列内排序 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

约束：`status` check in (todo, in_progress, done, cancelled)；`priority` check in (low, medium, high, urgent)。

**`subtasks` 表** — 子任务

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| task_id | uuid references tasks on delete cascade | 父任务 |
| user_id | uuid | |
| title | text not null | |
| done | boolean not null default false | |
| sort_order | int not null default 0 | |
| created_at | timestamptz | |

**`tags` 表** — 标签

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text not null | |
| color | text | 颜色值 |
| created_at | timestamptz | |

唯一约束：`(user_id, name)`。

**`task_tags` 表** — 任务-标签关联

| 字段 | 类型 |
|---|---|
| task_id | uuid references tasks on delete cascade |
| tag_id | uuid references tags on delete cascade |
| 主键 | (task_id, tag_id) |

#### 重复规则 JSONB 结构

```json
{
  "frequency": "daily" | "weekly" | "monthly",
  "interval": 1,
  "end_date": "2026-12-31T00:00:00Z" | null
}
```

**生成逻辑**：任务被标记为 `done` 时，若 `recurrence_rule` 非空：
1. 触发器/Edge Function 计算 `recurrence_next = due_date + interval`
2. 若未超过 `end_date`，克隆当前任务为新任务（status='todo'，新 due_date，相同 recurrence_rule），并清空当前任务的 recurrence_rule（避免再次重复）

#### 状态流转

```
todo ──► in_progress ──► done
  │           │
  └───────────┴──► cancelled

done/cancelled 可恢复为 todo
```

#### 到期提醒

- 本地：Tauri `plugin-notification`，前端定时扫描 due_date 即将到期任务。
- 邮件：Edge Function + Database Webhook，任务创建/更新时若 due_date 在未来，调度提醒邮件（通过 Supabase Edge Function + Resend/SMTP）。

#### Realtime

启用 `tasks`、`subtasks` 表 Realtime，前端订阅 `user_id` 过滤的变更。

#### 组件拆分

- `TaskListView` / `TaskBoardView` / `TaskCalendarView` — 三视图（路由内切换）
- `TaskCard` / `TaskRow` — 单任务卡片
- `TaskDetailDrawer` — 详情抽屉
- `TaskForm` — 创建/编辑表单
- `SubtaskList` — 子任务列表
- `TagManager` — 标签管理
- `useTasks` — TanStack Query hook（列表/筛选/CRUD）

---

### 7.2 记账详细设计

#### 数据库表结构（`0003_finance.sql`）

**`accounts` 表** — 账户

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text not null | 账户名 |
| type | text not null | `cash` / `bank` / `credit` |
| initial_balance | numeric(12,2) not null default 0 | 初始余额 |
| currency | text not null default 'CNY' | |
| sort_order | int not null default 0 | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`categories` 表** — 分类

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text not null | |
| type | text not null | `income` / `expense` |
| icon | text | 图标标识 |
| parent_id | uuid references categories | 父分类（支持二级），null 为一级 |
| sort_order | int not null default 0 | |

**`transactions` 表** — 流水

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| type | text not null | `income` / `expense` / `transfer` |
| amount | numeric(12,2) not null | 金额（正数） |
| account_id | uuid references accounts | 源账户 |
| to_account_id | uuid references accounts | 转账目标账户（仅 transfer） |
| category_id | uuid references categories | 分类（transfer 时为 null） |
| date | date not null | 发生日期 |
| note | text | 备注 |
| receipt_url | text | 票据照片 Storage 路径 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

约束：`type` check in (income, expense, transfer)；转账时 `to_account_id` 非空、`category_id` 为空。

**`budgets` 表** — 预算

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| category_id | uuid references categories | 按分类设预算 |
| amount | numeric(12,2) not null | 月度预算上限 |
| year_month | int not null | 如 202608 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

唯一约束：`(user_id, category_id, year_month)`。

#### 账户余额计算

```
balance = initial_balance
        + SUM(income.amount)  where account_id = this
        - SUM(expense.amount) where account_id = this
        + SUM(transfer.amount) where to_account_id = this
        - SUM(transfer.amount) where account_id = this
```

用 Postgres 视图 `account_balances` 聚合，或前端按账户分组计算。超支预警：前端比较 `本月支出 vs budget.amount`。

#### 票据照片 Storage

- bucket: `receipt-photos`，路径 `user_id/transaction_id/filename`
- RLS：Storage policy 按 `auth.uid()` 匹配路径首段。

#### 组件拆分

- `TransactionList` — 流水列表（按日期分组）
- `TransactionForm` — 记账表单（收入/支出/转账切换）
- `AccountList` / `AccountCard` — 账户列表与余额
- `BudgetList` / `BudgetProgress` — 预算列表与进度条
- `FinanceReport` — 报表（月度收支柱状图、分类占比饼图、趋势折线图，Recharts）
- `useTransactions` / `useAccounts` / `useBudgets` — TanStack Query hooks

---

### 7.3 笔记详细设计

#### 数据库表结构（`0004_notes.sql`）

**`note_folders` 表** — 文件夹

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text not null | |
| parent_id | uuid references note_folders | 父文件夹（嵌套），null 为根 |
| sort_order | int not null default 0 | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`notes` 表** — 笔记

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| folder_id | uuid references note_folders on delete set null | |
| title | text not null default '无标题' | |
| content | jsonb not null default '{}'::jsonb | Tiptap JSON 文档 |
| content_text | text | 纯文本（由触发器从 content 提取，用于全文搜索） |
| search_vector | tsvector | 全文搜索向量（generated column） |
| is_pinned | boolean not null default false | 收藏 |
| cover_url | text | 封面图 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`note_tags` 表** + **`note_note_tags` 关联表**（结构同任务标签）。

#### 全文搜索

```sql
-- content_text 由触发器从 Tiptap JSON 提取纯文本
-- search_vector 为 generated column
alter table notes add column search_vector tsvector
  generated always as (to_tsvector('chinese', coalesce(title,'') || ' ' || coalesce(content_text,''))) stored;

create index notes_search_idx on notes using gin(search_vector);

-- 查询
select * from notes where search_vector @@ to_tsquery('chinese', '关键词');
```

触发器函数：遍历 Tiptap JSON 的 text 节点拼接为 content_text。

#### 图片存储

- bucket: `note-images`，路径 `user_id/note_id/uuid.ext`
- 粘贴/拖拽图片 → 上传 Storage → 返回 public_url → Tiptap 插入 image 节点
- Storage policy：用户只能读写自己路径前缀下的对象。

#### pgvector 语义搜索（可选，非 MVP）

- `notes` 增列 `content_embedding vector(1536)`
- Edge Function 在 note 更新时调用 embedding API 生成向量
- 查询：`order by content_embedding <=> query_embedding limit 10`

#### 组件拆分

- `NoteSidebar` — 文件夹树
- `NoteList` — 笔记列表（标题 + 摘要 + 时间）
- `NoteEditor` — Tiptap 编辑器（工具栏 + 内容区）
- `TiptapToolbar` — 富文本工具栏
- `NoteSearch` — 搜索框 + 结果
- `useNotes` / `useFolders` — TanStack Query hooks

---

### 7.4 邮箱详细设计

#### 数据库表结构（`0005_email.sql`）

**`email_accounts` 表** — 邮箱账号元数据（凭证存 keychain，不进库）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| email | text not null | 邮箱地址 |
| display_name | text | 发件人显示名 |
| imap_host | text not null | |
| imap_port | int not null | 通常 993 |
| smtp_host | text not null | |
| smtp_port | int not null | 通常 465/587 |
| use_ssl | boolean not null default true | |
| last_synced_uid | int | 已同步的最大 IMAP UID |
| last_synced_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

唯一约束：`(user_id, email)`。

> 凭证（密码或 OAuth token）通过 Tauri keychain 插件存储，key 为 `easywork:email:{account_id}`，不写入数据库。

**`email_folders` 表** — 文件夹

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| email_account_id | uuid references email_accounts on delete cascade | |
| user_id | uuid | |
| name | text not null | 显示名（收件箱/已发送...） |
| imap_path | text not null | IMAP 路径（INBOX, Sent, 等） |
| unread_count | int not null default 0 | |
| sort_order | int not null default 0 | |

**`emails` 表** — 邮件缓存

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| email_account_id | uuid references email_accounts on delete cascade | |
| user_id | uuid | |
| folder_id | uuid references email_folders | |
| message_id | text | IMAP Message-ID 头 |
| uid | int | IMAP UID |
| from_address | text | |
| to_addresses | text[] | |
| cc_addresses | text[] | |
| subject | text | |
| preview_text | text | 前 200 字 |
| body_html | text | |
| body_text | text | |
| has_attachments | boolean default false | |
| is_read | boolean default false | |
| is_starred | boolean default false | |
| received_at | timestamptz | |
| created_at | timestamptz | |

唯一约束：`(email_account_id, message_id)` 用于去重。

**`email_attachments` 表** — 附件

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| email_id | uuid references emails on delete cascade | |
| user_id | uuid | |
| filename | text | |
| mime_type | text | |
| size | int | 字节 |
| storage_path | text | Storage 路径 |
| created_at | timestamptz | |

#### 收件流程

```
1. Rust 前台实时拉取（应用打开时）：
   Tauri command `fetch_emails(account_id)`
   → keychain 取凭证
   → IMAP 连接，FETCH (last_synced_uid, MAX] 的邮件
   → 写入 emails 表 + 附件存 Storage
   → 更新 last_synced_uid / last_synced_at
   → Realtime 自动推送新邮件到前端

2. Edge Function 后台兜底（应用未打开时）：
   Supabase cron 每 5 分钟
   → 查询所有 email_accounts
   → 用 Deno imap 库连接（凭证：因 keychain 不可用，后台模式要求账号密码也存库的加密列，或限制后台仅支持 OAuth refresh token）
   → 拉取新邮件写库
```

> 后台凭证方案需在实现时确定：MVP 可先只做 Rust 前台拉取，Edge Function 后台作为增强项。

#### 发件流程

```
1. 前端 MailComposer 撰写 → 调 Tauri command `send_email(account_id, to[], cc[], subject, body_html, attachments[])`
2. Rust：keychain 取凭证 → lettre SMTP 发送
3. 成功后：IMAP APPEND 到"已发送"文件夹 + 写入 emails 表（folder=已发送）
4. 失败：返回错误，前端 Toast 提示
```

#### 附件 Storage

- bucket: `email-attachments`，路径 `user_id/account_id/email_id/filename`
- 收件附件：Rust 拉取时存入；发件附件：发送前上传。

#### 搜索

- `subject` + `body_text` + `from_address` 全文检索（tsvector）。
- 支持按文件夹、是否未读、是否星标筛选。

#### Rust 侧模块

- `src-tauri/src/mail/mod.rs` — 邮件模块入口
- `src-tauri/src/mail/imap.rs` — IMAP 收件逻辑
- `src-tauri/src/mail/smtp.rs` — SMTP 发件逻辑
- `src-tauri/src/mail/storage.rs` — 附件 Storage 上传/下载
- Tauri commands：`fetch_emails`、`send_email`、`test_account_connection`、`save_account_credentials`

#### 前端组件拆分

- `MailAccountTree` — 账号 + 文件夹树（左栏）
- `MailList` — 邮件列表（中栏，含筛选/搜索）
- `MailReader` — 阅读区（右栏，HTML 渲染 + 附件列表）
- `MailComposer` — 撰写弹窗（收件人/主题/正文/附件）
- `MailAccountSettings` — 账号配置（IMAP/SMTP 表单 + 测试连接）
- `useEmails` / `useFolders` / `useEmailAccounts` — TanStack Query hooks

## 8. 响应式多端 UI 策略

### 断点

- `< 640px`（sm 以下）：移动端 — 底部 Tab 栏 + 抽屉导航，单列堆叠
- `640–1024px`（平板）：可折叠侧栏
- `≥ 1024px`（桌面）：图标侧边栏（hover 展开文字）+ 主区

### 各模块布局适配

- **全局**：左侧图标侧边栏（最小化，hover 显文字），一次只显示一个主模块
- **任务**：桌面三视图切换 + 详情抽屉；移动端列表为主，看板横向滑动，日历缩为日程列表
- **邮箱**：桌面三栏（账号树+列表+阅读）；移动端两级导航（列表→阅读页）
- **笔记**：桌面两栏（文件夹树+编辑器）；移动端文件夹抽屉 + 编辑器全屏
- **记账**：桌面表单+报表并排；移动端表单底部抽屉，报表纵向堆叠
- **Dashboard**：卡片网格，移动端单列

### 主题

亮/暗双主题，shadcn/ui 原生支持。

## 9. 已确认的关键决策

| 事项 | 决策 |
|---|---|
| 数据架构 | Supabase 云端优先，放弃 local-first |
| 目标平台 | 桌面三平台 + 移动端（Android/iOS） |
| 前端框架 | Vite + React 19 + TypeScript |
| 路由库 | TanStack Router v1 |
| 富文本编辑器 | Tiptap v2 |
| 图表库 | Recharts v2 |
| 认证方式 | 邮箱密码 + 魔法链接（MVP 不加 OAuth） |
| 使用模型 | 单用户、多设备同步 |
| 邮件收发 | IMAP/SMTP（Rust 侧）+ Supabase 缓存 |
| 邮件收取 | Rust IMAP 轮询 + Edge Function 定时兜底 |
| 记账深度 | 单式流水账 + 预算 |
| 货币 | 单币种 CNY |
| 任务重复 | MVP 支持简单重复（每日/每周/每月） |
| pgvector | 笔记语义搜索列为可选增强，非 MVP |
| 数据备份 | 提供 JSON/CSV 导出 |
| Supabase 部署 | Cloud 托管 |
| i18n | MVP 中文，预留结构 |

## 10. 实施顺序

按子系统拆分，每个子系统独立走 spec → plan → 实现循环：

1. **Dashboard 骨架**（项目脚手架 + 全局布局 + 登录 + Dashboard）
2. **任务管理**
3. **记账**
4. **笔记**
5. **邮箱**（最复杂，放最后）

## 11. 范围说明

本规格覆盖整体地基与五个模块的功能边界及详细设计（表结构、RLS、状态机、组件拆分）。每个模块的详细实现计划由 `writing-plans` 阶段按实施顺序逐个生成，避免单一计划过大。
