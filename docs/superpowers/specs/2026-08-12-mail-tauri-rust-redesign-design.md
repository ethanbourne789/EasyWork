# 邮箱模块重构设计：Tauri 2 + Rust 原生实现

> ⚠️ **实现注记（2026-08-15）**：文中的 `<app_data_dir>` 已改为「数据根目录」（`<data_root>`）——优先「用户文档目录/EasyWork」（`document_dir()`），失败回退应用数据目录。见 `src-tauri/src/lib.rs` 的 `resolve_data_root()` / `migrate_legacy_data()`。
>
> **目标**：将邮箱模块从 Supabase Edge Function + Postgres 架构迁移到 Tauri 2 + Rust 原生实现，支持 Windows 和 Android 双端，具备多账户统一收件箱、邮箱签名、多尺寸响应式 UI 能力。
>
> **参考项目**：Skim（Tauri 2 + async-imap + lettre + mail-parser + rusqlite）、MailVault、Himalaya
>
> **适用范围**：仅邮件（mail）模块。Supabase Auth 继续保留用于应用级登录认证。

---

## 1. 决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Android 适配深度 | 原生 APK（Tauri 2 Android 构建） | 用户明确要求适配 Android 端，原生构建支持后台同步、离线、通知 |
| OAuth2 支持 | 第一期仅密码认证，架构预留 auth_type='oauth2' | 快速交付，Gmail/Outlook 用应用专用密码；后续追加 OAuth2 |
| 统一收件箱方案 | 虚拟文件夹（方案 A） | 左栏顶部新增虚拟节点，与现有三栏布局兼容，改动最小 |
| 功能按钮分布 | 顶部标题栏 | 收取/写信/设置在标题栏，跨尺寸统一位置，移动端底部增加操作栏 |
| 邮箱签名功能 | 每账户默认签名 + 回复自动追加 + HTML 富文本 | 满足日常使用，富文本支持图片/链接/表格 |
| Android 后台同步 | Foreground Service + IMAP IDLE | 最可靠保活，支持 push 推送，通知栏可静默 |
| Android 凭证存储 | keyring crate（先验证兼容性，回退 Android Keystore） | 跨平台代码统一，预留回退方案 |
| 统一收件箱 SQL | 应用层聚合查询 | SQLite 本地查询毫秒级，实时一致，无需维护物化视图 |

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│  前端 (React + TypeScript + TanStack Query + shadcn/ui)        │
│  - UI 组件（列表/阅读/撰写/文件夹树）零改动                     │
│  - mailApi.ts 适配层（新增）：invoke() 替换 supabase 调用      │
│  - useMail.ts 钩子：仅改数据源，UI 组件不动                    │
└───────────────┬──────────────────────────────────────────────┘
                │  Tauri IPC  (invoke / listen 事件流)
┌───────────────▼──────────────────────────────────────────────┐
│  Tauri 2 Rust 后端 =「本地邮件服务 MailService」                │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────────┐  │
│  │Command 层│  │ Sync 引擎│  │ 后台调度 (tokio)             │  │
│  │invoke 处理│  │游标/对账 │  │ Desktop: tokio 定时          │  │
│  │          │  │旗标同步  │  │ Android: Foreground Service  │  │
│  │          │  │          │  │           + IMAP IDLE         │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬──────────────────┘  │
│       │             │                   │                     │
│  ┌────▼─────┐  ┌────▼─────┐  ┌──────────▼──────────────────┐  │
│  │IMAP Adapter│ │SMTP Adapter│ │Credential Store             │  │
│  │async-imap │  │lettre     │  │keyring crate                │  │
│  │+rustls TLS│  │+MIME 构建 │  │Win: Credential Manager      │  │
│  │           │  │           │  │Android: Keystore（需验证）   │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬──────────────────┘  │
│       │             │                   │                     │
│  ┌────▼─────────────▼───────────────────▼──────────────────┐  │
│  │  SQLite 数据层 (rusqlite + bundled + FTS5 + WAL)        │  │
│  │  DB: <app_data_dir>/mail/easywork-mail.db               │  │
│  │  附件: <app_data_dir>/mail/attachments/                  │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
         │                                  │
     IMAPS (993/143)                  SMTPS (465/587)
         ▼                                  ▼
   邮件服务商 IMAP                    邮件服务商 SMTP
