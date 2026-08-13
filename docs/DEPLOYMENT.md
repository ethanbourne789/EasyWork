# EasyWork 部署指南

> 本文档说明如何将 EasyWork 项目部署到生产环境。
> 项目分为两部分：**Supabase 云端**（数据库 + Edge Functions）和**本地桌面应用**（Tauri 打包）。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    用户桌面                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  EasyWork 桌面应用（Tauri 打包）                   │  │
│  │  ┌─────────────┐  ┌───────────────────────────┐  │  │
│  │  │  Rust 后端   │  │  前端（React + Vite）       │  │
│  │  │  (src-tauri) │  │  (src/ → dist/)            │  │
│  │  └─────────────┘  └───────────┬───────────────┘  │  │
│  └───────────────────────────────┼───────────────────┘  │
│                                  │ HTTPS                │
└──────────────────────────────────┼──────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     Supabase 云端            │
                    │  ┌─────────────────────┐    │
                    │  │  PostgreSQL 数据库   │    │
                    │  │  (migrations/)       │    │
                    │  └──────────┬──────────┘    │
                    │             │                │
                    │  ┌──────────▼──────────┐    │
                    │  │  Edge Functions      │    │
                    │  │  (functions/)        │    │
                    │  │  - fetch-mail        │    │
                    │  │  - send-mail         │    │
                    │  │  - manage-folder     │    │
                    │  │  - sync-calendar     │    │
                    │  └─────────────────────┘    │
                    │  + Auth / Storage / Realtime │
                    └──────────────────────────────┘
