---
design_type: feature
created_at: 2026-08-14
---

# Cloud Sync Architecture — Local-First PostgreSQL Incremental Sync

## Intent Contract

```
intent: 为 EasyWork 添加可选的云端同步能力，让用户在 App 内配置 PostgreSQL 数据库连接后，
        自动将本地数据（任务、笔记、记账、日历 + 邮件设置）与云端双向增量同步，
        支持多设备、离线优先、最后写入获胜的冲突解决。

constraints:
  - 不硬编码数据库连接信息到项目代码中，所有配置通过 App 内设置页面管理
  - 保持本地 SQLite 为主数据源，不改变 local-first 设计原则
  - 仅使用免费层数据库服务（Supabase / Aiven / Render PostgreSQL）
  - TLS 传输加密，不做强端对端加密
  - 不限制同步设备数量
  - 邮件正文和附件不同步，仅同步邮件账户设置
  - 兼容现有 schema，不破坏现有数据

success_criteria:
  - 用户可在 App 设置页面添加/编辑/删除数据库连接配置
  - 启用同步后，本地变更在下次同步时自动上传至云端
  - 新设备配置相同连接后，能完整拉取已有数据
  - 双设备同时修改同一条记录时，时间戳晚者获胜（LWW）
  - 断网时 App 正常工作，网络恢复后自动追赶同步
  - 同步状态在 UI 中可见（图标/通知）

risk_level: medium
```

## Verification Contract

```
verify_steps:
  - check: SQLite 新增 sync_config 和 sync_log 表，不影响现有数据
  - check: PostgreSQL 端 schema 创建脚本正确，支持所有同步模块
  - check: Rust sync engine 能正确检测本地变更并上传
  - check: Rust sync engine 能正确拉取云端变更并合并到本地
  - check: LWW 冲突解决逻辑在测试场景中正确工作
  - check: 设置页面 UI 完整，支持连接测试功能
  - check: 断网场景中 App 不崩溃，同步队列正常排队
  - check: 同步状态图标在侧边栏/顶栏正确显示
```

## Governance Contract

```
approval_gates:
  - 同步引擎核心逻辑完成，需人工审查冲突解决代码
  - 数据库连接信息存储方式确认（SQLite 明文存储，用户已知风险）
  - 设置页面 UI 完成，需人工审查安全性提示是否充分

rollback:
  - 同步功能为可选，关闭同步后完全退回纯本地模式
  - PostgreSQL 数据不影响本地 SQLite，随时可断开
  - Schema 变更通过版本号控制，不升级即可保持原状态

ownership: 本项目开发团队
```

## Scope

| In (包含) | Out (不包含) |
|---|---|
| 任务模块完整同步（tasks, subtasks, tags, task_tags） | 邮件正文和附件同步 |
| 笔记模块完整同步（notes, note_folders, note_tags） | 端到端加密（E2EE） |
| 记账模块完整同步（accounts, categories, transactions, budgets） | 用户认证系统（无密码/多用户） |
| 日历模块完整同步（calendar_events, calendar_subscriptions） | 数据库级 CDC（如 PostgreSQL Logical Replication） |
| 邮件设置同步（email_accounts 配置，不含邮件内容） | 实时 WebSocket 推送 |
| App 内同步配置 UI 页面 | 同步历史审计日志 |
| SQLite 端同步元数据表（sync_config, sync_log） | 数据自动清理/过期策略 |
| PostgreSQL 端 schema 定义与初始化 | 差量二进制同步（仅全量行级 UPSERT） |
| Rust 同步引擎（增量检测、上传、下载、LWW 合并） | |
| 后台定时同步任务 + 即时上传触发 | |
| 同步状态 UI 指示器 | |

## Decisions

| # | Decision | Choice | Rejected Alternatives |
|---|---|---|---|
| 1 | 云端数据库类型 | PostgreSQL（Supabase/Aiven/Render 免费层） | MongoDB（关系型数据不匹配）、Firestore（vendor lock-in 强） |
| 2 | 同步协议 | 自定义 HTTPS REST + PostgreSQL 直连 | Supabase Realtime（平台绑定）、GraphQL（过度）、gRPC（证书复杂） |
| 3 | 变更检测方式 | SQLite Trigger 自动更新 `sync_modified_at` 列 | 全量比对（慢）、WAL 日志解析（复杂、跨平台难） |
| 4 | 冲突解决策略 | 最后写入获胜（LWW），基于 `updated_at` | 手动合并（体验差）、CRDT（实现复杂、存储膨胀）、OT（不适合结构化数据） |
| 5 | 配置存储位置 | SQLite `sync_config` 表，App 内设置页面管理 | 硬编码（违反要求）、配置文件（不易用）、OS Keyring（仅适合密码，不适合连接串） |
| 6 | 云端 schema 策略 | 与 SQLite schema 一一对应，独立建表 | 使用 JSON 列存储整行（丢失查询能力）、使用 Supabase 自动 schema（绑定平台） |
| 7 | 同步触发时机 | 数据变更时立即入队上传 + 后台 60 秒定时拉取 | 仅手动触发（不符合实时要求）、每秒轮询（资源浪费） |
| 8 | 设备识别方式 | 每台设备有唯一 `device_id`（UUID），存储在本地 | 要求用户注册/登录（破坏 local-first）、基于 IP（不稳定） |
| 9 | 连接信息安全等级 | SQLite 明文存储，UI 提示安全风险 | 操作系统密钥管理（用户选择了简单方案）、本地加密文件（需要额外密码） |

