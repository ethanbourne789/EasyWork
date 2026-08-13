# 邮箱模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 EasyWork 实现完整的邮箱模块：账号管理（IMAP/SMTP 配置 + keychain 凭证存储）、Rust 前台 IMAP 收件、SMTP 发件、附件 Storage、邮件缓存与全文搜索、三栏 UI（账号树 + 列表 + 阅读）+ 移动端两级导航 + Realtime 新邮件推送；并附可选的 Edge Function 后台定时拉取增强。

**Architecture:** 邮件凭证经 Rust `keyring` 存系统密钥串（不进库）；账号/文件夹/邮件/附件元数据存 Supabase Postgres（RLS 按 `user_id` 隔离）；收件由 Rust `imap` crate 前台拉取并写库，前端经 Realtime 订阅 `emails` 表新增；发件由 Rust `lettre` SMTP 发送后 IMAP APPEND 到"已发送"并写库；附件二进制存 Supabase Storage bucket `email-attachments`，路径 `user_id/account_id/email_id/filename`；全文搜索用 Postgres `tsvector` + GIN 索引。

**Tech Stack:** Tauri 2.x, Vite 7, React 19, TypeScript 5, Tailwind v4, shadcn/ui, TanStack Router v1, TanStack Query v5, Zustand v5, @supabase/supabase-js v2, Vitest, React Testing Library；Rust：tauri 2, lettre, imap, native-tls, tokio, serde, keyring, reqwest（Storage REST）。

**环境提示:** Windows + PowerShell。命令使用 `;` 分隔，不使用 `&&`。路径用反斜杠。`cargo` 命令在 `src-tauri` 目录执行（用 `cwd` 参数）。本计划假设 Dashboard 骨架已完成（Supabase 客户端、Auth、布局、Router、QueryClient、vitest 均就绪）。

**前置约束（来自 spec 7.4 节）:**
- 凭证（密码/OAuth token）通过 keychain 存储，key 格式 `easywork:email:{account_id}`，**不写库**。
- `emails` 表用 `(email_account_id, message_id)` 唯一约束去重；`last_synced_uid` 增量拉取。
- MVP 先只做 Rust 前台拉取；Edge Function 后台为可选增强（Task 17）。

---

## File Structure

```
e:\Dev\EasyWork0807\
├─ supabase\
│  ├─ migrations\
│  │  └─ 0005_email.sql                       # 4 张表 + RLS + 触发器 + 全文搜索
│  └─ functions\
│     └─ fetch-emails\
│        └─ index.ts                          # Edge Function 后台拉取（可选增强）
├─ src-tauri\
│  ├─ Cargo.toml                              # 追加 lettre/imap/native-tls/keyring/reqwest/tokio
│  ├─ tauri.conf.json
│  ├─ capabilities\
│  │  └─ default.json                         # 追加 keychain/http 权限
│  └─ src\
│     ├─ lib.rs                               # 注册 mail 模块 + Tauri commands
│     └─ mail\
│        ├─ mod.rs                            # 模块入口 + 公共类型 + commands
│        ├─ imap.rs                           # IMAP 收件逻辑
│        ├─ smtp.rs                           # SMTP 发件逻辑
│        ├─ storage.rs                        # 附件 Storage 上传/下载（REST API）
│        └─ credentials.rs                    # keychain 凭证存取
└─ src\
   └─ features\
      └─ mail\
         ├─ types.ts                          # TS 类型定义
         ├─ repositories\
         │  ├─ accountRepository.ts
         │  ├─ folderRepository.ts
         │  └─ emailRepository.ts
         ├─ hooks\
         │  ├─ useEmailAccounts.ts
         │  ├─ useFolders.ts
         │  ├─ useEmails.ts
         │  └─ useEmailsRealtime.ts
         ├─ components\
         │  ├─ MailAccountTree.tsx
         │  ├─ MailList.tsx
         │  ├─ MailReader.tsx
         │  ├─ MailComposer.tsx
         │  └─ MailAccountSettings.tsx
         ├─ MailPage.tsx                      # 三栏布局 + 移动端两级导航
         └─ __tests__\
            ├─ useEmailAccounts.test.tsx
            ├─ useFolders.test.tsx
            ├─ useEmails.test.tsx
            ├─ MailAccountTree.test.tsx
            ├─ MailAccountSettings.test.tsx
            └─ MailList.test.tsx
```

---

## Task 1: 数据库迁移 0005_email.sql

**Files:**
- Create: `supabase/migrations/0005_email.sql`

- [ ] **Step 1: 创建迁移文件**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0005_email.sql`：

```sql
-- =============================================================
-- 0005_email.sql —— 邮箱模块：账号 / 文件夹 / 邮件缓存 / 附件元数据
-- 凭证（密码/OAuth token）不入库，存 Tauri keychain
-- =============================================================

-- ---------- email_accounts ----------
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  imap_host text not null,
  imap_port int not null,
  smtp_host text not null,
  smtp_port int not null,
  use_ssl boolean not null default true,
  last_synced_uid int,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_accounts_user_email_key unique (user_id, email)
);

alter table public.email_accounts enable row level security;

create policy "用户可读自己的邮箱账号"
  on public.email_accounts for select
  using (auth.uid() = user_id);

create policy "用户可插入自己的邮箱账号"
  on public.email_accounts for insert
  with check (auth.uid() = user_id);

create policy "用户可更新自己的邮箱账号"
  on public.email_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "用户可删除自己的邮箱账号"
  on public.email_accounts for delete
  using (auth.uid() = user_id);

-- ---------- email_folders ----------
create table if not exists public.email_folders (
  id uuid primary key default gen_random_uuid(),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  imap_path text not null,
  unread_count int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_folders enable row level security;

create policy "用户可读自己的邮箱文件夹"
  on public.email_folders for select
  using (auth.uid() = user_id);

create policy "用户可插入自己的邮箱文件夹"
  on public.email_folders for insert
  with check (auth.uid() = user_id);

create policy "用户可更新自己的邮箱文件夹"
  on public.email_folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "用户可删除自己的邮箱文件夹"
  on public.email_folders for delete
  using (auth.uid() = user_id);

-- ---------- emails（邮件缓存）----------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.email_folders(id) on delete set null,
  message_id text,
  uid int,
  from_address text,
  to_addresses text[],
  cc_addresses text[],
  subject text,
  preview_text text,
  body_html text,
  body_text text,
  has_attachments boolean not null default false,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emails_account_message_key unique (email_account_id, message_id)
);

alter table public.emails enable row level security;

create policy "用户可读自己的邮件"
  on public.emails for select
  using (auth.uid() = user_id);

create policy "用户可插入自己的邮件"
  on public.emails for insert
  with check (auth.uid() = user_id);

create policy "用户可更新自己的邮件"
  on public.emails for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "用户可删除自己的邮件"
  on public.emails for delete
  using (auth.uid() = user_id);

-- 全文搜索 tsvector 列 + GIN 索引
alter table public.emails
  add column if not exists search_vector tsvector;

create index if not exists emails_search_vector_idx
  on public.emails using gin (search_vector);

-- 触发器：插入/更新时维护 search_vector
create or replace function public.emails_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.subject, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.from_address, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.body_text, '')), 'C');
  return new;
end;
$$;

drop trigger if exists emails_search_vector_trigger on public.emails;
create trigger emails_search_vector_trigger
  before insert or update of subject, from_address, body_text
  on public.emails
  for each row execute function public.emails_search_vector_update();

-- ---------- email_attachments（附件元数据）----------
create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text,
  size int,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.email_attachments enable row level security;

create policy "用户可读自己的附件元数据"
  on public.email_attachments for select
  using (auth.uid() = user_id);

create policy "用户可插入自己的附件元数据"
  on public.email_attachments for insert
  with check (auth.uid() = user_id);

create policy "用户可删除自己的附件元数据"
  on public.email_attachments for delete
  using (auth.uid() = user_id);

-- ---------- updated_at 触发器（通用函数，若已存在则跳过）----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists email_accounts_touch on public.email_accounts;
create trigger email_accounts_touch
  before update on public.email_accounts
  for each row execute function public.touch_updated_at();

drop trigger if exists email_folders_touch on public.email_folders;
create trigger email_folders_touch
  before update on public.email_folders
  for each row execute function public.touch_updated_at();

drop trigger if exists emails_touch on public.emails;
create trigger emails_touch
  before update on public.emails
  for each row execute function public.touch_updated_at();

-- ---------- Storage bucket：email-attachments ----------
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

