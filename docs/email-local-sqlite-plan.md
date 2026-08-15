# EasyWork 邮件模块技术规划：弃用 Edge Function + 本地 SQLite 服务

> ⚠️ **实现注记（2026-08-15）**：文中的 `<app_data_dir>` 已改为「数据根目录」（`<data_root>`）——优先「用户文档目录/EasyWork」（`document_dir()`），失败回退应用数据目录。见 `src-tauri/src/lib.rs` 的 `resolve_data_root()` / `migrate_legacy_data()`。
>
> 目标：邮件模块全面弃用 Supabase Edge Function，IMAP 同步 / 发送邮件 / 文件夹管理三项核心功能全部在**本地**完成；邮件数据存储与管理迁移到**本地 SQLite 服务**。
> 适用范围：仅邮件（mail）模块。日历（sync-calendar）等其它模块暂不在此范围内，但其后续改造可复用本方案范式。

---

## 0. 现状与目标对照

| 维度 | 现状（待替换） | 目标（本方案） |
|---|---|---|
| IMAP 同步 | Deno Edge Function `fetch-mail` | 本地 Rust 服务（IMAP adapter） |
| 发送邮件 | Deno Edge Function `send-mail` | 本地 Rust 服务（SMTP adapter） |
| 文件夹管理 | Deno Edge Function `manage-folder` | 本地 Rust 服务（IMAP mailbox 操作） |
| 数据存储 | Supabase Postgres（`email_accounts/folders/emails/attachments`） | 本地 SQLite 文件（应用数据目录） |
| 凭据存储 | Supabase Postgres（PGP 加密列） | 操作系统密钥库（Keychain / Windows 凭据管理器） |
| 客户端交互 | React → `supabase.from()` / `supabase.functions.invoke()` | React → Tauri IPC `invoke()` → Rust MailService |
| 离线能力 | 无（强依赖云端） | 完整离线可读、联网可同步 |

**结论**：本地服务 = Tauri 的 Rust 后端（`easywork_lib`）。它既承载 IMAP/SMTP 网络协议，又通过 SQLite 负责本地存储与索引，是天然的「本地 SQLite 服务」。前端通过 Tauri IPC（`invoke` / 事件）与之交互，无需额外守护进程、无端口/CORS/防火墙问题，单二进制即可分发。

---

## 1. 整体架构设计

```
┌──────────────────────────────────────────────────────────────┐
│  前端 (React + TypeScript + TanStack Query)                    │
│  - UI 组件（列表/阅读/撰写/文件夹树）                          │
│  - useMail 钩子（仅改数据源，UI 不动）                         │
│  - mailApi 适配层：把旧 supabase 调用改为 invoke()             │
└───────────────┬──────────────────────────────────────────────┘
                │  Tauri IPC  (invoke / listen 事件流)
                │  - 读：mail_list_* / mail_get_*
                │  - 写：mail_send / mail_sync / mail_create_folder ...
                │  - 进度：event "mail://sync-progress"
┌───────────────▼──────────────────────────────────────────────┐
│  Tauri Rust 后端 =「本地邮件服务 MailService」                  │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Command 层   │  │  Sync 引擎   │  │  后台调度 (tokio)   │  │
│  │ (invoke 处理)│  │ (游标/对账)  │  │  定时 + IDLE 监听   │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬───────────┘  │
│         │                 │                    │              │
│  ┌──────▼───────┐  ┌──────▼───────┐   ┌────────▼──────────┐   │
│  │ IMAP Adapter │  │ SMTP Adapter │   │ Credential Store  │   │
│  │ (async-imap) │  │  (lettre)    │   │ (OS Keychain)     │   │
│  └──────┬───────┘  └──────┬───────┘   └────────┬──────────┘   │
│         │                 │                    │              │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐   │
│  │  SQLite 数据访问层 (sqlx / rusqlite，WAL 模式)          │   │
│  │  DB 文件：<app_data_dir>/mail/easywork-mail.db          │   │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │                                  │
     IMAPS (993/143+STARTTLS)       SMTPS (465/587+STARTTLS)
         ▼                                  ▼
   邮件服务商 IMAP 服务器              邮件服务商 SMTP 服务器
```

**关键决策**
- **不引入独立守护进程**：IMAP/SMTP 必须在原生层（WebView 中无法建立原始 TCP/TLS 连接）。Tauri Rust 后端即本地服务，避免 sidecar 二进制的进程管理复杂度。
- **SQLite 为单租户**：桌面应用只服务本机当前用户，原 Postgres 的 `user_id` 隔离列可移除，表结构更简洁。
- **Supabase 仅在登录态保留**：应用级认证（Supabase Auth）继续存在，但邮件数据链路完全脱离 Supabase。