```

### 关键设计原则

- **无独立守护进程**：Rust 后端即本地服务，避免 sidecar 进程管理复杂度。
- **UI 零改动**：仅新增 `mailApi.ts` 适配层，所有 UI 组件保留现有代码。
- **双端统一代码库**：Windows/Android 共享 Rust 核心 + React 前端，平台差异通过 `cfg` 条件编译处理。
- **完整离线**：SQLite 本地缓存，断网可读历史邮件，联网后增量同步。
- **Supabase 仅保留 Auth**：邮件链路完全脱离 Supabase，无 Edge Function、无 Postgres、无 Storage 依赖。

---

## 3. 技术栈与依赖

### 3.1 Rust 依赖（src-tauri/Cargo.toml）

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-keyring = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"

tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "time", "sync", "fs", "io-util"] }

async-imap = { version = "0.10", default-features = false, features = ["runtime-tokio"] }
lettre = { version = "0.11", default-features = false, features = ["tokio1", "tokio1-rustls-tls", "smtp-transport", "builder", "hostname", "pool"] }
mail-parser = "0.11"

rustls = { version = "0.23", default-features = false, features = ["ring", "logging", "std", "tls12"] }
tokio-rustls = { version = "0.26", default-features = false, features = ["ring", "logging", "tls12"] }
rustls-platform-verifier = "0.5"

rusqlite = { version = "0.32", features = ["bundled"] }
keyring = "3"
ammonia = "4"

tracing = "0.1"
tracing-subscriber = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(target_os = "android")'.dependencies]
tauri-plugin-background-service = "1"
```

### 3.2 前端依赖变更（package.json）

```jsonc
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-notification": "^2"
  }
}
```

### 3.3 Tauri 配置变更

- **tauri.conf.json**：CSP 收紧，移除邮件链路对 supabase.co 的依赖（仅保留 Auth 所需域名）。
- **capabilities/default.json**（桌面）：`core:default` + `keyring:default` + `dialog:default` + `notification:default`
- **capabilities/mobile.json**（Android）：上述 + `background-service:default`

---

## 4. 数据模型

DB 文件位于 `<app_data_dir>/mail/easywork-mail.db`，启用 `WAL` + `foreign_keys=ON`。

```sql
-- 1) 邮箱账号（密码不存库，仅存 keychain 引用）
CREATE TABLE email_accounts (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  display_name    TEXT,
  username        TEXT,
  credential_ref  TEXT NOT NULL,
  imap_host       TEXT NOT NULL,
  imap_port       INTEGER NOT NULL DEFAULT 993,
  smtp_host       TEXT NOT NULL,
  smtp_port       INTEGER NOT NULL DEFAULT 465,
  use_ssl         INTEGER NOT NULL DEFAULT 1,
  auth_type       TEXT NOT NULL DEFAULT 'password',
  signature_id    TEXT,
  signature_auto_append_new   INTEGER DEFAULT 1,
  signature_auto_append_reply INTEGER DEFAULT 1,
  last_synced_at  TEXT,
  last_synced_uid INTEGER,
  sync_enabled    INTEGER NOT NULL DEFAULT 1,
  sync_interval_mins INTEGER DEFAULT 5,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- 2) 文件夹
CREATE TABLE email_folders (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  imap_path     TEXT NOT NULL,
  parent_path   TEXT,
  is_system     INTEGER NOT NULL DEFAULT 0,
  folder_type   TEXT NOT NULL DEFAULT 'other',
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

-- 3) 邮件
CREATE TABLE emails (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  folder_id       TEXT,
  message_id      TEXT,
  uid             INTEGER,
  from_address    TEXT,
  to_addresses    TEXT,
  cc_addresses    TEXT,
  subject         TEXT,
  preview_text    TEXT,
  body_text       TEXT,
  body_html       TEXT,
  has_attachments INTEGER DEFAULT 0,
  is_read         INTEGER DEFAULT 0,
  is_starred      INTEGER DEFAULT 0,
  sync_state      INTEGER DEFAULT 0,
  received_at     TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (account_id, message_id)
);
CREATE INDEX idx_emails_folder ON emails(folder_id, received_at DESC);
CREATE INDEX idx_emails_account ON emails(account_id, received_at DESC);

-- 4) 附件
CREATE TABLE email_attachments (
  id          TEXT PRIMARY KEY,
  email_id    TEXT NOT NULL,
  filename    TEXT,
  mime_type   TEXT,
  size        INTEGER,
  file_path   TEXT NOT NULL,
  is_inline   INTEGER DEFAULT 0,
  content_id  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_att_email ON email_attachments(email_id);

-- 5) 同步状态
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

-- 6) FTS5 全文搜索
CREATE VIRTUAL TABLE emails_fts USING fts5(
  subject, from_address, preview_text, body_text,
  content='emails', content_rowid='rowid'
);

-- 7) 模板
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY, name TEXT, subject TEXT, body TEXT, created_at TEXT
);

-- 8) 签名（HTML 富文本 + 每账户关联）
CREATE TABLE email_signatures (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  html        TEXT NOT NULL,
  is_default  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 9) 元数据
CREATE TABLE mail_meta ( key TEXT PRIMARY KEY, value TEXT );
```