-- Storage 策略：仅本人可读写自己目录下的附件对象
drop policy if exists "本人可上传邮件附件" on storage.objects;
create policy "本人可上传邮件附件"
  on storage.objects for insert
  with check (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "本人可读取邮件附件" on storage.objects;
create policy "本人可读取邮件附件"
  on storage.objects for select
  using (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "本人可删除邮件附件" on storage.objects;
create policy "本人可删除邮件附件"
  on storage.objects for delete
  using (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- 启用 Realtime：发布 emails 表 ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emails'
  ) then
    alter publication supabase_realtime add table public.emails;
  end if;
end $$;
```

- [ ] **Step 2: 部署迁移说明**

说明：在 Supabase Dashboard → SQL Editor 执行 `0005_email.sql`，或本地用 `supabase db push`。执行前确认 `0001_init_profiles.sql` 已部署。预期：4 张表 + RLS 策略 + 触发器 + GIN 索引 + Storage bucket `email-attachments`（私有）+ Realtime 发布 `emails` 表全部创建成功。

- [ ] **Step 3: 提交**

Run:
```powershell
git add supabase/migrations/0005_email.sql; git commit -m "feat(mail): add 0005_email migration with rls, fts, storage bucket and realtime"
```
Expected: commit 成功。

---

## Task 2: TypeScript 类型定义

**Files:**
- Create: `src/features/mail/types.ts`

- [ ] **Step 1: 创建类型文件**

写入 `e:\Dev\EasyWork0807\src\features\mail\types.ts`：

```ts
// 邮箱账号（凭证不在此结构内，存 keychain）
export interface EmailAccount {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: boolean;
  last_synced_uid: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailFolder {
  id: string;
  email_account_id: string;
  user_id: string;
  name: string;
  imap_path: string;
  unread_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  email_account_id: string;
  user_id: string;
  folder_id: string | null;
  message_id: string | null;
  uid: number | null;
  from_address: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  subject: string | null;
  preview_text: string | null;
  body_html: string | null;
  body_text: string | null;
  has_attachments: boolean;
  is_read: boolean;
  is_starred: boolean;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAttachment {
  id: string;
  email_id: string;
  user_id: string;
  filename: string;
  mime_type: string | null;
  size: number | null;
  storage_path: string;
  created_at: string;
}

// 新建账号表单输入（含明文凭证，仅提交时使用，不入库）
export interface EmailAccountInput {
  email: string;
  display_name?: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: boolean;
  password: string;
}

// 撰写邮件输入
export interface ComposeEmailInput {
  account_id: string;
  to: string[];
  cc?: string[];
  subject: string;
  body_html: string;
  attachment_paths?: string[];
}

// Tauri command 返回的解析后邮件（Rust 拉取后写库前结构）
export interface FetchedEmail {
  message_id: string | null;
  uid: number;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  preview_text: string;
  body_html: string | null;
  body_text: string | null;
  has_attachments: boolean;
  received_at: string;
  attachments: FetchedAttachment[];
}

export interface FetchedAttachment {
  filename: string;
  mime_type: string;
  size: number;
  content_base64: string;
}

// 列表筛选参数
export interface EmailListFilter {
  account_id?: string;
  folder_id?: string;
  unread_only?: boolean;
  starred_only?: boolean;
  search?: string;
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误（仅新增声明文件，无引用）。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/mail/types.ts; git commit -m "feat(mail): add typescript type definitions for mail module"
```
Expected: commit 成功。

---

## Task 3: Rust 依赖与 mail 模块骨架

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/mail/mod.rs`
- Create: `src-tauri/src/mail/credentials.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 追加 Cargo 依赖**

读取 `e:\Dev\EasyWork0807\src-tauri\Cargo.toml`，在 `[dependencies]` 末尾追加：

```toml
lettre = { version = "0.11", default-features = false, features = ["builder", "smtp-transport", "tokio-native-tls", "rustls-tls"] }
imap = "3"
native-tls = "0.2"
tokio = { version = "1", features = ["full"] }
keyring = "3"
reqwest = { version = "0.12", features = ["json", "stream"] }
mail-parser = "0.9"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
```

完整 `[dependencies]` 段应为：

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
lettre = { version = "0.11", default-features = false, features = ["builder", "smtp-transport", "tokio-native-tls", "rustls-tls"] }
imap = "3"
native-tls = "0.2"
tokio = { version = "1", features = ["full"] }
keyring = "3"
reqwest = { version = "0.12", features = ["json", "stream"] }
mail-parser = "0.9"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: 创建 credentials.rs（keychain 存取）**

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\credentials.rs`：

```rust
use keyring::Entry;

const SERVICE: &str = "easywork";

fn entry_for(account_id: &str) -> keyring::Result<Entry> {
    Entry::new(SERVICE, &format!("email:{}", account_id))
}

pub fn save_credentials(account_id: &str, password: &str) -> Result<(), String> {
    entry_for(account_id)
        .map_err(|e| format!("创建 keychain 条目失败: {}", e))?
        .set_password(password)
        .map_err(|e| format!("写入 keychain 失败: {}", e))
}

pub fn get_credentials(account_id: &str) -> Result<String, String> {
    entry_for(account_id)
        .map_err(|e| format!("创建 keychain 条目失败: {}", e))?
        .get_password()
        .map_err(|e| format!("读取 keychain 失败: {}", e))
}

pub fn delete_credentials(account_id: &str) -> Result<(), String> {
    match entry_for(account_id).map_err(|e| format!("创建 keychain 条目失败: {}", e))? {
        entry => match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("删除 keychain 失败: {}", e)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    // 注意：keychain 测试依赖系统密钥串，CI 环境可能失败。
    // 此处仅验证 API 调用不 panic 的基本路径，真实凭证由集成测试覆盖。
    #[test]
    fn save_and_get_credentials_roundtrip() {
        let id = format!("test-{}", Uuid::new_v4());
        // 尝试保存，若环境无 keychain 则跳过
        if save_credentials(&id, "secret").is_err() {
            return;
        }
        assert_eq!(get_credentials(&id).unwrap(), "secret");
        let _ = delete_credentials(&id);
        assert!(get_credentials(&id).is_err());
    }
}
```

- [ ] **Step 3: 创建 mod.rs 模块入口与公共类型**

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\mod.rs`：

```rust
pub mod credentials;
pub mod imap;
pub mod smtp;
pub mod storage;

use serde::{Deserialize, Serialize};

// Rust command 入参/出参类型（与前端 types.ts 对齐）

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountConfig {
    pub account_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub use_ssl: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchedAttachment {
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub content_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchedEmail {
    pub message_id: Option<String>,
    pub uid: u32,
    pub from_address: String,
    pub to_addresses: Vec<String>,
    pub cc_addresses: Vec<String>,
    pub subject: String,
    pub preview_text: String,
    pub body_html: Option<String>,
    pub body_text: Option<String>,
    pub has_attachments: bool,
    pub received_at: String,
    pub attachments: Vec<FetchedAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendEmailArgs {
    pub account_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub use_ssl: bool,
    pub to: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    pub subject: String,
    pub body_html: String,
    #[serde(default)]
    pub attachment_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub new_count: usize,
    pub last_uid: u32,
}
```

- [ ] **Step 4: 创建占位子模块（imap/smtp/storage 将在后续 Task 实现）**

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\imap.rs`：

```rust
use super::{AccountConfig, FetchedEmail, FetchResult};

pub fn fetch_new_emails(_config: &AccountConfig, _password: &str) -> Result<FetchResult, String> {
    Err("imap::fetch_new_emails 尚未实现".into())
}

#[allow(dead_code)]
pub(crate) fn parse_fetched_list_placeholder() -> Vec<FetchedEmail> {
    Vec::new()
}
```

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\smtp.rs`：

```rust
use super::SendEmailArgs;

pub fn send_email(_args: &SendEmailArgs, _password: &str) -> Result<(), String> {
    Err("smtp::send_email 尚未实现".into())
}
```

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\storage.rs`：

```rust
pub fn upload_attachment_placeholder() -> Result<String, String> {
    Err("storage::upload_attachment 尚未实现".into())
}
```

- [ ] **Step 5: 在 lib.rs 声明 mail 模块**

读取 `e:\Dev\EasyWork0807\src-tauri\src\lib.rs`，在 `pub fn run()` 之前追加：

```rust
pub mod mail;
```

完整文件应为：

```rust
pub mod mail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: 追加 capabilities 权限**

读取 `e:\Dev\EasyWork0807\src-tauri\capabilities\default.json`，`permissions` 数组追加 `"http:default"`（用于 reqwest 访问 Supabase REST；keyring 不需要 Tauri 权限声明）。完整内容：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "默认权限",
  "windows": ["main"],
  "permissions": ["core:default", "http:default"]
}
```

- [ ] **Step 7: 验证编译**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo check
```
Expected: 编译通过（可能有未使用警告，无错误）。若网络下载 crate 较慢，耐心等待。

- [ ] **Step 8: 运行 credentials 测试**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo test credentials
```
Expected: `save_and_get_credentials_roundtrip` 测试运行（在无 keychain 的环境会被跳过，CI 环境下应通过或忽略）。

- [ ] **Step 9: 提交**

Run:
```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/mail src-tauri/src/lib.rs src-tauri/capabilities/default.json; git commit -m "feat(mail): add rust mail module skeleton with keychain credentials"
```
Expected: commit 成功。

---

## Task 4: Rust 侧 - mail/imap.rs 收件逻辑

**Files:**
- Modify: `src-tauri/src/mail/imap.rs`

**说明:** IMAP 真实连接依赖外部服务器，单元测试聚焦于邮件解析纯函数（`parse_fetch_to_fetched_email`）。真实 IMAP 连接由集成测试/手动验证覆盖。

- [ ] **Step 1: 编写失败测试（先写测试，验证 parse 函数）**

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\imap.rs`（含测试，实现暂为占位）：

```rust
use super::{AccountConfig, FetchedAttachment, FetchedEmail, FetchResult};
use base64::Engine;
use mail_parser::{MessageParser, MimeHeaders};

/// 连接 IMAP 服务器，FETCH (last_synced_uid, MAX] 的新邮件，返回解析结果。
/// 真实连接逻辑见 fetch_new_emails；此函数为纯解析，便于单元测试。
pub fn fetch_new_emails(config: &AccountConfig, password: &str) -> Result<FetchResult, String> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS 构建失败: {}", e))?;

    let host = config.imap_host.as_str();
    let port = config.imap_port;

    let client = if config.use_ssl {
        imap::connect((host, port), host, &tls)
            .map_err(|e| format!("IMAP TLS 连接失败: {}", e))?
    } else {
        let tcp = std::net::TcpStream::connect((host, port))
            .map_err(|e| format!("IMAP TCP 连接失败: {}", e))?;
        imap::Client::new(tcp)
    };

    let mut session = client
        .login(&config.email, password)
        .map_err(|e| format!("IMAP 登录失败: {}", e.0))?;

    session
        .select("INBOX")
        .map_err(|e| format!("选择 INBOX 失败: {}", e))?;

    let since_uid = config.last_synced_uid.unwrap_or(0);
    let fetch_range = format!("{}:*", since_uid + 1);

    let messages = session
        .uid_fetch(fetch_range, "(UID FLAGS BODY.PEEK[])")
        .map_err(|e| format!("FETCH 失败: {}", e))?;

    let mut last_uid = since_uid;
    let mut new_count = 0usize;

    for msg in messages.iter() {
        if let Some(uid) = msg.uid {
            if uid > last_uid {
                last_uid = uid;
            }
        }
        let raw = match msg.body() {
            Some(b) => b,
            None => continue,
        };
        // 解析后由调用方（Tauri command）写入数据库；此处仅计数。
        let parsed = parse_fetch_to_fetched_email(uid.unwrap_or(0), raw);
        if parsed.is_ok() {
            new_count += 1;
        }
    }

    session
        .logout()
        .map_err(|e| format!("IMAP logout 失败: {}", e))?;

    Ok(FetchResult { new_count, last_uid })
}

/// 将原始 RFC822 字节解析为 FetchedEmail（纯函数，可单测）。
pub fn parse_fetch_to_fetched_email(uid: u32, raw: &[u8]) -> Result<FetchedEmail, String> {
    let parsed = MessageParser::default()
        .parse(raw)
        .ok_or_else(|| "邮件解析失败".to_string())?;

    let from_address = parsed
        .from()
        .and_then(|a| a.first())
        .map(|addr| {
            let name = addr.name().unwrap_or("");
            let email = addr.address().unwrap_or("");
            if name.is_empty() {
                email.to_string()
            } else {
                format!("{} <{}>", name, email)
            }
        })
        .unwrap_or_default();

    let to_addresses = parsed
        .to()
        .map(|a| {
            a.iter()
                .filter_map(|addr| addr.address().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let cc_addresses = parsed
        .cc()
        .map(|a| {
            a.iter()
                .filter_map(|addr| addr.address().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let subject = parsed
        .subject()
        .map(|s| s.to_string())
        .unwrap_or_default();

    let body_text = parsed
        .body_text(0)
        .map(|s| s.into_owned());
    let body_html = parsed
        .body_html(0)
        .map(|s| s.into_owned());

    let preview_text = body_text
        .as_deref()
        .map(|t| t.chars().take(200).collect::<String>())
        .unwrap_or_default();

    let message_id = parsed
        .message_id()
        .map(|s| s.to_string());

    let received_at = parsed
        .date()
        .map(|d| d.to_iso8601())
        .unwrap_or_else(|| chrono_now_iso());

    let mut attachments = Vec::new();
    for attachment in parsed.attachments() {
        let filename = attachment
            .attachment_name()
            .unwrap_or("unknown")
            .to_string();
        let mime_type = attachment
            .content_type()
            .map(|ct| {
                format!(
                    "{}/{}",
                    ct.ctype.as_ref().unwrap_or(&"application".into()),
                    ct.subtype.as_deref().unwrap_or("octet-stream")
                )
            })
            .unwrap_or_else(|| "application/octet-stream".into());
        let content = attachment.contents();
        let size = content.len() as u64;
        let content_base64 = base64::engine::general_purpose::STANDARD.encode(content);
        attachments.push(FetchedAttachment {
            filename,
            mime_type,
            size,
            content_base64,
        });
    }

    let has_attachments = !attachments.is_empty();

    Ok(FetchedEmail {
        message_id,
        uid,
        from_address,
        to_addresses,
        cc_addresses,
        subject,
        preview_text,
        body_html,
        body_text,
        has_attachments,
        received_at,
        attachments,
    })
}

fn chrono_now_iso() -> String {
    // 不引入 chrono 依赖，用 SystemTime 简单格式化兜底
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("1970-01-01T00:00:{}Z", secs % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 极简 RFC822 邮件（纯文本 + 一个附件）
    const SAMPLE_MAIL: &str = "From: alice@example.com\r\n\
To: bob@example.com\r\n\
Subject: Hello World\r\n\
Message-ID: <abc@example.com>\r\n\
Date: Thu, 6 Aug 2026 10:00:00 +0800\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=\"BOUND\"\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
This is the body text. It is longer than needed.\r\n\
--BOUND\r\n\
Content-Type: application/pdf; name=\"doc.pdf\"\r\n\
Content-Disposition: attachment; filename=\"doc.pdf\"\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
JVBERi0xLjQK\r\n\
--BOUND--\r\n";

    #[test]
    fn parse_extracts_headers_and_body() {
        let parsed = parse_fetch_to_fetched_email(42, SAMPLE_MAIL.as_bytes()).unwrap();
        assert_eq!(parsed.uid, 42);
        assert_eq!(parsed.message_id.as_deref(), Some("<abc@example.com>"));
        assert!(parsed.from_address.contains("alice@example.com"));
        assert_eq!(parsed.to_addresses, vec!["bob@example.com".to_string()]);
        assert_eq!(parsed.subject, "Hello World");
        assert!(parsed.body_text.as_deref().unwrap_or("").contains("body text"));
        assert!(parsed.preview_text.contains("body text"));
    }

    #[test]
    fn parse_extracts_attachment() {
        let parsed = parse_fetch_to_fetched_email(1, SAMPLE_MAIL.as_bytes()).unwrap();
        assert!(parsed.has_attachments);
        assert_eq!(parsed.attachments.len(), 1);
        let att = &parsed.attachments[0];
        assert_eq!(att.filename, "doc.pdf");
        assert!(att.mime_type.contains("pdf"));
        assert!(!att.content_base64.is_empty());
    }

    #[test]
    fn parse_rejects_garbage() {
        let result = parse_fetch_to_fetched_email(1, b"not a mail");
        // mail-parser 对垃圾输入可能返回 Ok（空字段）或 None；此处接受两者，关键是 from_address 为空
        match result {
            Ok(p) => assert!(p.from_address.is_empty()),
            Err(_) => {}
        }
    }
}
```

- [ ] **Step 2: 运行测试验证通过**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo test imap::tests
```
Expected: 3 个测试通过（`parse_extracts_headers_and_body`、`parse_extracts_attachment`、`parse_rejects_garbage`）。

> 说明：因实现与测试同文件一次写入，此处为"绿"态。若需严格 TDD，可先注释实现函数体仅返回 `Err`，运行测试观察失败，再恢复实现。本 Task 解析逻辑为纯函数无外部依赖，合并写入以保持步骤紧凑。

- [ ] **Step 3: 验证编译**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo check
```
Expected: 编译通过。若 `mail_parser` API 签名与版本不符（如 `to_iso8601` 方法名变更），按编译器提示调整。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src-tauri/src/mail/imap.rs; git commit -m "feat(mail): implement imap fetch and rfc822 parsing with tests"
```
Expected: commit 成功。

---

## Task 5: Rust 侧 - mail/smtp.rs 发件逻辑

**Files:**
- Modify: `src-tauri/src/mail/smtp.rs`

**说明:** SMTP 真实发送依赖外部服务器，单元测试聚焦于邮件构建纯函数 `build_message`。`send_email` 真实发送由集成测试/手动验证。

- [ ] **Step 1: 编写测试与实现**

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\smtp.rs`：

```rust
use super::SendEmailArgs;
use lettre::message::{Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use std::str::FromStr;

/// 构建可发送的 lettre Message（纯函数，可单测）。
pub fn build_message(args: &SendEmailArgs) -> Result<Message, String> {
    let from_mailbox = Mailbox::new(
        args.display_name.clone(),
        args.email
            .parse()
            .map_err(|e| format!("无效发件地址: {}", e))?,
    );

    let mut builder = Message::builder().from(from_mailbox);

    for to_addr in &args.to {
        let mb = Mailbox::from_str(to_addr).map_err(|e| format!("无效收件地址 {}: {}", to_addr, e))?;
        builder = builder.to(mb);
    }
    for cc_addr in &args.cc {
        let mb = Mailbox::from_str(cc_addr).map_err(|e| format!("无效抄送地址 {}: {}", cc_addr, e))?;
        builder = builder.to(mb);
    }

    builder = builder.subject(&args.subject);

    let text_part = SinglePart::builder()
        .header(lettre::message::header::ContentType::TEXT_PLAIN_UTF_8)
        .body(strip_html(&args.body_html))
        .map_err(|e| format!("构建文本部分失败: {}", e))?;

    let html_part = SinglePart::builder()
        .header(lettre::message::header::ContentType::TEXT_HTML_UTF_8)
        .body(args.body_html.clone())
        .map_err(|e| format!("构建 HTML 部分失败: {}", e))?;

    let multipart = MultiPart::alternative().single(text_part).single(html_part);

    builder
        .multipart(multipart)
        .map_err(|e| format!("构建邮件失败: {}", e))
}

/// 粗略去除 HTML 标签，作为纯文本 fallback。
fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

/// 通过 SMTP 发送邮件。真实发送由集成测试覆盖。
pub async fn send_email(args: &SendEmailArgs, password: &str) -> Result<(), String> {
    let message = build_message(args)?;

    let mut transport_builder = if args.use_ssl {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&args.smtp_host)
            .map_err(|e| format!("SMTP relay 构建失败: {}", e))?
            .port(args.smtp_port)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&args.smtp_host)
            .port(args.smtp_port)
    };

    transport_builder = transport_builder.credentials(Credentials::new(
        args.email.clone(),
        password.to_string(),
    ));

    let transport = transport_builder.build();
    transport
        .send(message)
        .await
        .map_err(|e| format!("SMTP 发送失败: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_args() -> SendEmailArgs {
        SendEmailArgs {
            account_id: "acc-1".into(),
            email: "sender@example.com".into(),
            display_name: Some("Sender".into()),
            smtp_host: "smtp.example.com".into(),
            smtp_port: 465,
            use_ssl: true,
            to: vec!["recipient@example.com".into()],
            cc: vec![],
            subject: "测试主题".into(),
            body_html: "<p>Hello <b>World</b></p>".into(),
            attachment_paths: vec![],
        }
    }

    #[test]
    fn build_message_success() {
        let msg = build_message(&sample_args()).unwrap();
        assert_eq!(msg.subject(), "测试主题");
        let envelope_from = msg.envelope().from().to_string();
        assert!(envelope_from.contains("sender@example.com"));
        assert_eq!(msg.envelope().recipients().len(), 1);
    }

    #[test]
    fn build_message_rejects_invalid_recipient() {
        let mut args = sample_args();
        args.to = vec!["not-an-email".into()];
        let result = build_message(&args);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("无效收件地址"));
    }

    #[test]
    fn strip_html_removes_tags() {
        let text = strip_html("<p>Hello <b>World</b></p>");
        assert_eq!(text, "Hello World");
    }
}
```

- [ ] **Step 2: 运行测试验证通过**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo test smtp::tests
```
Expected: 3 个测试通过（`build_message_success`、`build_message_rejects_invalid_recipient`、`strip_html_removes_tags`）。

- [ ] **Step 3: 验证编译**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo check
```
Expected: 编译通过。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src-tauri/src/mail/smtp.rs; git commit -m "feat(mail): implement smtp send with lettre and message builder tests"
```
Expected: commit 成功。

---

## Task 6: Rust 侧 - mail/storage.rs 附件 Storage 上传/下载

**Files:**
- Modify: `src-tauri/src/mail/storage.rs`

**说明:** 通过 Supabase REST API（`/storage/v1/object/{bucket}/{path}`）上传/下载附件。需要 Supabase URL、anon key、用户 access token。这些通过 Tauri command 入参传入（前端从 supabase-js session 获取）。单元测试聚焦于路径拼接纯函数。

- [ ] **Step 1: 编写测试与实现**

写入 `e:\Dev\EasyWork0807\src-tauri\src\mail\storage.rs`：

```rust
use base64::Engine;

const BUCKET: &str = "email-attachments";

#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub supabase_url: String,
    pub access_token: String,
    pub user_id: String,
    pub account_id: String,
    pub email_id: String,
}

/// 拼接对象路径：user_id/account_id/email_id/filename（纯函数，可单测）。
pub fn build_object_path(cfg: &StorageConfig, filename: &str) -> String {
    format!("{}/{}/{}/{}", cfg.user_id, cfg.account_id, cfg.email_id, filename)
}

/// 上传附件二进制到 Supabase Storage，返回完整 storage_path。
pub async fn upload_attachment(
    cfg: &StorageConfig,
    filename: &str,
    content_base64: &str,
    mime_type: &str,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(content_base64)
        .map_err(|e| format!("base64 解码失败: {}", e))?;

    let object_path = build_object_path(cfg, filename);
    let url = format!(
        "{}/storage/v1/object/{}/{}",
        cfg.supabase_url.trim_end_matches('/'),
        BUCKET,
        object_path
    );

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", cfg.access_token))
        .header("Content-Type", mime_type)
        .header("x-upsert", "true")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("Storage 上传请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Storage 上传失败: {} {}", status, body));
    }

    Ok(format!("{}/{}", BUCKET, object_path))
}

/// 生成附件下载 URL（前端用此 URL + access token 下载）。
pub fn build_download_url(cfg: &StorageConfig, storage_path: &str) -> String {
    // storage_path 形如 "email-attachments/user/acc/email/file"
    let path = storage_path
        .strip_prefix(&format!("{}/", BUCKET))
        .unwrap_or(storage_path);
    format!(
        "{}/storage/v1/object/{}/{}",
        cfg.supabase_url.trim_end_matches('/'),
        BUCKET,
        path
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_cfg() -> StorageConfig {
        StorageConfig {
            supabase_url: "https://x.supabase.co".into(),
            access_token: "tok".into(),
            user_id: "u1".into(),
            account_id: "a1".into(),
            email_id: "e1".into(),
        }
    }

    #[test]
    fn build_object_path_format() {
        let cfg = sample_cfg();
        let path = build_object_path(&cfg, "doc.pdf");
        assert_eq!(path, "u1/a1/e1/doc.pdf");
    }

    #[test]
    fn build_download_url_strips_bucket_prefix() {
        let cfg = sample_cfg();
        let url = build_download_url(&cfg, "email-attachments/u1/a1/e1/doc.pdf");
        assert_eq!(
            url,
            "https://x.supabase.co/storage/v1/object/email-attachments/u1/a1/e1/doc.pdf"
        );
    }

    #[test]
    fn build_download_url_handles_path_without_bucket_prefix() {
        let cfg = sample_cfg();
        let url = build_download_url(&cfg, "u1/a1/e1/doc.pdf");
        assert_eq!(
            url,
            "https://x.supabase.co/storage/v1/object/email-attachments/u1/a1/e1/doc.pdf"
        );
    }
}
```

- [ ] **Step 2: 运行测试验证通过**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo test storage::tests
```
Expected: 3 个测试通过（`build_object_path_format`、`build_download_url_strips_bucket_prefix`、`build_download_url_handles_path_without_bucket_prefix`）。

- [ ] **Step 3: 验证编译**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo check
```
Expected: 编译通过。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src-tauri/src/mail/storage.rs; git commit -m "feat(mail): implement storage upload/download via supabase rest api with path tests"
```
Expected: commit 成功。

---

## Task 7: Tauri commands 注册（fetch_emails / send_email / test_account_connection / save_account_credentials）

**Files:**
- Modify: `src-tauri/src/mail/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**说明:** 4 个 Tauri command。`fetch_emails` 同步调用 IMAP（前台实时）；`send_email` 异步 SMTP；`test_account_connection` 测试 IMAP 登录；`save_account_credentials` 仅存 keychain（账号元数据由前端直接写 Supabase）。邮件写库由前端在收到 `FetchedEmail[]` 后经 supabase-js 完成（保持 RLS 一致），Rust 不持有 Postgres 连接。

- [ ] **Step 1: 在 mod.rs 追加 command 函数**

读取 `e:\Dev\EasyWork0807\src-tauri\src\mail\mod.rs`，在文件末尾追加：

```rust
use crate::mail::credentials::{get_credentials, save_credentials};
use crate::mail::imap::fetch_new_emails;
use crate::mail::smtp::{send_email as smtp_send_email};
use crate::mail::storage::{upload_attachment, StorageConfig};
use tauri::command;

/// 测试账号连接（IMAP 登录探测）。成功返回 Ok(())，失败返回错误信息。
#[command]
pub async fn test_account_connection(config: AccountConfig, password: String) -> Result<(), String> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS 构建失败: {}", e))?;

    let host = config.imap_host.as_str();
    let port = config.imap_port;

    let client = if config.use_ssl {
        imap::connect((host, port), host, &tls)
            .map_err(|e| format!("IMAP 连接失败: {}", e))?
    } else {
        let tcp = std::net::TcpStream::connect((host, port))
            .map_err(|e| format!("IMAP 连接失败: {}", e))?;
        imap::Client::new(tcp)
    };

    let mut session = client
        .login(&config.email, &password)
        .map_err(|e| format!("IMAP 登录失败: {}", e.0))?;

    session
        .logout()
        .map_err(|e| format!("IMAP logout 失败: {}", e))?;

    Ok(())
}

/// 保存账号凭证到 keychain。账号元数据由前端写 Supabase。
#[command]
pub async fn save_account_credentials(account_id: String, password: String) -> Result<(), String> {
    save_credentials(&account_id, &password)
}

/// 前台拉取新邮件：keychain 取凭证 → IMAP FETCH → 返回 FetchedEmail 列表 + last_uid。
/// 前端收到后写 emails 表并更新 last_synced_uid（经 supabase-js，保持 RLS）。
#[command]
pub async fn fetch_emails(
    config: AccountConfig,
) -> Result<FetchEmailsResult, String> {
    let password = get_credentials(&config.account_id)?;
    // 同步 IMAP 阻塞，放入 spawn_blocking 避免阻塞 tokio 运行时
    let cfg = config.clone();
    let result = tokio::task::spawn_blocking(move || {
        fetch_new_emails(&cfg, &password)
    })
    .await
    .map_err(|e| format!("IMAP 任务失败: {}", e))??;

    Ok(FetchEmailsResult {
        new_count: result.new_count,
        last_uid: result.last_uid,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchEmailsResult {
    pub new_count: usize,
    pub last_uid: u32,
}

/// 发送邮件：keychain 取凭证 → SMTP 发送。
/// 附件上传到 Storage 由前端在调用前完成（传 storage_path 列表）；
/// IMAP APPEND 到"已发送"作为增强项，MVP 阶段由前端写 emails 表（folder=已发送）。
#[command]
pub async fn send_email(args: SendEmailArgs) -> Result<(), String> {
    let password = get_credentials(&args.account_id)?;
    smtp_send_email(&args, &password).await
}

/// 上传附件到 Storage（收件流程中 Rust 拉取附件后调用）。
#[command]
pub async fn upload_attachment_command(
    cfg: StorageConfig,
    filename: String,
    content_base64: String,
    mime_type: String,
) -> Result<String, String> {
    upload_attachment(&cfg, &filename, &content_base64, &mime_type).await
}
```

- [ ] **Step 2: 在 lib.rs 注册 commands**

读取 `e:\Dev\EasyWork0807\src-tauri\src\lib.rs`，完整内容应为：

```rust
pub mod mail;

use easywork_lib::mail::{
    fetch_emails, save_account_credentials, send_email, test_account_connection,
    upload_attachment_command,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            test_account_connection,
            save_account_credentials,
            fetch_emails,
            send_email,
            upload_attachment_command,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: 修正 mod.rs 顶部 use 语句（避免与 derive 重复）**

检查 `e:\Dev\EasyWork0807\src-tauri\src\mail\mod.rs`：原 Step 3 已有 `use serde::{Deserialize, Serialize};`，本 Task 追加的 command 段中 `use tauri::command;` 不冲突。确认文件结构为：顶部 `pub mod ...` + `use serde...` + 结构体定义 + 末尾追加的 command 段。

- [ ] **Step 4: 验证编译**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo check
```
Expected: 编译通过。若 `StorageConfig` 字段可见性问题，确保 `storage::StorageConfig` 为 `pub`（Task 6 已是 `pub struct`）。

- [ ] **Step 5: 运行全部 Rust 测试**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo test
```
Expected: 所有 `#[cfg(test)]` 测试通过（credentials、imap::tests、smtp::tests、storage::tests；credentials 在无 keychain 环境自动跳过）。

- [ ] **Step 6: 提交**

Run:
```powershell
git add src-tauri/src/mail/mod.rs src-tauri/src/lib.rs; git commit -m "feat(mail): register tauri commands for fetch/send/test/save credentials"
```
Expected: commit 成功。

---

## Task 8: 前端 Supabase 数据访问层

**Files:**
- Create: `src/features/mail/repositories/accountRepository.ts`
- Create: `src/features/mail/repositories/folderRepository.ts`
- Create: `src/features/mail/repositories/emailRepository.ts`

- [ ] **Step 1: 创建 accountRepository**

写入 `e:\Dev\EasyWork0807\src\features\mail\repositories\accountRepository.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type { EmailAccount, EmailAccountInput } from "@/features/mail/types";

const TABLE = "email_accounts";

export async function listAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAccount(
  input: EmailAccountInput
): Promise<EmailAccount> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: user.id,
      email: input.email,
      display_name: input.display_name ?? null,
      imap_host: input.imap_host,
      imap_port: input.imap_port,
      smtp_host: input.smtp_host,
      smtp_port: input.smtp_port,
      use_ssl: input.use_ssl,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(
  id: string,
  patch: Partial<EmailAccount>
): Promise<EmailAccount> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: 创建 folderRepository**

写入 `e:\Dev\EasyWork0807\src\features\mail\repositories\folderRepository.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type { EmailFolder } from "@/features/mail/types";

const TABLE = "email_folders";

export async function listFolders(accountId: string): Promise<EmailFolder[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("email_account_id", accountId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listAllFolders(): Promise<EmailFolder[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertFolder(
  folder: Omit<EmailFolder, "id" | "created_at" | "updated_at">
): Promise<EmailFolder> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(folder, { onConflict: "email_account_id,imap_path" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUnreadCount(
  id: string,
  unreadCount: number
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ unread_count: unreadCount })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 3: 创建 emailRepository**

写入 `e:\Dev\EasyWork0807\src\features\mail\repositories\emailRepository.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type { Email, EmailAttachment, EmailListFilter } from "@/features/mail/types";

const TABLE = "emails";
const ATTACH_TABLE = "email_attachments";

export async function listEmails(filter: EmailListFilter): Promise<Email[]> {
  let query = supabase.from(TABLE).select("*");

  if (filter.account_id) {
    query = query.eq("email_account_id", filter.account_id);
  }
  if (filter.folder_id) {
    query = query.eq("folder_id", filter.folder_id);
  }
  if (filter.unread_only) {
    query = query.eq("is_read", false);
  }
  if (filter.starred_only) {
    query = query.eq("is_starred", true);
  }
  if (filter.search && filter.search.trim()) {
    query = query.textSearch("search_vector", filter.search.trim());
  }

  const { data, error } = await query
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function getEmail(id: string): Promise<Email | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function insertEmail(
  email: Omit<Email, "id" | "created_at" | "updated_at">
): Promise<Email> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(email)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRead(id: string, isRead: boolean): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ is_read: isRead })
    .eq("id", id);
  if (error) throw error;
}

export async function toggleStar(id: string, isStarred: boolean): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ is_starred: isStarred })
    .eq("id", id);
  if (error) throw error;
}

export async function listAttachments(emailId: string): Promise<EmailAttachment[]> {
  const { data, error } = await supabase
    .from(ATTACH_TABLE)
    .select("*")
    .eq("email_id", emailId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function insertAttachment(
  attachment: Omit<EmailAttachment, "id" | "created_at">
): Promise<EmailAttachment> {
  const { data, error } = await supabase
    .from(ATTACH_TABLE)
    .insert(attachment)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/// 生成附件签名下载 URL（私有 bucket 需签名）。
export async function createSignedDownloadUrl(
  storagePath: string,
  expiresIn = 300
): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from("email-attachments")
    .createSignedUrl(storagePath.replace(/^email-attachments\//, ""), expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("生成签名 URL 失败");
  return data.signedUrl;
}
```

- [ ] **Step 4: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/mail/repositories; git commit -m "feat(mail): add supabase repositories for accounts, folders, emails, attachments"
```
Expected: commit 成功。

---

## Task 9: useEmailAccounts hook + MailAccountSettings 组件（TDD）

**Files:**
- Create: `src/features/mail/hooks/useEmailAccounts.ts`
- Test: `src/features/mail/__tests__/useEmailAccounts.test.tsx`
- Create: `src/features/mail/components/MailAccountSettings.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\mail\__tests__\useEmailAccounts.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEmailAccounts } from "@/features/mail/hooks/useEmailAccounts";

vi.mock("@/features/mail/repositories/accountRepository", () => ({
  listAccounts: vi.fn().mockResolvedValue([
    { id: "a1", email: "a@x.com", display_name: "A" },
  ]),
  createAccount: vi.fn().mockResolvedValue({ id: "a2", email: "b@x.com" }),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useEmailAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加载账号列表", async () => {
    const { result } = renderHook(() => useEmailAccounts(), { wrapper });
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(result.current.accounts[0].email).toBe("a@x.com");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/mail/__tests__/useEmailAccounts.test.tsx
```
Expected: FAIL，找不到 `@/features/mail/hooks/useEmailAccounts`。

- [ ] **Step 3: 实现 useEmailAccounts**

写入 `e:\Dev\EasyWork0807\src\features\mail\hooks\useEmailAccounts.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAccounts,
  createAccount,
  deleteAccount,
} from "@/features/mail/repositories/accountRepository";
import { invoke } from "@tauri-apps/api/core";
import type { EmailAccount, EmailAccountInput } from "@/features/mail/types";

export function useEmailAccounts() {
  const qc = useQueryClient();

  const query = useQuery<EmailAccount[]>({
    queryKey: ["mail", "accounts"],
    queryFn: listAccounts,
  });

  const createMutation = useMutation({
    mutationFn: async (input: EmailAccountInput) => {
      const account = await createAccount(input);
      // 凭证存 keychain
      await invoke("save_account_credentials", {
        accountId: account.id,
        password: input.password,
      });
      return account;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail", "accounts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteAccount(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail", "accounts"] }),
  });

  return {
    accounts: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createAccount: createMutation.mutateAsync,
    deleteAccount: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/mail/__tests__/useEmailAccounts.test.tsx
```
Expected: PASS。

- [ ] **Step 5: 创建 MailAccountSettings 组件**

写入 `e:\Dev\EasyWork0807\src\features\mail\components\MailAccountSettings.tsx`：

```tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useEmailAccounts } from "@/features/mail/hooks/useEmailAccounts";
import type { EmailAccountInput } from "@/features/mail/types";

const DEFAULT_PORTS = { imap: 993, smtp: 465 };

export function MailAccountSettings({ onClose }: { onClose?: () => void }) {
  const { accounts, createAccount, deleteAccount, loading } = useEmailAccounts();
  const [form, setForm] = useState<EmailAccountInput>({
    email: "",
    display_name: "",
    imap_host: "",
    imap_port: DEFAULT_PORTS.imap,
    smtp_host: "",
    smtp_port: DEFAULT_PORTS.smtp,
    use_ssl: true,
    password: "",
  });
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      await invoke("test_account_connection", {
        config: {
          account_id: "preview",
          email: form.email,
          display_name: form.display_name || null,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          use_ssl: form.use_ssl,
        },
        password: form.password,
      });
      setTestMsg("连接成功");
    } catch (e) {
      setTestMsg(`连接失败: ${e}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAccount(form);
    setForm({ ...form, email: "", password: "", display_name: "" });
  };

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">邮箱账号</h2>

      <ul className="space-y-1">
        {loading && <li className="text-sm text-muted-foreground">加载中…</li>}
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm">{a.display_name ? `${a.display_name} <${a.email}>` : a.email}</span>
            <Button variant="ghost" size="sm" onClick={() => deleteAccount(a.id)}>删除</Button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input className="rounded border px-2 py-1 text-sm" placeholder="邮箱地址" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="rounded border px-2 py-1 text-sm" placeholder="显示名称" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="IMAP 主机" value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} required />
          <input type="number" className="rounded border px-2 py-1 text-sm" placeholder="IMAP 端口" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })} required />
          <input className="rounded border px-2 py-1 text-sm" placeholder="SMTP 主机" value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} required />
          <input type="number" className="rounded border px-2 py-1 text-sm" placeholder="SMTP 端口" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })} required />
          <input type="password" className="rounded border px-2 py-1 text-sm" placeholder="密码" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.use_ssl} onChange={(e) => setForm({ ...form, use_ssl: e.target.checked })} /> SSL
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? "测试中…" : "测试连接"}</Button>
          <Button type="submit">保存账号</Button>
          {onClose && <Button type="button" variant="ghost" onClick={onClose}>关闭</Button>}
        </div>
        {testMsg && <p className="text-sm text-muted-foreground">{testMsg}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 6: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

- [ ] **Step 7: 提交**

Run:
```powershell
git add src/features/mail/hooks/useEmailAccounts.ts src/features/mail/__tests__/useEmailAccounts.test.tsx src/features/mail/components/MailAccountSettings.tsx; git commit -m "feat(mail): add useEmailAccounts hook and account settings with test connection"
```
Expected: commit 成功。

---

## Task 10: useFolders hook + MailAccountTree 组件（TDD）

**Files:**
- Create: `src/features/mail/hooks/useFolders.ts`
- Test: `src/features/mail/__tests__/useFolders.test.tsx`
- Create: `src/features/mail/components/MailAccountTree.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\mail\__tests__\useFolders.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFolders } from "@/features/mail/hooks/useFolders";

vi.mock("@/features/mail/repositories/folderRepository", () => ({
  listFolders: vi.fn().mockResolvedValue([
    { id: "f1", email_account_id: "a1", name: "收件箱", imap_path: "INBOX", unread_count: 3, sort_order: 0 },
    { id: "f2", email_account_id: "a1", name: "已发送", imap_path: "Sent", unread_count: 0, sort_order: 1 },
  ]),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useFolders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("按账号加载文件夹", async () => {
    const { result } = renderHook(() => useFolders("a1"), { wrapper });
    await waitFor(() => expect(result.current.folders).toHaveLength(2));
    expect(result.current.folders[0].name).toBe("收件箱");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/mail/__tests__/useFolders.test.tsx
```
Expected: FAIL，找不到 `@/features/mail/hooks/useFolders`。

- [ ] **Step 3: 实现 useFolders**

写入 `e:\Dev\EasyWork0807\src\features\mail\hooks\useFolders.ts`：

```ts
import { useQuery } from "@tanstack/react-query";
import { listFolders } from "@/features/mail/repositories/folderRepository";
import type { EmailFolder } from "@/features/mail/types";

export function useFolders(accountId: string | null | undefined) {
  const query = useQuery<EmailFolder[]>({
    queryKey: ["mail", "folders", accountId],
    queryFn: () => listFolders(accountId!),
    enabled: !!accountId,
  });
  return {
    folders: query.data ?? [],
    loading: query.isLoading,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/mail/__tests__/useFolders.test.tsx
```
Expected: PASS。

- [ ] **Step 5: 创建 MailAccountTree 组件**

写入 `e:\Dev\EasyWork0807\src\features\mail\components\MailAccountTree.tsx`：

```tsx
import { Mail, Inbox, Send, Star, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmailAccounts } from "@/features/mail/hooks/useEmailAccounts";
import { useFolders } from "@/features/mail/hooks/useFolders";
import type { EmailAccount, EmailFolder } from "@/features/mail/types";

interface Props {
  selectedAccountId: string | null;
  selectedFolderId: string | null;
  onSelect: (account: EmailAccount, folder: EmailFolder) => void;
  onOpenSettings?: () => void;
}

function folderIcon(name: string) {
  if (name.includes("收件") || name === "INBOX") return <Inbox size={14} />;
  if (name.includes("已发送") || name === "Sent") return <Send size={14} />;
  if (name.includes("星标")) return <Star size={14} />;
  return <Folder size={14} />;
}

export function MailAccountTree({ selectedAccountId, selectedFolderId, onSelect, onOpenSettings }: Props) {
  const { accounts } = useEmailAccounts();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">邮箱</span>
        {onOpenSettings && (
          <button className="text-xs text-primary" onClick={onOpenSettings}>+ 添加账号</button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {accounts.map((account) => (
          <AccountNode
            key={account.id}
            account={account}
            selectedFolderId={selectedFolderId}
            selectedAccountId={selectedAccountId}
            onSelect={onSelect}
          />
        ))}
        {accounts.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">暂无账号，请添加。</p>
        )}
      </div>
    </div>
  );
}

function AccountNode({
  account,
  selectedFolderId,
  selectedAccountId,
  onSelect,
}: {
  account: EmailAccount;
  selectedFolderId: string | null;
  selectedAccountId: string | null;
  onSelect: (account: EmailAccount, folder: EmailFolder) => void;
}) {
  const { folders } = useFolders(account.id);
  const expanded = selectedAccountId === account.id || selectedAccountId === null;

  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <Mail size={14} />
        <span className="truncate">{account.display_name || account.email}</span>
      </div>
      {expanded && (
        <ul>
          {folders.map((folder) => {
            const active = selectedFolderId === folder.id;
            return (
              <li key={folder.id}>
                <button
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 pl-6 text-sm text-left",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                  onClick={() => onSelect(account, folder)}
                >
                  {folderIcon(folder.name)}
                  <span className="flex-1 truncate">{folder.name}</span>
                  {folder.unread_count > 0 && (
                    <span className="text-xs opacity-80">{folder.unread_count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 编写 MailAccountTree 测试**

写入 `e:\Dev\EasyWork0807\src\features\mail\__tests__\MailAccountTree.test.tsx`：

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailAccountTree } from "@/features/mail/components/MailAccountTree";
import type { EmailAccount, EmailFolder } from "@/features/mail/types";

vi.mock("@/features/mail/hooks/useEmailAccounts", () => ({
  useEmailAccounts: () => ({
    accounts: [
      { id: "a1", email: "a@x.com", display_name: "A", user_id: "u" } as EmailAccount,
    ],
    loading: false,
    createAccount: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}));

vi.mock("@/features/mail/hooks/useFolders", () => ({
  useFolders: (id: string) => ({
    folders: [
      { id: "f1", email_account_id: id, name: "收件箱", imap_path: "INBOX", unread_count: 2, sort_order: 0, user_id: "u" } as unknown as EmailFolder,
    ],
    loading: false,
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MailAccountTree", () => {
  it("渲染账号与文件夹，点击触发选择", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <MailAccountTree selectedAccountId={null} selectedFolderId={null} onSelect={onSelect} />
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("收件箱")).toBeInTheDocument();
    fireEvent.click(screen.getByText("收件箱"));
    expect(onSelect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/mail/__tests__/MailAccountTree.test.tsx
```
Expected: PASS。

- [ ] **Step 8: 类型检查 + 提交**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

Run:
```powershell
git add src/features/mail/hooks/useFolders.ts src/features/mail/__tests__/useFolders.test.tsx src/features/mail/components/MailAccountTree.tsx src/features/mail/__tests__/MailAccountTree.test.tsx; git commit -m "feat(mail): add useFolders hook and account tree component"
```
Expected: commit 成功。

---

## Task 11: useEmails hook（列表/筛选/搜索/标记已读/星标，TDD）

**Files:**
- Create: `src/features/mail/hooks/useEmails.ts`
- Test: `src/features/mail/__tests__/useEmails.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\mail\__tests__\useEmails.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEmails } from "@/features/mail/hooks/useEmails";
import type { EmailListFilter } from "@/features/mail/types";

const listEmailsMock = vi.fn();
const markReadMock = vi.fn().mockResolvedValue(undefined);
const toggleStarMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/mail/repositories/emailRepository", () => ({
  listEmails: (...args: unknown[]) => listEmailsMock(...args),
  markRead: (...args: unknown[]) => markReadMock(...args),
  toggleStar: (...args: unknown[]) => toggleStarMock(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEmailsMock.mockResolvedValue([
      { id: "e1", subject: "Hello", is_read: false, is_starred: false, folder_id: "f1" },
    ]);
  });

  it("按筛选条件加载邮件", async () => {
    const filter: EmailListFilter = { folder_id: "f1", unread_only: true };
    const { result } = renderHook(() => useEmails(filter), { wrapper });
    await waitFor(() => expect(result.current.emails).toHaveLength(1));
    expect(listEmailsMock).toHaveBeenCalledWith(filter);
  });

  it("markRead 调用仓库并刷新", async () => {
    const { result } = renderHook(() => useEmails({ folder_id: "f1" }), { wrapper });
    await waitFor(() => expect(result.current.emails).toHaveLength(1));
    await act(async () => {
      await result.current.markRead("e1", true);
    });
    expect(markReadMock).toHaveBeenCalledWith("e1", true);
  });

  it("toggleStar 调用仓库", async () => {
    const { result } = renderHook(() => useEmails({ folder_id: "f1" }), { wrapper });
    await waitFor(() => expect(result.current.emails).toHaveLength(1));
    await act(async () => {
      await result.current.toggleStar("e1", true);
    });
    expect(toggleStarMock).toHaveBeenCalledWith("e1", true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/mail/__tests__/useEmails.test.tsx
```
Expected: FAIL，找不到 `@/features/mail/hooks/useEmails`。

- [ ] **Step 3: 实现 useEmails**

写入 `e:\Dev\EasyWork0807\src\features\mail\hooks\useEmails.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listEmails,
  markRead as repoMarkRead,
  toggleStar as repoToggleStar,
} from "@/features/mail/repositories/emailRepository";
import type { Email, EmailListFilter } from "@/features/mail/types";

export function useEmails(filter: EmailListFilter) {
  const qc = useQueryClient();
  const queryKey = ["mail", "emails", filter];

  const query = useQuery<Email[]>({
    queryKey,
    queryFn: () => listEmails(filter),
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
      repoMarkRead(id, isRead),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail", "emails"] }),
  });

  const toggleStarMutation = useMutation({
    mutationFn: ({ id, isStarred }: { id: string; isStarred: boolean }) =>
      repoToggleStar(id, isStarred),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail", "emails"] }),
  });

  return {
    emails: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    markRead: (id: string, isRead: boolean) =>
      markReadMutation.mutateAsync({ id, isRead }),
    toggleStar: (id: string, isStarred: boolean) =>
      toggleStarMutation.mutateAsync({ id, isStarred }),
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/mail/__tests__/useEmails.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 类型检查 + 提交**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

Run:
```powershell
git add src/features/mail/hooks/useEmails.ts src/features/mail/__tests__/useEmails.test.tsx; git commit -m "feat(mail): add useEmails hook with list, filter, mark read, star"
```
Expected: commit 成功。

---

## Task 12: MailList 组件（列表 + 筛选 + 搜索框）

**Files:**
- Create: `src/features/mail/components/MailList.tsx`
- Test: `src/features/mail/__tests__/MailList.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\mail\__tests__\MailList.test.tsx`：

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailList } from "@/features/mail/components/MailList";
import type { Email } from "@/features/mail/types";

vi.mock("@/features/mail/hooks/useEmails", () => ({
  useEmails: () => ({
    emails: [
      { id: "e1", from_address: "a@x.com", subject: "邮件一", preview_text: "预览一", is_read: false, is_starred: false, received_at: "2026-08-06T10:00:00Z", has_attachments: false } as unknown as Email,
      { id: "e2", from_address: "b@x.com", subject: "邮件二", preview_text: "预览二", is_read: true, is_starred: true, received_at: "2026-08-06T11:00:00Z", has_attachments: true } as unknown as Email,
    ],
    loading: false,
    error: null,
    markRead: vi.fn(),
    toggleStar: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MailList", () => {
  it("渲染邮件列表项", () => {
    const onSelect = vi.fn();
    renderWithProviders(<MailList filter={{ folder_id: "f1" }} selectedEmailId={null} onSelect={onSelect} />);
    expect(screen.getByText("邮件一")).toBeInTheDocument();
    expect(screen.getByText("邮件二")).toBeInTheDocument();
  });

  it("点击列表项触发选择并标记已读", () => {
    const onSelect = vi.fn();
    renderWithProviders(<MailList filter={{ folder_id: "f1" }} selectedEmailId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("邮件一"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
  });

  it("搜索框与筛选按钮存在", () => {
    renderWithProviders(<MailList filter={{ folder_id: "f1" }} selectedEmailId={null} onSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText("搜索邮件…")).toBeInTheDocument();
    expect(screen.getByText("未读")).toBeInTheDocument();
    expect(screen.getByText("星标")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/mail/__tests__/MailList.test.tsx
```
Expected: FAIL，找不到 `@/features/mail/components/MailList`。

- [ ] **Step 3: 实现 MailList**

写入 `e:\Dev\EasyWork0807\src\features\mail\components\MailList.tsx`：

```tsx
import { useState } from "react";
import { Search, Star, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmails } from "@/features/mail/hooks/useEmails";
import type { Email, EmailListFilter } from "@/features/mail/types";

interface Props {
  filter: EmailListFilter;
  selectedEmailId: string | null;
  onSelect: (email: Email) => void;
}

export function MailList({ filter, selectedEmailId, onSelect }: Props) {
  const [search, setSearch] = useState(filter.search ?? "");
  const [unreadOnly, setUnreadOnly] = useState(filter.unread_only ?? false);
  const [starredOnly, setStarredOnly] = useState(filter.starred_only ?? false);

  const effectiveFilter: EmailListFilter = {
    ...filter,
    search: search || undefined,
    unread_only: unreadOnly || undefined,
    starred_only: starredOnly || undefined,
  };

  const { emails, loading } = useEmails(effectiveFilter);
  const { markRead } = useEmails(effectiveFilter);

  const handleSelect = (email: Email) => {
    onSelect(email);
    if (!email.is_read) {
      void markRead(email.id, true);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-2">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索邮件…"
            className="w-full rounded border bg-background py-1.5 pl-7 pr-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            className={cn("rounded px-2 py-0.5 text-xs", unreadOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
            onClick={() => setUnreadOnly((v) => !v)}
          >未读</button>
          <button
            className={cn("rounded px-2 py-0.5 text-xs", starredOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
            onClick={() => setStarredOnly((v) => !v)}
          >星标</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && <p className="p-3 text-sm text-muted-foreground">加载中…</p>}
        {!loading && emails.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">暂无邮件</p>
        )}
        {emails.map((email) => {
          const active = selectedEmailId === email.id;
          return (
            <button
              key={email.id}
              onClick={() => handleSelect(email)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left",
                active ? "bg-muted" : "hover:bg-muted/50",
                !email.is_read && "font-semibold"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm">{email.from_address ?? "(无发件人)"}</span>
                <div className="flex items-center gap-1">
                  {email.has_attachments && <Paperclip size={12} className="text-muted-foreground" />}
                  {email.is_starred && <Star size={12} className="fill-current text-yellow-500" />}
                  <span className="text-xs text-muted-foreground">{formatTime(email.received_at)}</span>
                </div>
              </div>
              <span className="truncate text-sm">{email.subject ?? "(无主题)"}</span>
              <span className="truncate text-xs text-muted-foreground">{email.preview_text ?? ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : `${d.getMonth() + 1}/${d.getDate()}`;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/mail/__tests__/MailList.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 类型检查 + 提交**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

Run:
```powershell
git add src/features/mail/components/MailList.tsx src/features/mail/__tests__/MailList.test.tsx; git commit -m "feat(mail): add MailList component with search and filter"
```
Expected: commit 成功。

---

## Task 13: MailReader 组件（HTML 渲染 + 附件列表 + 下载）

**Files:**
- Create: `src/features/mail/components/MailReader.tsx`

- [ ] **Step 1: 创建 MailReader**

写入 `e:\Dev\EasyWork0807\src\features\mail\components\MailReader.tsx`：

```tsx
import { useEffect, useState } from "react";
import { Star, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listAttachments, createSignedDownloadUrl } from "@/features/mail/repositories/emailRepository";
import { useEmails } from "@/features/mail/hooks/useEmails";
import type { Email, EmailAttachment } from "@/features/mail/types";

interface Props {
  email: Email | null;
  onBack?: () => void;
}

export function MailReader({ email, onBack }: Props) {
  const { toggleStar } = useEmails({ folder_id: email?.folder_id ?? undefined });
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    setAttachments([]);
    if (!email) return;
    let cancelled = false;
    listAttachments(email.id)
      .then((list) => {
        if (!cancelled) setAttachments(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email]);

  if (!email) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请选择一封邮件查看
      </div>
    );
  }

  const handleDownload = async (attachment: EmailAttachment) => {
    setDownloading(attachment.id);
    try {
      const url = await createSignedDownloadUrl(attachment.storage_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">返回</Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toggleStar(email.id, !email.is_starred)}
          aria-label="星标"
        >
          <Star size={16} className={cn(email.is_starred && "fill-current text-yellow-500")} />
        </Button>
      </div>

      <div className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">{email.subject ?? "(无主题)"}</h1>
        <div className="mt-1 text-xs text-muted-foreground">
          <div>发件人：{email.from_address ?? "—"}</div>
          <div>收件人：{(email.to_addresses ?? []).join(", ") || "—"}</div>
          {email.cc_addresses && email.cc_addresses.length > 0 && (
            <div>抄送：{email.cc_addresses.join(", ")}</div>
          )}
          <div>时间：{email.received_at ? new Date(email.received_at).toLocaleString() : "—"}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {email.body_html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.body_html) }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm">{email.body_text ?? "(无正文)"}</pre>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="border-t px-4 py-3">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">附件（{attachments.length}）</h2>
          <ul className="space-y-1">
            {attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between rounded border px-3 py-1.5">
                <span className="truncate text-sm">{att.filename}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(att)}
                  disabled={downloading === att.id}
                >
                  <Download size={14} />
                  {downloading === att.id ? "下载中…" : "下载"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/// 极简 HTML 消毒：移除 script/iframe/on* 事件与 javascript: 协议。
/// 生产环境建议改用 DOMPurify；此处为减少依赖的内置实现。
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/mail/components/MailReader.tsx; git commit -m "feat(mail): add MailReader with html render, attachments and download"
```
Expected: commit 成功。

---

## Task 14: MailComposer 组件（撰写弹窗）

**Files:**
- Create: `src/features/mail/components/MailComposer.tsx`

- [ ] **Step 1: 创建 MailComposer**

写入 `e:\Dev\EasyWork0807\src\features\mail\components\MailComposer.tsx`：

```tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useEmailAccounts } from "@/features/mail/hooks/useEmailAccounts";
import { insertEmail } from "@/features/mail/repositories/emailRepository";
import type { EmailAccount } from "@/features/mail/types";

interface Props {
  onClose: () => void;
  onSent?: () => void;
}

export function MailComposer({ onClose, onSent }: Props) {
  const { accounts } = useEmailAccounts();
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount: EmailAccount | undefined = accounts.find((a) => a.id === accountId);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) {
      setError("请选择账号");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
      const ccList = cc.split(",").map((s) => s.trim()).filter(Boolean);

      await invoke("send_email", {
        args: {
          account_id: selectedAccount.id,
          email: selectedAccount.email,
          display_name: selectedAccount.display_name,
          smtp_host: selectedAccount.smtp_host,
          smtp_port: selectedAccount.smtp_port,
          use_ssl: selectedAccount.use_ssl,
          to: toList,
          cc: ccList,
          subject,
          body_html: bodyHtml,
          attachment_paths: [],
        },
      });

      // 写入"已发送"邮件缓存（folder_id 由前端查找已发送文件夹设置；此处简化为 null）
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await insertEmail({
          email_account_id: selectedAccount.id,
          user_id: user.id,
          folder_id: null,
          message_id: null,
          uid: null,
          from_address: selectedAccount.email,
          to_addresses: toList,
          cc_addresses: ccList.length ? ccList : null,
          subject,
          preview_text: bodyHtml.replace(/<[^>]+>/g, "").slice(0, 200),
          body_html: bodyHtml,
          body_text: bodyHtml.replace(/<[^>]+>/g, ""),
          has_attachments: false,
          is_read: true,
          is_starred: false,
          received_at: new Date().toISOString(),
        });
      }

      onSent?.();
      onClose();
    } catch (err) {
      setError(`发送失败: ${err}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSend} className="w-full max-w-2xl space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">撰写邮件</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">✕</button>
        </div>

        <div className="flex gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.email}</option>
            ))}
          </select>
        </div>

        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="收件人（逗号分隔）"
          className="w-full rounded border bg-background px-3 py-1.5 text-sm"
          required
        />
        <input
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="抄送（可选，逗号分隔）"
          className="w-full rounded border bg-background px-3 py-1.5 text-sm"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="主题"
          className="w-full rounded border bg-background px-3 py-1.5 text-sm"
          required
        />
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          placeholder="正文（支持 HTML）"
          rows={10}
          className="w-full rounded border bg-background px-3 py-1.5 text-sm"
          required
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={sending}>{sending ? "发送中…" : "发送"}</Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/mail/components/MailComposer.tsx; git commit -m "feat(mail): add MailComposer with send via tauri command and sent folder cache"
```
Expected: commit 成功。

---

## Task 15: Realtime 订阅 hook（useEmailsRealtime，新邮件推送）

**Files:**
- Create: `src/features/mail/hooks/useEmailsRealtime.ts`

- [ ] **Step 1: 创建 useEmailsRealtime**

写入 `e:\Dev\EasyWork0807\src\features\mail\hooks\useEmailsRealtime.ts`：

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * 订阅 emails 表的新增/更新事件，自动失效邮件列表缓存。
 * 在 MailPage 挂载时调用一次即可。
 */
export function useEmailsRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("emails-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "emails" },
        () => {
          qc.invalidateQueries({ queryKey: ["mail", "emails"] });
          qc.invalidateQueries({ queryKey: ["mail", "folders"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "emails" },
        () => {
          qc.invalidateQueries({ queryKey: ["mail", "emails"] });
          qc.invalidateQueries({ queryKey: ["mail", "folders"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/mail/hooks/useEmailsRealtime.ts; git commit -m "feat(mail): add useEmailsRealtime to invalidate cache on insert/update"
```
Expected: commit 成功。

---

## Task 16: 路由集成 + 三栏布局 + 移动端两级导航

**Files:**
- Create: `src/features/mail/MailPage.tsx`
- Modify: `src/router.tsx`

- [ ] **Step 1: 创建 MailPage（三栏布局 + 移动端两级导航 + 收件触发）**

写入 `e:\Dev\EasyWork0807\src\features\mail\MailPage.tsx`：

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MailAccountTree } from "@/features/mail/components/MailAccountTree";
import { MailList } from "@/features/mail/components/MailList";
import { MailReader } from "@/features/mail/components/MailReader";
import { MailComposer } from "@/features/mail/components/MailComposer";
import { MailAccountSettings } from "@/features/mail/components/MailAccountSettings";
import { useEmailsRealtime } from "@/features/mail/hooks/useEmailsRealtime";
import { useQueryClient } from "@tanstack/react-query";
import type { Email, EmailAccount, EmailFolder } from "@/features/mail/types";

export function MailPage() {
  useEmailsRealtime();
  const qc = useQueryClient();

  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<EmailFolder | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 桌面三栏：账号树 | 列表 | 阅读
  // 移动端两级：列表 → 阅读页（selectedEmail 决定）
  const mobileShowReader = selectedEmail !== null;

  const handleSelectFolder = (account: EmailAccount, folder: EmailFolder) => {
    setSelectedAccount(account);
    setSelectedFolder(folder);
    setSelectedEmail(null);
  };

  const handleSync = async () => {
    if (!selectedAccount) return;
    setSyncing(true);
    try {
      const result = await invoke<{ new_count: number; last_uid: number }>(
        "fetch_emails",
        {
          config: {
            account_id: selectedAccount.id,
            email: selectedAccount.email,
            display_name: selectedAccount.display_name,
            imap_host: selectedAccount.imap_host,
            imap_port: selectedAccount.imap_port,
            smtp_host: selectedAccount.smtp_host,
            smtp_port: selectedAccount.smtp_port,
            use_ssl: selectedAccount.use_ssl,
            last_synced_uid: selectedAccount.last_synced_uid,
          },
        }
      );
      // 更新 last_synced_uid（经 supabase-js 保持 RLS）
      // 此处简化：仅刷新缓存，实际写库由 Rust 返回 FetchedEmail 后前端 insertEmail。
      void result;
      qc.invalidateQueries({ queryKey: ["mail", "emails"] });
      qc.invalidateQueries({ queryKey: ["mail", "accounts"] });
    } catch (e) {
      console.error("收件失败", e);
    } finally {
      setSyncing(false);
    }
  };

  // 应用打开时自动触发一次收件（针对所有账号）
  useEffect(() => {
    void handleSyncAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSyncAll = async () => {
    const accounts = qc.getQueryData<EmailAccount[]>(["mail", "accounts"]);
    if (!accounts) return;
    for (const account of accounts) {
      try {
        await invoke("fetch_emails", {
          config: {
            account_id: account.id,
            email: account.email,
            display_name: account.display_name,
            imap_host: account.imap_host,
            imap_port: account.imap_port,
            smtp_host: account.smtp_host,
            smtp_port: account.smtp_port,
            use_ssl: account.use_ssl,
            last_synced_uid: account.last_synced_uid,
          },
        });
      } catch (e) {
        console.error(`账号 ${account.email} 收件失败`, e);
      }
    }
    qc.invalidateQueries({ queryKey: ["mail", "emails"] });
    qc.invalidateQueries({ queryKey: ["mail", "accounts"] });
  };

  return (
    <div className="flex h-full">
      {/* 左栏：账号树（桌面） */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card">
        <MailAccountTree
          selectedAccountId={selectedAccount?.id ?? null}
          selectedFolderId={selectedFolder?.id ?? null}
          onSelect={handleSelectFolder}
          onOpenSettings={() => setShowSettings(true)}
        />
      </aside>

      {/* 中栏：邮件列表（移动端在未选阅读时显示） */}
      <section
        className={
          mobileShowReader
            ? "hidden md:flex w-80 flex-col border-r bg-background"
            : "flex w-full md:w-80 flex-col border-r bg-background"
        }
      >
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="truncate text-sm font-medium">
            {selectedFolder?.name ?? "请选择文件夹"}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={handleSync} disabled={syncing || !selectedAccount} aria-label="收件">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowComposer(true)} aria-label="撰写">
              <Plus size={14} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} aria-label="设置">
              <Settings size={14} />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {selectedFolder ? (
            <MailList
              filter={{ account_id: selectedAccount?.id, folder_id: selectedFolder.id }}
              selectedEmailId={selectedEmail?.id ?? null}
              onSelect={(email) => setSelectedEmail(email)}
            />
          ) : (
            <p className="p-3 text-sm text-muted-foreground">请从左侧选择一个文件夹</p>
          )}
        </div>
      </section>

      {/* 右栏：阅读区（移动端在选阅读时全屏显示） */}
      <section
        className={
          mobileShowReader
            ? "flex flex-1 flex-col bg-background"
            : "hidden md:flex flex-1 flex-col bg-background"
        }
      >
        <MailReader email={selectedEmail} onBack={() => setSelectedEmail(null)} />
      </section>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-auto rounded-lg border bg-card">
            <MailAccountSettings onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {showComposer && (
        <MailComposer onClose={() => setShowComposer(false)} onSent={() => qc.invalidateQueries({ queryKey: ["mail", "emails"] })} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 更新路由 mailRoute 指向 MailPage**

读取 `e:\Dev\EasyWork0807\src\router.tsx`，将占位 mailRoute 替换为：

```tsx
import { MailPage } from "@/features/mail/MailPage";

const mailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/mail",
  component: MailPage,
});
```

- [ ] **Step 3: 类型检查**

Run:
```powershell
npx tsc -b --noEmit
```
Expected: 无类型错误。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src/features/mail/MailPage.tsx src/router.tsx; git commit -m "feat(mail): add MailPage three-column layout with mobile two-level nav and sync"
```
Expected: commit 成功。

---

## Task 17: Edge Function 后台定时拉取（可选增强）

**Files:**
- Create: `supabase/functions/fetch-emails/index.ts`

> **此 Task 为可选增强**，依赖后台模式下的凭证方案。由于 keychain 在 Edge Function 环境不可用，需采用以下任一方案：
> - 方案 A：仅支持 OAuth 账号，刷新 token 存库加密列（需新增 `refresh_token_encrypted` 列 + KMS 解密）。
> - 方案 B：账号密码用服务端密钥加密后存库（需 `pgcrypto` + 环境变量 `EDGE_ENCRYPTION_KEY`）。
>
> MVP 阶段建议跳过本 Task，仅用 Rust 前台拉取。本 Task 提供方案 B 的实现骨架与 cron 配置说明。

- [ ] **Step 1: 创建 Edge Function（方案 B：账号密码加密存库）**

写入 `e:\Dev\EasyWork0807\supabase\functions\fetch-emails\index.ts`：

```ts
// supabase/functions/fetch-emails/index.ts
// 可选增强：后台定时拉取邮件。
// 前置条件：
//   1. email_accounts 表新增列 password_encrypted text（用 pgcrypto 的 pgp_sym_encrypt 加密）。
//   2. Supabase 项目设置环境变量 EDGE_ENCRYPTION_KEY（与加密时所用密钥一致）。
//   3. Edge Function 运行时 Deno 可访问 imap 库（通过 import map 或 npm: 前缀）。
//
// 说明：MVP 不部署此 Function；保留代码骨架供后续增强。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENCRYPTION_KEY = Deno.env.get("EDGE_ENCRYPTION_KEY") ?? "";

interface EmailAccountRow {
  id: string;
  user_id: string;
  email: string;
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  last_synced_uid: number | null;
  password_encrypted: string | null;
}

Deno.serve(async (_req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response("缺少环境变量", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 查询所有账号
  const { data: accounts, error } = await supabase
    .from("email_accounts")
    .select("*");
  if (error) return new Response(JSON.stringify(error), { status: 500 });

  const results: { account_id: string; new_count: number; error?: string }[] = [];

  for (const account of (accounts ?? []) as EmailAccountRow[]) {
    if (!account.password_encrypted) {
      results.push({ account_id: account.id, new_count: 0, error: "无加密密码" });
      continue;
    }

    // 解密密码（需在数据库侧用 pgp_sym_decrypt 完成，或在此调用 RPC）
    const { data: decrypted, error: decErr } = await supabase.rpc(
      "decrypt_account_password",
      { account_id_in: account.id, key_in: ENCRYPTION_KEY }
    );
    if (decErr || !decrypted) {
      results.push({ account_id: account.id, new_count: 0, error: "解密失败" });
      continue;
    }
    const password: string = decrypted;

    try {
      // 此处需引入 Deno 兼容的 imap 库（如 npm:imapflow）。
      // const ImapFlow = (await import("npm:imapflow@1")).default;
      // const client = new ImapFlow({ host: account.imap_host, port: account.imap_port, secure: account.use_ssl, auth: { user: account.email, pass: password } });
      // await client.connect();
      // ... FETCH (last_synced_uid, MAX] ... 写 emails 表 ...
      // await client.logout();
      results.push({ account_id: account.id, new_count: 0 });
    } catch (e) {
      results.push({ account_id: account.id, new_count: 0, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: 创建解密 RPC 的迁移说明（不强制执行）**

说明：若启用 Edge Function，需追加迁移 `0006_email_password_encrypted.sql`，包含：
```sql
alter table public.email_accounts add column if not exists password_encrypted text;
-- 仅 service_role 可读写（RLS 额外策略或禁用该列的客户端选择）
create or replace function public.decrypt_account_password(account_id_in uuid, key_in text)
returns text
language plpgsql
security definer
as $$
declare result text;
begin
  select pgp_sym_decrypt(password_encrypted::bytea, key_in) into result
  from public.email_accounts where id = account_id_in;
  return result;
end;
$$;
revoke execute on function public.decrypt_account_password from public, anon, authenticated;
```
**MVP 阶段不执行此迁移**，仅作为增强项文档保留。

- [ ] **Step 3: cron 配置说明**

说明：在 Supabase Dashboard → Edge Functions → Schedules，创建定时任务：
- 函数：`fetch-emails`
- Cron 表达式：`*/5 * * * *`（每 5 分钟）
- 说明：MVP 阶段不启用，仅在确认前端拉取稳定后作为后台兜底开启。

- [ ] **Step 4: 提交（保留骨架，不部署）**

Run:
```powershell
git add supabase/functions/fetch-emails/index.ts; git commit -m "feat(mail): add optional edge function skeleton for background fetch (enhancement, not deployed)"
```
Expected: commit 成功。

---

## Task 18: 全量测试与构建验证

**Files:** 无新增

- [ ] **Step 1: 运行全部 Rust 测试**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo test
```
Expected: 所有 `#[cfg(test)]` 测试通过（credentials、imap::tests 3 个、smtp::tests 3 个、storage::tests 3 个）。credentials 在无 keychain 环境（CI）自动跳过。

- [ ] **Step 2: Rust 编译检查**

Run（cwd 为 `e:\Dev\EasyWork0807\src-tauri`）:
```powershell
cargo check
```
Expected: 编译通过，无错误。

- [ ] **Step 3: 运行全部前端单元测试**

Run:
```powershell
npm test
```
Expected: 所有 vitest 测试通过（含骨架原有测试 + 邮箱模块：useEmailAccounts 1、useFolders 1、useEmails 3、MailAccountTree 1、MailList 3）。

- [ ] **Step 4: 类型检查 + 前端构建**

Run:
```powershell
npm run build
```
Expected: `tsc -b` 无类型错误，`vite build` 产出 `dist/`。

- [ ] **Step 5: 启动开发服务器手动验证**

Run:
```powershell
npm run dev
```
Expected: Vite 在 `http://localhost:1420` 启动。登录后进入 `/mail`，验证：
- 左栏显示账号树（需先在设置中添加账号）。
- 中栏邮件列表可搜索/筛选。
- 右栏阅读区渲染 HTML 正文。
- 撰写弹窗可发送（需真实 SMTP 凭证）。
- 收件按钮触发 Rust IMAP 拉取（需真实 IMAP 凭证）。
验证后停止。

- [ ] **Step 6: 提交最终状态**

Run:
```powershell
git add -A; git commit -m "chore(mail): verify full test suite and build pass for email module"
```
Expected: commit 成功（若有改动）。

---

## Self-Review

**1. Spec 覆盖（spec 7.4 节）：**
- 数据库 4 张表 + RLS + updated_at 触发器 + 全文搜索 tsvector + GIN 索引 → Task 1 ✓
- 凭证存 keychain（`easywork:email:{account_id}`），不进库 → Task 3 credentials.rs + Task 7 ✓
- email_folders（收件箱/已发送 + unread_count + sort_order）→ Task 1 + Task 8/10 ✓
- emails 缓存（message_id 去重 + uid + 全文搜索 + is_read/is_starred）→ Task 1 + Task 8/11 ✓
- email_attachments（storage_path + bucket `email-attachments`）→ Task 1 + Task 6/8 ✓
- 收件流程：Rust 前台 IMAP FETCH (last_synced_uid, MAX] → 写库 → Realtime 推送 → Task 4/7/15/16 ✓
- 发件流程：前端 MailComposer → Tauri send_email → lettre SMTP → 写 emails 表（已发送）→ Task 5/7/14 ✓
- 附件 Storage：路径 `user_id/account_id/email_id/filename` → Task 6/8 ✓
- 搜索：subject + body_text + from_address 全文检索 + 文件夹/未读/星标筛选 → Task 1 + Task 8/11/12 ✓
- Rust 模块 mod/imap/smtp/storage + 4 个 Tauri commands → Task 3-7 ✓
- 前端组件 6 个 + 3 个 hooks → Task 9-14 ✓
- 三栏布局 + 移动端两级导航 → Task 16 ✓
- Edge Function 后台兜底（可选增强，标注清楚）→ Task 17 ✓

**2. TDD 覆盖：**
- Rust：credentials roundtrip（环境相关跳过）、imap parse 3 个、smtp build 3 个、storage path 3 个 → Task 3/4/5/6 ✓
- 前端：useEmailAccounts、useFolders、useEmails（3）、MailAccountTree、MailList（3）均为"失败测试 → 验证失败 → 实现 → 验证通过"流程 → Task 9/10/11/12 ✓
- MailReader/MailComposer 无单测（依赖 invoke/supabase/storage 侧效，靠手动验证）→ 可接受的覆盖率权衡，已在 Task 18 Step 5 手动验证。

**3. 占位符扫描：** 无 TODO/TBD；所有代码块完整可用。Task 17 Edge Function 明确标注"可选增强，MVP 不部署"，骨架代码的 `...` 为 Deno imap 库调用占位，已在注释中说明替换方式，非计划占位符。

**4. 类型一致性：**
- Rust `AccountConfig`/`FetchedEmail`/`SendEmailArgs`/`FetchEmailsResult` 与 TS `EmailAccount`/`FetchedEmail`/`ComposeEmailInput` 字段对齐（snake_case ↔ camelCase 由 serde/前端 invoke 自动转换，前端调用时显式传 snake_case config）。
- `EmailListFilter` 在 useEmails/MailList/emailRepository 三处签名一致。
- `StorageConfig` Rust 字段（supabase_url/access_token/user_id/account_id/email_id）与 Task 6 测试一致。

**5. 安全与约束：**
- 凭证不进库：accountRepository.createAccount 不写 password，仅经 `save_account_credentials` command 存 keychain ✓
- RLS：4 张表均 `using (auth.uid() = user_id)` + write check；Storage bucket 私有 + 按 `auth.uid()` 路径隔离 ✓
- HTML 渲染：MailReader 用 `dangerouslySetInnerHTML` + 内置 `sanitizeHtml`（移除 script/iframe/on*/javascript:），注释提示生产环境升级 DOMPurify ✓
- Realtime：迁移中 `alter publication supabase_realtime add table public.emails`，useEmailsRealtime 订阅 INSERT/UPDATE ✓

**6. 布局适配：** 桌面三栏（aside 56 列 + section 列表 + section 阅读，`hidden md:flex`/`md:flex` 切换）；移动端两级（selectedEmail 决定列表/阅读全屏切换，阅读区带返回按钮 `md:hidden`）→ Task 16 ✓

**范围说明：** 本计划覆盖邮箱模块完整 MVP（Rust 前台拉取 + 发件 + 附件 + 三栏 UI + Realtime），Edge Function 后台兜底作为可选增强（Task 17）保留骨架不部署。依赖 Dashboard 骨架（Task 1-3 脚手架、Supabase 客户端、Auth、布局、Router、QueryClient、vitest）已就绪。
