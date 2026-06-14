# 日志模块增强设计文档

**日期**: 2026-06-14  
**状态**: 已确认  
**目标**: 完善 EasyWork 日志系统，支持完整调用链追踪，帮助排查 Android 端邮箱账号创建失败等问题

---

## 1. 背景与问题

### 当前状态
- 已有基础 `fern` 日志系统，输出到文件和控制台
- 邮箱模块部分操作有日志（`add_account`、`test_connection`）
- **记账模块完全没有日志记录**
- 前端日志页面显示演示数据，未连接真实日志

### 核心问题
- Android 端新建邮箱账号失败时，无法定位问题源
- 缺少完整调用链追踪
- 日志分散，无法统一查看和导出

---

## 2. 解决方案

### 方案选择：SQLite + 异步批量写入

```
┌─────────────────────────────────────────────────────────────┐
│                         前端 (React)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 日志页面：过滤/分页/导出/查看调用链详情               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Rust 后端 (Tauri)                       │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ mail 模块    │    │ accounting   │    │ note 模块    │   │
│  │ - add_account│    │ - txn_create │    │ - create     │   │
│  │ - sync       │    │ - category   │    │ - update     │   │
│  │ - send_mail  │    │ - budget     │    │ - delete     │   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘   │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │ log::info!()                  │
│                             ▼                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Logger (fern + channel)                 │   │
│  │  ┌─────────────┐  ┌─────────────────────────────┐  │   │
│  │  │ File Output │  │ Async Channel → Batch Writer│  │   │
│  │  │ (完整日志)   │  │ (SQLite 批量写入)           │  │   │
│  │  └─────────────┘  └─────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  SQLite 文件    │                      │
│                    │  app_logs 表    │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 数据库设计

### 3.1 新日志表结构

```sql
-- 应用日志表（替代原有 logs）
CREATE TABLE app_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id    TEXT,           -- 调用链追踪 ID
    level       TEXT NOT NULL,  -- DEBUG/INFO/WARN/ERROR
    module      TEXT NOT NULL,  -- 模块名：mail/accounting/note/settings/system
    action      TEXT,           -- 操作：add_account/sync/send_mail/txn_create
    status      TEXT,           -- 状态：START/SUCCESS/FAILED
    params      TEXT,           -- JSON 格式的参数（脱敏）
    result      TEXT,           -- JSON 格式的结果摘要
    error_msg   TEXT,           -- 错误信息
    duration_ms INTEGER,        -- 耗时（毫秒）
    source_file TEXT,           -- 源文件名
    source_line INTEGER,        -- 源文件行号
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_app_logs_created ON app_logs(created_at DESC);
CREATE INDEX idx_app_logs_module ON app_logs(module);
CREATE INDEX idx_app_logs_level ON app_logs(level);
CREATE INDEX idx_app_logs_trace ON app_logs(trace_id);
CREATE INDEX idx_app_logs_action ON app_logs(module, action);
```

### 3.2 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| trace_id | TEXT | 调用链 ID，关联同一操作的多条日志 | "a1b2c3d4" |
| level | TEXT | 日志级别 | "INFO", "ERROR" |
| module | TEXT | 模块名 | "mail", "accounting" |
| action | TEXT | 具体操作 | "add_account", "sync" |
| status | TEXT | 操作状态 | "START", "SUCCESS", "FAILED" |
| params | TEXT | JSON 参数（脱敏） | `{"email":"a***@gmail.com","imap_port":993}` |
| result | TEXT | JSON 结果摘要 | `{"account_id":1,"folders_count":5}` |
| error_msg | TEXT | 错误详情 | "IMAP 连接超时" |
| duration_ms | INTEGER | 耗时毫秒 | 1523 |
| source_file | TEXT | 源文件 | "mail.rs" |
| source_line | INTEGER | 行号 | 127 |

---

## 4. 后端架构

### 4.1 日志写入流程

```rust
// 1. 业务代码调用
let trace_id = logging::trace_id();
log::info!("[{}] add_account START email={}", trace_id, email);

