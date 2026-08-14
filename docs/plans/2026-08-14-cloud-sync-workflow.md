---
intent: 为 EasyWork 添加可选的云端同步能力，让用户在 App 内配置 PostgreSQL 数据库连接后，自动将本地数据与云端双向增量同步
success_criteria:
  - 用户可在 App 设置页面添加/编辑/删除数据库连接配置
  - 启用同步后，本地变更在下次同步时自动上传至云端
  - 新设备配置相同连接后，能完整拉取已有数据
  - 双设备同时修改同一条记录时，时间戳晚者获胜（LWW）
  - 断网时 App 正常工作，网络恢复后自动追赶同步
  - 同步状态在 UI 中可见
risk_level: medium
auto_approve: false
---

## Steps

- [ ] **Step 1: 添加 tokio-postgres 依赖到 Cargo.toml**
action: 在 `src-tauri/Cargo.toml` 的 `[dependencies]` 区域添加 `tokio-postgres = { version = "0.7", features = ["runtime", "tls", "with-chrono-0_4", "with-uuid-1" ] }`
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | findstr "tokio-postgres"

- [ ] **Step 2: 创建 sync 模块目录和 mod.rs**
action: 创建 `src-tauri/src/sync/` 目录和 `src-tauri/src/sync/mod.rs` 文件。mod.rs 声明子模块：`pub mod engine; pub mod config; pub mod postgres; pub mod schema;` 并在 mod.rs 中定义公共类型：`SyncConfig` (serde struct: id, enabled, provider, connection_string, database_name, last_sync_at, sync_error, created_at, updated_at), `SyncStatus` (serde struct: enabled, last_sync_at, sync_error, device_id, device_name), `SyncLogEntry` (serde struct: id, direction, table_name, records_count, status, error_message, duration_ms, created_at), `ConnectionTestResult` (serde struct: success, message), `SyncResult` (serde struct: success, records_uploaded, records_downloaded, error)
loop: false
verify:
  type: artifact
  path: src-tauri/src/sync/mod.rs
  assert:
    kind: exists

- [ ] **Step 3: 实现 sync/config.rs — 同步配置读写**
action: 在 `src-tauri/src/sync/config.rs` 中实现：1) `create_sync_tables(conn: &Connection)` — 创建 sync_config, sync_log, device_info 三张表的 SQL；2) `get_sync_config(conn: &Connection) -> Result<Option<SyncConfig>>` — 读取 sync_config 表 'default' 行；3) `save_sync_config(conn: &Connection, config: &SyncConfig) -> Result<()>` — INSERT OR REPLACE；4) `delete_sync_config(conn: &Connection) -> Result<()>` — DELETE FROM sync_config；5) `get_device_id(conn: &Connection) -> Result<String>` — 读取或生成 device_id；6) `set_device_name(conn: &Connection, name: &str) -> Result<()>` — 更新设备名称。使用 rusqlite，Result 类型为 anyhow::Result 或自定义 Error。同步 Schema 版本检查：在函数开头调用，若 sync_config 表不存在则创建。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error[" | findstr /v "warning"

- [ ] **Step 4: 升级 SQLite Schema 到 v3，添加同步元数据列和 Trigger**
action: 修改 `src-tauri/src/db.rs`：1) 将 SCHEMA_VERSION 改为 3；2) 在 migrate 函数中，当 current < 3 时执行 ALTER TABLE 语句，为以下表添加 sync_modified_at 和 sync_device_id 列：tasks, subtasks, tags, task_tags, accounts, categories, transactions, budgets, notes, note_folders, note_tags, calendar_events, calendar_subscriptions；3) 为每个有 updated_at 列的表创建 AFTER UPDATE trigger 自动更新 sync_modified_at；4) 调用 sync::config::create_sync_tables() 创建同步元数据表。注意：使用 IF NOT EXISTS 保证幂等，不破坏 v2 已有数据。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 5: 为邮件数据库添加同步元数据列**
action: 修改 `src-tauri/src/mail/db.rs`：1) 将 mail SCHEMA_VERSION 升级为 "2"；2) 在 mail migrate 中，当版本 < 2 时，ALTER TABLE email_accounts 添加 sync_modified_at 和 sync_device_id 列；3) 创建 AFTER UPDATE trigger。同时调用 sync::config::create_sync_tables(mail_conn) 在 mail db 中创建同步元数据表（或使用共享的主 db）。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 6: 实现 sync/postgres.rs — PostgreSQL 连接管理**
action: 在 `src-tauri/src/sync/postgres.rs` 中实现：1) `PgConnection` 结构体，封装 tokio_postgres::Client；2) `connect(connection_string: &str) -> Result<PgConnection>` — 使用 rustls TLS 连接 PostgreSQL；3) `test_connection(connection_string: &str) -> Result<ConnectionTestResult>` — 尝试连接并执行 SELECT 1；4) `ensure_schema(client: &tokio_postgres::Client)` — 调用 schema 初始化。处理连接超时（10秒），合理的错误信息（中文）。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 7: 实现 sync/schema.rs — 云端 PostgreSQL Schema 初始化**
action: 在 `src-tauri/src/sync/schema.rs` 中实现 `init_cloud_schema(client: &tokio_postgres::Client) -> Result<()>`。使用 CREATE TABLE IF NOT EXISTS 创建所有同步表的云端镜像。表包括：devices, sync_state, tasks, subtasks, tags, task_tags, accounts, categories, transactions, budgets, notes, note_folders, note_tags, calendar_events, calendar_subscriptions, email_accounts。每张表结构与 SQLite 端一致，额外增加 sync_modified_at TEXT NOT NULL 和 sync_device_id TEXT NOT NULL 字段。为每张表创建 sync_modified_at 索引。所有建表语句幂等执行。
loop: false
verify:
  type: artifact
  path: src-tauri/src/sync/schema.rs
  assert:
    kind: exists