### 统一收件箱实现

采用应用层聚合查询，不创建物化视图：

```rust
pub fn list_unified_inbox(limit: i64, offset: i64) -> Vec<EmailRow> {
    "SELECT e.*, a.email as account_email, a.display_name as account_name
     FROM emails e
     JOIN email_folders f ON e.folder_id = f.id
     JOIN email_accounts a ON e.account_id = a.id
     WHERE f.folder_type = 'inbox'
     ORDER BY e.received_at DESC
     LIMIT ? OFFSET ?"
}

pub fn unified_unread_count() -> i64 {
    "SELECT COUNT(*) FROM emails e
     JOIN email_folders f ON e.folder_id = f.id
     WHERE f.folder_type = 'inbox' AND e.is_read = 0"
}
```

### 文件夹类型推断

```rust
fn infer_folder_type(imap_path: &str, flags: &[str]) -> FolderType {
    let path_upper = imap_path.to_uppercase();
    if flags.iter().any(|f| f.contains("Inbox")) || path_upper == "INBOX" {
        return FolderType::Inbox;
    }
    match path_upper.as_str() {
        "SENT" | "SENT ITEMS" | "SENT MESSAGES" => FolderType::Sent,
        "DRAFTS" | "DRAFT" => FolderType::Drafts,
        "TRASH" | "DELETED" | "DELETED ITEMS" => FolderType::Trash,
        "JUNK" | "SPAM" | "JUNK EMAIL" => FolderType::Spam,
        _ => FolderType::Other,
    }
}
```

---

## 5. 响应式 UI 设计

### 5.1 断点规则

| 断点 | 尺寸 | 布局 |
|------|------|------|
| lg | ≥1024px | 三栏并排 [200px \| 360px \| flex-1] |
| md | 768-1023px | 双栏 + 抽屉 [flex-1 \| flex-1]，左栏改 Drawer |
| sm | <768px | 单栏切换 [list ⇄ reader]，底部 Tab Bar |

### 5.2 功能按钮位置

| 按钮 | 桌面 | 平板 | 手机 |
|------|------|------|------|
| 收取邮件 | 标题栏右 | 标题栏右(图标) | 标题栏右(图标) |
| 写邮件 | 标题栏右 | 标题栏右(图标) | 底部操作栏 |
| 设置 | 标题栏右 | 标题栏右(图标) | 底部操作栏 |
| 搜索 | 中栏顶部 | 中栏顶部 | 列表顶部 |
| 文件夹树 | 左栏常驻 | ☰抽屉 | 底部→全屏 |
| 标星/删除 | 阅读区右上 | 阅读区右上 | 阅读区顶部 |
| 回复/转发 | 阅读区底部 | 阅读区底部 | 阅读区底部 |
| 签名管理 | 设置→签名 | 设置→签名 | 设置→签名 |