// 2. 自定义 fern appender 捕获日志
// 3. 通过 mpsc channel 发送到后台线程
// 4. 后台线程批量写入 SQLite（每 500ms 或满 100 条）
```

### 4.2 核心组件

| 组件 | 职责 |
|------|------|
| `logging.rs` | 初始化 fern，配置双输出（文件 + channel） |
| `LogWriter` | 后台线程，消费 channel，批量写入 SQLite |
| `LogEntry` | 日志条目结构体 |
| `parse_log_message()` | 解析 log 消息，提取 module/action/status/params |

### 4.3 日志消息格式约定

为便于解析，业务代码的 log 消息需遵循格式：

```
[{trace_id}] {action} {status} {json_params}
```

示例：
```
[a1b2c3d4] add_account START {"email":"a***@gmail.com","imap_host":"imap.gmail.com"}
[a1b2c3d4] add_account SUCCESS {"account_id":1,"duration_ms":1523}
[a1b2c3d4] add_account FAILED {"error":"IMAP 连接超时"}
```

---

## 5. 日志颗粒度定义

### 5.1 邮箱模块 (mail)

| 操作 | START 记录 | SUCCESS 记录 | FAILED 记录 |
|------|------------|--------------|-------------|
| `add_account` | email, imap_host, imap_port, smtp_host, smtp_port | account_id, duration_ms | error, error_type |
| `test_connection` | imap_host, imap_port, email | duration_ms | error, error_category |
| `sync_account` | account_id, period_days | folders_count, messages_new, duration_ms | error, failed_folders |
| `send_mail` | account_id, to_count, cc_count, bcc_count, has_attachment | message_id, duration_ms | error, stage (connect/send/record) |
| `autodiscover` | email, domain | imap_host, smtp_host, source | error, tried_urls |
| `delete_account` | account_id | duration_ms | error |
| `fetch_messages` | account_id, folder_id, page | returned_count, total | error |

### 5.2 记账模块 (accounting)

| 操作 | START 记录 | SUCCESS 记录 | FAILED 记录 |
|------|------------|--------------|-------------|
| `txn_create` | type, amount, category | transaction_id | error |
| `txn_update` | id, changed_fields | affected_rows | error |
| `txn_delete` | id | affected_rows | error |
| `category_create` | name, type | category_id | error |
| `budget_create` | category, amount, year, month | budget_id | error |
| `budget_save_all` | year, month, items_count | affected_count | error |

### 5.3 笔记模块 (note)

| 操作 | START 记录 | SUCCESS 记录 | FAILED 记录 |
|------|------------|--------------|-------------|
| `create` | title, folder_id | note_id | error |
| `update` | id, changed_fields | affected_rows | error |
| `delete` | id | affected_rows | error |

### 5.4 设置模块 (settings)

| 操作 | START 记录 | SUCCESS 记录 | FAILED 记录 |
|------|------------|--------------|-------------|
| `set_config` | key, new_value | old_value | error |
| `get_config` | key | value (truncated) | error |

---

## 6. 前端功能

### 6.1 日志页面

```
┌────────────────────────────────────────────────────────────────┐
│  系统日志                                          [导出] [清空] │
├────────────────────────────────────────────────────────────────┤
│  过滤: [模块 ▼] [级别 ▼] [时间范围 ▼] [trace_id: ____] [搜索]   │
├────────────────────────────────────────────────────────────────┤
│  统计: 今天 127 条 │ 错误 3 条 │ 警告 12 条                      │
├────────────────────────────────────────────────────────────────┤
│  ▼ 2026-06-14 10:23:45                                         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ [INFO] mail │ add_account │ START                        │ │
│  │ trace: a1b2c3d4 │ 参数: email=a***@gmail.com             │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ [ERROR] mail │ add_account │ FAILED          1523ms      │ │
│  │ trace: a1b2c3d4 │ 错误: IMAP 连接超时                    │ │
│  │ [展开调用链]                                             │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ...                                                          │
├────────────────────────────────────────────────────────────────┤
│  共 127 条 │ 第 1/3 页 │ < 1 2 3 >                             │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 功能清单

