# supabase-legacy（历史存档）

> 归档日期：2026-08-14
> 归档原因：EasyWork 已全面转向 **local-first** 架构，Supabase 不再作为唯一数据源。

## 本目录内容

这是旧版「以 Supabase 为唯一数据源」时代的平台部署单元：

- `config.toml` —— Supabase CLI 项目配置（含旧 project_id、redirect URL 等标识）
- `migrations/` —— 旧架构的数据库迁移脚本（schema 含 `user_id`、`amount`、`initial_balance` 等旧列）
- `functions/` —— 旧 Edge Functions（`sync-calendar` 等，已由 Rust 后端本地实现替代）
- `seed.sql` —— 旧演示数据
- `.env.secrets.example` —— Edge Function 密钥模板（占位符，无真实密钥）

## ⚠️ 重要说明

1. **本目录的 schema 已与当前架构脱节**。当前云端同步表由 App 运行时自动创建，定义见
   `src-tauri/src/sync/schema.rs`（含 `sync_modified_at` / `sync_device_id` 列）。
2. 将来若选择 Supabase 作为同步 provider，云端表由 `init_cloud_schema()` 自动建表，
   **本目录的 migrations 不参与**，仅可作为参考。
3. 本目录仅供历史查阅，请勿作为新开发依据。