## Surface

### A. SQLite 端变更

#### 新增表：`sync_config`

存储用户配置同步连接信息。连接串（PostgreSQL connection string）直接存储在 SQLite 中。

```sql
CREATE TABLE sync_config (
    id TEXT PRIMARY KEY,              -- 'default' 单行配置
    enabled INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL DEFAULT 'supabase',  -- 'supabase' | 'aiven' | 'render' | 'custom'
    connection_string TEXT NOT NULL,   -- PostgreSQL connection string (postgresql://...)
    database_name TEXT NOT NULL,
    last_sync_at TEXT,                -- 上次成功同步时间
    sync_error TEXT,                  -- 上次错误信息
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

#### 新增表：`sync_log`

记录同步历史，用于调试和状态显示。

```sql
CREATE TABLE sync_log (
    id TEXT PRIMARY KEY,
    direction TEXT NOT NULL,          -- 'upload' | 'download'
    table_name TEXT NOT NULL,         -- 同步的表名
    records_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,             -- 'success' | 'error' | 'conflict_resolved'
    error_message TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_sync_log_created ON sync_log(created_at DESC);
```

#### 新增表：`device_info`

本地设备标识，用于多设备追踪。

```sql
CREATE TABLE device_info (
    id TEXT PRIMARY KEY,              -- 'local' 单行
    device_id TEXT NOT NULL UNIQUE,   -- UUID v4，设备唯一标识
    device_name TEXT NOT NULL,        -- 用户可自定义
    created_at TEXT NOT NULL
);
```

#### 各同步表新增列

所有参与同步的表增加同步元数据列（通过 schema migration v3 添加）：

```sql
ALTER TABLE tasks ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
ALTER TABLE tasks ADD COLUMN sync_device_id TEXT;
-- ... 对 subtasks, tags, task_tags, accounts, categories, transactions, budgets,
--     notes, note_folders, note_tags, calendar_events, calendar_subscriptions 同样处理
```

同时为各表添加 Trigger 自动更新 `sync_modified_at`：

```sql
CREATE TRIGGER tasks_sync_touch AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET sync_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;
```

#### 邮件账户设置同步

`email_accounts` 表在 `easywork-mail.db` 中，需要同步其配置（不含邮件内容）：

```sql
-- 在 mail db 中同样添加
ALTER TABLE email_accounts ADD COLUMN sync_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
ALTER TABLE email_accounts ADD COLUMN sync_device_id TEXT;
```

> **注意：** `emails`, `email_attachments`, `mail_sync_state` 等同步状态表不参与跨设备同步。

---

### B. PostgreSQL 端 Schema

云端 PostgreSQL 使用与 SQLite 对应的 schema，通过连接串中的数据库名隔离不同用户数据。每个用户/设备组独立数据库（Supabase 项目免费，天然隔离）。

**初始化脚本**（首次连接时自动执行）：

```sql
-- 设备注册表
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT now()::text,
    created_at TEXT NOT NULL DEFAULT now()::text
);

-- 同步元数据表（记录每个设备每个表的最后同步时间）
CREATE TABLE IF NOT EXISTS sync_state (
    device_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (device_id, table_name)
);

-- 以下为各模块数据表的云端镜像
-- 结构与 SQLite 端一致，增加 device_id 和 sync_modified_at 字段

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    recurrence_rule TEXT,
    recurrence_next TEXT,
    parent_task_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_modified_at TEXT NOT NULL,
    sync_device_id TEXT NOT NULL
);

-- ... (subtasks, tags, task_tags, accounts, categories, transactions, budgets,
--      notes, note_folders, note_tags, calendar_events, calendar_subscriptions,
--      email_accounts 同样定义)

