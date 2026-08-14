# Supabase 部署单元

此目录包含**所有需要部署到 Supabase 云端**的资源。与项目根目录的本地前端/Tauri 代码完全解耦，可独立部署。

## 目录结构

```
supabase/
├── config.toml                 # Supabase CLI 项目配置（项目 ID、函数、存储桶等）
├── .env.secrets.example        # Edge Function Secrets 模板（复制为 .env.secrets 使用）
├── .env.secrets                # 真实 Secrets（已 gitignore，不提交）
│
├── migrations/                 # 数据库迁移（按版本号顺序执行）
│   ├── 0001_init_profiles.sql          # 用户档案表
│   ├── 0002_tasks.sql                  # 任务模块
│   ├── 0003_finance.sql                # 财务模块
│   ├── 0004_notes.sql                  # 笔记模块
│   ├── 0005_email.sql                  # 邮件模块
│   ├── 0006_storage_and_indexes.sql    # 存储桶与索引
│   ├── 0007_realtime.sql               # 实时订阅
│   ├── 0008_email_credentials.sql      # 邮箱凭据
│   ├── 0009_budget_overall_rollover.sql # 预算结转
│   ├── 0010_service_role_grants.sql    # service_role 授权
│   ├── 0011_seed_demo_data.sql         # 演示数据
│   ├── 0019_mail_cron.sql              # 邮件定时同步
│   ├── 0020_new_user_finance_defaults.sql # 新用户财务默认值
│   ├── 0021_rich_demo_data.sql         # 丰富演示数据
│   ├── 0022_avatars_bucket.sql         # 头像存储桶
│   ├── 0023_email_folder_sync_cursor.sql # 邮件文件夹同步游标
│   ├── 0024_calendar.sql               # 日历模块
│   ├── 0024_mail_cron_service_auth.sql # 邮件 Cron 鉴权加固
│   ├── 0025_fix_budget_overall_uniq.sql # 预算唯一约束修复
│   ├── 0026_hardening_policies_and_security.sql # RLS 加固
│   ├── 0027_security_cleanup.sql       # 安全清理
│   ├── 0028_email_password_encryption.sql # 邮箱密码加密函数
│   └── 0029_email_password_key_param.sql  # 加密函数密钥参数化
│
├── functions/                  # Edge Functions（Deno 运行时）
│   ├── _shared/                # 共享模块（部署时随函数打包）
│   │   ├── mail.ts             # IMAP/SMTP 工具 + 密码解密
│   │   └── ics.ts              # ICS 日历解析
│   ├── fetch-mail/             # 收信（IMAP 增量同步）
│   │   └── index.ts
│   ├── send-mail/              # 发信（SMTP）
│   │   └── index.ts
│   ├── manage-folder/          # 邮件文件夹管理（建/改/删）
│   │   └── index.ts
│   └── sync-calendar/          # 日历订阅同步（ICS/CalDAV）
│       └── index.ts
│
├── seed.sql                    # 种子数据（演示账号 + 示例数据，可选）
│
└── .temp/                      # CLI 运行时临时文件（已 gitignore）
    ├── linked-project.json     # 远程项目链接信息
    ├── project-ref             # 项目引用 ID
    └── ...
```

## 部署的内容

| 类别 | 内容 | 部署命令 |
|---|---|---|
| **数据库 Schema** | 23 个迁移文件（0001-0029） | `supabase db push --linked` |
| **Edge Functions** | 4 个函数 | `supabase functions deploy <name>` |
| **Secrets** | 2 个手动密钥 | `supabase secrets set --env-file .env.secrets` |
| **Cron 任务** | 由迁移 0024 创建 | 随 DB 迁移自动创建 |
| **存储桶** | avatars（公开）、email-attachments（私有） | 由迁移 0006/0022 创建 |

## 不在此目录的内容

以下内容**不属于** Supabase 部署，位于项目根目录：

- 前端源码 → `src/`
- Tauri 桌面后端 → `src-tauri/`
- 前端构建配置 → `package.json`、`vite.config.ts`
- 前端环境变量 → `.env`（`VITE_SUPABASE_URL` 等）

## 快速部署

```bash
# 1. 链接远程项目（首次）
supabase link --project-ref nbcsywzqvvputqitmpla

# 2. 应用数据库迁移
supabase db push --linked

# 3. 部署所有 Edge Functions
supabase functions deploy fetch-mail --no-verify-jwt
supabase functions deploy send-mail --no-verify-jwt
supabase functions deploy manage-folder --no-verify-jwt
supabase functions deploy sync-calendar --no-verify-jwt

# 4. 设置 Secrets
cp .env.secrets.example .env.secrets
# 编辑 .env.secrets 填入真实值
supabase secrets set --env-file .env.secrets

# 5. 可选：加载演示数据
supabase db query --linked --file seed.sql
```

详细说明见 [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)。
