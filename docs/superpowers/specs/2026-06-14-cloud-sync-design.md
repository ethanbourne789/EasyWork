---
title: 网络同步模块设计
description: 基于 Supabase 的个人多设备实时同步方案
date: 2026-06-14
tags:
  - EasyWork
  - sync
  - supabase
  - design
  - tauri
  - react
status: draft
---

# 网络同步模块设计（EasyWork · cloud-sync）

> [!info] 一句话定位
> **个人多设备实时同步**：基于 Supabase (PostgreSQL) 实现 Windows 与 Android 之间的数据实时同步，覆盖记账、运动、股票、邮件设置、笔记、日历、任务等全部模块。

---

## 一、目标与非目标

### 1.1 目标
- 同一用户在 Windows 和 Android 设备间实时同步所有业务数据
- 使用第三方云服务（Supabase），免费额度满足个人使用
- 本地 SQLite 保持离线可用，联网后自动同步
- 信任云服务安全措施，不做端到端加密

### 1.2 非目标（v1 不做）
- 多用户/家庭共享
- 端到端加密
- 自建服务器支持
- 文件级附件同步（邮件附件仍走 IMAP）
- 冲突解决 UI（v1 采用 last-write-wins）

---

## 二、决策摘要

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 云数据库 | Supabase (PostgreSQL) |
| 2 | 同步策略 | 实时同步（Supabase Realtime） |
| 3 | 离线策略 | 本地优先，联网后自动增量同步 |
| 4 | 冲突策略 | Last-write-wins（以 updated_at 为准） |
| 5 | 认证方式 | Supabase Auth（邮箱注册） |
| 6 | 数据隐私 | 信任云服务安全，不做端到端加密 |
| 7 | 成本 | 免费额度（500MB 数据库） |
| 8 | 同步粒度 | 按表级行级同步，非全量 |

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────┐     ┌─────────────────┐
│  Windows (Tauri) │     │ Android (Tauri)  │
│  ┌───────────┐  │     │  ┌───────────┐   │
│  │ Local     │  │     │  │ Local     │   │
│  │ SQLite    │  │     │  │ SQLite    │   │
│  └─────┬─────┘  │     │  └─────┬─────┘   │
│        │        │     │        │          │
│  ┌─────▼─────┐  │     │  ┌─────▼─────┐   │
│  │ Sync      │  │     │  │ Sync      │   │
│  │ Engine    │  │     │  │ Engine    │   │
│  └─────┬─────┘  │     │  └─────┬─────┘   │
└────────┼────────┘     └────────┼──────────┘
         │                       │
         │   HTTPS / WebSocket   │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │  Supabase   │
              │  ┌───────┐  │
              │  │ Auth  │  │
              │  ├───────┤  │
              │  │ Postgres│ │
              │  ├───────┤  │
              │  │Realtime│ │
              │  ├───────┤  │
              │  │Storage│  │
              │  └───────┘  │
              └─────────────┘
```

### 3.2 同步引擎（Rust 端）

同步引擎在 `src-tauri/src/sync/` 模块中实现，核心职责：

1. **变更追踪**：本地 SQLite 每张需要同步的表增加 `sync_version` 和 `sync_status` 字段
2. **增量上传**：将本地 `sync_status = 'dirty'` 的记录推送到 Supabase
3. **增量下载**：通过 Supabase Realtime 监听远端变更，拉取到本地
4. **冲突处理**：比较 `updated_at`，较新者胜出

### 3.3 文件结构

```
src-tauri/src/sync/
├── mod.rs              # 模块入口，初始化 Supabase 客户端
├── client.rs           # Supabase HTTP/WebSocket 客户端封装
├── engine.rs           # 同步引擎核心（上传/下载/冲突处理）
├── schema.rs           # 远端表结构定义（Supabase SQL migration）
├── changelog.rs        # 本地变更追踪（dirty 标记、版本号）
└── auth.rs             # 用户认证（注册/登录/token 管理）