---

## 2. 模块职责划分

| 模块 | 位置 | 职责 |
|---|---|---|
| **UI 组件** | React (`src/features/mail/*.tsx`) | 渲染文件夹树、邮件列表、阅读视图、撰写窗、进度提示 |
| **useMail 钩子** | React (`src/features/mail/useMail.ts`) | 封装查询/变更语义；仅替换内部数据源为 `mailApi` |
| **mailApi 适配层** | React (`src/features/mail/mailApi.ts`) | 把旧 `supabase.from/invoke` 映射为 `invoke()`；统一错误 → `Result<T, MailError>`；可选 WebSocket/事件进度 |
| **Command 层** | Rust (`commands.rs`) | 接收 `invoke` 参数，做入参校验，调用领域服务，返回 JSON 可序列化 DTO |
| **MailService（领域核心）** | Rust (`mail/service.rs`) | 编排：同步、发送、文件夹操作；事务边界；并发锁 |
| **IMAP Adapter** | Rust (`mail/imap.rs`) | `async-imap` 封装：连接/TLS、LIST、SELECT、FETCH、STORE、APPEND、CREATE/RENAME/DELETE |
| **SMTP Adapter** | Rust (`mail/smtp.rs`) | `lettre` 封装：构建 MIME、STARTTLS/隐式 TLS 发送、拒绝明文 AUTH |
| **MIME 解析** | Rust (`mail/mime.rs`) | `mail-parser` 解析 RFC822 → 结构化（地址/正文/附件） |
| **SQLite 存储层** | Rust (`mail/db/*.rs`) | 建表迁移（随版本号）、DAO、索引、FTS5、WAL、连接池 |
| **Credential Store** | Rust (`mail/creds.rs`) | 经 `tauri-plugin-keyring` 读写 OS 密钥库；内存缓存；绝不落明文 |
| **Sync 调度** | Rust (`mail/scheduler.rs`) | tokio 定时任务（默认 5min）+ IMAP IDLE 长连接推送 + 手动触发 |
| **事件总线** | Rust (`mail/events.rs`) | `app.emit("mail://sync-progress", …)` 向前端推送进度/完成 |

---

## 3. 本地 SQLite 数据表结构

DB 文件位于 `<app_data_dir>/mail/easywork-mail.db`，启用 `WAL` + `foreign_keys=ON`。以下为建表 DDL（SQLite 语法）。

