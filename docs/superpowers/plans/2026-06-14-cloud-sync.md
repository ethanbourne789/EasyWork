---
title: 网络同步模块实现计划
description: 基于 Supabase 的个人多设备实时同步实现计划
date: 2026-06-14
tags:
  - EasyWork
  - sync
  - supabase
  - plan
  - tauri
  - react
status: draft
---

# 网络同步模块实现计划

> 基于设计文档 `2026-06-14-cloud-sync-design.md` 制定

---

## Phase 1：基础设施（预计 2-3 天）

### Task 1.1：搭建 Supabase 项目
- [ ] 在 supabase.com 创建项目
- [ ] 记录项目 URL、anon key、service_role key
- [ ] 配置环境变量（.env 文件）

### Task 1.2：编写 Supabase Migration 文件
- [ ] `000_init_auth.sql` - 认证配置
- [ ] `001_accounting.sql` - 记账表（transactions, categories, budgets, import_logs）
- [ ] `002_sports.sql` - 运动表（sports_records）
- [ ] `003_stock.sql` - 股票表（stock_watchlist, stock_trades, stock_alerts）
- [ ] `004_mail_settings.sql` - 邮件设置表（mail_accounts, mail_folders, mail_signatures, mail_contacts, mail_contact_groups）
- [ ] `005_notes.sql` - 笔记表（notes, note_folders）
- [ ] `006_calendar.sql` - 日历表（calendars）
- [ ] `007_tasks.sql` - 任务表（tasks, timelines）
- [ ] `008_settings.sql` - 设置表（settings, app_config）
- [ ] `009_realtime.sql` - Realtime 订阅配置

### Task 1.3：执行 Migration
- [ ] 在 Supabase Dashboard 执行 SQL 或 CLI 执行
- [ ] 验证表结构和 RLS 策略

### Task 1.4：本地 SQLite 变更追踪字段
- [ ] 编写迁移脚本，为所有需要同步的表添加 `sync_version` 和 `sync_status` 字段
- [ ] 创建 `sync_global_version` 表
- [ ] 更新 `schema.rs` 中的表创建逻辑

### Task 1.5：Rust 端 Supabase 客户端
- [ ] 添加依赖：`reqwest`、`tokio-tungstenite`、`serde_json`
- [ ] 创建 `src-tauri/src/sync/client.rs`
- [ ] 实现 Supabase HTTP 客户端（REST API 封装）
- [ ] 实现 WebSocket 客户端（Realtime 订阅）

---

## Phase 2：核心同步引擎（预计 3-4 天）

### Task 2.1：认证模块
- [ ] 创建 `src-tauri/src/sync/auth.rs`
- [ ] 实现注册/登录 API
- [ ] 实现 JWT token 存储和刷新
- [ ] 实现退出登录

### Task 2.2：变更追踪模块
- [ ] 创建 `src-tauri/src/sync/changelog.rs`
- [ ] 实现 dirty 记录查询
- [ ] 实现 sync_version 递增逻辑
- [ ] 实现软删除（sync_status = 'deleting'）

### Task 2.3：同步引擎核心
- [ ] 创建 `src-tauri/src/sync/engine.rs`
- [ ] 实现上传流程（本地 → 云端）
- [ ] 实现下载流程（云端 → 本地）
- [ ] 实现冲突处理（last-write-wins）
- [ ] 实现离线队列

### Task 2.4：网络检测
- [ ] 实现网络状态检测（在线/离线）
- [ ] 网络恢复时自动触发同步

### Task 2.5：模块入口
- [ ] 创建 `src-tauri/src/sync/mod.rs`
- [ ] 初始化同步引擎
- [ ] 在 `main.rs` 中注册模块

---

## Phase 3：模块集成（预计 2-3 天）

### Task 3.1：数据层接入同步引擎
- [ ] 修改 `src-tauri/src/db/ops/` 中的 INSERT/UPDATE/DELETE 操作
- [ ] 每次操作后更新 sync_status 和 sync_version
- [ ] 涉及模块：accounting, sports, stock, notes, calendar, tasks, settings

### Task 3.2：前端 IPC 接口
- [ ] 创建 `src/lib/sync-ipc.ts`
- [ ] 定义登录/注册/同步状态等接口
- [ ] 在 Rust 端实现对应的 command

### Task 3.3：前端同步状态管理
- [ ] 创建 `src/lib/sync-store.ts`（Zustand）
- [ ] 管理同步状态（已同步/同步中/离线/失败）
- [ ] 管理用户登录状态

### Task 3.4：同步状态指示器
- [ ] 在应用顶部状态栏添加同步状态图标
- [ ] 根据同步状态显示不同图标和颜色

### Task 3.5：设置页面云同步选项卡
- [ ] 在设置模块添加"云同步"选项卡
- [ ] 登录/注册表单
- [ ] 同步状态显示
- [ ] 手动同步按钮
- [ ] 最后同步时间显示
- [ ] 退出登录按钮

---

## Phase 4：测试与优化（预计 2-3 天）

### Task 4.1：单元测试
- [ ] 同步引擎单元测试
- [ ] 变更追踪单元测试
- [ ] 冲突处理单元测试

### Task 4.2：集成测试
- [ ] 双端同步测试（Windows + Android）
- [ ] 离线/在线切换测试
- [ ] 冲突场景测试

### Task 4.3：性能优化
- [ ] 批量同步优化
- [ ] 增量拉取优化
- [ ] WebSocket 重连机制

### Task 4.4：错误处理
- [ ] 网络错误处理
- [ ] 认证失败处理
- [ ] 同步失败重试机制

---

## 任务依赖关系

```
Phase 1
  ├─ Task 1.1 → Task 1.2 → Task 1.3
  ├─ Task 1.4
  └─ Task 1.5

Phase 2（依赖 Phase 1）
  ├─ Task 2.1（依赖 Task 1.5）
  ├─ Task 2.2（依赖 Task 1.4）
  ├─ Task 2.3（依赖 Task 2.1, 2.2）
  ├─ Task 2.4（依赖 Task 2.3）
  └─ Task 2.5（依赖 Task 2.3）

Phase 3（依赖 Phase 2）
  ├─ Task 3.1（依赖 Task 2.3）
  ├─ Task 3.2（依赖 Task 2.1）
  ├─ Task 3.3（依赖 Task 3.2）
  ├─ Task 3.4（依赖 Task 3.3）
  └─ Task 3.5（依赖 Task 3.3）

Phase 4（依赖 Phase 3）
  ├─ Task 4.1
  ├─ Task 4.2
  ├─ Task 4.3
  └─ Task 4.4
```

---

## 预计总工时

- Phase 1：2-3 天
- Phase 2：3-4 天
- Phase 3：2-3 天
- Phase 4：2-3 天
- **总计：9-13 天**

---

## 风险点

1. **Supabase Realtime 限制**：免费计划 200 并发连接，个人使用足够，但需注意 WebSocket 连接稳定性
2. **冲突处理**：v1 采用 last-write-wins，可能丢失数据，后续可考虑引入冲突解决 UI
3. **离线同步**：离线时间过长可能导致数据冲突增多，需测试极端场景
4. **Android 构建**：Tauri Android 仍在 beta，可能遇到构建问题

---

## 下一步

确认计划后，从 **Phase 1 Task 1.1** 开始执行：搭建 Supabase 项目。