| 功能 | 描述 |
|------|------|
| 实时查看 | 显示最近日志，自动刷新（可关闭） |
| 过滤 | 按模块、级别、时间范围、trace_id、关键词 |
| 调用链追踪 | 点击 trace_id 展开同一调用链的所有日志 |
| 详情查看 | 点击日志条目展开完整 params/result |
| 导出 | 导出为 JSON 或纯文本文件 |
| 清空 | 清空所有日志（需确认） |
| 统计 | 显示今日日志数、错误数、警告数 |

### 6.3 Android 端适配

- 日志页面在移动端正常显示
- 导出功能使用 Tauri 的文件保存 API
- 支持分享导出文件（邮件/微信等）

---

## 7. 自动清理策略

### 7.1 清理规则

- **时间策略**: 保留最近 7 天的日志
- **数量策略**: 最多保留 10000 条（按 created_at 排序删除最旧的）

### 7.2 清理时机

- 应用启动时执行一次
- 每次写入后检查（如果超过阈值）

### 7.3 清理实现

```sql
-- 按时间清理
DELETE FROM app_logs WHERE created_at < datetime('now', '-7 days');

-- 按数量清理
DELETE FROM app_logs WHERE id NOT IN (
    SELECT id FROM app_logs ORDER BY created_at DESC LIMIT 10000
);
```

---

## 8. 性能考虑

### 8.1 异步写入

- 日志先写入内存 channel（无阻塞）
- 后台线程批量写入 SQLite（每 500ms 或满 100 条）
- 避免日志写入影响业务性能

### 8.2 参数脱敏

- 密码字段：完全隐藏
- 邮箱地址：显示首尾字符，如 `a***@gmail.com`
- 其他敏感信息：根据字段名自动脱敏

### 8.3 数据库优化

- 使用 WAL 模式（已配置）
- 批量 INSERT 而非单条插入
- 合理索引避免全表扫描

---

## 9. 实现范围

### 9.1 后端 (Rust)

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/db/migrations/V5__app_logs.sql` | 新增 app_logs 表和索引 |
| `src-tauri/src/logging.rs` | 添加 channel appender，启动 LogWriter 线程 |
| `src-tauri/src/log_writer.rs` | 新增：后台日志写入器 |
| `src-tauri/src/commands/log.rs` | 新增：日志查询/导出/清空 IPC 命令 |
| `src-tauri/src/commands/mail.rs` | 添加详细日志（add_account/sync/send_mail 等） |
| `src-tauri/src/commands/accounting.rs` | 添加详细日志（txn_create/category_create 等） |
| `src-tauri/src/commands/note.rs` | 添加详细日志 |
| `src-tauri/src/commands/settings.rs` | 添加详细日志 |
| `src-tauri/src/commands/autoconfig.rs` | 添加详细日志 |

### 9.2 前端 (React)

| 文件 | 修改内容 |
|------|----------|
| `src/routes/logs.tsx` | 重写：连接真实日志，添加过滤/分页/导出 |
| `src/lib/log-ipc.ts` | 新增：日志相关 IPC 调用封装 |
| `shared/src/types/log.ts` | 新增：日志类型定义 |

---

## 10. 测试计划

### 10.1 单元测试

- 日志解析函数：验证各种格式的日志消息能正确解析
- 参数脱敏：验证敏感字段被正确隐藏

### 10.2 集成测试

- 完整流程：调用 add_account → 检查 app_logs 表有对应记录
- 调用链追踪：验证同一 trace_id 的多条日志能正确关联

### 10.3 手动测试

- Android 端新建邮箱账号，验证日志完整记录
- 前端日志页面：过滤/分页/导出功能
- 大量日志时的性能表现

---

## 11. 后续扩展

- 日志级别动态调整（开发时 DEBUG，生产时 INFO）
- 错误日志告警（连续错误时通知用户）
- 日志分析（错误趋势图、高频错误统计）
- 远程日志上报（可选，用于收集崩溃报告）