```sql
-- 1) 邮箱账号：密码不存库，仅存指向 OS Keychain 的引用
CREATE TABLE email_accounts (
  id              TEXT PRIMARY KEY,            -- UUID
  email           TEXT NOT NULL,
  display_name    TEXT,
  username        TEXT,
  credential_ref  TEXT NOT NULL,              -- keychain key, 如 "easywork:mail:<id>"
  imap_host       TEXT NOT NULL,
  imap_port       INTEGER NOT NULL,
  smtp_host       TEXT NOT NULL,
  smtp_port       INTEGER NOT NULL,
  use_ssl         INTEGER NOT NULL DEFAULT 1,
  auth_type       TEXT NOT NULL DEFAULT 'password', -- 'password' | 'oauth2'
  oauth_provider  TEXT,                       -- oauth2 时: 'gmail' | 'outlook'
  last_synced_at  TEXT,
  last_synced_uid INTEGER,
  sync_enabled    INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- 2) 文件夹：imap_path 唯一（每账号内）；支持层级 parent_path
CREATE TABLE email_folders (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  imap_path     TEXT NOT NULL,
  parent_path   TEXT,
  is_system     INTEGER NOT NULL DEFAULT 0,   -- 系统文件夹禁改名/删
  sort_order    INTEGER NOT NULL DEFAULT 0,
  last_uid      INTEGER,
  uid_validity  INTEGER,
  unread_count  INTEGER NOT NULL DEFAULT 0,
  total_count   INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (account_id, imap_path)
);
CREATE INDEX idx_folders_account ON email_folders(account_id);

-- 3) 邮件：message_id+account 唯一做去重（等价于 Postgres onConflict）
CREATE TABLE emails (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  folder_id       TEXT,
  message_id      TEXT,
  uid             INTEGER,                    -- 仅在该文件夹内唯一
  from_address    TEXT,
  to_addresses    TEXT,                       -- JSON 数组
  cc_addresses    TEXT,                       -- JSON 数组
  subject         TEXT,
  preview_text    TEXT,
  body_text       TEXT,
  body_html       TEXT,
  has_attachments INTEGER DEFAULT 0,
  is_read         INTEGER DEFAULT 0,
  is_starred      INTEGER DEFAULT 0,
  sync_state      INTEGER DEFAULT 0,          -- 0 一致 / 1 本地标记待回写
  received_at     TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (account_id, message_id)
);
CREATE INDEX idx_emails_folder ON emails(folder_id, received_at DESC);
CREATE INDEX idx_emails_uid    ON emails(account_id, folder_id, uid);

-- 4) 附件元数据；内容落本地磁盘（app data 下），DB 仅存路径
CREATE TABLE email_attachments (
  id          TEXT PRIMARY KEY,
  email_id    TEXT NOT NULL,
  filename    TEXT,
  mime_type   TEXT,
  size        INTEGER,
  file_path   TEXT NOT NULL,                  -- <app_data_dir>/mail/attachments/<id>-<name>
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_att_email ON email_attachments(email_id);

-- 5) 同步状态/锁（每账号每文件夹一行）
CREATE TABLE mail_sync_state (
  account_id   TEXT NOT NULL,
  folder_id    TEXT NOT NULL,
  last_uid     INTEGER,
  uid_validity INTEGER,
  syncing      INTEGER DEFAULT 0,
  last_error   TEXT,
  updated_at   TEXT,
  PRIMARY KEY (account_id, folder_id)
);

-- 6) 全文检索（沿用 Postgres search_vector 能力）
CREATE VIRTUAL TABLE emails_fts USING fts5(
  subject, preview_text, body_text,
  content='emails', content_rowid='rowid'
);

-- 7) 模板 / 签名（沿用迁移 0030 的语义）
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY, name TEXT, subject TEXT, body TEXT, created_at TEXT
);
CREATE TABLE email_signatures (
  id TEXT PRIMARY KEY, name TEXT, html TEXT, is_default INTEGER DEFAULT 0, created_at TEXT
);

-- 8) 本地元数据 KV（schema 版本号等）
CREATE TABLE mail_meta ( key TEXT PRIMARY KEY, value TEXT );
```

**设计要点**
- 时间统一用 ISO8601 文本（`YYYY-MM-DDTHH:MM:SSZ`），便于前后端一致与排序。
- 布尔用 `INTEGER 0/1`；数组（`to_addresses` 等）用 JSON 文本，读取时反序列化。
- 密码**绝不进 SQLite**：`credential_ref` 指向 OS Keychain 中的条目；适配器取凭据时由 `creds.rs` 解密加载到内存，发送/同步后立即清零。
- 附件内容存磁盘而非 BLOB，避免单库膨胀；仅超大附件（>10MB）可按需流式写盘。
- 版本化迁移：启动时比对 `mail_meta.schema_version`，按脚本顺序 `CREATE TABLE IF NOT EXISTS` 增量升级。

---

## 4. 同步策略

### 4.1 游标模型（沿用并固化现有 Edge Function 的成熟逻辑）
- 每个文件夹维护 `(last_uid, uid_validity)`。
- **首次 / `uid_validity` 变更（文件夹被服务端重建）**：仅拉取最近 `WINDOW=200` 封，避免整箱下载。
- **增量**：范围 `${last_uid+1}:*`，真增量，不再每次全扫。
- **安全上限**：游标异常落后时 `HARD_CAP=1000` 截断单次拉取量。

### 4.2 删除对账
- 同步后执行 IMAP `UID SEARCH ${fromUid}:*`，得到服务端存活 UID 集合。
- 本地该文件夹、`uid >= fromUid` 的行中，凡 `uid` 不在存活集合者 → 本地软删除/物理删除。
- 失败时**不阻断主流程**（与现状一致）。

### 4.3 旗标同步
- 服务端 → 本地：`\Seen → is_read`、`\Flagged → is_starred`（解析 FETCH flags 即得）。
- 本地 → 服务端（增强项）：用户在本地标记已读/星标后，经 IMAP `STORE +FLAGS` 回写；以 `sync_state=1` 标记待回写，由后台任务补偿。