```

---

## 文件部署位置划分

### 一、Supabase 云端（`supabase/` 目录）

此目录是一个**完整的 Supabase 部署单元**，包含所有需要部署到云端的资源。

| 类别 | 路径 | 说明 |
|---|---|---|
| CLI 配置 | `supabase/config.toml` | 项目 ID、Edge Function 配置、存储桶定义 |
| DB 迁移 | `supabase/migrations/*.sql` | 23 个 SQL 文件（0001-0029），按版本号顺序执行 |
| 种子数据 | `supabase/seed.sql` | 演示账号 + 跨模块示例数据（可选） |
| Edge Functions | `supabase/functions/*/index.ts` | 4 个 Deno 函数 |
| 共享模块 | `supabase/functions/_shared/*.ts` | 部署时随函数一并打包 |
| Secrets 模板 | `supabase/.env.secrets.example` | Edge Function 环境变量模板 |

**Edge Functions 清单：**

| 函数 | 用途 | 鉴权方式 | 触发方式 |
|---|---|---|---|
| `fetch-mail` | IMAP 增量收信 | JWT（手动）/ SERVICE_ROLE_KEY（定时） | 手动 + pg_cron 每 5 分钟 |
| `send-mail` | SMTP 发信 | JWT | 手动 |
| `manage-folder` | 邮件文件夹建/改/删 | JWT | 手动 |
| `sync-calendar` | 日历订阅同步（ICS/CalDAV） | JWT | 手动 |

### 二、本地桌面应用（项目根目录）

| 类别 | 路径 | 说明 |
|---|---|---|
| 前端源码 | `src/` | React + TypeScript，`pnpm build` 产出到 `dist/` |
| Tauri 后端 | `src-tauri/src/` | Rust 代码，编译为本地二进制 |
| Tauri 配置 | `src-tauri/tauri.conf.json` | 应用元数据、CSP、窗口、打包目标 |
| Tauri 能力 | `src-tauri/capabilities/` | 权限声明 |
| 应用图标 | `src-tauri/icons/` | 各平台图标资源 |
| 构建配置 | `package.json`、`vite.config.ts`、`tsconfig.json` | 依赖与构建脚本 |
| 环境变量 | `.env`（已 gitignore） | 前端运行时配置 |
| 构建脚本 | `scripts/` | 打包、验证工具 |

### 三、纯文档/工具（不部署）

| 路径 | 说明 |
|---|---|
| `docs/` | 设计文档、审阅记录 |
| `design/` | UI 原型与设计规范 |
| `.github/workflows/` | CI 配置 |
| `scripts/` | 开发工具（截图、文档生成等） |

---

## 前置准备

### 1. 安装工具

| 工具 | 版本要求 | 说明 |
|---|---|---|
| Node.js | ≥ 22 | 前端构建 |
| pnpm | 11.x | 包管理器（`npm i -g pnpm`） |
| Rust | stable | Tauri 后端编译 |
| Supabase CLI | ≥ 2.111.0 | 数据库与函数部署 |

### 2. 获取项目凭据

从 [Supabase Dashboard](https://supabase.com/dashboard/project/nbcsywzqvvputqitmpla/settings/api) 获取：

- **Project Ref**: `nbcsywzqvvputqitmpla`
- **Project URL**: `https://nbcsywzqvvputqitmpla.supabase.co`
- **anon key**: 用于前端（公开）
- **service_role key**: 用于 Edge Function（保密）

### 3. 登录 Supabase CLI

```bash
supabase login
```

---

## 第一部分：部署 Supabase 云端

所有操作在项目根目录执行，CLI 会自动识别 `supabase/config.toml`。

### 步骤 1：链接远程项目（首次）

```bash
supabase link --project-ref nbcsywzqvvputqitmpla
```

### 步骤 2：应用数据库迁移

```bash
# 查看本地与远程迁移差异
supabase migration list --linked

# 推送所有未应用的迁移
supabase db push --linked
```

**迁移历史不一致时的修复：**

```bash
# 将本地存在但远程缺失的迁移标记为已应用
supabase migration repair --linked --status applied <version>

# 将远程存在但本地已删除的迁移标记为已回滚
supabase migration repair --linked --status reverted <version>
```

### 步骤 3：部署 Edge Functions

```bash
# 逐个部署（--no-verify-jwt: 函数自行校验鉴权）
supabase functions deploy fetch-mail --no-verify-jwt
supabase functions deploy send-mail --no-verify-jwt
supabase functions deploy manage-folder --no-verify-jwt
supabase functions deploy sync-calendar --no-verify-jwt

# 验证部署结果
supabase functions list
```

### 步骤 4：设置 Edge Function Secrets

```bash
# 1. 从模板创建本地 secrets 文件
cp supabase/.env.secrets.example supabase/.env.secrets

# 2. 编辑填入真实值
#    - SERVICE_ROLE_KEY: 从 Dashboard 复制 service_role key
#    - EMAIL_ENC_KEY: 生成 256-bit hex 密钥（见下方）

# 3. 生成邮箱加密密钥
#    方法 A: OpenSSL
openssl rand -hex 32
#    方法 B: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. 推送到远程
supabase secrets set --project-ref nbcsywzqvvputqitmpla --env-file supabase/.env.secrets

# 5. 验证
supabase secrets list
```

> **警告**：`EMAIL_ENC_KEY` 一旦设置并加密了存量密码，**不可更改**，否则所有已加密密码无法解密。请妥善备份此密钥。

### 步骤 5：执行存量密码加密（如有存量明文密码）

```sql
-- 通过 supabase db query --linked 执行
UPDATE public.email_accounts
   SET password = public.encrypt_email_password(
     password,
     '<你的 EMAIL_ENC_KEY 值>'
   )
 WHERE password IS NOT NULL
   AND NOT (password ~ '^[A-Za-z0-9+/=]+$' AND LENGTH(password) > 60);
```

### 步骤 6：加载演示数据（可选，仅演示环境）

```bash
supabase db query --linked --file supabase/seed.sql
```

### 步骤 7：验证部署

```bash
# 验证迁移状态
supabase migration list --linked

# 验证函数状态
supabase functions list

# 验证加密函数 round-trip
supabase db query --linked "SELECT public.decrypt_email_password(public.encrypt_email_password('test', '<EMAIL_ENC_KEY>'), '<EMAIL_ENC_KEY>') AS result;"
# 预期输出: test
```

---

## 第二部分：构建本地桌面应用

### 步骤 1：安装依赖

```bash
pnpm install
```

### 步骤 2：配置前端环境变量

```bash
# 从模板创建
cp .env.example .env

# 编辑 .env 填入值
# VITE_SUPABASE_URL=https://nbcsywzqvvputqitmpla.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon-key>
# VITE_DEMO_EMAIL=demo@easywork.app
# VITE_DEMO_PASSWORD=Demo123456!
```

### 步骤 3：开发模式（热重载）

```bash
pnpm tauri dev
```

### 步骤 4：生产打包

**标准打包（生成 .exe / .msi）：**

```bash
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

**绿色版打包（免安装）：**

```bash
pnpm build:green
```

脚本会编译 Rust + 构建前端 + 复制依赖，产物位于 `release-green/`。

### 步骤 5：验证构建产物

```bash
# 验证演示账号可登录
node scripts/verify-demo.mjs
```

---

## 常见问题

### Q1: `supabase db push` 报 `duplicate key value violates unique constraint "schema_migrations_pkey"`

远程迁移历史与本地不一致。使用 `migration repair` 修复：

```bash
supabase migration repair --linked --status reverted <冲突的版本号>
supabase migration repair --linked --status applied <新版本号>
```

### Q2: `supabase db query` 报 `permission denied to set parameter`

CLI 的 `cli_login` 角色无 superuser 权限，不能执行 `ALTER DATABASE SET`。
本项目通过将密钥作为函数参数传入（见迁移 0029），避免依赖 DB 级 GUC。

### Q3: Edge Function 报 `Missing SERVICE_ROLE_KEY`

`fetch-mail` 的定时分支需要 `SERVICE_ROLE_KEY` 这个环境变量（注意没有 `SUPABASE_` 前缀）。
此变量需手动设置，值等于 Dashboard 的 `service_role key`：

```bash
supabase secrets set SERVICE_ROLE_KEY=<service-role-key>
```

### Q4: 邮箱密码加密后无法解密

检查以下几点：
1. `EMAIL_ENC_KEY` 是否与加密时使用的密钥一致
2. Edge Function 是否能读取到 `EMAIL_ENC_KEY`（`supabase secrets list` 验证）
3. `decrypt_email_password` 函数权限（仅 `service_role` 可调用）

### Q5: Tauri 构建报 `cargo` 找不到

确保 Rust 工具链已安装并更新：

```bash
rustup update stable
```

### Q6: 前端无法连接 Supabase

检查 Tauri CSP 配置（`src-tauri/tauri.conf.json`）中的 `connect-src` 是否包含你的 Supabase URL。

---

## 部署检查清单

### Supabase 云端

- [ ] `supabase link` 成功
- [ ] `supabase migration list --linked` 所有迁移已应用
- [ ] `supabase functions list` 4 个函数均为 ACTIVE
- [ ] `supabase secrets list` 包含 `EMAIL_ENC_KEY` 和 `SERVICE_ROLE_KEY`
- [ ] 加密函数 round-trip 测试通过
- [ ] pg_cron 任务 `fetch-mail-every-5min` 已创建

### 本地桌面应用

- [ ] `pnpm install` 成功
- [ ] `.env` 已配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
- [ ] `pnpm tauri dev` 可正常启动
- [ ] 演示账号 `demo@easywork.app` / `Demo123456!` 可登录
- [ ] `pnpm tauri build` 生成安装包
- [ ] `pnpm test` 全部通过
- [ ] `pnpm lint` 无错误

---

## 环境变量汇总

### 前端（`.env`，已 gitignore）

| 变量 | 说明 | 示例 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | `https://nbcsywzqvvputqitmpla.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key（公开） | `eyJhbGci...` |
| `VITE_DEMO_EMAIL` | 演示账号邮箱 | `demo@easywork.app` |
| `VITE_DEMO_PASSWORD` | 演示账号密码 | `Demo123456!` |

### Edge Function Secrets（`supabase/.env.secrets`，已 gitignore）

| 变量 | 说明 | 自动注入 |
|---|---|---|
| `SERVICE_ROLE_KEY` | service_role 密钥（等于 SUPABASE_SERVICE_ROLE_KEY） | 否，手动设置 |
| `EMAIL_ENC_KEY` | 邮箱密码加密密钥（256-bit hex） | 否，手动设置 |
| `SUPABASE_URL` | 项目 URL | 是 |
| `SUPABASE_ANON_KEY` | anon key | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | 是 |
| `SUPABASE_DB_URL` | 数据库连接串 | 是 |
