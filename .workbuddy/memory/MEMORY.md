# EasyWork 项目长期记忆

## 产品定位
Tauri 桌面端全能生产力工作台：任务/邮箱/笔记/记账/仪表盘。React 19 + Vite + Tailwind v4 + shadcn/ui(new-york) + TanStack Router。local-first：本地 SQLite + 可选 PostgreSQL 云同步（src-tauri/src/sync/*，tokio-postgres）。用户偏中文，偏好详尽严格的审阅。

## 架构关键事实
- **数据根目录**：`document_dir()/EasyWork`（本机 D:\WindowsStuff\Documents\EasyWork），失败回退 AppData；lib.rs `resolve_data_root()` + `migrate_legacy_data()` 首启迁移。用户明确：不走 OneDrive。
- 认证本地化：users 表 argon2 哈希 + auth_* 命令；登录态 localStorage `easywork:user_id`。Supabase 已彻底移除（归档 docs/archive/supabase-legacy/）。
- schema：db.rs SCHEMA_VERSION=12；邮件独立库 mail/easywork-mail.db（schema v7），密码存 keyring（keyring=3 必须按平台启用后端 feature，否则 set 静默失败）。
- 🔴 **Tauri v2 IPC 参数默认 camelCase**（Rust `task_id`→JS `taskId`）；必填缺失报错，**可选缺失静默失效**；错误 reject 的是 String 非 Error；清字段用 `nullFields: string[]`。
- data_clear_all/import_all：必须按 CLEAR_ORDER 子表优先 + 断开 categories/note_folders 自引用 + 显式按 BACKUP_TABLES 顺序导入 + 事务前 `PRAGMA foreign_keys=OFF`（serde_json Object 是 BTreeMap 字母序，遍历 obj 会乱序）。
- 演示模式：demo@easywork.app/demo123456；seedDemoData 日期全部相对 now()；整页 reload 会触发重新播种（E2E 勿 reload 后断言数据）。

## 绿色版构建（npm run build:green）
- 🔴 cargo build --release 必须带 `--features custom-protocol`（否则白屏连 localhost:1420）；必须前台跑 timeout≥600000（后台任务会在 cargo 阶段被杀）。
- tauri.conf.json bundle.active:false + targets:[]；+crt-static 免 VC++；产物 release-green/EasyWork.exe（2026-08-15: **13.66MB**，release 调优 lto/codegen-units=1/opt-level="z" 后较 22.8MB 减 40%）。运行期仅需 WebView2。
- 调用方式：PowerShell 工具直调 `npm.cmd run build:green`。
- `tsc -b --force` 引爆 TS6310 → tsconfig.node.json 已改 emitDeclarationOnly+outDir 到 node_modules/.tmp。日常 `tsc -b` 增量。

## 环境坑
- pnpm 11：构建脚本许可放 pnpm-workspace.yaml，**保留 `allowBuilds: { esbuild: true }`**。
- 🔴 genie-safe-delete shim（NODE_OPTIONS 注入）拦截批量删除 → 构建前清空 NODE_OPTIONS（build-green.ps1 已处理）。
- cargo crates 走 rsproxy 镜像（~/.cargo/config.toml rsproxy-sparse）。

## 测试
- 浏览器只能测纯前端（无 __TAURI_INTERNALS__，invoke 全挂）；数据工作流必须跑 exe 或 tauri dev。脚本 scripts/e2e-browser-smoke.mjs。
- Tauri E2E：Playwright + WebView2 CDP；**生产 tauri.conf.json 不再带调试端口，E2E 构建用 `src-tauri/tauri-e2e.conf.json` + `pnpm run build:e2e`**；CSP connect-src 必须含 `ipc: http://ipc.localhost`；重启前杀干净 easywork/msedgewebview 进程。骨架 e2e-tauri/helpers.mjs；mail-full-flow.mjs 27/27。
- 邮件：IMAP/SMTP 均 TLS-only（mailpit 只能测 SMTP）；首次同步窗口 200 封/文件夹。已修复：emails_fts 触发器（mail/db.rs v4）、附件落盘（service.rs）、已读/星标回写 IMAP（commands.rs push_flag_to_imap）。
- 🔴 **凭据安全约定**：QQ 邮箱授权码一律经 `QQ_AUTH_CODE` 环境变量注入（邮箱可用 `QQ_EMAIL` 覆盖默认 1633856788@qq.com）；禁止在脚本/代码/记忆里硬编码任何密码、授权码、API key。E2E 脚本统一在入口校验 `QQ_AUTH_CODE`，缺失时提示用法并 exit(1)。
- 2026-08-15 全项目审阅（详见 docs/project-review-2026-08-15.md）已修复：sync 触发器补齐 5 表；tombstone 删除传播 + 下载触发器 mute 防回环；PG 连接串/CalDAV 密码迁 keyring；tracing 日志 init；assetProtocol 移除 `**`；playwright.config.ts 端口 1420；playwright 移 devDependencies；localStorage 统一走 src/lib/storage.ts；Mail/Notes i18n 补全；business.rs 按领域拆分；LWW updated_at 覆盖 subtasks/tags/task_tags；邮件同步锁外解析+单事务批量写入；P2 白名单 SQL 标识符 + SqlVal 枚举替代 "NULL" 哨兵；sync 冲突检测+UI（sync_conflicts 表 + sync_conflicts_list/resolve 命令 + SyncConflictPanel）。
- **新功能（2026-08-15 晚）**：日历事件提醒（db v12 reminder_minutes + check_event_reminders 60s 轮询 + 系统通知）；IMAP 大附件按需拉取（parse_message_lazy 5MB 阈值 + email_attachment_download）；备份 AES-256-GCM 可选加密（BackupPasswordDialog）；Cargo release 调优（lto/codegen-units=1/opt-level=z）。
- 前端存储：所有 localStorage 读写统一走 `src/lib/storage.ts`（key 常量、类型安全、异常吞掉），避免各模块分散硬编码 key。

## 设计系统（AGENTS.md / design/UI-Redesign-System.md 为准）
- 主色 Iris 鸢尾靛 oklch(56% 0.17 264)；暖调中性灰色相 70；Fraunces(标题)/Plus Jakarta Sans(UI)/JetBrains Mono(金额)；图标唯一源 lucide-react；禁止硬编码颜色/像素，一律用 token。

## 记账模块待办
周期交易、批量操作、CSV 导入、PDF 导出、decimal 精度、多账本、智能记账。详见 docs/finance-module-review-2026-08-10.md。

## Android 图标
icons/android/ 受版本控制；tauri android build --apk → scripts/repackage_apk_icons.py → zipalign → apksigner sign。