### 4.4 调度与触发
- **手动**：UI「收取邮件」→ `invoke('mail_sync', {accountId?})`。
- **定时**：tokio 定时器，默认每 5 分钟；可配置（移动端省电可拉长）。
- **推送（增强）**：对支持 `IDLE` 的服务商维持长连接，服务端有变化即触发增量同步。
- **并发保护**：每个账号一把 `tokio::Mutex` + `mail_sync_state.syncing` 双保险，避免重叠同步；与现状 `claim_mail_sync_lock` / `release_mail_sync_lock` 思路一致，但改为本地锁。

### 4.5 附件
- 解析出的附件写入 `<app_data_dir>/mail/attachments/`，DB 记 `file_path` / `mime_type` / `size`。
- 超大附件（>10MB）仅记录元信息、不强制落盘（与现状一致）。

---

## 5. IMAP 同步流程

```
invoke('mail_sync', {accountId?})
  └─ Rust Command 校验 → MailService.sync_account(id?)
       ├─ 取账号 + 经 Keychain 取明文密码（仅本次调用生命周期内）
       ├─ 加账号级互斥锁
       ├─ IMAP 连接（端口 993 隐式 TLS；非 993 优先 STARTTLS 升级）
       │      · TLS 校验证书（系统根证书；允许 per-account CA 覆盖）
       ├─ LIST 邮箱 → 过滤 \Noselect/\NonExistent
       ├─ 对每个文件夹：
       │     ├─ ensure 本地 folder 行（名称映射：INBOX→收件箱 等，沿用 FOLDER_MAPPING）
       │     ├─ SELECT → 读 uidNext / uidValidity / exists / unseen
       │     ├─ 计算 range（首同步 WINDOW / 增量 last_uid+1:*）
       │     ├─ FETCH range (UID, RFC822, FLAGS) —— 流式逐封
       │     │     ├─ mail-parser 解析 → 结构化
       │     │     ├─ 附件落盘
       │     │     └─ UPSERT emails（onConflict account_id+message_id）
       │     ├─ 删除对账（UID SEARCH 比对）
       │     └─ 更新 folder 游标/未读/总数
       ├─ 更新 account.last_synced_at / last_synced_uid
       └─ emit('mail://sync-progress', {phase:'done', accountId, fetched, inserted})
  前端 listen 进度 → 刷新 TanStack Query 缓存
```

**复用现有逻辑**：原 `fetch-mail/index.ts` 的 `FOLDER_MAPPING`、WINDOW/HARD_CAP、删除对账、错误容忍等可直接平移到 Rust，无需重新设计。

---

## 6. 发信流程

```
invoke('mail_send', {accountId, to, cc, subject, body, attachmentIds?})
  └─ Rust Command 校验（收件人数 ≤50、格式正则，沿用 MAX_RECIPIENTS/EMAIL_RE）
       ├─ 取账号 + Keychain 明文密码
       ├─ lettre 构建 MIME（multipart/alternative：text+html；附件 base64）
       │      · 主题/文件名 RFC2047 编码（非 ASCII）
       ├─ SMTP 连接（465 隐式 TLS / 587+STARTTLS）
       │      · STARTTLS 协商失败 → 拒绝明文发送 AUTH（防降级 MITM）
       │      · AUTH LOGIN 凭据来自 Keychain
       ├─ 发送成功 → 立即本地插入「已发送」副本（UI 秒回）
       ├─ 同时 IMAP APPEND 到 Sent 文件夹（让服务端留存；下次同步自然对齐）
       └─ emit('mail://send-done', {emailId}) → 前端失效 Sent 列表缓存
```

**设计要点**
- 立即本地插入已发送副本保证 UI 响应；IMAP APPEND 保证服务端一致性，二者幂等（按 message_id 去重）。
- 凭据全程不落盘、不进 SQLite、不出现在日志。

---

## 7. 文件夹管理实现

| 操作 | IMAP 端 | 本地 SQLite | 保护 / 补偿 |
|---|---|---|---|
| 创建 | `mailboxCreate(name)` → 取真实 path | 插入 `email_folders`（imap_path=真实 path，sort_order 自增） | 若 INSERT 失败 → 回滚删除已建 IMAP 目录 |
| 重命名 | `mailboxRename(old, new)` | 更新 `name`/`imap_path` | 系统文件夹（INBOX/Sent/Drafts/Trash/Junk）禁止；UPDATE 失败 → 改回旧 path |
| 删除 | `mailboxDelete(path)` | 先删本地 `emails`+`email_folders` 行 | 系统文件夹禁止；DB 已删后 IMAP 失败仅告警（下次同步重发现） |