### 5.3 统一收件箱 UI

左侧栏顶部新增"统一收件箱"虚拟节点：
- 「📥 全部」：聚合所有账户 folder_type='inbox' 的邮件
- 「⭐ 待办」：聚合所有账户 is_starred=1 的邮件
- 下方为各账户文件夹树（可折叠）

邮件列表项标注来源账户（如"QQ · 验收报告"），便于区分。

### 5.4 签名功能 UI

- **管理入口**：设置 → 签名（富文本编辑器，支持图片/链接/表格）
- **撰写邮件**：MailComposer 底部显示当前签名预览，可手动切换/移除
- **自动追加**：新建邮件和回复/转发时，根据账户配置自动追加签名到正文末尾

---

## 6. Android 原生构建

### 6.1 构建环境

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
# NDK r26+ via Android Studio SDK Manager
export ANDROID_NDK_HOME=$ANDROID_SDK_ROOT/ndk/26.1.10909125
pnpm tauri android dev   # 开发调试
pnpm tauri android build # 产出 APK/AAB
```

### 6.2 AndroidManifest 权限

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<application android:usesCleartextTraffic="false">
    <service
        android:name="com.easywork.app.MailSyncService"
        android:foregroundServiceType="dataSync"
        android:exported="false" />
</application>
```

- minSdkVersion: 24（Android 7.0）
- targetSdkVersion: 35（Android 15）

### 6.3 后台同步架构

Foreground Service + IMAP IDLE 长连接：

1. **启动时**：对每个 sync_enabled 账户执行一次全量同步，然后启动 IDLE 长连接
2. **IDLE 推送**：收到 EXISTS 响应 → 增量 FETCH → 写入 SQLite → 系统通知 + 事件通知前端
3. **定时兜底**：每 sync_interval_mins 分钟检查 IDLE 连接状态，断连则重新同步 + 重启 IDLE
4. **网络变化**：监听 ACCESS_NETWORK_STATE，网络切换时重连 IMAP
5. **省电模式**：检测 PowerManager.isPowerSaveMode，省电模式下拉长间隔至 30min

### 6.4 凭证存储验证

Phase 1 首项任务：验证 keyring crate Android 兼容性
- 可用：直接使用，代码与 Windows 一致
- 不可用：回退到 Android Keystore via JNI 或 SQLCipher 整库加密

### 6.5 通知渠道

创建 `mail_notification` 渠道，用户可单独关闭邮件通知。新邮件通知标题=发件人，内容=主题。

---

## 7. Tauri IPC 命令契约

| 分类 | 命令 | 入参 | 返回 |
|------|------|------|------|
| 读 | `mail_list_accounts` | — | `EmailAccount[]` |
| 读 | `mail_list_folders` | `{accountId?}` | `EmailFolder[]` |
| 读 | `mail_list_messages` | `{folderId, limit?, offset?, search?}` | `Email[]` |
| 读 | `mail_unified_inbox` | `{limit?, offset?, search?}` | `Email[]`（含 account_email 字段） |
| 读 | `mail_unified_unread` | — | `i64` |
| 读 | `mail_get_message` | `{id}` | `Email` |
| 读 | `mail_get_attachment` | `{id}` | 文件路径 |
| 读 | `mail_folder_unread` | `{accountId?}` | `{folderId: count}` |
| 读 | `mail_list_signatures` | — | `EmailSignature[]` |
| 写 | `mail_add_account` | 账号表单 + 密码 | `EmailAccount` |
| 写 | `mail_send` | `{accountId,to,cc,subject,body,attachmentIds?}` | `Email` |
| 写 | `mail_sync` | `{accountId?}` | `{fetched, inserted, folders, error?}` |
| 写 | `mail_create_folder` | `{accountId, name}` | `EmailFolder` |
| 写 | `mail_rename_folder` | `{id, name}` | `EmailFolder` |
| 写 | `mail_delete_folder` | `{id}` | `{ok:true}` |
| 写 | `mail_mark_read` | `{id, isRead}` | `{ok:true}` |
| 写 | `mail_toggle_star` | `{id}` | `{ok:true}` |
| 写 | `mail_delete_message` | `{id}` | `{ok:true}` |
| 写 | `mail_save_draft` / `mail_update_draft` | 草稿表单 | `Email` |
| 写 | `mail_save_signature` | `{id?, name, html, isDefault?}` | `EmailSignature` |
| 写 | `mail_delete_signature` | `{id}` | `{ok:true}` |
| 写 | `mail_set_account_signature` | `{accountId, signatureId?, autoNew?, autoReply?}` | `{ok:true}` |