- [ ] **Step 8: 实现 sync/engine.rs — 上传逻辑（本地 → 云端）**
action: 在 `src-tauri/src/sync/engine.rs` 中实现 `sync_upload(db: &Arc<tokio::sync::Mutex<Connection>>, mail_db: &Arc<tokio::sync::Mutex<Connection>>) -> Result<SyncUploadResult>`。逻辑：1) 从 sync_config 读取配置和 last_sync_at；2) 遍历所有同步表，SELECT * FROM table WHERE sync_modified_at > ? ORDER BY sync_modified_at；3) 对每条记录构建 PostgreSQL UPSERT 语句（ON CONFLICT (id) DO UPDATE SET ... WHERE EXCLUDED.updated_at > table.updated_at），使用参数化查询批量执行；4) 更新 sync_config.last_sync_at 为当前时间；5) 记录 sync_log（direction='upload'）。对于 email_accounts 表，从 mail_db 读取。处理网络错误并设置 sync_error 字段。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 9: 实现 sync/engine.rs — 下载逻辑（云端 → 本地）**
action: 在 `src-tauri/src/sync/engine.rs` 中实现 `sync_download(db: &Arc<tokio::sync::Mutex<Connection>>, mail_db: &Arc<tokio::sync::Mutex<Connection>>) -> Result<SyncDownloadResult>`。逻辑：1) 从本地读取每个表的 last_downloaded_at；2) 对每个表，从 PostgreSQL 查询 WHERE sync_modified_at > ? AND sync_device_id != ?（排除自身设备的变更）；3) 对每条云端记录应用 LWW 合并：如果本地不存在则 INSERT；如果本地存在且云端 updated_at > 本地 updated_at 则 UPDATE；否则跳过；4) 记录 sync_log（direction='download'）；5) 更新下载游标。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 10: 实现 sync/engine.rs — 首次全量同步**
action: 在 `src-tauri/src/sync/engine.rs` 中实现 `full_sync(db: &Arc<tokio::sync::Mutex<Connection>>, mail_db: &Arc<tokio::sync::Mutex<Connection>>) -> Result<()>`。当 last_sync_at 为空时触发：1) 先上传本地所有数据到云端；2) 再下载云端所有数据（非本设备）到本地，应用 LWW；3) 设置 last_sync_at 为当前时间。用于新设备首次连接。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 11: 在 lib.rs 中注册 sync 模块并启动后台同步任务**
action: 修改 `src-tauri/src/lib.rs`：1) 添加 `pub mod sync;` 模块声明；2) 在 setup 闭包中，启动后台同步 tokio task——每 60 秒检查 sync_config.enabled，如启用则调用 sync_upload + sync_download；3) 在 sync task 中捕获所有错误，只记录日志，不崩溃主进程；4) 使用 tracing 记录同步状态。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 12: 在 commands.rs 中添加同步相关 Tauri commands**
action: 在 `src-tauri/src/commands.rs` 中添加以下命令：1) `sync_config_get(State<AppState>) -> Result<SyncConfig>`；2) `sync_config_save(State<AppState>, config: SyncConfig) -> Result<()>`；3) `sync_config_delete(State<AppState>) -> Result<()>`；4) `sync_test_connection(State<AppState>) -> Result<ConnectionTestResult>` — 使用当前配置测试连接；5) `sync_trigger(State<AppState>) -> Result<SyncResult>` — 手动触发完整同步；6) `sync_status(State<AppState>) -> Result<SyncStatus>` — 返回当前同步状态；7) `sync_log_get(State<AppState>, limit: Option<i32>) -> Result<Vec<SyncLogEntry>>` — 默认 limit=20；8) `sync_set_device_name(State<AppState>, name: String) -> Result<()>`
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 13: 在 lib.rs 中注册 sync commands 到 invoke_handler**
action: 修改 `src-tauri/src/lib.rs` 的 `invoke_handler` 宏，在 `generate_handler!` 列表末尾添加：`commands::sync_config_get, commands::sync_config_save, commands::sync_config_delete, commands::sync_test_connection, commands::sync_trigger, commands::sync_status, commands::sync_log_get, commands::sync_set_device_name`
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 14: 创建前端 syncApi.ts**
action: 创建 `src/features/sync/syncApi.ts`，定义所有同步相关 API 函数，使用 Tauri invoke 模式（懒加载 import）。函数包括：`getSyncConfig()`, `saveSyncConfig(config)`, `deleteSyncConfig()`, `testConnection()`, `triggerSync()`, `getSyncStatus()`, `getSyncLog(limit)`, `setDeviceName(name)`。所有函数使用动态 import('@tauri-apps/api/core') 以兼容浏览器开发模式。
loop: false
verify:
  type: artifact
  path: src/features/sync/syncApi.ts
  assert:
    kind: exists