- **名称映射 / 系统文件夹判定**：平移 `manage-folder` 的 `SYSTEM_PATHS`/`SYSTEM_NAMES` 与 `FOLDER_MAPPING` 到 Rust。
- **层级**：支持 `parent_path` 与 IMAP 分隔符（如 `/` 或 `.`），创建嵌套目录时按 provider 分隔符拼接。

---

## 8. 本地服务与客户端交互方式

### 8.1 命令契约（Tauri IPC）
全部通过 `invoke(cmd, args)`；参数与返回均为 JSON 可序列化结构。返回沿用现有 `Email`/`EmailFolder`/`EmailAccount`/`EmailAttachment` 的 TS 类型形状，使 UI 几乎零改动。

| 分类 | 命令 | 入参 | 返回 |
|---|---|---|---|
| 读 | `mail_list_accounts` | — | `EmailAccount[]` |
| 读 | `mail_list_folders` | `{accountId?}` | `EmailFolder[]` |
| 读 | `mail_list_messages` | `{folderId, limit?, offset?, search?}` | `Email[]`（列表态，不含正文大字段） |
| 读 | `mail_get_message` | `{id}` | `Email`（含正文） |
| 读 | `mail_get_attachment` | `{id}` | 文件流 / 本地路径 |
| 读 | `mail_folder_unread` | `{accountId?}` | `{folderId: count}` |
| 写 | `mail_add_account` | 账号表单 + 密码（临时，写入 Keychain） | `EmailAccount` |
| 写 | `mail_send` | `{accountId,to,cc,subject,body,attachmentIds?}` | `Email`（已发送副本） |
| 写 | `mail_sync` | `{accountId?}` | `{fetched, inserted, folders, error?}` |
| 写 | `mail_create_folder` | `{accountId, name}` | `EmailFolder` |
| 写 | `mail_rename_folder` | `{id, name}` | `EmailFolder` |
| 写 | `mail_delete_folder` | `{id}` | `{ok:true}` |
| 写 | `mail_mark_read` | `{id, isRead}` | `{ok:true}` |
| 写 | `mail_toggle_star` | `{id}` | `{ok:true}` |
| 写 | `mail_delete_message` | `{id}` | `{ok:true}` |
| 写 | `mail_save_draft` / `mail_update_draft` | 草稿表单 | `Email` |

### 8.2 进度事件（长任务）
`mail_sync` / `mail_send` 通过 `app.emit("mail://sync-progress", payload)` 向前端推送阶段：
```ts
type SyncProgress =
  | { phase: 'connecting'; accountId: string }
  | { phase: 'folder'; accountId: string; path: string; done: number; total: number }
  | { phase: 'done'; accountId: string; fetched: number; inserted: number }
  | { phase: 'error'; accountId: string; message: string };
```
前端 `listen('mail://sync-progress', …)` 驱动进度条，避免「同步中无反馈」。

### 8.3 前端适配层（关键：UI 不动）
新增 `src/features/mail/mailApi.ts`，把旧 `useMail.ts` 中的 `supabase.from/invoke` 调用整体替换为 `invoke()`：

```ts
import { invoke } from '@tauri-apps/api/core';
import type { Email, EmailFolder, EmailAccount } from '@/types';

export const mailApi = {
  listFolders: (accountId?: string) =>
    invoke<EmailFolder[]>('mail_list_folders', { accountId }),
  listMessages: (folderId: string, limit = 50, offset = 0) =>
    invoke<Email[]>('mail_list_messages', { folderId, limit, offset }),
  send: (p: { accountId: string; to: string; cc?: string; subject: string; body: string }) =>
    invoke<Email>('mail_send', p),
  sync: (accountId?: string) => invoke('mail_sync', { accountId }),
  // …其余一一对应
};
```
`useMail.ts` 内各 `useQuery`/`useMutation` 的 `queryFn` 改为调用 `mailApi.*`；`onSuccess` 仍用 `qc.invalidateQueries` 失效缓存。这样**所有 UI 组件与页面无需改动**，改动被收敛在适配层。

### 8.4 安全约束
- SQLite 文件权限限定当前用户（Tauri 数据目录默认如此）。
- 密码仅存 OS Keychain；Rust 侧用后即清。
- IMAP/SMTP **强制 TLS 校验**，禁用明文降级；per-account 自签 CA 可覆盖。
- `invoke` 入参在服务端二次校验（不信任前端），沿用现有 `MAX_RECIPIENTS`/`EMAIL_RE` 等防滥用规则。
- 错误返回结构化 `MailError{ code, message }`，不向 UI 泄露主机名/内网细节。

---