### 进度事件

```ts
type SyncProgress =
  | { phase: 'connecting'; accountId: string }
  | { phase: 'folder'; accountId: string; path: string; done: number; total: number }
  | { phase: 'done'; accountId: string; fetched: number; inserted: number }
  | { phase: 'error'; accountId: string; message: string }
  | { phase: 'new-mail'; accountId: string; subject: string; from: string };
```

---

## 8. 同步策略

沿用现有 Edge Function 的成熟逻辑，平移到 Rust：

- **游标模型**：每文件夹维护 `(last_uid, uid_validity)`；首次拉 WINDOW=200 封；增量 `last_uid+1:*`；HARD_CAP=1000 截断
- **删除对账**：FETCH 后 `UID SEARCH` 比对存活集合，本地清理已删除邮件
- **旗标同步**：`\Seen → is_read`、`\Flagged → is_starred`；本地标记后 IMAP `STORE` 回写（sync_state=1 待回写）
- **文件夹发现**：`client.list()` → folder_type 推断 → 中文显示名映射（INBOX→收件箱等）
- **并发保护**：每账号一把 `tokio::Mutex` + `mail_sync_state.syncing` 双保险
- **附件**：解析后写入 `<app_data_dir>/mail/attachments/`，>10MB 仅记录元信息

---

## 9. 发信流程

1. Rust Command 校验（收件人数 ≤50、格式正则）
2. 取账号 + Keychain 明文密码（仅本次调用生命周期内）
3. lettre 构建 MIME（multipart/alternative：text+html；附件 base64；签名自动追加）
4. SMTP 连接（465 隐式 TLS / 587+STARTTLS），STARTTLS 失败拒绝明文 AUTH
5. 发送成功 → 本地插入「已发送」副本（UI 秒回）+ IMAP APPEND 到 Sent 文件夹
6. emit `mail://send-done` → 前端失效 Sent 列表缓存

---

## 10. 实施路线

| 阶段 | 内容 | 复杂度 | 期次 |
|------|------|--------|------|
| P0 | 依赖接入：Cargo.toml + package.json + capabilities | 低 | MVP |
| P1 | SQLite 层：DDL + 迁移 + DAO + FTS5 + WAL | 中 | MVP |
| P2 | Credential Store：keyring 读写 + 内存缓存 + Android 验证 | 中 | MVP |
| P3 | IMAP Adapter + 同步引擎：游标/对账/旗标/folder_type | 高 | MVP |
| P4 | SMTP Adapter + 发信：MIME/TLS/APPEND Sent/签名追加 | 中 | MVP |
| P5 | 文件夹管理：创建/重命名/删除 + 系统保护 + 补偿 | 中 | MVP |
| P6 | Command 层 + 事件总线：注册 invoke handler + 事件 | 中 | MVP |
| P7 | 前端 mailApi.ts 适配层 + useMail.ts 数据源切换 | 中 | MVP |
| P8 | 统一收件箱：虚拟节点 + 聚合查询 + 来源标签 | 中 | MVP |
| P9 | 签名功能：富文本编辑器 + 每账户默认 + 自动追加 | 中 | MVP |
| P10 | 响应式 UI：抽屉（平板）+ 底部操作栏（手机）+ 断点 | 中 | MVP |
| P11 | 凭据迁移：首启动从 Supabase 读取 → Keychain + SQLite | 中 | MVP |
| P12 | 退役 Supabase 邮件：删除 Edge Function + 表 + RPC + Storage | 低 | MVP |
| P13 | Android 构建：NDK + Manifest + Foreground Service + IDLE + 通知 | 高 | 第二期 |
| P14 | 测试：Rust 单测 + 前端组件 + 端到端 + Android 设备 | 中 | 第二期 |
| P15 | 打包验证：Windows 单 exe + Android APK/AAB | 低 | 第二期 |