- [ ] **Step 15: 创建前端 useSync.ts hooks**
action: 创建 `src/features/sync/useSync.ts`，使用 TanStack Query 封装同步 API。Hook 包括：`useSyncConfig()` (useQuery), `useSaveSyncConfig()` (useMutation + invalidate), `useDeleteSyncConfig()` (useMutation), `useTestConnection()` (useMutation), `useTriggerSync()` (useMutation), `useSyncStatus()` (useQuery, 30s refetch), `useSyncLog()` (useQuery), `useSetDeviceName()` (useMutation)
loop: false
verify:
  type: artifact
  path: src/features/sync/useSync.ts
  assert:
    kind: exists

- [ ] **Step 16: 创建 SyncStatusCard 组件**
action: 创建 `src/features/settings/SyncStatusCard.tsx`。显示当前同步状态：启用/禁用状态、上次同步时间、设备名称、同步错误信息。使用 shadcn/ui Card 样式。状态图标：Cloud(CloudOff/CloudDownload/Loader2)。颜色映射：success(已同步<5min), warning(待同步), destructive(错误), muted(未配置)。包含手动触发同步的按钮。
loop: false
verify: npx tsc --noEmit 2>&1 | findstr /C:"SyncStatusCard"

- [ ] **Step 17: 创建 SyncConfigForm 组件**
action: 创建 `src/features/settings/SyncConfigForm.tsx`。表单字段：1) 启用同步 Toggle/Checkbox；2) 数据库提供商 Select（Supabase/Aiven/Render/自定义）；3) 连接地址 Input（postgresql://...）；4) 数据库名 Input；5) 设备名称 Input；6) 「测试连接」Button（调用 testConnection，显示结果）；7) 「保存配置」Button（调用 saveSyncConfig）；8) 「删除配置」Button（危险操作，需确认）。底部显示安全提示：连接信息将存储在本地数据库中。使用 react-hook-form + zod 验证连接串格式。
loop: false
verify: npx tsc --noEmit 2>&1 | findstr /C:"SyncConfigForm"

- [ ] **Step 18: 创建 SyncLogViewer 组件**
action: 创建 `src/features/settings/SyncLogViewer.tsx`。使用 TanStack Query 获取最近 20 条同步日志。以表格/列表形式展示：时间、方向（上/下箭头图标）、表名、记录数、状态（成功/错误徽章）。可滚动，带 Skeleton 加载态。使用 shadcn/ui Table + Badge 组件。
loop: false
verify: npx tsc --noEmit 2>&1 | findstr /C:"SyncLogViewer"