## 9. 实施路线（可落地步骤）

| 阶段 | 内容 | 关键产物 | 复杂度 |
|---|---|---|---|
| P0 | 依赖接入：在 `src-tauri/Cargo.toml` 增加 `tokio`、`sqlx`（sqlite）/或 `rusqlite`、`async-imap`、`lettre`、`mail-parser`、`tauri-plugin-keyring`、`tracing`；配置 `features` | Cargo.toml 更新 | 低 |
| P1 | SQLite 层：DDL 建表 + 版本迁移 + DAO + WAL 连接池 | `mail/db/*` | 中 |
| P2 | Credential Store：Keychain 读写 + 内存缓存 | `mail/creds.rs` | 低 |
| P3 | IMAP Adapter + 同步引擎（游标/对账/旗标/进度事件） | `mail/imap.rs`, `mail/service.rs` | 高 |
| P4 | SMTP Adapter + 发信（MIME 构建 / TLS / APPEND Sent） | `mail/smtp.rs` | 中 |
| P5 | 文件夹管理（创建/重命名/删除 + 系统保护 + 补偿） | `mail/imap.rs` | 中 |
| P6 | Command 层 + 事件总线，注册 `invoke_handler!` | `commands.rs`, `lib.rs` | 中 |
| P7 | 前端 `mailApi.ts` 适配层 + 改写 `useMail.ts` 数据源 | `src/features/mail/*` | 中 |
| P8 | 凭据迁移：首启动从 Supabase 读取既有账号密码 → 写入 Keychain + 本地 SQLite；可选一次性回填历史邮件 | 迁移脚本 | 中 |
| P9 | 退役 Edge Function：删除 `supabase/functions/{fetch-mail,send-mail,manage-folder}` 与 `_shared/mail.ts` 的调用；保留文件或归档（不再被调用） | 清理 | 低 |
| P10 | 测试：Rust 单测（MIME 解析 / 游标计算 / 去重）、前端组件测试、端到端（接真实 IMAP 测试账号） | 测试 | 中 |
| P11 | 打包验证：复用现有绿色构建（`scripts/build-green.ps1`），确认新 Rust 依赖静态链接、单 exe 可分发 | 构建 | 低 |

---

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 服务商禁用基础认证（Gmail/Outlook 需 OAuth2 或应用专用密码） | 短期引导用户使用「应用专用密码」；中期在 `auth_type='oauth2'` 分支接入 OAuth2 令牌流程（Tauri 窗口授权 + `oauth2` crate 刷新） |
| SQLite 单写者并发 | 启用 WAL；所有写操作经单一 `tokio` 任务/通道串行化；读可并发 |
| 大邮箱内存压力 | 流式 FETCH、分批 UPSERT、WINDOW/HARD_CAP 限制；不整箱载入 |
| TLS 证书校验证书链 | 默认系统根证书；保留 per-account `tlsCa` 覆盖项 |
| 后台同步耗电 | 自适应间隔；IDLE 长连接替代轮询；可配置开关 |
| 凭据本地安全 | OS Keychain 为主，绝不明文；可选 SQLCipher 整库加密兜底 |
| Edge Function 逻辑平移遗漏 | 直接复用现有 `FOLDER_MAPPING`、WINDOW/HARD_CAP、删除对账、补偿回滚等成熟实现，逐函数对照 |

---

## 11. 验证与验收

- **单元**：MIME 解析、游标 range 计算、message_id 去重、旗标映射。
- **集成**：接 Gmail/Outlook/QQ 等真实 IMAP 测试账号，验证首同步、增量、删除对账、发信落 Sent、文件夹增删改。
- **交互**：前端 `mailApi` 替换后，原邮件 UI（列表/阅读/撰写/文件夹树）功能与表现一致；同步进度条正常。
- **安全**：断网可读本地缓存；抓包确认 IMAP/SMTP 全程 TLS；密钥不在 SQLite 与日志出现。
- **构建**：`npm run build:green` 产出单 exe，拷贝即用，无额外运行依赖（WebView2 除外）。

---

### 一句话总结
把 Tauri Rust 后端升级为「本地邮件服务」：IMAP/SMTP 从 Deno Edge Function 平移进 Rust（`async-imap`/`lettre`），数据从 Supabase Postgres 迁到本地 SQLite（sqlx + WAL + FTS5），凭据进 OS Keychain；前端仅新增 `mailApi` 适配层把 `useMail` 的数据源从 `supabase` 切到 `invoke`，UI 与交互零改动、离线能力完整。