### 依赖关系

```
P0 → P1 → P2 → P3 → P6 → P7 → P8（统一收件箱）
                ↑       ↗
                P4 ────/
                P5 ────/
P7 → P9（签名）
P7 → P10（响应式 UI）
P11（迁移）依赖 P2
P12（退役）依赖 P7 + P11
P13（Android）依赖 P3 + P6
P14（测试）依赖 P7 + P13
P15（打包）依赖 P14
```

---

## 11. Supabase 退役清单

| 类型 | 资源 | 处理 |
|------|------|------|
| Edge Function | `fetch-mail` | 删除 |
| Edge Function | `send-mail` | 删除 |
| Edge Function | `manage-folder` | 删除 |
| 共享库 | `_shared/mail.ts` | 删除 |
| DB 表 | `email_accounts` | 删除 |
| DB 表 | `email_folders` | 删除 |
| DB 表 | `emails` | 删除 |
| DB 表 | `email_attachments` | 删除 |
| DB 表 | `email_templates` | 删除 |
| DB 表 | `email_signatures` | 删除 |
| DB 表 | `mail_sync_locks` | 删除 |
| RPC | `unread_email_counts` | 删除 |
| RPC | `claim_mail_sync_lock` | 删除 |
| RPC | `release_mail_sync_lock` | 删除 |
| RPC | `encrypt_email_password` | 删除 |
| RPC | `decrypt_email_password` | 删除 |
| Storage | `email-attachments` 桶 | 删除 |
| pg_cron | `fetch-mail-every-5min` | 删除 |
| Realtime | `easywork-mail` channel | 删除 |
| 环境变量 | `EMAIL_ENC_KEY` | 可删除（邮件不再使用） |

**保留**：Supabase Auth（应用级登录认证）、其他模块的 Supabase 资源（日历、任务等）。

---

## 12. 安全约束

- SQLite 文件权限限定当前用户（Tauri 数据目录默认如此）。
- 密码仅存 OS Keychain；Rust 侧用后即清，绝不落 SQLite、不出现在日志。
- IMAP/SMTP 强制 TLS 校验，禁用明文降级；per-account 自签 CA 可覆盖。
- invoke 入参在 Rust 侧二次校验（不信任前端），沿用 MAX_RECIPIENTS=50、EMAIL_RE 格式校验。
- 错误返回结构化 `MailError{ code, message }`，不向 UI 泄露主机名/内网细节。
- HTML 邮件正文经 ammonia 消毒后渲染，防 XSS。

---

## 13. 风险与对策

| 风险 | 对策 |
|------|------|
| keyring Android 不兼容 | 首期验证；回退 Android Keystore JNI 或 SQLCipher 整库加密 |
| Android 15 dataSync 6h 超时 | START_STICKY 自动重启；IDLE 长连接不计入 dataSync 时间 |
| OEM 电池优化杀死后台 | 引导用户加入电池白名单；检测 isPowerSaveMode 拉长间隔 |
| Gmail/Outlook 禁用基础认证 | 引导使用应用专用密码；架构预留 auth_type='oauth2' |
| SQLite 单写者并发 | WAL 模式；写操作经 tokio 通道串行化；读可并发 |
| 大邮箱内存压力 | 流式 FETCH、分批 UPSERT、WINDOW/HARD_CAP 限制 |
| TLS 证书链 | 默认系统根证书；保留 per-account tlsCa 覆盖 |
| Edge Function 逻辑平移遗漏 | 逐函数对照 FOLDER_MAPPING、WINDOW/HARD_CAP、删除对账、补偿回滚 |