- [ ] **Step 19: 创建 SyncSettings 主面板组件**
action: 创建 `src/features/settings/SyncSettings.tsx`。组合 SyncStatusCard + SyncConfigForm + SyncLogViewer。布局：顶部状态卡片，中间配置表单，底部同步日志。处理配置加载、保存、删除的完整流程。保存配置后自动触发首次同步。
loop: false
verify: npx tsc --noEmit 2>&1 | findstr /C:"SyncSettings"

- [ ] **Step 20: 在 Settings.tsx 中添加同步 Tab**
action: 修改 `src/features/settings/Settings.tsx`：1) 导入 SyncSettings 组件；2) 在 tabs 列表中添加「同步」Tab（Cloud 图标）；3) 在 switch/render 逻辑中添加 sync tab 的渲染分支。Tab 位置放在「通知」之后、「关于」之前。
loop: false
verify: npx tsc --noEmit

- [ ] **Step 21: 创建 SyncStatusIcon 全局状态组件**
action: 创建 `src/components/SyncStatusIcon.tsx`。小型状态指示器组件，用于在侧边栏或顶栏显示同步状态。尺寸：24x24 图标 + 可选 tooltip。状态映射：未配置→CloudOff(灰色)、同步中→Loader2 spin(品牌色)、已同步→Cloud(绿色)、待同步→CloudDownload(橙色)、错误→CloudOff(红色)。使用 useSyncStatus hook 获取实时状态。
loop: false
verify: npx tsc --noEmit 2>&1 | findstr /C:"SyncStatusIcon"

- [ ] **Step 22: 在侧边栏中添加同步状态图标**
action: 修改 `src/components/layout/Sidebar.tsx`，在侧边栏底部导航区域（版本信息上方）插入 SyncStatusIcon 组件。图标带 tooltip 显示详细同步状态（上次同步时间、错误信息等）。
loop: false
gate: human
verify: npx tsc --noEmit

- [ ] **Step 23: 添加国际化文案（中英文）**
action: 1) 在 `src/lib/locales/zh-CN.json` 中添加同步相关文案键：sync.title, sync.enabled, sync.provider, sync.connection_string, sync.database_name, sync.device_name, sync.test_connection, sync.save, sync.delete, sync.syncing, sync.synced, sync.pending, sync.error, sync.security_notice, sync.log 等；2) 在 `src/lib/locales/en-US.json` 中添加对应英文翻译。确保所有新增 UI 组件使用 useTranslation() 钩子。
loop: false
verify:
  - type: artifact
    path: src/lib/locales/zh-CN.json
    assert:
      kind: exists
  - type: shell
    command: npx tsc --noEmit

- [ ] **Step 24: 在数据变更命令中添加即时上传触发**
action: 修改 `src-tauri/src/commands.rs` 中的 CRUD 命令（task_create, task_update, task_delete, note_create, note_update 等高频命令），在命令末尾添加即时上传触发逻辑：如果同步已启用，在后台 spawn 一个 sync_upload task（非阻塞）。使用 `tokio::spawn` + 弱引用避免循环依赖。仅在关键命令（创建/更新/删除）上添加，读取命令不需要。
loop: false
verify: cargo check --manifest-path src-tauri/Cargo.toml --lib 2>&1 | findstr /C:"error["

- [ ] **Step 25: 完整编译验证**
action: 执行完整编译检查，确保 Rust 后端和 TypeScript 前端都没有编译错误。先 cargo check，再前端 tsc --noEmit，最后尝试 pnpm run build 验证打包。
loop: until clean
max_iterations: 3
verify:
  - type: shell
    command: cargo check --manifest-path src-tauri/Cargo.toml --lib
  - type: shell
    command: npx tsc --noEmit

- [ ] **Step 26: 同步引擎代码人工审查**
action: 人工审查 sync/engine.rs 中的 LWW 冲突解决逻辑是否正确。验证场景：1) 同一条记录在两个设备上修改，时间戳晚者获胜；2) 记录在一个设备删除，另一个设备修改——修改获胜；3) 首次全量同步时不会丢失数据。检查边界条件：时区问题、空值处理、并发安全。
loop: false
gate: human
verify:
  type: human-review
  check: LWW 合并逻辑在边缘场景下正确，无数据丢失风险