src/lib/sync/
├── sync-ipc.ts         # 前端 IPC 接口定义
└── sync-store.ts       # 前端同步状态管理（Zustand）
```

---

## 四、需要同步的内容

### 4.1 同步范围总览

| 模块 | 同步表 | 说明 |
|------|--------|------|
| 记账 | `transactions`, `categories`, `budgets`, `import_logs` | 账单、分类、预算、导入记录 |
| 运动 | `sports_records` | 运动记录 |
| 股票 | `stock_watchlist`, `stock_trades`, `stock_alerts` | 自选股、交易记录、价格预警 |
| 邮件 | `mail_accounts`, `mail_folders`, `mail_signatures` | 邮箱设置、文件夹配置、签名（**不同步邮件正文**） |
| 笔记 | `notes`, `note_folders` | 笔记内容和文件夹结构 |
| 日历 | `calendars` | 日程安排 |
| 任务 | `tasks`, `timelines` | 看板和任务时间线 |
| 设置 | `settings`, `app_config` | 应用配置和偏好设置 |
| 联系人 | `mail_contacts`, `mail_contact_groups` | 邮件联系人 |

### 4.2 不同步的内容

| 内容 | 原因 |
|------|------|
| 邮件正文 (`mail_messages`) | 邮件数据量大，通过 IMAP 协议从邮件服务器获取 |
| 邮件附件 (`mail_attachments`) | 同上，附件走 IMAP |
| 日志 (`logs`, `app_logs`) | 每台设备独立的运行日志，无需同步 |
| 待发送操作 (`mail_pending_ops`) | 设备本地的操作队列，完成后自然体现在数据中 |

### 4.3 各模块详细字段

#### 记账模块

**transactions** — 交易记录
- 全量同步：id, type, amount, category, subcategory, note, date, created_at, updated_at

**categories** — 收支分类
- 全量同步：id, name, type, icon, color, parent_id, sort_order, created_at
- 注意：默认分类需做幂等处理（按 name+type 去重）

**budgets** — 预算
- 全量同步：id, category, amount, year, month, created_at, updated_at

#### 运动模块

**sports_records** — 运动记录
- 全量同步：id, type, duration, distance, calories, date, note, created_at

#### 股票模块

**stock_watchlist** — 自选股
- 全量同步：id, symbol, name, market_type, sort_order, created_at, updated_at

**stock_trades** — 交易记录
- 全量同步：id, symbol, trade_type, price, quantity, fee, traded_at, note, created_at, updated_at

**stock_alerts** — 价格预警
- 全量同步：id, symbol, market_type, alert_type, target_value, is_enabled, cooldown_minutes, last_triggered_at, trigger_count, note, created_at, updated_at

#### 邮件设置

**mail_accounts** — 邮箱账号配置
- 同步字段：id, email, provider, imap_host, imap_port, smtp_host, smtp_port, username, use_tls, sync_interval_secs, sync_period_days, color, is_default, notifications_enabled, display_name
- **不同步**：encrypted_password（每台设备独立配置）

**mail_folders** — 邮件文件夹
- 全量同步

**mail_signatures** — 邮件签名
- 全量同步

#### 笔记模块

**notes** — 笔记
- 全量同步：id, title, content, folder_id, tags, created_at, updated_at

**note_folders** — 笔记文件夹
- 全量同步：id, name, parent_id

#### 日历模块

**calendars** — 日程
- 全量同步：id, title, description, start_at, end_at, type, color, is_all_day, created_at

#### 任务模块

**tasks** — 任务/看板
- 全量同步：id, title, description, status, priority, urgency, difficulty, assignee, start_time, due_time, completed_at, rating, created_at, updated_at

**timelines** — 时间线
- 全量同步：id, task_id, node_desc, created_at

#### 设置

**settings** — 设置键值对
- 全量同步：key, value
- 注意：部分设置项可能是设备特有的（如窗口大小），需标记哪些 key 需要同步

**app_config** — 应用配置
- 全量同步：key, value

---

## 五、本地 SQLite 变更追踪

### 5.1 新增字段

每张需要同步的表增加以下字段：

```sql
ALTER TABLE {table} ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE {table} ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean'
    CHECK(sync_status IN ('clean', 'dirty', 'deleting'));
```

- `sync_version`：每次修改递增，用于增量同步
- `sync_status`：
  - `clean` — 已与云端一致
  - `dirty` — 本地有修改，待上传
  - `deleting` — 本地已删除，待通知云端

### 5.2 变更触发

在 Rust 端的数据库操作层（`src-tauri/src/db/ops/`）中，每次 INSERT/UPDATE/DELETE 操作时：
- INSERT/UPDATE：设置 `sync_status = 'dirty'`, `sync_version = sync_version + 1`
- DELETE：改为软删除，设置 `sync_status = 'deleting'`

### 5.3 全局版本向量

维护一个 `sync_global_version` 表，记录每张表的最后同步版本：

```sql
CREATE TABLE IF NOT EXISTS sync_global_version (
    table_name TEXT PRIMARY KEY,
    last_synced_version INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT
);
```

---

## 六、Supabase 远端设计

### 6.1 远端表结构

远端 PostgreSQL 表结构与本地 SQLite 基本一致，但增加以下字段：

```sql
-- 每张表增加
device_id TEXT NOT NULL DEFAULT '',   -- 最后修改的设备标识
```

### 6.2 RLS 策略

所有表启用 Row Level Security，用户只能访问自己的数据：

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns all" ON {table}
    FOR ALL
    USING (auth.uid() = user_id);
```

