# EasyWork — 综合设计文档（Design3 合并版）

> 版本：3.0.0 | 日期：2026-07-01 | 状态：**待审阅**

---

## 修订历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 3.0.0 | 2026-07-01 | 合并 Design2（完整架构）与 Mail-Design3（邮件模块），填补缺口，统一输出 |

---

## 目录

1. [项目概述](#1-项目概述)
2. [设计原则与约束](#2-设计原则与约束)
3. [技术栈](#3-技术栈)
4. [系统架构](#4-系统架构)
5. [数据模型与数据库](#5-数据模型与数据库)
6. [邮件模块（重点）](#6-邮件模块重点)
7. [功能模块清单](#7-功能模块清单)
8. [UI/UX 与响应式布局](#8-uiux-与响应式布局)
9. [工作流设计](#9-工作流设计)
10. [测试策略](#10-测试策略)
11. [部署与发布](#11-部署与发布)
12. [附录](#12-附录)

---

## 1. 项目概述

### 1.1 产品定位
EasyWork 是一款面向个人和小团队的桌面工作效率工具，核心功能包括：

- **邮件管理**：IMAP/SMTP 多账户收发、搜索、HTML 渲染
- **日历**：日/周/月视图，拖拽事件
- **任务（Todo）**：看板/列表视图，子任务，截止日期
- **笔记**：富文本编辑，Markdown 支持
- **联系人**：分组管理，邮件快捷操作
- **天气**：本地天气信息集成

### 1.2 技术目标
- 跨平台：Windows / macOS / Linux
- 启动时间 < 2s（冷启动）
- 邮件同步延迟 < 5s（IDLE 模式）
- 离线可用，网络恢复后自动同步
- 单元测试覆盖率 > 70%

### 1.3 范围约束（YAGNI）
本设计文档覆盖**第一版（MVP）**所需功能，不包含：
- 邮件规则/过滤器
- 日历订阅（iCal）
- 任务协作/共享
- 多语言国际化（i18n）
- 插件系统

---

## 2. 设计原则与约束

### 2.1 架构原则
| 原则 | 说明 |
|------|------|
| Clean Architecture | 依赖方向：UI → Application → Domain → Infrastructure（Domain 不依赖任何外层） |
| Feature-first 目录结构 | 按功能模块（邮件、日历、任务）组织代码，而非按技术层次 |
| Repository 模式 | Domain 层定义 Repository 接口，Infrastructure 层提供实现 |
| EventBus 解耦 | 模块间通信通过事件总线，避免直接依赖 |
| 单向数据流 | UI 状态由 ViewModel 管理，通过 Stream 单向流动 |

### 2.2 技术约束
| 约束 | 决策 |
|------|------|
| UI 框架 | Flutter Desktop |
| 状态管理 | Riverpod（手动 Provider，无代码生成） |
| 不可变模型 | freezed + json_serializable（允许代码生成） |
| 本地数据库 | SQLite（drift/moor） |
| 邮件协议 | IMAP/SMTP（enough_mail 库） |
| 平台降级 | 功能不可用时优雅降级，不崩溃 |

---

## 3. 技术栈

### 3.1 核心依赖

| 类别 | 库 | 版本（参考） | 用途 |
|------|-----|-------------|------|
| UI 框架 | flutter | SDK | 跨平台桌面 UI |
| 状态管理 | flutter_riverpod | ^2.4.0 | 手动 Provider，无 codegen |
| 不可变模型 | freezed | ^2.4.0 | 数据类生成 |
| 序列化 | json_serializable | ^6.7.0 | JSON 序列化 |
| 本地数据库 | drift (moor) | ^2.14.0 | SQLite ORM |
| 邮件协议 | enough_mail | ^2.0.0 | IMAP/SMTP/MIME 解析 |
| 事件总线 | event_bus | ^2.0.0 | 模块间通信 |
| 日志 | logger | ^2.0.0 | 结构化日志 |
| HTTP 客户端 | dio | ^5.4.0 | REST API 调用 |
| 路由 | go_router | ^12.0.0 | 声明式路由 |
| 测试 | mockito | ^5.4.0 | Mock 生成 |
| 测试 | flutter_test | SDK | 单元/Widget 测试 |
| 集成测试 | integration_test | SDK | 端到端测试 |

### 3.2 开发工具

| 工具 | 用途 |
|------|------|
| build_runner | freezed/drift 代码生成 |
| very_good_cli | 项目脚手架（可选） |
| dart_code_metrics | 代码质量检查 |
| flutter_lints | 代码规范 |

---

## 4. 系统架构

### 4.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                           │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐     │
│  │ Screens │ │ Widgets  │ │ Dialogs│ │ ViewModels│     │
│  └────┬────┘ └────┬─────┘ └───┬────┘ └─────┬────┘     │
│       │           │           │             │           │
├───────┴───────────┴───────────┴─────────────┴───────────┤
│                  Application Layer                      │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ Use Cases    │ │ DTOs         │ │ Service Agents │  │
│  └──────┬───────┘ └──────────────┘ └────────────────┘  │
│         │                                               │
├─────────┴───────────────────────────────────────────────┤
│                     Domain Layer                        │
│  ┌──────────┐ ┌────────────┐ ┌─────────────────────┐   │
│  │ Entities │ │ Value Obj   │ │ Repository Interfaces│   │
│  └──────────┘ └────────────┘ └─────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                Infrastructure Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ SQLite/  │ │ IMAP/    │ │ HTTP     │ │ Platform │  │
│  │ drift    │ │ SMTP     │ │ Client   │ │ Services │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 目录结构

```
lib/
├── core/
│   ├── event_bus/
│   │   ├── event_bus.dart
│   │   └── app_events.dart
│   ├── database/
│   │   ├── app_database.dart
│   │   └── app_database.g.dart
│   ├── di/
│   │   └── providers.dart
│   ├── router/
│   │   └── app_router.dart
│   ├── theme/
│   │   └── app_theme.dart
│   └── utils/
│       └── logger.dart
├── features/
│   ├── mail/
│   │   ├── data/
│   │   │   ├── datasources/
│   │   │   │   ├── mail_local_datasource.dart
│   │   │   │   └── mail_remote_datasource.dart
│   │   │   ├── models/
│   │   │   │   ├── mail_account_model.dart
│   │   │   │   ├── mail_message_model.dart
│   │   │   │   └── mail_folder_model.dart
│   │   │   ├── repositories/
│   │   │   │   └── mail_repository_impl.dart
│   │   │   └── services/
│   │   │       ├── imap_client_manager.dart
│   │   │       ├── smtp_client_manager.dart
│   │   │       ├── mail_html_renderer.dart
│   │   │       ├── mail_sync_service.dart
│   │   │       └── mail_search_service.dart
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── mail_account.dart
│   │   │   │   ├── mail_message.dart
│   │   │   │   └── mail_folder.dart
│   │   │   ├── enums/
│   │   │   │   ├── mail_sync_state.dart
│   │   │   │   └── mail_connection_state.dart
│   │   │   └── repositories/
│   │   │       └── mail_repository.dart
│   │   └── presentation/
│   │       ├── mail_inbox_screen.dart
│   │       ├── mail_compose_screen.dart
│   │       ├── mail_detail_screen.dart
│   │       ├── mail_account_settings_screen.dart
│   │       ├── widgets/
│   │       │   ├── mail_list_tile.dart
│   │       │   ├── mail_folder_tree.dart
│   │       │   └── mail_html_viewer.dart
│   │       └── providers/
│   │           ├── mail_accounts_provider.dart
│   │           ├── mail_messages_provider.dart
│   │           └── mail_compose_provider.dart
│   ├── calendar/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   ├── todo/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   ├── notes/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   ├── contacts/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   └── weather/
│       ├── data/
│       ├── domain/
│       └── presentation/
└── main.dart
```

### 4.3 模块间通信（EventBus）

```dart
// app_events.dart
sealed class AppEvent {}

// 邮件相关事件
class MailReceivedEvent extends AppEvent {
  final String accountId;
  final MailMessage message;
}

class MailUpdatedEvent extends AppEvent {
  final String accountId;
  final String messageId;
}

class MailDeletedEvent extends AppEvent {
  final String accountId;
  final String messageId;
}

class MailConnectionLostEvent extends AppEvent {
  final String accountId;
  final String reason;
}

class MailConnectionReestablishedEvent extends AppEvent {
  final String accountId;
}

class MailSyncCompletedEvent extends AppEvent {
  final String accountId;
  final int newMessageCount;
}

class MailSearchCompletedEvent extends AppEvent {
  final String query;
  final List<MailMessage> results;
}

// 日历相关事件
class CalendarEventCreatedEvent extends AppEvent { ... }
class CalendarEventUpdatedEvent extends AppEvent { ... }
class CalendarEventDeletedEvent extends AppEvent { ... }

// 任务相关事件
class TaskCreatedEvent extends AppEvent { ... }
class TaskStatusChangedEvent extends AppEvent { ... }
class TaskCompletedEvent extends AppEvent { ... }
```

---

## 5. 数据模型与数据库

### 5.1 数据库选择：SQLite + drift

**为什么选择 drift（原 moor）：**
- 类型安全的 SQLite 封装
- 自动生成 DAO、数据类、迁移代码
- 良好的 Flutter 集成
- 支持流式查询（实时更新 UI）

### 5.2 核心表结构

#### EmailAccount（邮件账户）

```sql
CREATE TABLE email_accounts (
    id              TEXT PRIMARY KEY,        -- UUID
    email           TEXT NOT NULL UNIQUE,    -- 邮箱地址
    display_name    TEXT,                    -- 显示名称
    incoming_server TEXT NOT NULL,           -- IMAP 服务器
    incoming_port   INTEGER NOT NULL,        -- IMAP 端口
    incoming_ssl    INTEGER NOT NULL DEFAULT 1,  -- 是否 SSL
    outgoing_server TEXT NOT NULL,           -- SMTP 服务器
    outgoing_port   INTEGER NOT NULL,        -- SMTP 端口
    outgoing_ssl    INTEGER NOT NULL DEFAULT 1,  -- 是否 SSL
    login_type      TEXT NOT NULL DEFAULT 'password',  -- 登录方式
    auth_info_json  TEXT,                    -- 认证信息（加密存储）
    discovered_config_json TEXT,             -- 自动发现的配置
    sync_state      TEXT NOT NULL DEFAULT 'idle',  -- 同步状态
    sync_interval   INTEGER NOT NULL DEFAULT 300,  -- 同步间隔（秒）
    last_sync_at    TEXT,                    -- 上次同步时间
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

#### MailFolder（邮件文件夹）

```sql
CREATE TABLE mail_folders (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,           -- 显示名称
    delimiter       TEXT,                    -- 路径分隔符
    flags_json      TEXT,                    -- 文件夹标志 JSON
    parent_path     TEXT,                    -- 父文件夹路径
    full_path       TEXT NOT NULL,           -- 完整路径
    total_count     INTEGER DEFAULT 0,
    unread_count    INTEGER DEFAULT 0,
    last_sync_at    TEXT,
    is_sync_enabled INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_mail_folders_account ON mail_folders(account_id);
CREATE UNIQUE INDEX idx_mail_folders_account_path ON mail_folders(account_id, full_path);
```

#### MailMessage（邮件消息）

```sql
CREATE TABLE mail_messages (
    id              TEXT PRIMARY KEY,        -- UUID
    account_id      TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    folder_id       TEXT NOT NULL REFERENCES mail_folders(id) ON DELETE CASCADE,
    uid             INTEGER NOT NULL,        -- IMAP UID
    message_id      TEXT,                    -- Message-ID 头
    subject         TEXT,
    from_addresses  TEXT,                    -- JSON 数组
    to_addresses    TEXT,                    -- JSON 数组
    cc_addresses    TEXT,                    -- JSON 数组
    bcc_addresses   TEXT,                    -- JSON 数组
    date            TEXT,                    -- 发送日期
    text_body       TEXT,                    -- 纯文本正文
    html_body       TEXT,                    -- HTML 正文
    preview_text    TEXT,                    -- 预览文本（前 200 字符）
    is_read         INTEGER NOT NULL DEFAULT 0,
    is_starred      INTEGER NOT NULL DEFAULT 0,
    is_answered     INTEGER NOT NULL DEFAULT 0,
    is_forwarded    INTEGER NOT NULL DEFAULT 0,
    is_draft        INTEGER NOT NULL DEFAULT 0,
    flags_json      TEXT,                    -- IMAP 标志 JSON
    size_bytes      INTEGER DEFAULT 0,
    headers_json    TEXT,                    -- 邮件头 JSON
    raw_mime        TEXT,                    -- 原始 MIME（用于重新发送/转发）
    local_path      TEXT,                    -- 本地缓存路径
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(uid, folder_id)
);

CREATE INDEX idx_mail_messages_account ON mail_messages(account_id);
CREATE INDEX idx_mail_messages_folder ON mail_messages(folder_id);
CREATE INDEX idx_mail_messages_date ON mail_messages(date DESC);
CREATE INDEX idx_mail_messages_read ON mail_messages(is_read);
CREATE INDEX idx_mail_messages_starred ON mail_messages(is_starred);
```

#### MailAttachment（邮件附件）

```sql
CREATE TABLE mail_attachments (
    id              TEXT PRIMARY KEY,
    message_id      TEXT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    content_type    TEXT,                    -- MIME 类型
    size_bytes      INTEGER DEFAULT 0,
    content_id      TEXT,                    -- 内联附件 ID
    is_inline       INTEGER NOT NULL DEFAULT 0,
    local_path      TEXT,                    -- 本地下载路径
    download_state  TEXT NOT NULL DEFAULT 'pending',  -- pending/downloading/downloaded/failed
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_mail_attachments_message ON mail_attachments(message_id);
```

#### CalendarEvent（日历事件）

```sql
CREATE TABLE calendar_events (
    id              TEXT PRIMARY KEY,
    account_id      TEXT,                    -- 关联账户（可为空表示本地事件）
    title           TEXT NOT NULL,
    description     TEXT,
    location        TEXT,
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    is_all_day      INTEGER NOT NULL DEFAULT 0,
    recurrence_json TEXT,                    -- 重复规则 JSON
    alarm_minutes   INTEGER,                 -- 提前提醒分钟数
    color           TEXT,                    -- 事件颜色
    calendar_id     TEXT,
    external_id     TEXT,                    -- 外部日历 ID（CalDAV）
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);
CREATE INDEX idx_calendar_events_account ON calendar_events(account_id);
```

#### TodoTask（任务）

```sql
CREATE TABLE todo_tasks (
    id              TEXT PRIMARY KEY,
    parent_id       TEXT REFERENCES todo_tasks(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending/in_progress/completed
    priority        TEXT NOT NULL DEFAULT 'medium',   -- low/medium/high/urgent
    due_date        TEXT,
    completed_at    TEXT,
    estimated_minutes INTEGER,
    actual_minutes  INTEGER,
    tags_json       TEXT,                    -- 标签 JSON 数组
    color           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_todo_tasks_status ON todo_tasks(status);
CREATE INDEX idx_todo_tasks_due ON todo_tasks(due_date);
CREATE INDEX idx_todo_tasks_parent ON todo_tasks(parent_id);
CREATE INDEX idx_todo_tasks_priority ON todo_tasks(priority);
```

#### Note（笔记）

```sql
CREATE TABLE notes (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    content         TEXT,                    -- Markdown 内容
    plain_text      TEXT,                    -- 纯文本（用于搜索）
    tags_json       TEXT,                    -- 标签 JSON 数组
    image_paths     TEXT,                    -- 图片路径 JSON 数组
    is_pinned       INTEGER NOT NULL DEFAULT 0,
    is_archived     INTEGER NOT NULL DEFAULT 0,
    color           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_notes_pinned ON notes(is_pinned);
CREATE INDEX idx_notes_archived ON notes(is_archived);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
```

#### Contact（联系人）

```sql
CREATE TABLE contacts (
    id              TEXT PRIMARY KEY,
    first_name      TEXT,
    last_name       TEXT,
    email           TEXT NOT NULL,
    phone           TEXT,
    company         TEXT,
    job_title       TEXT,
    avatar_path     TEXT,
    notes           TEXT,
    group_id        TEXT,
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    external_id     TEXT,                    -- 外部联系人 ID
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_group ON contacts(group_id);
CREATE INDEX idx_contacts_favorite ON contacts(is_favorite);
```

#### Settings（设置）

```sql
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    value_type      TEXT NOT NULL DEFAULT 'string',  -- string/number/boolean/json
    updated_at      TEXT NOT NULL
);

-- 默认设置
INSERT INTO settings (key, value, value_type, updated_at) VALUES
    ('theme_mode', 'system', 'string', datetime('now')),
    ('font_size', '14', 'number', datetime('now')),
    ('sync_interval', '300', 'number', datetime('now')),
    ('email_signature', '', 'string', datetime('now')),
    ('email_reply_prefix', 'Re: ', 'string', datetime('now')),
    ('email_forward_prefix', 'Fwd: ', 'string', datetime('now')),
    ('email_block_external_images', 'false', 'boolean', datetime('now')),
    ('weather_enabled', 'true', 'boolean', datetime('now')),
    ('weather_unit', 'celsius', 'string', datetime('now')),
    ('weather_location', '', 'string', datetime('now')),
    ('sidebar_collapsed', 'false', 'boolean', datetime('now')),
    ('default_view', 'inbox', 'string', datetime('now'));
```

### 5.3 数据库迁移策略

```dart
// 迁移示例
@override
MigrationStrategy get migration => MigrationStrategy(
  onCreate: (m) => m.createAll(),
  onUpgrade: (m, from, to) async {
    if (from < 2) {
      // v1 → v2: 添加 image_paths 字段
      await m.addColumn(notes, notes.imagePaths);
    }
    if (from < 3) {
      // v2 → v3: 添加 email_block_external_images 设置
      await into(settings).insert(
        SettingsCompanion.insert(
          key: 'email_block_external_images',
          value: 'false',
          valueType: 'boolean',
          updatedAt: DateTime.now(),
        ),
      );
    }
  },
);
```

---

## 6. 邮件模块（重点）

邮件模块是 EasyWork 的核心模块，基于 `enough_mail` 库实现 IMAP/SMTP 协议通信。

### 6.1 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│  │ Inbox Screen  │ │Compose Screen │ │  Detail Screen    │ │
│  └───────┬───────┘ └───────┬───────┘ └─────────┬─────────┘ │
│          │                 │                    │           │
│  ┌───────┴─────────────────┴────────────────────┴─────────┐│
│  │              Providers (Riverpod)                      ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐ ││
│  │  │  Accounts   │ │  Messages   │ │  Compose State   │ ││
│  │  │  Provider   │ │  Provider   │ │    Provider      │ ││
│  │  └─────────────┘ └─────────────┘ └──────────────────┘ ││
│  └───────────────────────────┬────────────────────────────┘│
├──────────────────────────────┴──────────────────────────────┤
│                    Application Layer                        │
│  ┌────────────────────────────────────────────────────────┐│
│  │ Use Cases / Service Agents                             ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐  ││
│  │  │ SyncService  │ │ SearchService│ │ ComposeService│  ││
│  │  └──────────────┘ └──────────────┘ └───────────────┘  ││
│  └────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                  Infrastructure Layer                       │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ ImapClientManager│  │SmtpClientManager │               │
│  │  (enough_mail)   │  │  (enough_mail)   │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                     │                          │
│  ┌────────┴─────────────────────┴─────────┐               │
│  │        enough_mail Library              │               │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐  │               │
│  │  │MailClient│ │MailClient│ │  IMAP  │  │               │
│  │  │ (IMAP)   │ │ (SMTP)   │ │Search  │  │               │
│  │  └──────────┘ └──────────┘ └────────┘  │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │       MailHtmlRenderer                   │               │
│  │  TransformConfiguration + security       │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │       MimeMessageMapper                  │               │
│  │  MimeMessage → Drift Models             │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 enough_mail 库集成

#### 6.2.1 核心依赖树

```
enough_mail
├── imap/
│   ├── ImapClient          # IMAP 协议客户端
│   ├── ImapClientConfig     # 连接配置
│   ├── ImapResponse         # 响应解析
│   ├── ImapCommand          # 命令构造
│   └── Sequence             # UID/序列号范围
├── smtp/
│   ├── SmtpClient          # SMTP 协议客户端
│   ├── SmtpClientConfig     # 连接配置
│   └── SmtpResponse         # 响应解析
├── mail/
│   ├── MailClient           # 高层邮件客户端（封装 IMAP/SMTP）
│   ├── MailClientConfig     # 综合配置
│   ├── MailAccount          # 账户信息
│   ├── Mailbox              # 邮箱/文件夹
│   └── MessageBuilder       # 消息构建器
├── mime/
│   ├── MimeMessage          # MIME 消息模型
│   ├── MimePart             # MIME 部分
│   ├── MimeHeader           # MIME 头
│   └── ContentDisposition   # 内容处置
└── search/
    ├── SearchTerm           # 搜索条件基类
    ├── AndTerm              # AND 组合
    ├── OrTerm               # OR 组合
    ├── SubjectTerm          # 主题搜索
    ├── FromTerm             # 发件人搜索
    ├── ToTerm               # 收件人搜索
    ├── BodyTerm             # 正文搜索
    ├── DateTerm             # 日期搜索
    ├── FlagTerm             # 标志搜索
    ├── SizeTerm             # 大小搜索
    ├── MessageIdTerm        # Message-ID 搜索
    ├── HeaderTerm           # 自定义头搜索
    └── NotTerm              # NOT 取反
```

#### 6.2.2 MailClient 生命周期

```dart
class ImapClientManager {
  MailClient? _client;
  MailClientConfig? _config;
  
  // 连接状态
  StreamController<MailConnectionState> _connectionStateController;
  
  /// 1. 创建并连接
  Future<void> connect(MailAccount account) async {
    _config = MailClientConfig(
      imapConfig: ImapConfig(
        host: account.incomingServer,
        port: account.incomingPort,
        socketType: account.incomingSsl 
            ? SocketType.ssl 
            : SocketType.plaintext,
        clientConfig: ClientConfig(),
      ),
      smtpConfig: SmtpConfig(
        host: account.outgoingServer,
        port: account.outgoingPort,
        socketType: account.outgoingSsl 
            ? SocketType.ssl 
            : SocketType.plaintext,
      ),
      name: account.displayName,
      email: account.email,
    );
    
    _client = MailClient(_config!, isLogEnabled: false);
    await _client!.connect();
    _connectionStateController.add(MailConnectionState.connected);
  }
  
  /// 2. 开启 IDLE（实时推送）
  Future<void> startIdle() async {
    await _client?.startIdle();
  }
  
  /// 3. 监听事件
  Stream<MailUpdateEvent> get onMailUpdate {
    return _client!.eventBus.on<MailUpdateEvent>();
  }
  
  Stream<MailVanishedEvent> get onMailVanished {
    return _client!.eventBus.on<MailVanishedEvent>();
  }
  
  /// 4. 断开连接
  Future<void> disconnect() async {
    await _client?.stopIdle();
    await _client?.disconnect();
    _client = null;
    _connectionStateController.add(MailConnectionState.disconnected);
  }
  
  /// 5. 销毁
  void dispose() {
    disconnect();
    _connectionStateController.close();
  }
}
```

#### 6.2.3 MessageBuilder 使用（撰写/回复/转发）

```dart
class MailComposeService {
  /// 撰写新邮件
  Future<MimeMessage> buildNewMessage({
    required String from,
    required List<String> to,
    List<String>? cc,
    List<String>? bcc,
    required String subject,
    required String textBody,
    String? htmlBody,
    List<Attachment>? attachments,
    String? inReplyTo,
    List<String>? references,
  }) async {
    final builder = MessageBuilder()
      ..from = [MailAddress(from)]
      ..to = to.map((e) => MailAddress(e)).toList()
      ..subject = subject;
    
    if (cc != null) {
      builder.cc = cc.map((e) => MailAddress(e)).toList();
    }
    if (bcc != null) {
      builder.bcc = bcc.map((e) => MailAddress(e)).toList();
    }
    if (inReplyTo != null) {
      builder.inReplyTo = inReplyTo;
      builder.references = references ?? [];
    }
    
    // 正文
    if (htmlBody != null) {
      builder.addTextPart(textBody);
      builder.addHtmlPart(htmlBody);
    } else {
      builder.addTextPart(textBody);
    }
    
    // 附件
    if (attachments != null) {
      for (final attachment in attachments) {
        builder.addAttachment(
          await MimePart.fromFileData(
            data: attachment.data,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
          ),
        );
      }
    }
    
    return builder.buildMimeMessage();
  }
  
  /// 回复邮件
  Future<MimeMessage> buildReply({
    required MimeMessage original,
    required String from,
    required String replyBody,
    bool replyAll = true,
  }) async {
    final builder = MessageBuilder.replyToMessage(
      original,
      from: MailAddress(from),
      replyAll: replyAll,
    )..addTextPart(replyBody);
    
    return builder.buildMimeMessage();
  }
  
  /// 转发邮件
  Future<MimeMessage> buildForward({
    required MimeMessage original,
    required String from,
    required List<String> to,
    String? forwardNote,
  }) async {
    final builder = MessageBuilder.forwardMessage(
      original,
      from: MailAddress(from),
      to: to.map((e) => MailAddress(e)).toList(),
    );
    
    if (forwardNote != null) {
      builder.addTextPart(forwardNote);
    }
    
    return builder.buildMimeMessage();
  }
}
```

#### 6.2.4 搜索 API（IMAP Search）

```dart
class MailSearchService {
  final ImapClientManager _imapManager;
  
  /// 搜索邮件
  /// 支持 15 种搜索条件（见附录 A）
  Future<List<MailMessage>> search({
    required String query,
    MailSearchFilter? filter,
  }) async {
    final client = _imapManager.client;
    if (client == null) throw MailException('Not connected');
    
    // 构建搜索条件
    SearchTerm term = SubjectTerm(query);
    
    // 组合过滤条件
    if (filter != null) {
      final terms = <SearchTerm>[term];
      
      if (filter.isRead != null) {
        terms.add(FlagTerm(MessageFlags.seen, filter.isRead!));
      }
      if (filter.hasAttachment == true) {
        terms.add(HeaderTerm('content-disposition', 'attachment'));
      }
      if (filter.from != null) {
        terms.add(FromTerm(filter.from!));
      }
      if (filter.dateAfter != null) {
        terms.add(DateTerm(
          DateTimeComparator.after, 
          filter.dateAfter!,
        ));
      }
      if (filter.dateBefore != null) {
        terms.add(DateTerm(
          DateTimeComparator.before, 
          filter.dateBefore!,
        ));
      }
      if (filter.minSize != null) {
        terms.add(SizeTerm(
          SizeComparator.largerThan, 
          filter.minSize!,
        ));
      }
      
      term = AndTerm(terms);
    }
    
    // 执行搜索
    final result = await client.searchMessages(
      term: term,
      charset: 'UTF-8',
    );
    
    return result.messages;
  }
}
```

### 6.3 HTML 渲染管线

#### 6.3.1 渲染流程

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ HTML Content │───▶│ TransformConfig  │───▶│ Sanitized HTML  │
│ (raw)        │    │ (security)       │    │ (safe)          │
└──────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │   Flutter WebView │
                                            │   或 自定义 Widget │
                                            └─────────────────┘
```

#### 6.3.2 TransformConfiguration

```dart
class MailHtmlRenderer {
  final TransformConfiguration _config;
  
  MailHtmlRenderer({bool blockExternalImages = false}) 
      : _config = TransformConfiguration(
          // 安全策略
          blockLocalImages: false,
          blockExternalImages: blockExternalImages,
          
          // 样式覆盖
          bodyStyles: {
            'font-family': 'Roboto, Arial, sans-serif',
            'font-size': '14px',
            'line-height': '1.6',
            'color': '#333333',
            'word-wrap': 'break-word',
          },
          
          // 链接处理
          linkTarget: '_blank',
          
          // 图片处理
          imageFixType: ImageFixType.keep,
          
          // 安全：移除脚本
          stripScripts: true,
          
          // 安全：移除危险属性
          permittedAttributesPerTag: {
            'a': ['href', 'title', 'class'],
            'img': ['src', 'alt', 'width', 'height', 'class'],
            'div': ['class', 'style'],
            'span': ['class', 'style'],
            'table': ['class', 'style', 'border'],
            'td': ['class', 'style', 'colspan', 'rowspan'],
          },
        );
  
  /// 渲染 HTML 供显示
  String render(String htmlContent) {
    // 1. 预处理：修复常见问题
    var html = _preprocess(htmlContent);
    
    // 2. 安全转换
    html = sanitizeHtml(html, configuration: _config);
    
    // 3. 包装为完整 HTML
    return _wrapFullHtml(html);
  }
  
  String _preprocess(String html) {
    // 移除零宽字符、修复编码问题
    return html
        .replaceAll(RegExp(r'[\u200B-\u200D\uFEFF]'), '')
        .replaceAll('&nbsp;', ' ');
  }
  
  String _wrapFullHtml(String body) {
    return '''
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        ${_config.bodyStyles.entries.map((e) => '${e.key}: ${e.value};').join('\n')}
      </style>
    </head>
    <body>$body</body>
    </html>
    ''';
  }
}
```

### 6.4 MimeMessage → Drift 模型映射

```dart
class MimeMessageMapper {
  /// 将 enough_mail 的 MimeMessage 映射为数据库模型
  static MailMessageModel fromMimeMessage({
    required MimeMessage mime,
    required String accountId,
    required String folderId,
  }) {
    return MailMessageModel(
      id: const Uuid().v4(),
      accountId: accountId,
      folderId: folderId,
      uid: mime.uid ?? 0,
      messageId: mime.messageId,
      subject: mime.decodeSubject(),
      fromAddresses: jsonEncode(
        mime.from?.map((a) => a.toString()).toList() ?? [],
      ),
      toAddresses: jsonEncode(
        mime.to?.map((a) => a.toString()).toList() ?? [],
      ),
      ccAddresses: jsonEncode(
        mime.cc?.map((a) => a.toString()).toList() ?? [],
      ),
      bccAddresses: jsonEncode(
        mime.bcc?.map((a) => a.toString()).toList() ?? [],
      ),
      date: mime.decodeDate(),
      textBody: mime.decodeTextPlainPart(),
      htmlBody: mime.decodeHtmlPart(),
      previewText: _extractPreview(mime),
      isRead: mime.flags?.contains(MessageFlags.seen) ?? false,
      isStarred: mime.flags?.contains(MessageFlags.flagged) ?? false,
      isAnswered: mime.flags?.contains(MessageFlags.answered) ?? false,
      isForwarded: mime.flags?.contains(MessageFlags.forwarded) ?? false,
      isDraft: mime.flags?.contains(MessageFlags.draft) ?? false,
      flagsJson: jsonEncode(mime.flags?.toList() ?? []),
      sizeBytes: mime.size ?? 0,
      headersJson: _extractHeaders(mime),
      rawMime: mime.toString(),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
  }
  
  /// 提取附件信息
  static List<MailAttachmentModel> extractAttachments({
    required MimeMessage mime,
    required String messageId,
  }) {
    final attachments = <MailAttachmentModel>[];
    
    mime.parts?.forEach((part) {
      if (part.isAttachment() || part.contentDisposition != null) {
        attachments.add(MailAttachmentModel(
          id: const Uuid().v4(),
          messageId: messageId,
          fileName: part.fileName ?? 'unnamed',
          contentType: part.contentType?.mimeType,
          sizeBytes: part.data?.length ?? 0,
          contentId: part.contentId,
          isInline: part.contentDisposition?.isInline ?? false,
          downloadState: DownloadState.pending,
          createdAt: DateTime.now(),
        ));
      }
      
      // 递归处理 multipart
      if (part.parts != null) {
        attachments.addAll(extractAttachments(
          mime: part as MimeMessage,
          messageId: messageId,
        ));
      }
    });
    
    return attachments;
  }
  
  static String _extractPreview(MimeMessage mime) {
    final text = mime.decodeTextPlainPart();
    if (text == null || text.isEmpty) return '';
    return text.length > 200 ? '${text.substring(0, 200)}...' : text;
  }
  
  static String _extractHeaders(MimeMessage mime) {
    final headers = <String, dynamic>{};
    mime.headers?.forEach((header) {
      headers[header.name] = header.value;
    });
    return jsonEncode(headers);
  }
}
```

### 6.5 连接事件处理

```dart
class MailConnectionEventHandler {
  final EventBus _eventBus;
  final ImapClientManager _imapManager;
  final AppDatabase _database;
  
  /// 重连策略
  static const _reconnectDelays = [
    Duration(seconds: 1),
    Duration(seconds: 2),
    Duration(seconds: 5),
    Duration(seconds: 10),
    Duration(seconds: 30),
  ];
  int _reconnectAttempt = 0;
  
  void startListening() {
    // 监听连接丢失
    _eventBus.on<MailConnectionLostEvent>().listen((event) {
      _handleConnectionLost(event.accountId, event.reason);
    });
    
    // 监听连接恢复
    _eventBus.on<MailConnectionReestablishedEvent>().listen((event) {
      _reconnectAttempt = 0;
    });
    
    // 监听邮件更新
    _eventBus.on<MailUpdateEvent>().listen((event) {
      _handleMailUpdate(event);
    });
    
    // 监听邮件消失（被其他客户端删除）
    _eventBus.on<MailVanishedEvent>().listen((event) {
      _handleMailVanished(event);
    });
  }
  
  Future<void> _handleConnectionLost(
    String accountId, 
    String reason,
  ) async {
    logger.warning('Connection lost for $accountId: $reason');
    
    await _database.updateSyncState(
      accountId, 
      MailSyncState.disconnected,
    );
    
    // 指数退避重连
    if (_reconnectAttempt < _reconnectDelays.length) {
      final delay = _reconnectDelays[_reconnectAttempt];
      _reconnectAttempt++;
      
      await Future.delayed(delay);
      await _imapManager.reconnect(accountId);
    } else {
      _eventBus.fire(MailConnectionFailedEvent(
        accountId: accountId,
        reason: 'Max reconnection attempts exceeded',
      ));
    }
  }
  
  Future<void> _handleMailUpdate(MailUpdateEvent event) async {
    final existing = await _database.getMessageByUid(
      event.accountId,
      event.messageUid,
    );
    
    if (existing != null) {
      await _database.updateMessage(
        existing.copyWith(
          isRead: event.flags.contains(MessageFlags.seen),
          isStarred: event.flags.contains(MessageFlags.flagged),
          updatedAt: DateTime.now(),
        ),
      );
    } else {
      final mime = await _imapManager.fetchMessage(event.messageUid);
      final model = MimeMessageMapper.fromMimeMessage(
        mime: mime,
        accountId: event.accountId,
        folderId: event.folderId,
      );
      await _database.insertMessage(model);
      
      final attachments = MimeMessageMapper.extractAttachments(
        mime: mime,
        messageId: model.id,
      );
      await _database.insertAttachments(attachments);
      
      _eventBus.fire(MailReceivedEvent(
        accountId: event.accountId,
        message: model,
      ));
    }
  }
  
  Future<void> _handleMailVanished(MailVanishedEvent event) async {
    for (final uid in event.messageUids) {
      await _database.markMessageDeleted(
        event.accountId,
        uid,
      );
    }
  }
}
```

### 6.6 邮件同步服务

```dart
class MailSyncService {
  final ImapClientManager _imapManager;
  final AppDatabase _database;
  final MailRepository _repository;
  
  /// 全量同步
  Future<SyncResult> fullSync(String accountId) async {
    final client = _imapManager.client;
    if (client == null) throw MailException('Not connected');
    
    final syncResult = SyncResult();
    
    try {
      // 1. 获取文件夹列表
      final folders = await client.listMailboxes();
      await _syncFolders(accountId, folders);
      
      // 2. 同步每个文件夹
      for (final folder in folders) {
        if (!folder.isSelectable) continue;
        
        final folderModel = await _database.getFolderByPath(
          accountId, 
          folder.path,
        );
        if (folderModel == null) continue;
        
        await client.selectMailbox(folder.path);
        
        final status = await client.status();
        syncResult.totalMessages += status.messages ?? 0;
        
        if (folderModel.lastSyncUid != null) {
          final validity = await client.uidFetch(
            '${folderModel.lastSyncUid}:*',
            ['UID', 'FLAGS'],
          );
          // 验证 UID 有效性...
        }
        
        final newMessages = await _syncMessages(
          accountId,
          folderModel,
          client,
        );
        syncResult.newMessages += newMessages;
      }
      
      await _database.updateSyncState(accountId, MailSyncState.idle);
      await _database.updateLastSyncAt(accountId, DateTime.now());
      
    } catch (e) {
      syncResult.error = e.toString();
      await _database.updateSyncState(accountId, MailSyncState.error);
    }
    
    return syncResult;
  }
  
  /// 增量同步（IDLE 模式下收到新邮件后）
  Future<void> incrementalSync({
    required String accountId,
    required String folderPath,
    required int sinceUid,
  }) async {
    final client = _imapManager.client;
    if (client == null) return;
    
    await client.selectMailbox(folderPath);
    
    final messages = await client.uidFetch(
      '${sinceUid + 1}:*',
      ['UID', 'BODY[]', 'FLAGS', 'ENVELOPE'],
    );
    
    for (final message in messages) {
      final mime = message.mimeMessage;
      if (mime == null) continue;
      
      final folder = await _database.getFolderByPath(accountId, folderPath);
      if (folder == null) continue;
      
      final model = MimeMessageMapper.fromMimeMessage(
        mime: mime,
        accountId: accountId,
        folderId: folder.id,
      );
      
      await _database.insertMessage(model);
    }
  }
  
  /// 同步文件夹
  Future<void> _syncFolders(
    String accountId, 
    List<Mailbox> remoteFolders,
  ) async {
    final existingFolders = await _database.getFoldersByAccount(accountId);
    final existingPaths = existingFolders.map((f) => f.fullPath).toSet();
    
    for (final remote in remoteFolders) {
      if (!existingPaths.contains(remote.path)) {
        await _database.insertFolder(MailFolderModel(
          id: const Uuid().v4(),
          accountId: accountId,
          name: remote.name,
          delimiter: remote.delimiter,
          flagsJson: jsonEncode(remote.flags?.toList() ?? []),
          parentPath: remote.parent?.path,
          fullPath: remote.path,
          totalCount: remote.messages ?? 0,
          unreadCount: remote.unseen ?? 0,
          isSyncEnabled: true,
          createdAt: DateTime.now(),
        ));
      } else {
        await _database.updateFolderCounts(
          accountId,
          remote.path,
          remote.messages ?? 0,
          remote.unseen ?? 0,
        );
      }
    }
  }
}
```

---

## 7. 功能模块清单

### 7.1 邮件模块（Feature: mail）

| 功能点 | 说明 | 优先级 |
|--------|------|--------|
| 多账户管理 | 添加/编辑/删除 IMAP 账户，支持自动发现配置 | P0 |
| 文件夹树 | 显示账户文件夹结构，支持嵌套，显示未读数 | P0 |
| 邮件列表 | 分页加载，显示发件人/主题/预览/时间/附件图标 | P0 |
| 邮件详情 | HTML 渲染正文，显示附件，支持下载 | P0 |
| 撰写邮件 | 收件人/抄送/密送，富文本编辑，附件上传 | P0 |
| 回复/转发 | 引用原文，支持回复全部 | P0 |
| 搜索 | IMAP 服务器端搜索，支持主题/发件人/正文/日期范围 | P1 |
| 标记操作 | 已读/未读、星标、删除 | P0 |
| IDLE 实时推送 | 新邮件即时通知 | P1 |
| 外部图片拦截 | 可配置阻止加载外部图片，保护隐私 | P1 |
| 邮件签名 | 账户级别签名，自动附加 | P2 |
| 草稿保存 | 自动保存草稿到 Drafts 文件夹 | P2 |

### 7.2 日历模块（Feature: calendar）

| 功能点 | 说明 | 优先级 |
|--------|------|--------|
| 日视图 | 时间线布局，支持拖拽创建事件 | P0 |
| 周视图 | 7 天布局，跨天事件处理 | P0 |
| 月视图 | 月份网格，显示事件点 | P0 |
| 创建/编辑事件 | 标题、时间、描述、地点、颜色 | P0 |
| 全天事件 | 独立显示区域 | P0 |
| 重复事件 | 每天/每周/每月/每年 | P1 |
| 提醒通知 | 事件前 N 分钟提醒 | P1 |
| 拖拽调整 | 拖拽改变事件时间和持续时间 | P1 |
| 多日事件 | 跨天事件正确显示 | P2 |

### 7.3 任务模块（Feature: todo）

| 功能点 | 说明 | 优先级 |
|--------|------|--------|
| 看板视图 | 拖拽卡片（待办/进行中/已完成） | P0 |
| 列表视图 | 紧凑列表，按优先级排序 | P0 |
| 创建/编辑任务 | 标题、描述、优先级、截止日期 | P0 |
| 子任务 | 支持嵌套，进度联动 | P0 |
| 优先级标记 | 低/中/高/紧急，颜色区分 | P0 |
| 标签过滤 | 按标签筛选任务 | P1 |
| 截止日期提醒 | 过期/即将过期高亮 | P1 |
| 任务统计 | 完成率、按优先级分布 | P2 |

### 7.4 笔记模块（Feature: notes）

| 功能点 | 说明 | 优先级 |
|--------|------|--------|
| 列表视图 | 卡片/列表切换，显示标题/预览/时间 | P0 |
| Markdown 编辑 | 实时预览，支持常见语法 | P0 |
| 富文本编辑 | 格式工具栏（加粗/斜体/列表/标题） | P0 |
| 标签管理 | 创建/编辑标签，多标签支持 | P0 |
| 图片插入 | 拖拽/粘贴图片到笔记 | P1 |
| 置顶笔记 | 重要笔记置顶显示 | P1 |
| 归档笔记 | 归档不再需要的笔记 | P1 |
| 笔记搜索 | 全文搜索（标题+内容） | P1 |

### 7.5 联系人模块（Feature: contacts）

| 功能点 | 说明 | 优先级 |
|--------|------|--------|
| 联系人列表 | 分组显示，搜索过滤 | P0 |
| 创建/编辑联系人 | 姓名、邮箱、电话、公司、职位 | P0 |
| 联系人详情 | 完整信息，关联邮件 | P0 |
| 收藏联系人 | 星标常用联系人 | P0 |
| 联系人分组 | 自定义分组管理 | P1 |
| 快速发邮件 | 从联系人直接打开邮件撰写 | P1 |
| 导入/导出 | vCard 格式导入导出 | P2 |

### 7.6 天气模块（Feature: weather）

| 功能点 | 说明 | 优先级 |
|--------|------|--------|
| 当前天气 | 温度、天气状况、风力 | P1 |
| 天气图标 | 根据天气状况显示图标 | P1 |
| 多日预报 | 3-7 天预报 | P2 |
| 自动定位 | 使用系统位置服务 | P2 |
| 单位切换 | 摄氏度/华氏度 | P2 |

---

## 8. UI/UX 与响应式布局

### 8.1 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│                    App Shell                                │
│  ┌─────┬───────────────────────────────────────────────┐   │
│  │     │  Top Bar (title, search, actions)             │   │
│  │  S  ├───────────────────────────────────────────────┤   │
│  │  i  │                                               │   │
│  │  d  │              Main Content Area                │   │
│  │  e  │                                               │   │
│  │  b  │  ┌─────────────────────────────────────────┐  │   │
│  │  a  │  │                                         │  │   │
│  │  r  │  │         Feature-specific content        │  │   │
│  │     │  │                                         │  │   │
│  │     │  └─────────────────────────────────────────┘  │   │
│  └─────┴───────────────────────────────────────────────┘   │
│                    Status Bar (sync status, weather)        │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 响应式断点

| 断点 | 宽度 | 布局 |
|------|------|------|
| Compact | < 800px | 侧边栏折叠为图标，内容区全宽 |
| Medium | 800px - 1200px | 侧边栏展开（窄版），内容区自适应 |
| Expanded | > 1200px | 侧边栏展开（宽版），内容区可分区显示 |

### 8.3 邮件模块响应式布局

#### Compact（< 800px）- 移动端风格
```
┌──────────────────────────┐
│ ≡  EasyWork    🔍  ⚙️   │  ← 顶部栏：汉堡菜单 + 搜索
├──────────────────────────┤
│                          │
│    [邮件列表/详情全屏]    │  ← 单列导航：列表和详情切换
│                          │
│                          │
├──────────────────────────┤
│ 📥 📅 ✅ 📝 👤           │  ← 底部导航栏（图标）
└──────────────────────────┘
```

#### Medium（800px - 1200px）- 平板风格
```
┌────────┬─────────────────┐
│ ≡ 收件 │  Top Bar        │  ← 可折叠侧边栏（图标）
│        ├─────────────────┤
│ 📥 收件│                 │
│ 📤 已发│  [邮件列表]     │  ← 单列邮件列表
│ 📝 草稿│                 │
│ 🗑 已删│                 │
│        │                 │
│ ────── │                 │
│ 日历   │                 │
│ 任务   │                 │
│ 笔记   │                 │
└────────┴─────────────────┘
```

#### Expanded（> 1200px）- 桌面端风格
```
┌────────┬─────────────┬─────────────────────────┐
│ ≡ 收件 │  文件夹     │  Top Bar    🔍  ⚙️     │
│        ├─────────────┼─────────────────────────┤
│ 📥 收件│  📥 收件箱  │                         │
│ 📤 已发│  📤 已发送  │    [邮件详情/预览]      │
│ 📝 草稿│  📝 草稿箱  │                         │
│ 🗑 已删│  🗑 已删除  │                         │
│        │  ─────────  │                         │
│ ────── │  📁 归档    │                         │
│ 📥 收件│  ⭐ 星标    │                         │
│ 📅 日历│  📌 标签    │                         │
│ ✅ 任务│             │                         │
│ 📝 笔记│             │                         │
│ 👤 联系│             │                         │
└────────┴─────────────┴─────────────────────────┘
```

### 8.4 主题系统

```dart
class AppTheme {
  // 颜色方案
  static const lightColorScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF1976D2),
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: Color(0xFFBBDEFB),
    secondary: Color(0xFF26A69A),
    surface: Color(0xFFFAFAFA),
    error: Color(0xFFD32F2F),
    // ...
  );
  
  static const darkColorScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF90CAF9),
    onPrimary: Color(0xFF000000),
    primaryContainer: Color(0xFF1565C0),
    secondary: Color(0xFF80CBC4),
    surface: Color(0xFF121212),
    error: Color(0xFFEF5350),
    // ...
  );
  
  // 字体缩放
  static const fontScaleLevels = [0.85, 1.0, 1.15, 1.3];
  
  // 间距系统
  static const spacing = Spacing(
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  );
}
```

### 8.5 交互模式

| 交互 | 说明 |
|------|------|
| 单击 | 选中/打开项目 |
| 双击 | 编辑项目 |
| 右键 | 上下文菜单（删除/移动/标记等） |
| 拖拽 | 任务看板移动、日历事件调整 |
| 滑动 | 移动端删除/归档（Compact 模式） |
| 键盘快捷键 | Ctrl+N 新建、Ctrl+F 搜索、Ctrl+S 保存 |

---

## 9. 工作流设计

### 9.1 邮件收发工作流

#### 9.1.1 接收邮件流程

```
┌──────────────┐
│  用户登录    │
└──────┬───────┘
       │
       ▼
┌──────────────┐     失败     ┌──────────────┐
│ 连接 IMAP   │────────────▶│ 显示错误     │
│ 服务器      │              │ 提示重试     │
└──────┬───────┘              └──────────────┘
       │ 成功
       ▼
┌──────────────┐
│ 选择收件箱   │
│ 文件夹      │
└──────┬───────┘
       │
       ▼
┌──────────────┐     有新邮件  ┌──────────────┐
│ 获取 UID    │────────────▶│ 下载邮件     │
│ 列表        │              │ 头部+正文    │
└──────┬───────┘              └──────┬───────┘
       │ 无新邮件                    │
       ▼                            ▼
┌──────────────┐              ┌──────────────┐
│ 保持 IDLE   │              │ 解析 MIME    │
│ 等待通知    │              │ 映射到 Drift │
└──────┬───────┘              └──────┬───────┘
       │                            │
       │         ┌──────────────────┘
       │         │
       ▼         ▼
┌──────────────┐
│ 更新 UI     │
│ 显示新邮件  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 触发通知    │
│ 系统通知    │
└──────────────┘
```

#### 9.1.2 发送邮件流程

```
┌──────────────┐
│  用户点击    │
│  "发送"     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 表单验证    │
│ (收件人/主题)│
└──────┬───────┘
       │ 验证失败
       ▼
┌──────────────┐
│ 显示错误    │
│ 提示修正    │
└──────────────┘
       │ 验证通过
       ▼
┌──────────────┐
│ 构建        │
│ MimeMessage │
└──────┬───────┘
       │
       ▼
┌──────────────┐     失败     ┌──────────────┐
│ 连接 SMTP   │────────────▶│ 保存草稿     │
│ 服务器      │              │ 提示重试     │
└──────┬───────┘              └──────────────┘
       │ 成功
       ▼
┌──────────────┐
│ 发送邮件    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 保存到      │
│ "已发送"    │
│ 文件夹      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 关闭撰写    │
│ 窗口        │
└──────────────┘
```

### 9.2 账户自动发现流程

```
┌──────────────┐
│ 输入邮箱地址 │
│ user@domain  │
└──────┬───────┘
       │
       ▼
┌──────────────┐     失败     ┌──────────────┐
│ 查询 DNS    │────────────▶│ 手动配置     │
│ MX 记录     │              │ 输入服务器   │
└──────┬───────┘              └──────┬───────┘
       │ 成功                        │
       ▼                            │
┌──────────────┐                     │
│ 尝试         │                     │
│ Autoconfig   │                     │
│ (Mozilla)    │                     │
└──────┬───────┘                     │
       │ 失败                        │
       ▼                            │
┌──────────────┐                     │
│ 尝试         │                     │
│ Autodiscover │                     │
│ (Microsoft)  │                     │
└──────┬───────┘                     │
       │ 失败                        │
       ▼                            │
┌──────────────┐                     │
│ 尝试         │                     │
│ SRV 记录     │                     │
│ (RFC 6186)   │                     │
└──────┬───────┘                     │
       │ 失败                        │
       ▼                            ▼
┌──────────────┐              ┌──────────────┐
│ 尝试常见     │◀─────────────│ 手动输入     │
│ 配置         │              │ 服务器信息   │
│ (Gmail/Outlook│             └──────┬───────┘
│ /Yahoo 等)   │                     │
└──────┬───────┘                     │
       │                             │
       ▼◀────────────────────────────┘
┌──────────────┐
│ 验证连接    │
│ 测试登录    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 保存账户    │
│ 开始同步    │
└──────────────┘
```

### 9.3 同步状态机

```
                    ┌─────────┐
         ┌─────────│  IDLE   │◀────────┐
         │         └────┬────┘         │
         │              │              │
    手动触发         IDLE 超时      同步完成
    /定时触发        /收到通知
         │              │              │
         ▼              ▼              │
    ┌─────────┐    ┌─────────┐         │
    │ SYNCING │    │ CONNECTING│        │
    └────┬────┘    └────┬────┘         │
         │              │              │
    同步成功        连接成功           │
         │              │              │
         ▼              ▼              │
    ┌─────────────────────────┐       │
    │      SYNCING            │───────┘
    └─────────────┬───────────┘
                  │
             同步失败
                  │
                  ▼
            ┌─────────┐
            │  ERROR  │───▶ 重试 ──▶ CONNECTING
            └─────────┘
```

### 9.4 离线工作流

```
┌──────────────┐
│  网络状态    │
│  检测       │
└──────┬───────┘
       │
       ├────────────── 在线 ──────────────┐
       │                                  │
       ▼                                  ▼
┌──────────────┐                 ┌──────────────┐
│  离线模式    │                 │  在线模式    │
│              │                 │              │
│ • 读取缓存   │                 │ • 实时同步   │
│ • 本地搜索   │                 │ • 服务器搜索 │
│ • 编辑操作   │                 │ • 全量功能   │
│   排队等待   │                 │              │
└──────┬───────┘                 └──────────────┘
       │
       │ 网络恢复
       ▼
┌──────────────┐
│  排队操作    │
│  同步执行    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  更新本地    │
│  缓存       │
└──────────────┘
```

---

## 10. 测试策略

### 10.1 测试金字塔

```
┌─────────────────────────────────────────┐
│          E2E Tests (5%)                 │  ← 关键流程自动化验证
│  集成测试：账户登录→收发邮件→断开       │
├─────────────────────────────────────────┤
│       Integration Tests (25%)           │  ← 模块间协作验证
│  Repository + Database / API + Model    │
├─────────────────────────────────────────┤
│         Unit Tests (70%)                │  ← 核心逻辑验证
│  Domain Entities / Use Cases / Mapper   │
└─────────────────────────────────────────┘
```

### 10.2 各层测试重点

| 层级 | 测试类型 | 覆盖率目标 | 工具 |
|------|----------|-----------|------|
| Domain | Entity 单元测试 | 90%+ | flutter_test |
| Domain | Value Object 验证 | 95%+ | flutter_test |
| Application | Use Case 测试 | 80%+ | flutter_test + mockito |
| Data | Repository 实现测试 | 75%+ | mockito + fake DB |
| Data | DataSource 测试 | 70%+ | mockito |
| Infrastructure | ImapClient 测试 | 60%+ | mockito（Mock IMAP 响应） |
| Infrastructure | HTML Renderer 测试 | 80%+ | flutter_test |
| Presentation | Widget 测试 | 60%+ | flutter_test |
| E2E | 完整流程测试 | 关键路径 | integration_test |

### 10.3 测试示例

#### Unit Test — Entity 测试

```dart
void main() {
  group('MailMessage', () {
    test('should create with required fields', () {
      final message = MailMessage(
        id: '1',
        accountId: 'acc-1',
        folderId: 'folder-1',
        uid: 1001,
        subject: 'Test Email',
        fromAddresses: '["user@example.com"]',
        date: DateTime(2024, 1, 15, 10, 30),
        isRead: false,
        isStarred: false,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      
      expect(message.id, '1');
      expect(message.subject, 'Test Email');
      expect(message.isRead, false);
    });
    
    test('should parse from addresses', () {
      final message = MailMessage(
        // ...
        fromAddresses: '["Alice <alice@example.com>", "bob@example.com"]',
      );
      
      final fromList = jsonDecode(message.fromAddresses) as List;
      expect(fromList.length, 2);
      expect(fromList[0], 'Alice <alice@example.com>');
    });
  });
}
```

#### Unit Test — MimeMessageMapper 测试

```dart
void main() {
  group('MimeMessageMapper', () {
    test('should map MimeMessage to Drift model', () {
      final mime = MimeMessage()
        ..uid = 12345
        ..messageId = '<test@example.com>'
        ..subject = 'Test Subject'
        ..from = [MailAddress('sender@example.com')]
        ..to = [MailAddress('recipient@example.com')]
        ..date = DateTime(2024, 1, 15)
        ..flags = {MessageFlags.seen};
      
      final model = MimeMessageMapper.fromMimeMessage(
        mime: mime,
        accountId: 'acc-1',
        folderId: 'folder-1',
      );
      
      expect(model.uid, 12345);
      expect(model.messageId, '<test@example.com>');
      expect(model.subject, 'Test Subject');
      expect(model.isRead, true);
    });
    
    test('should extract attachments', () {
      final mime = MimeMessage()
        ..parts = [
          MimePart()
            ..contentType = ContentType('text', 'plain'),
          MimePart()
            ..contentType = ContentType('application', 'pdf')
            ..fileName = 'document.pdf'
            ..contentDisposition = ContentDisposition('attachment'),
        ];
      
      final attachments = MimeMessageMapper.extractAttachments(
        mime: mime,
        messageId: 'msg-1',
      );
      
      expect(attachments.length, 1);
      expect(attachments[0].fileName, 'document.pdf');
    });
  });
}
```

#### Integration Test — Repository 测试

```dart
void main() {
  group('MailRepository', () {
    late AppDatabase database;
    late MailRepository repository;
    
    setUp(() {
      database = AppDatabase();
      repository = MailRepositoryImpl(database);
    });
    
    tearDown(() async {
      await database.close();
    });
    
    test('should save and retrieve messages', () async {
      final message = MailMessageModel(
        // ...
      );
      
      await repository.saveMessage(message);
      final retrieved = await repository.getMessageById(message.id);
      
      expect(retrieved, isNotNull);
      expect(retrieved!.subject, message.subject);
    });
    
    test('should search messages', () async {
      // Insert test data
      await repository.saveMessage(_createMessage(subject: 'Hello'));
      await repository.saveMessage(_createMessage(subject: 'World'));
      await repository.saveMessage(_createMessage(subject: 'Hello World'));
      
      final results = await repository.searchMessages('Hello');
      
      expect(results.length, 2);
    });
  });
}
```

### 10.4 测试数据管理

```dart
class TestDataProvider {
  /// 创建测试账户
  static MailAccountModel createTestAccount({
    String? id,
    String? email,
  }) {
    return MailAccountModel(
      id: id ?? 'test-acc-1',
      email: email ?? 'test@example.com',
      displayName: 'Test User',
      incomingServer: 'imap.example.com',
      incomingPort: 993,
      incomingSsl: true,
      outgoingServer: 'smtp.example.com',
      outgoingPort: 587,
      outgoingSsl: true,
      syncState: MailSyncState.idle,
      syncInterval: 300,
      isActive: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
  }
  
  /// 创建测试邮件
  static MailMessageModel createTestMessage({
    String? id,
    String? subject,
    bool isRead = false,
  }) {
    return MailMessageModel(
      id: id ?? 'test-msg-1',
      accountId: 'test-acc-1',
      folderId: 'test-folder-1',
      uid: 1001,
      subject: subject ?? 'Test Subject',
      fromAddresses: '["sender@example.com"]',
      toAddresses: '["recipient@example.com"]',
      date: DateTime.now(),
      textBody: 'This is a test message.',
      isRead: isRead,
      isStarred: false,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
  }
}
```

---

## 11. 部署与发布

### 11.1 构建配置

#### Windows
```yaml
# windows/runner/Runner.exe.manifest
<?xml version="1.0" encoding="utf-8"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity version="1.0.0.0" name="com.easywork.app"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security>
      <requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
```

#### macOS
```yaml
# macos/Runner/Info.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>EasyWork</string>
    <key>CFBundleIdentifier</key>
    <string>com.easywork.app</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2026 EasyWork. All rights reserved.</string>
</dict>
</plist>
```

#### Linux
```yaml
# linux/CMakeLists.txt
cmake_minimum_required(VERSION 3.10)
project(runner LANGUAGES CXX)

set(BINARY_NAME "easywork")
set(APPLICATION_ID "com.easywork.app")
```

### 11.2 版本管理

采用 [SemVer](https://semver.org/) 语义化版本：

```
MAJOR.MINOR.PATCH

MAJOR - 不兼容的 API 变更
MINOR - 向后兼容的功能新增
PATCH - 向后兼容的问题修复
```

版本号定义在：
- `pubspec.yaml`: `version: 1.0.0+1`
- Windows: `windows/runner/Runner.rc`
- macOS: `macos/Runner/Info.plist`
- Linux: `linux/CMakeLists.txt`

### 11.3 CI/CD 流程

```yaml
# .github/workflows/build.yml
name: Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.19.0'
      - run: flutter pub get
      - run: dart analyze
      - run: dart test --coverage=coverage
      - run: dart run coverage:format_coverage

  build-windows:
    runs-on: windows-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: flutter build windows --release
      - uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: build/windows/x64/runner/Release/

  build-macos:
    runs-on: macos-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: flutter build macos --release
      - uses: actions/upload-artifact@v4
        with:
          name: macos-build
          path: build/macos/Build/Products/Release/

  build-linux:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: flutter build linux --release
      - uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: build/linux/x64/release/bundle/
```

### 11.4 发布流程

1. 更新版本号（pubspec.yaml + 平台配置）
2. 运行完整测试套件
3. 构建所有平台产物
4. 创建 GitHub Release + 上传产物
5. 更新 CHANGELOG

---

## 12. 附录

### 附录 A：IMAP SearchTerm 参考

| SearchTerm | 说明 | 示例 |
|-----------|------|------|
| `SubjectTerm` | 主题搜索 | `SubjectTerm('meeting')` |
| `FromTerm` | 发件人搜索 | `FromTerm('alice@example.com')` |
| `ToTerm` | 收件人搜索 | `ToTerm('bob@example.com')` |
| `BodyTerm` | 正文搜索 | `BodyTerm('invoice')` |
| `DateTerm` | 日期搜索 | `DateTerm(DateTimeComparator.after, date)` |
| `FlagTerm` | 标志搜索 | `FlagTerm(MessageFlags.seen, true)` |
| `SizeTerm` | 大小搜索 | `SizeTerm(SizeComparator.largerThan, 1024000)` |
| `MessageIdTerm` | Message-ID 搜索 | `MessageIdTerm('<abc@example.com>')` |
| `HeaderTerm` | 自定义头搜索 | `HeaderTerm('X-Priority', '1')` |
| `AndTerm` | AND 组合 | `AndTerm([term1, term2])` |
| `OrTerm` | OR 组合 | `OrTerm([term1, term2])` |
| `NotTerm` | NOT 取反 | `NotTerm(term)` |
| `Utf8Term` | UTF-8 搜索 | `Utf8Term('主题')` |
| `NumericTerm` | 数值搜索 | `NumericTerm('RFC822.SIZE', 1024, '>')` |
| `AllTerm` | 全部匹配 | `AllTerm()` |

### 附录 B：错误码定义

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| `MAIL_001` | IMAP 连接超时 | 提示用户检查网络，建议重试 |
| `MAIL_002` | IMAP 认证失败 | 提示检查用户名/密码，建议开启应用专用密码 |
| `MAIL_003` | IMAP 文件夹不存在 | 自动创建或提示用户检查配置 |
| `MAIL_004` | SMTP 发送失败 | 保存草稿，提示用户稍后重试 |
| `MAIL_005` | 附件过大（>25MB） | 提示用户压缩或使用云链接 |
| `MAIL_006` | HTML 渲染失败 | 降级为纯文本显示 |
| `MAIL_007` | UID 无效（UIDVALIDITY 变更） | 重新同步文件夹 |
| `CAL_001` | 日历事件冲突 | 提示用户确认是否覆盖 |
| `TASK_001` | 任务循环引用 | 阻止创建，提示用户 |
| `SYNC_001` | 后台同步失败 | 降低同步频率，记录错误 |
| `NET_001` | 网络不可用 | 切换到离线模式 |

### 附录 C：键盘快捷键

| 快捷键 | 操作 | 适用场景 |
|--------|------|----------|
| `Ctrl+N` | 新建 | 当前模块新建项 |
| `Ctrl+F` | 搜索 | 全局搜索 |
| `Ctrl+S` | 保存 | 撰写/编辑保存 |
| `Ctrl+Enter` | 发送 | 邮件发送 |
| `Ctrl+R` | 回复 | 邮件回复 |
| `Ctrl+Shift+R` | 回复全部 | 邮件回复全部 |
| `Ctrl+F` | 转发 | 邮件转发 |
| `Delete` | 删除 | 选中项删除 |
| `Ctrl+Z` | 撤销 | 撤销操作 |
| `Ctrl+Y` | 重做 | 重做操作 |
| `Esc` | 关闭/取消 | 关闭弹窗/取消操作 |
| `↑/↓` | 导航 | 列表上下导航 |
| `Enter` | 打开 | 打开选中项 |
| `Space` | 标记已读 | 邮件标记已读/未读 |

### 附录 D：配置文件格式

```json
{
  "version": "1.0.0",
  "accounts": [
    {
      "id": "uuid-1",
      "email": "user@example.com",
      "displayName": "User",
      "incoming": {
        "server": "imap.example.com",
        "port": 993,
        "ssl": true
      },
      "outgoing": {
        "server": "smtp.example.com",
        "port": 587,
        "ssl": true
      },
      "syncInterval": 300
    }
  ],
  "settings": {
    "theme": "system",
    "fontSize": 14,
    "language": "zh-CN",
    "weatherEnabled": true,
    "weatherUnit": "celsius"
  }
}
```

### 附录 E：依赖版本锁定

```yaml
# pubspec.yaml
name: easywork
description: EasyWork - Desktop Productivity Suite
version: 1.0.0+1
publish_to: 'none'

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.4.0
  freezed_annotation: ^2.4.0
  json_annotation: ^4.8.0
  drift: ^2.14.0
  sqlite3_flutter_libs: ^0.5.0
  enough_mail: ^2.0.0
  event_bus: ^2.0.0
  logger: ^2.0.0
  dio: ^5.4.0
  go_router: ^12.0.0
  uuid: ^4.2.0
  intl: ^0.19.0
  flutter_localizations:
    sdk: flutter

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0
  build_runner: ^2.4.0
  freezed: ^2.4.0
  json_serializable: ^6.7.0
  drift_dev: ^2.14.0
  mockito: ^5.4.0
  build_verify: ^3.1.0
  dart_code_metrics: ^5.7.0

flutter:
  uses-material-design: true
  assets:
    - assets/icons/
    - assets/images/
```

---

## 文档状态

- [x] 项目概述
- [x] 设计原则与约束
- [x] 技术栈（含版本参考）
- [x] 系统架构（含目录结构、EventBus）
- [x] 数据模型与数据库（8 张表 + 迁移策略）
- [x] 邮件模块（enough_mail 集成、HTML 渲染、MimeMessage 映射、连接事件、同步服务）
- [x] 功能模块清单（6 个模块，含优先级）
- [x] UI/UX 与响应式布局（3 个断点 + 主题系统）
- [x] 工作流设计（邮件收发、账户发现、同步状态机、离线工作流）
- [x] 测试策略（金字塔 + 各层测试 + 示例）
- [x] 部署与发布（构建配置、CI/CD、版本管理）
- [x] 附录（SearchTerm 参考、错误码、快捷键、配置格式、依赖版本）

---

*文档完成，待用户审阅确认后进入实现阶段。*