-- 索引
CREATE INDEX IF NOT EXISTS idx_tasks_sync_modified ON tasks(sync_modified_at);
-- ... 各表同样建立 sync_modified_at 索引
```

---

### C. Rust 同步引擎

#### 文件结构

```
src-tauri/src/
  sync/
    mod.rs          -- 模块入口，暴露 sync_upload() 和 sync_download()
    engine.rs       -- 同步核心逻辑
    config.rs       -- 同步配置读写
    postgres.rs     -- PostgreSQL 连接管理（tokio-postgres）
    schema.rs       -- 云端 schema 初始化
```

#### 核心流程

**上传（Upload）：**

1. 读取 `sync_config`，如未启用则跳过
2. 读取 `device_info.device_id`
3. 对每个同步表，查询 `sync_modified_at > sync_config.last_sync_at` 且 `sync_device_id != current_device_id` 已处理的记录
4. 批量 UPSERT 到 PostgreSQL（`ON CONFLICT(id) DO UPDATE`，带 LWW 判断）
5. 更新 `sync_config.last_sync_at`
6. 记录 `sync_log`

**下载（Download）：**

1. 读取 `sync_config` 和 `device_id`
2. 对每个同步表，从 PostgreSQL 查询 `sync_modified_at > 本地最后下载时间` 且 `sync_device_id != 本地 device_id` 的记录
3. 对每条记录应用 LWW 合并：
   - 如果本地不存在该记录 → 直接插入
   - 如果本地存在且云端的 `updated_at > 本地 updated_at` → 覆盖
   - 如果本地 `updated_at >= 云端 updated_at` → 跳过（本地更新）
4. 标记下载记录，更新游标
5. 记录 `sync_log`

**LWW 合并伪代码：**

```rust
async fn merge_row(local: Option<Row>, cloud: Row, table: &str) -> Result<()> {
    match local {
        None => {
            // 本地没有，直接插入云端版本
            insert_local(cloud, table).await?;
        }
        Some(local_row) => {
            if cloud.updated_at > local_row.updated_at {
                // 云端更新，覆盖本地
                upsert_local(cloud, table).await?;
            }
            // 否则跳过，本地更新，后续上传时会覆盖云端
        }
    }
    Ok(())
}
```

#### 后台定时任务

在 `lib.rs` 中启动 tokio 定时任务：

```rust
// 每 60 秒执行一次完整同步循环
#[tokio::task]
async fn sync_loop(db: Arc<tokio::sync::Mutex<Connection>>) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        if is_sync_enabled(&db).await {
            sync_upload(&db).await;
            sync_download(&db).await;
        }
    }
}
```

#### 即时上传触发

当本地数据发生变更时（通过现有 Tauri commands），在 command 结束后触发即时上传：

```rust
// 在 task_create, task_update, task_delete 等 command 末尾
if is_sync_enabled(&app_state.db).await {
    tokio::spawn(async move {
        sync_upload(&app_state.db).await;
    });
}
```

---

### D. 新增 Tauri Commands

| Command | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `sync_config_get` | 无 | `SyncConfig` | 获取当前同步配置 |
| `sync_config_save` | `SyncConfig` | `Result<()>` | 保存同步配置 |
| `sync_config_delete` | 无 | `Result<()>` | 删除同步配置 |
| `sync_test_connection` | 无 | `ConnectionTestResult` | 测试数据库连接 |
| `sync_trigger` | 无 | `SyncResult` | 手动触发同步 |
| `sync_status` | 无 | `SyncStatus` | 获取同步状态信息 |
| `sync_log_get` | `limit: i32` | `Vec<SyncLogEntry>` | 获取同步日志 |

---

### E. 前端设置页面

在现有 `Settings.tsx` 中新增「同步」Tab：

**组件结构：**

```
Settings/
  SyncSettings.tsx          -- 同步设置主面板
  SyncConfigForm.tsx        -- 连接配置表单
  SyncStatusCard.tsx        -- 同步状态显示
  SyncLogViewer.tsx         -- 同步日志查看