每张表增加 `user_id UUID NOT NULL REFERENCES auth.users(id)` 字段。

### 6.3 Realtime 订阅

为需要同步的表启用 Supabase Realtime：

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE {table};
```

客户端通过 WebSocket 订阅变更事件，实现实时推送。

### 6.4 Supabase Migration 文件

远端数据库的 DDL 放在 `src-tauri/migrations/supabase/` 目录下，按模块分文件：

```
src-tauri/migrations/supabase/
├── 000_init_auth.sql        # 认证配置
├── 001_accounting.sql       # 记账相关表
├── 002_sports.sql           # 运动相关表
├── 003_stock.sql            # 股票相关表
├── 004_mail_settings.sql    # 邮件设置相关表
├── 005_notes.sql            # 笔记相关表
├── 006_calendar.sql         # 日历相关表
├── 007_tasks.sql            # 任务相关表
├── 008_settings.sql         # 设置相关表
└── 009_realtime.sql         # Realtime 订阅配置
```

---

## 七、同步流程

### 7.1 上传流程（本地 → 云端）

```
1. 查询本地 sync_status = 'dirty' 或 'deleting' 的记录
2. 批量 POST/PUT/DELETE 到 Supabase REST API
3. 成功后更新 sync_status = 'clean'，记录 last_synced_at
4. 失败时保留 dirty 状态，下次重试
```

### 7.2 下载流程（云端 → 本地）

```
1. 通过 Supabase Realtime 订阅变更事件
2. 收到变更通知后，通过 REST API 拉取最新数据
3. 与本地数据合并（last-write-wins 策略）
4. 更新本地 sync_status = 'clean'
```

### 7.3 冲突处理

v1 采用 Last-Write-Wins 策略：
- 比较 `updated_at` 字段，较新者胜出
- 如果 `updated_at` 相同，比较 `sync_version`，较大者胜出
- 不弹出冲突提示，静默合并

### 7.4 离线队列

离线时所有修改记录在本地 SQLite（sync_status = 'dirty'），联网后：
1. 检测网络恢复
2. 先上传所有 dirty 记录
3. 再拉取云端最新数据
4. 执行合并

---

## 八、认证流程

### 8.1 注册/登录

```
1. 用户在设置页面输入邮箱和密码
2. 调用 Supabase Auth API 注册/登录
3. 获取 JWT token，存储在本地安全存储
4. 首次登录后执行全量同步
```

### 8.2 Token 管理

- JWT token 存储在本地（Windows: 加密文件; Android: EncryptedSharedPreferences）
- Token 过期前自动刷新
- 支持退出登录（清除本地 token，保留本地数据）

---

## 九、前端集成

### 9.1 同步状态指示器

在应用顶部状态栏显示同步状态：
- 已同步 ✓
- 同步中 ⟳
- 离线 ○
- 同步失败 ✗

### 9.2 设置页面

在设置模块中增加"云同步"选项卡：
- 登录/注册
- 同步状态显示
- 手动同步按钮
- 最后同步时间
- 退出登录

---

## 十、依赖项

### Rust 端（Cargo.toml）

```toml
# Supabase 客户端
supabase-rs = "0.8"        # 或 reqwest + 手动封装
tokio-tungstenite = "0.21"  # WebSocket for Realtime
```

### 前端（package.json）

```json
{
  "@supabase/supabase-js": "^2.x"
}
```

---

## 十一、Supabase 免费额度评估

| 资源 | 免费额度 | 预估使用量 | 是否充足 |
|------|----------|------------|----------|
| 数据库空间 | 500 MB | ~50 MB（个人数据） | 充足 |
| 存储 | 1 GB | 不需要（邮件附件走 IMAP） | 充足 |
| 流量 | 2 GB/月 | ~200 MB/月 | 充足 |
| Realtime 连接 | 200 并发 | 2（两台设备） | 充足 |
| Auth MAU | 50,000 | 1 | 充足 |

---

## 十二、实施阶段

### Phase 1：基础设施
- 搭建 Supabase 项目，编写 migration 文件
- 实现 Rust 端 Supabase 客户端和认证模块
- 本地 SQLite 增加 sync_version/sync_status 字段

### Phase 2：核心同步
- 实现同步引擎（上传/下载/合并）
- 实现 Realtime 订阅
- 实现离线队列和网络检测

### Phase 3：模块集成
- 各模块数据层接入同步引擎
- 前端同步状态指示器
- 设置页面云同步选项卡

### Phase 4：测试与优化
- 双端同步压力测试
- 冲突场景测试
- 离线/在线切换测试
- 性能优化（批量同步、增量拉取）