```

**UI 布局：**

```
┌─────────────────────────────────────────────┐
│  同步设置                                    │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐    │
│  │  同步状态                            │    │
│  │  ● 已连接  (绿色)                    │    │
│  │  上次同步: 2 分钟前                   │    │
│  │  设备: MacBook Pro                   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  启用同步  [toggle switch]                   │
│                                             │
│  数据库提供商  [Supabase v]                  │
│  连接地址      [postgresql://...]            │
│  数据库名      [my-easywork]                │
│                                             │
│  [测试连接] [保存配置]                       │
│                                             │
│  ⚠️ 连接信息将存储在本地数据库中             │
│                                             │
│  ── 同步日志 ──                              │
│  [SyncLogViewer...]                         │
└─────────────────────────────────────────────┘
```

**关键交互：**
1. Toggle 开关控制同步启用/禁用
2. 选择数据库提供商后，展示对应的帮助链接
3. 「测试连接」按钮尝试连接 PostgreSQL，显示成功/失败
4. 保存配置后立即执行一次完整同步
5. 底部显示最近 10 条同步日志

---

### F. 同步状态指示器

复用现有 `NetworkStatus.tsx` 组件模式，在侧边栏底部或顶栏新增同步状态图标：

| 状态 | 图标 | 颜色 | 说明 |
|---|---|---|---|
| 未配置 | CloudOff | muted | 同步未启用 |
| 同步中 | Loader2 (spin) | brand-500 | 正在同步 |
| 已同步 | Cloud | success | 上次同步 < 5 分钟前 |
| 待同步 | CloudDownload | warning | 有本地变更未上传 |
| 错误 | CloudOff (红色) | destructive | 同步失败 |

---

### G. 新增依赖

**Rust 端：**
- `tokio-postgres = "0.7"` — PostgreSQL 异步客户端
- `tokio-postgres/rustls` — TLS 连接支持

**前端端：**
- 无新增依赖（使用现有 shadcn/ui 组件）

---

## Surface — Files Touched

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src-tauri/Cargo.toml` | 修改 | 添加 `tokio-postgres` 依赖 |
| `src-tauri/src/db.rs` | 修改 | Schema migration v3，添加 sync 相关表和列 |
| `src-tauri/src/lib.rs` | 修改 | 注册 sync commands，启动 sync 后台任务 |
| `src-tauri/src/sync/mod.rs` | **新增** | 同步模块入口 |
| `src-tauri/src/sync/engine.rs` | **新增** | 同步核心引擎 |
| `src-tauri/src/sync/config.rs` | **新增** | 配置读写 |
| `src-tauri/src/sync/postgres.rs` | **新增** | PostgreSQL 连接管理 |
| `src-tauri/src/sync/schema.rs` | **新增** | 云端 schema 初始化 |
| `src-tauri/src/commands.rs` | 修改 | 添加 sync_* Tauri commands |
| `src/features/settings/Settings.tsx` | 修改 | 添加「同步」Tab |
| `src/features/settings/SyncSettings.tsx` | **新增** | 同步设置页面 |
| `src/features/settings/SyncConfigForm.tsx` | **新增** | 配置表单 |
| `src/features/settings/SyncStatusCard.tsx` | **新增** | 状态卡片 |
| `src/features/settings/SyncLogViewer.tsx` | **新增** | 日志查看器 |
| `src/features/sync/syncApi.ts` | **新增** | 同步相关 API 调用 |
| `src/features/sync/useSync.ts` | **新增** | 同步 hooks |
| `src/components/SyncStatusIcon.tsx` | **新增** | 状态图标组件 |
| `src/lib/locales/zh-CN.json` | 修改 | 同步相关中文文案 |
| `src/lib/locales/en-US.json` | 修改 | 同步相关英文文案 |

## Risks & Open Questions

### Risks

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 连接串存储在 SQLite 明文中存在安全风险 | 中 | UI 明确提示；未来可选升级 OS Keyring |
| LWW 冲突解决可能丢失并发修改 | 中 | 适用于个人使用场景；同步日志记录冲突解决 |
| PostgreSQL 免费层有连接数/存储限制 | 低 | Supabase 500MB 对个人数据充足；监控存储使用 |
| 首次全量同步耗时较长（大数据量） | 低 | 分批同步 + 进度提示 |
| 网络不稳定导致同步不一致 | 低 | 幂等 UPSERT + 重试机制 |
| Schema 变更需要同步升级云端结构 | 中 | 自动 schema migration 机制 |

### Open Questions

1. **邮件密码同步策略：** 邮件账户密码存储在 OS Keyring 中，无法直接同步。新设备需要重新输入密码。是否在 UI 中明确提示？
2. **附件文件同步：** 记账模块的收据附件（`receipt_path`）为本地文件路径，不同步文件本身。是否需要在未来支持？
3. **Supabase RLS 策略：** 如果使用 Supabase，是否启用 Row Level Security？当前设计假设用户独享数据库，RLS 非必需。
4. **同步暂停机制：** 是否需要支持临时暂停同步（如数据整理期间）？当前通过启用/禁用 toggle 实现。
5. **Android 同步行为：** 移动端网络条件更不稳定，是否需要调整同步频率？当前统一 60 秒，后续可针对平台调整。
