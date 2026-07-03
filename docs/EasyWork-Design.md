# EasyWork - 整体架构与模块设计

## 概述

EasyWork 是一款个人效率工具，适配 Windows 和 Android 双端，目标是以统一的入口解决日常办公与生活中的常用工具需求。采用 Flutter + Dart 最新稳定版开发，响应式 UI 一套界面适配多分辨率。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Flutter + Dart 最新稳定版 |
| 状态管理 | Riverpod |
| 本地存储 | drift (SQLite) |
| 同步抽象 | Repository 模式（domain 层定义接口，data 层可切换本地/远端实现） |
| 邮件协议 | enough_mail ^2.1.7（IMAP + SMTP + MIME） |
| 邮件 UI | enough_mail_flutter ^2.1.2（MimeMessageViewer） |
| VCF 处理 | vcard（vCard 生成/解析） |
| 国际化 | Flutter intl / ARB（中英双语） |
| 路由 | go_router |
| 依赖原则 | 最新稳定版，非弃用，< 1 年未更新，评分良好 |

## 整体架构

### Clean Architecture + Feature-first 分包

```
lib/
├── core/                       # 基础设施
│   ├── theme/                  # 主题、配色、字号
│   ├── router/                 # 路由（go_router）
│   ├── i18n/                   # 国际化
│   ├── responsive/             # 响应式布局工具
│   └── extensions/             # 通用扩展
├── shared/                     # 跨模块共用组件
│   ├── widgets/                # 通用组件
│   └── models/                 # 跨模块数据模型
├── features/
│   ├── dashboard/              # 首页
│   ├── timeline/               # 时间线
│   ├── task_board/             # 任务看板
│   ├── calendar/               # 日历
│   ├── email/                  # 邮箱（MVP 重点）
│   ├── notes/                  # 笔记
│   ├── stocks/                 # 股票
│   ├── accounting/             # 记账
│   ├── exercise/               # 运动记录
│   ├── log/                    # 日志
│   └── settings/               # 设置
└── app.dart
```

### 每个 feature 模块内部分层

```
email/
├── domain/                     # 纯 Dart 业务逻辑
│   ├── models/                 # 实体
│   ├── repositories/           # 接口（abstract）
│   └── usecases/               # 用例
├── data/                       # 数据层
│   ├── repositories/           # 实现（drift / IMAP）
│   ├── datasources/            # 本地/远程数据源
│   └── database/               # drift 表定义
├── presentation/               # UI 层
│   ├── providers/              # Riverpod providers
│   ├── pages/                  # 页面
│   └── widgets/                # 组件
└── email_feature.dart
```

## 响应式 UI 策略

### 断点

| 宽度 | 设备 | 导航栏 |
|---|---|---|
| < 600px | Android 竖屏 | 隐藏侧栏，左上角汉堡菜单 |
| 600-900px | Android 横屏/小窗 | 可展开图标导航 |
| > 900px | Windows 大屏 | 图标导航栏锁定 48px |

### Windows 布局

左侧固定 48px 图标导航栏（仅图标，hover 显示 tooltip），右侧内容区自适应。

### Android 布局

左上角汉堡菜单打开 Drawer（图标 + 文字），高度不够时启用滚动，内容区全宽。

## 功能模块关系

- **任务看板** 是数据枢纽，被邮箱、日历、Dashboard 引用
- **Timeline** 是统一的记录聚合流（任务变更、账目、笔记更新、运动等）
- **日志** 是系统级操作记录（仅诊断用）
- **Dashboard** 从各模块拉取摘要：今日任务、待跟进、最近交易

## 邮箱模块详细设计

### 功能总览

```
邮箱模块
├── 账户管理（多账户、IMAP 自动发现、添加/删除/编辑）
├── 邮件管理（收件箱/已发送/草稿/垃圾邮件、列表/详情、回复/转发/删除、搜索、附件）
├── 联系人管理（列表/详情、CRUD、分组管理、VCF 导入/导出、从发件人添加）
├── 邮件签名（多签名管理、HTML/文本编辑器、默认签名、写邮件时切换）
├── 邮件 → 任务（一键转为任务，关联附件，跟踪进度）
└── Windows 后台（托盘常驻、IDLE/轮询收信、通知弹窗）
```

### 数据模型（drift tables）

```sql
-- 邮箱账户
CREATE TABLE email_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  display_name TEXT,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL,
  imap_use_ssl INTEGER NOT NULL DEFAULT 1,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_use_ssl INTEGER NOT NULL DEFAULT 1,
  auth_method TEXT,
  supports_idle INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 邮件
CREATE TABLE emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  subject TEXT,
  from_name TEXT,
  from_address TEXT NOT NULL,
  to_list TEXT,
  cc_list TEXT,
  bcc_list TEXT,
  body_text TEXT,
  body_html TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  folder TEXT NOT NULL DEFAULT 'inbox',
  thread_id TEXT,
  FOREIGN KEY (account_id) REFERENCES email_accounts(id)
);

-- 附件
CREATE TABLE email_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  local_path TEXT,
  cid TEXT,
  FOREIGN KEY (email_id) REFERENCES emails(id)
);

-- 联系人
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT NOT NULL,
  email_addresses TEXT,
  phone_numbers TEXT,
  organization TEXT,
  department TEXT,
  job_title TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES email_accounts(id)
);

-- 联系人分组
CREATE TABLE contact_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL
);

-- 联系人-分组关联
CREATE TABLE contact_group_members (
  contact_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  PRIMARY KEY (contact_id, group_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (group_id) REFERENCES contact_groups(id)
);

-- 邮件签名
CREATE TABLE email_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES email_accounts(id)
);

-- 邮件→任务关联
CREATE TABLE email_to_task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  linked_at TEXT NOT NULL,
  FOREIGN KEY (email_id) REFERENCES emails(id)
);
```

### 关键工作流

#### 1. 邮件 → 任务

```
邮件详情 → "转为任务"
  → 弹窗表单（标题预填主题、描述预填摘要、优先级、截止日期、关联联系人、关联附件）
  → 确认 → 写入 tasks 表 + email_to_task 关联表
  → 附件处理：邮件附件复制到 tasks/{task_id}/attachments/ 目录，email_to_task 扩展 attachment_paths（JSON 数组，存储复制后的路径）
  → 邮件标记"已关联" + 跳转按钮
  → Timeline 记录 → Dashboard 待办更新
  → 任务删除时清理对应附件目录
```

#### 2. VCF 导出

```
选中联系人 → "导出VCF" → vcard 包生成 vCard 对象
→ 序列化为 .vcf → file_picker 保存对话框 → 写入文件
支持多选批量导出为单个多记录 .vcf
```

#### 3. VCF 导入

```
选择 .vcf 文件 → 读取内容 → vcard 包解析
→ 映射为 Contact 模型 → 按 email 去重 → 批量写入 drift → 刷新列表
```

#### 4. Windows 后台收信

```
托盘常驻 → 定时 IDLE/轮询 IMAP → 发现新邮件 → drift 写入
→ 通知弹窗 → Dashboard 未读数 +1
```

#### 5. 写邮件

```
新建邮件 → 收件人选择（搜索联系人/分组） → 编辑正文
→ 签名自动插入默认签名（可切换） → 添加附件 → SMTP 发送
```

### 邮箱模块页面结构

```
email/
├── presentation/pages/
│   ├── email_list_page.dart          # 邮件列表（文件夹切换 + 搜索）
│   ├── email_detail_page.dart        # 邮件详情（MimeMessageViewer）
│   ├── compose_page.dart             # 写邮件（收件人选择、签名、附件）
│   ├── contact_list_page.dart        # 联系人列表（搜索 + 分组筛选）
│   ├── contact_detail_page.dart      # 联系人详情 + 关联邮件
│   ├── contact_form_page.dart        # 新建/编辑联系人
│   ├── contact_group_page.dart       # 分组管理
│   └── signature_manage_page.dart    # 签名管理
```

## 各模块详细设计

### 1. Dashboard

数据卡片固定顺序展示。

| 数据卡片 | 数据来源 |
|---|---|
| 今日待办 | task_board（截止日期为今天的任务，按优先级排序） |
| 待跟进邮件 | email（标记为待跟进或附件任务的邮件） |
| 未读邮件数 | email（各账户未读数汇总） |
| 本月支出/预算 | accounting（本月收支汇总 + 预算进度条） |
| 最近笔记 | notes（最近编辑的前 5 条） |
| 今日运动 | exercise（今天的运动记录摘要） |
| 股票概览 | stocks（自选股快照） |

Dashboard 页面结构：

```
├── AppBar（日期显示 + 快捷搜索入口）
├── 固定顺序 Grid 区域
│   └── 每个卡片有标题 + 核心数据 + 点击跳转
└── 各卡片按固定顺序排列
```

### 2. Timeline

所有模块关键操作的统一时间流聚合。

| 事件类型 | 来源模块 | 显示内容 |
|---|---|---|
| 任务状态变更 | task_board | "完成任务「xxx」"、"创建任务「xxx」" |
| 笔记更新 | notes | "编辑笔记「xxx」" |
| 账目记录 | accounting | "记录支出 ¥xxx - 餐饮" |
| 运动完成 | exercise | "完成跑步 5km" |
| 任务→邮件关联 | email + task_board | "将邮件「xxx」转为任务" |

显示方式：按日期分组的时间线列表，每条记录包含图标 + 时间 + 文字描述 + 可点击跳转到源模块。

### 3. 任务看板

#### 数据模型

```dart
// tasks
id, title, description, priority(high/medium/low),
status(todo/in_progress/done/suspended/abandoned/archived),
due_date, tags (JSON array), attachments (JSON array),
estimated_minutes, actual_minutes, progress_percentage,
is_recurring, recurrence_rule (RFC 5545 RRULE 格式),
parent_task_id (子任务), sort_order, created_at, updated_at,
completed_at

// task_comments
id, task_id, content, created_at
```

#### 视图

| 视图 | 说明 |
|---|---|
| 看板视图 | 按状态分列（待办/进行中/已完成/挂起），支持拖拽移动卡片。废弃和归档任务不直接显示，通过筛选器/按钮查看 |
| 列表视图 | 表格/列表形式，支持按优先级/截止日期/标签排序筛选 |
| 日历视图 | 在日历上标记有截止日期的任务，支持拖拽到日期以调整截止日 |

#### 周期任务

周期规则使用 RRULE 标准格式：

| 周期 | RRULE 示例 |
|---|---|
| 每日 | `FREQ=DAILY` |
| 每周一 | `FREQ=WEEKLY;BYDAY=MO` |
| 每月15日 | `FREQ=MONTHLY;BYMONTHDAY=15` |
| 工作日 | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |

周期任务完成时：原任务 status 改为 `done`，`completed_at` 记录时间；自动生成新任务（status=`todo`），继承描述、标签、附件，`due_date` 按 RRULE 计算下次日期；新任务 `parent_task_id` 指向原任务。

#### 邮件→任务联动

```
邮件详情页 → "转为任务" 按钮
  → 弹窗预填：标题=邮件主题、描述=邮件摘要、附件=邮件附件
  → 确认后写入 tasks + email_to_task
  → 附件复制到 tasks/{task_id}/attachments/
  → 邮件详情页显示 "已关联任务：xxx" + 跳转按钮
  → Timeline 记录
  → Dashboard 待办更新
```

### 4. 日历

| 功能 | 说明 |
|---|---|
| 月/周/日视图 | 三种时间粒度切换 |
| 任务标记 | 有截止日期的任务在日历上显示为彩色标记 |
| 农历显示 | 在中国节假日模式下显示农历日期和节气 |
| 钉钉日历同步 | 接入钉钉开放平台 Calendar API，只读同步日程 |
| 任务拖拽 | 日历视图下可拖拽任务到其他日期调整截止日 |
| 节假日标注 | 中国法定节假日、调休日自动标注 |

技术方案：
- 农历：使用 `flutter_lunar` 或 `lunar` 包实现农历和节气计算
- 钉钉日历：通过钉钉开放平台 OAuth2 授权，调用 Calendar API
- 日历组件：使用 `table_calendar` 或自建日历组件

### 5. 笔记

| 功能 | 说明 |
|---|---|
| 编辑器 | WYSIWYG 富文本编辑器 |
| 笔记列表 | 按更新时间倒序，支持全文搜索 |
| 分类/标签 | 支持为笔记添加标签，按标签筛选 |
| 附件 | 支持插入图片 |
| 导出 | 导出为纯文本/html |

技术方案：使用 `flutter_quill` 或 `appflowy_editor` 作为富文本编辑器。

### 6. 股票

| 功能 | 说明 |
|---|---|
| 自选股管理 | 添加/删除股票（按代码） |
| 行情展示 | 实时/延迟行情（最新价、涨跌幅、最高/最低） |
| 看板模式 | 自选股列表展示，支持排序 |
| 数据刷新 | 定时自动刷新 + 手动下拉刷新 |

技术方案：接入新浪财经免费 API 获取 A 股/港股/美股行情。

### 7. 记账

| 功能 | 说明 |
|---|---|
| 收支记录 | 单笔记录：类型(收入/支出)、分类、金额、日期、备注 |
| 分类管理 | 预设分类（餐饮/交通/购物/住房/娱乐/工资/投资收益等） |
| 月度汇总 | 月度收支统计图表（饼图/柱状图） |
| 预算管理 | 每个分类可设置月度预算，实时显示预算进度 |

数据模型：

```dart
// accounting_records
id, type(income/expense), category_id, amount, record_date,
note, created_at

// accounting_categories
id, name, icon, type(income/expense), monthly_budget, sort_order

// accounting_budgets
id, category_id, month(YYYY-MM), budget_amount
```

### 8. 运动记录

| 功能 | 说明 |
|---|---|
| 运动类型 | 跑步、骑行、健身（增肌/减脂/塑形） |
| 手动记录 | 类型 + 时长 + 距离(可选) + 消耗卡路里 |
| 数据同步 | 从华为健康、Keep 同步运动数据 |
| 统计展示 | 按月统计运动次数、总时长、总距离 |

第三方同步方案：
- 华为健康：通过华为运动健康 API（Health Kit）接入
- Keep：通过 Keep 开放平台 API 接入

### 9. 日志

| 功能 | 说明 |
|---|---|
| 记录范围 | 所有模块的关键操作（任务创建/完成、邮件收取、记账等） |
| 自动记录 | 系统自动写入，不可用户编辑 |
| 查看方式 | 按时间倒序，按模块筛选 |
| 保留策略 | 保留最近 90 天，支持手动清理 |

### 10. 设置

| 分组 | 设置项 |
|---|---|
| 通用 | 语言（中文/英文）、主题（浅色/深色/跟随系统） |
| 邮箱 | 各邮箱账户管理、新邮件通知开关、收取间隔 |
| 数据 | 自动备份开关、备份路径、手动触发备份/恢复 |
| 显示 | Dashboard 卡片配置 |
| 关于 | 版本号、开源许可 |

### 版本号管理

遵循语义化版本（SemVer）：`MAJOR.MINOR.PATCH+BUILD`

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向后兼容的功能新增
- **PATCH**：向后兼容的问题修复
- **BUILD**：构建号，每次发版递增

版本号在 `pubspec.yaml` 中管理：

```yaml
version: 1.0.0+1  # MAJOR.MINOR.PATCH+BUILD
```

发布流程：
1. 开发阶段：版本号保持 `0.x.y`，BUILD 递增
2. 首次发布：升至 `1.0.0+1`
3. 后续发版：按变更类型递增 MAJOR/MINOR/PATCH，BUILD 每次发版递增

### 设置持久化

使用 `shared_preferences` 存储所有设置项：

```dart
// core/constants/settings_keys.dart
const settingsKeys = {
  'language': 'zh',                     // 语言
  'theme_mode': 'system',               // 主题（light/dark/system）
  'auto_backup': true,                  // 自动备份开关
  'backup_path': '',                    // 备份路径
  'email_poll_interval': 5,             // 邮件轮询间隔（分钟）
  'new_email_notification': true,       // 新邮件通知开关
  'task_due_notification': true,        // 任务到期提醒开关
  'exercise_notification': true,        // 运动目标提醒开关
  'auto_start': false,                  // 开机自启动（Windows）
};
```

```dart
// core/providers/settings_provider.dart
final settingsProvider = StateNotifierProvider<SettingsNotifier, SettingsState>((ref) {
  return SettingsNotifier(ref);
});

class SettingsNotifier extends StateNotifier<SettingsState> {
  final Ref _ref;
  SettingsNotifier(this._ref) : super(const SettingsState()) {
    _loadAll();
  }

  Future<void> _loadAll() async {
    final prefs = await SharedPreferences.getInstance();
    state = SettingsState(
      language: prefs.getString('language') ?? 'zh',
      themeMode: prefs.getString('theme_mode') ?? 'system',
      autoBackup: prefs.getBool('auto_backup') ?? true,
      backupPath: prefs.getString('backup_path') ?? '',
      emailPollInterval: prefs.getInt('email_poll_interval') ?? 5,
      newEmailNotification: prefs.getBool('new_email_notification') ?? true,
      taskDueNotification: prefs.getBool('task_due_notification') ?? true,
      exerciseNotification: prefs.getBool('exercise_notification') ?? true,
      autoStart: prefs.getBool('auto_start') ?? false,
    );
  }

  Future<void> update<T>(String key, T value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value is String) await prefs.setString(key, value);
    if (value is bool) await prefs.setBool(key, value);
    if (value is int) await prefs.setInt(key, value);
    _loadAll(); // 重新加载
  }
}
```

## 跨模块通用设计

### Windows 托盘

使用 `system_tray` + `window_manager`：
- 关闭窗口时最小化到托盘而非退出
- 托盘图标右键菜单：显示主窗口、退出
- 新邮件时托盘图标闪烁/气泡通知

### 数据备份

- 自动备份：每天首次启动时自动备份 drift 数据库到 `{文档目录}/EasyWork/backups/`
- 备份文件命名：`easywork_backup_{YYYY-MM-DD_HHmmss}.db`
- 自动备份保留最近 30 天，超过的自动清理
- 手动备份不自动清理
- 手动导出：设置页面按钮触发，生成完整 JSON 包
- 手动恢复：选择备份文件恢复

### 通知系统

```
通知抽象层
├── 邮箱新邮件通知（Windows 弹窗）
├── 任务到期提醒
├── 运动目标达成提醒
└── 通知开关在各模块设置中控制
```

### 路由结构

```
/                           → Dashboard
/timeline                   → Timeline
/tasks                      → 任务看板（看板视图）
/tasks/list                 → 任务列表视图
/tasks/calendar             → 任务日历视图
/tasks/:id                  → 任务详情
/calendar                   → 日历
/email                      → 邮箱收件箱
/email/:id                  → 邮件详情
/email/compose              → 写邮件
/contacts                   → 联系人列表
/contacts/:id               → 联系人详情
/contacts/new               → 新建联系人
/contacts/groups            → 分组管理
/notes                      → 笔记列表
/notes/:id                  → 笔记详情/编辑
/stocks                     → 股票
/accounting                 → 记账
/accounting/report          → 月度报表
/exercise                   → 运动记录
/log                        → 日志
/settings                   → 设置
```

## 开发路线（MVP 阶段）

| 阶段 | 内容 |
|---|---|
| Phase 0 | 项目脚手架：Flutter 初始化、目录结构、drift + Riverpod 配置、主题、国际化、响应式布局框架 |
| Phase 1 | 所有功能的 UI 骨架页面 + 导航切换（空状态占位），侧栏导航 |
| Phase 2 | 邮箱模块：账户配置 → IMAP 收信 → 邮件列表/详情 → 联系人 CRUD + VCF → 签名 → 邮件→任务 |
| Phase 3 | 任务看板：任务 CRUD、看板/列表/日历视图、拖拽排序、周期任务 |
| Phase 4 | Dashboard（可拖拽卡片）+ Timeline（事件聚合） |
| Phase 5 | 日历（农历 + 节假日 + 任务标记）|
| Phase 6 | 笔记、记账（收支 + 预算报表）、运动记录 |
| Phase 7 | 股票行情、日志、设置、备份、Windows 托盘 |
| Phase 8 | 钉钉日历同步、华为健康/Keep 同步 |

## 设计系统

### 设计语言

- **风格定位**：现代柔和（Modern Soft），圆角克制、留白充足、低信息密度
- **毛玻璃**：适度使用，导航栏、激活态卡片、弹窗背景采用 backdrop blur 效果
- **设计原则**：内容优先、减少视觉噪音、一致性的呼吸感

### 色彩体系

#### Light Mode

| Token | Color | 用途 |
|---|---|---|
| `primary` | `#2563EB` | 主色 - 按钮、激活态、链接 |
| `primaryContainer` | `#DBEAFE` | 主色容器 - 选中背景、标签 |
| `onPrimary` | `#FFFFFF` | 主色上的文字/图标 |
| `secondary` | `#0D9488` | 辅助色 - 次要操作 |
| `secondaryContainer` | `#CCFBF1` | 辅助色容器 |
| `surface` | `#F8FAFC` | 页面背景 |
| `surfaceContainer` | `#FFFFFF` | 卡片/容器背景 |
| `surfaceVariant` | `#F1F5F9` | 二级容器背景（hover、输入框） |
| `onSurface` | `#0F172A` | 主要文字 |
| `onSurfaceVariant` | `#475569` | 次要文字 |
| `outline` | `#CBD5E1` | 边框、分割线 |
| `success` | `#16A34A` | 成功状态 |
| `warning` | `#D97706` | 警告状态 |
| `error` | `#DC2626` | 错误/删除 |
| `frost` | `rgba(255,255,255,0.7)` | 毛玻璃背景（light） |

#### Dark Mode

| Token | Color | 用途 |
|---|---|---|
| `primary` | `#60A5FA` | 主色 |
| `primaryContainer` | `#1E3A5F` | 主色容器 |
| `onPrimary` | `#0F172A` | 主色上的文字 |
| `secondary` | `#2DD4BF` | 辅助色 |
| `secondaryContainer` | `#134E4A` | 辅助色容器 |
| `surface` | `#0F172A` | 页面背景 |
| `surfaceContainer` | `#1E293B` | 卡片/容器背景 |
| `surfaceVariant` | `#334155` | 二级容器背景 |
| `onSurface` | `#F1F5F9` | 主要文字 |
| `onSurfaceVariant` | `#94A3B8` | 次要文字 |
| `outline` | `#334155` | 边框、分割线 |
| `frost` | `rgba(30,41,59,0.75)` | 毛玻璃背景（dark） |

### 字体

| Token | Size | Weight | 用途 |
|---|---|---|---|
| `display` | 32px | Bold | 页面大标题 |
| `headline` | 20px | SemiBold | 模块标题 |
| `title` | 16px | SemiBold | 卡片标题、列表项标题 |
| `body` | 14px | Regular | 正文 |
| `bodySmall` | 12px | Regular | 辅助文字 |
| `label` | 12px | Medium | 标签、按钮文字 |
| `caption` | 11px | Regular | 时间戳、次要标注 |

字体栈：系统默认（Windows: Segoe UI Variable, Android: Roboto）。

### 间距系统

基于 4px 网格：

| Token | Size | 用途 |
|---|---|---|
| `space-1` | 4px | 图标与文字间距 |
| `space-2` | 8px | 组件内间距 |
| `space-3` | 12px | 组件间间距 |
| `space-4` | 16px | 卡片内边距 |
| `space-5` | 20px | 区块间距 |
| `space-6` | 24px | 页面边距 |
| `space-8` | 32px | 大区块间距 |
| `space-10` | 40px | 页面顶部间距 |

### 圆角

| Token | Radius | 用途 |
|---|---|---|
| `radius-sm` | 6px | 按钮、输入框 |
| `radius-md` | 10px | 卡片、弹窗 |
| `radius-lg` | 16px | 大卡片、对话框 |
| `radius-full` | 999px | 标签、头像 |

### 阴影 & 毛玻璃

| Token | 效果 | 用途 |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 卡片轻微深度 |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` | 浮动卡片 |
| `shadow-lg` | `0 10px 25px rgba(0,0,0,0.1)` | 弹窗 |
| `frost` | `backdrop-filter: blur(12px)` | 导航栏、激活卡片、弹窗背景 |

### 关键组件设计

#### 导航栏（NavigationRail）

```
Windows:                                   Android:
┌──────┐                                   ┌──── Drawer ────┐
│  🏠  │ ← 激活态（primary bg + frost）      │  🏠  Dashboard │
│  ⏰  │                                     │  ⏰  Timeline  │
│  📋  │ ← hover（surfaceVariant bg）        │  📋  任务看板  │
│  📅  │                                     │  📅  日历      │
│  ✉️  │ ← 带未读标记（红色小圆点）            │  ✉️  邮箱(3)   │
│  📝  │                                     │  📝  笔记      │
│  ... │                                     │  ...           │
└──────┘                                     └────────────────┘
```

- 宽度：48px（固定）
- 图标：24x24，outlined 风格
- 选中态：毛玻璃背景 + primary 图标色
- 未读标记：8px 红色圆点，右上角

#### Dashboard 卡片

```
┌─────────────────────┐
│ 今日待办        ▶   │ ← title + 跳转箭头
│                     │
│  ● 完成周报         │ ← 任务项（多行）
│  ● 回复邮件         │
│  ○ 整理文档         │
│            +3 更多  │ ← 超出折叠
└─────────────────────┘
```

- 背景：白色（light）/ `#1E293B`（dark）
- 圆角：10px
- 内边距：16px
- 阴影：`shadow-sm`
- 标题区：headline 字号 + 右侧跳转箭头
- 拖拽时：阴影升至 `shadow-lg` + 轻微旋转

#### 任务卡片（Kanban）

```
┌──────────────────────┐
│ ● 整理会议笔记        │ ← 标题（body + SemiBold）
│ 📎 2  🏷️ 工作  🔥    │ ← 附件数 + 标签 + 优先级
│ 截止: 7月3日          │ ← 截止日期（过期变红）
└──────────────────────┘
```

- 宽度：自适应列宽（min 240px）
- 圆角：8px
- 左框线按优先级着色（高=红、中=琥珀、低=蓝）
- 拖拽时卡片跟随指针 + 半透明阴影

#### 邮件列表项

```
┌──────────────────────────────────┐
│ 张三                    10:30   │ ← 发件人 + 时间（右对齐）
│ Re: 项目进度讨论                 │ ← 主题（加粗 if 未读）
│ 好的，我这边已经完成了...    📎   │ ← 摘要 + 附件标记
└──────────────────────────────────┘
```

- 未读：左侧 4px primary 竖条 + 主题加粗
- 选中：primaryContainer 背景
- 分隔线：outline 色，1px

### 布局网格

```dart
// 响应式列数
< 600px  → 1列（移动端）
600-900px → 2列（平板）
> 900px  → 3-4列（桌面）
```

由 `ResponsiveGrid` 组件根据可用宽度自动计算列数。

## 平台特性深度设计

### Windows

#### 1. System Tray（系统托盘）

| 技术选型 | 说明 |
|---|---|
| `system_tray` | 托盘图标、右键菜单、气泡通知 |
| `window_manager` | 窗口控制（最小化/最大化/关闭行为、窗口位置恢复） |

**实现行为：**

```
点击关闭按钮 → 不退出应用，隐藏窗口到托盘
双击托盘图标 → 显示主窗口
托盘右键菜单：
  ├── 显示 EasyWork     → window_manager.show()
  ├── ─────────────
  ├── 新建任务           → show() + 导航到任务创建页
  ├── 写邮件             → show() + 导航到写邮件页
  ├── ─────────────
  └── 退出 EasyWork      → 释放所有资源（关闭 IMAP 连接、取消定时器、关闭数据库）→ 退出进程
```

**托盘图标状态：**
- 常态：EasyWork 图标（蓝色）
- 新邮件到达：图标闪烁 + 气泡通知（显示发件人和主题摘要）
- 用户点击气泡 → 打开主窗口并定位到邮件详情

#### 2. Window Management

| 功能 | 实现方式 |
|---|---|
| 窗口大小记忆 | `window_manager` 监听 resize 事件，退出前写入 shared_preferences |
| 窗口位置记忆 | 同上，保存上次关闭时的 (x, y) 坐标 |
| 最小尺寸 | `window_manager.setMinimumSize(800, 600)` |
| 启动行为 | 启动时恢复上次窗口位置/尺寸，若不可见则居中显示 |
| 关闭行为 | `on_window_close` 事件 → `setPreventClose(true)` → 隐藏到托盘 |

#### 3. 后台收信机制

```
应用运行中（含托盘隐藏状态）:
  ┌──────────────────────────────────────────┐
  │  Timer.periodic(Duration(minutes: 5))     │
  │     → 遍历所有已配置邮箱账户               │
  │     → IMAP IDLE（支持时）或 SELECT INBOX   │
  │     → 获取新邮件 UID 列表                  │
  │     → 对比本地最新 UID，发现增量            │
  │     → 下载新邮件 → 写入 drift              │
  │     → 触发 Windows 通知弹窗                │
  │     → Dashboard 未读数更新                 │
  └──────────────────────────────────────────┘
```

- 收取间隔：默认 5 分钟，可在设置中调整（1/5/15/30 分钟）
- 仅收取收件箱，其他文件夹不自动收取
- 添加邮箱账户时，连接 IMAP 服务器发送 CAPABILITY 命令，检测是否支持 IDLE，将结果写入 `supports_idle` 字段
- 支持 IMAP IDLE 的账户使用 `ImapClient.idle()` 长连接监听，不支持的使用 Timer.periodic 轮询
- IDLE 连接断开后自动重连（指数退避，最多 3 次）

#### 4. Windows 通知

| 技术选型 | 说明 |
|---|---|
| `flutter_local_notifications` | 跨平台本地通知，支持 Windows Toast |

**通知分类：**

| 通知类型 | 触发条件 | 点击行为 | 按钮操作 |
|---|---|---|---|
| 新邮件 | IMAP 收取到新邮件 | 打开主窗口 → 邮件详情 | "标记已读"、"转为任务" |
| 任务到期 | 定时检查任务截止日期 | 打开主窗口 → 任务详情 | "标记完成"、"推迟一天" |
| 数据备份 | 每日自动备份完成 | 打开设置页 | - |

**通知渠道（Android 也需要）：**

```dart
// 定义三个通知渠道
email_channel:     id='email',     name='邮件通知',     importance=high
task_channel:      id='task',      name='任务提醒',     importance=high
system_channel:    id='system',    name='系统通知',     importance=low
```

#### 5. Windows 自启动

可选设置项：`设置 → 通用 → 开机自启动`

```
开启时 → 写注册表 Run 键：
  HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
  EasyWork = "C:\path\to\easywork.exe"
关闭时 → 删除该注册表项
```

#### 6. 文件关联

| 文件类型 | 关联操作 |
|---|---|
| `.vcf` | 双击用 EasyWork 打开 → 导入联系人 |
| （未来）`mailto:` | 点击 mailto 链接 → 打开写邮件页 |

### Android

#### 1. Background Service（后台服务）

| 技术选型 | 说明 |
|---|---|
| `workmanager` | Android 后台周期性任务，最低 15 分钟间隔 |

**注册任务：**

```dart
Workmanager().registerPeriodicTask(
  'email-fetch',
  'backgroundEmailFetch',
  frequency: Duration(minutes: 15),  // Android 最低 15 分钟
  constraints: Constraints(
    networkType: NetworkType.connected,
  ),
);
```

- 收取新邮件（同 Windows 逻辑）
- 检查即将到期的任务（当日/次日）
- 触发对应通知

#### 2. Android 通知

- 使用 `flutter_local_notifications` 同一套抽象
- 三个通道同 Windows（email/task/system）
- 通知栏分组：按邮件会话归组
- 锁屏显示：敏感内容可选隐藏

#### 3. App Shortcuts（快捷方式）

```xml
<!-- Android 11+ 长按图标快捷方式 -->
<shortcuts>
  <shortcut
    android:shortcutId="new_task"
    android:enabled="true"
    android:icon="@drawable/ic_task"
    android:shortcutShortLabel="@string/shortcut_new_task"
    android:shortcutLongLabel="@string/shortcut_new_task_detail">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="easywork://tasks/new" />
  </shortcut>
  <shortcut
    android:shortcutId="compose_email"
    android:enabled="true"
    android:icon="@drawable/ic_email"
    android:shortcutShortLabel="@string/shortcut_compose_email"
    android:shortcutLongLabel="@string/shortcut_compose_email_detail">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="easywork://email/compose" />
  </shortcut>
  <shortcut
    android:shortcutId="quick_accounting"
    android:enabled="true"
    android:icon="@drawable/ic_accounting"
    android:shortcutShortLabel="@string/shortcut_accounting"
    android:shortcutLongLabel="@string/shortcut_accounting_detail">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="easywork://accounting/new" />
  </shortcut>
</shortcuts>
```

#### 4. Deep Links

| URI | 目标页面 |
|---|---|
| `easywork://tasks/new` | 新建任务 |
| `easywork://tasks/:id` | 任务详情 |
| `easywork://email/compose` | 写邮件 |
| `easywork://email/:id` | 邮件详情 |
| `easywork://accounting/new` | 快速记账 |

#### 5. Share Intent（分享到 EasyWork）

注册 Android Intent Filter：

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="text/plain" />
</intent-filter>
```

从浏览器/其他 App 分享文字 → EasyWork 弹出选择：
- 创建笔记（以分享内容作为笔记正文）
- 创建任务（以分享内容作为任务描述）

## 国际化（i18n）架构

### 技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | `flutter_localizations` (SDK) | Material/Cupertino 组件内置翻译 |
| 核心 | `intl` | 消息格式化、日期/数字/货币格式化 |
| 格式 | ARB (App Resource Bundle) | Flutter 标准字符串资源格式 |
| 生成 | `flutter gen-l10n` | 官方代码生成器，编译期类型安全 |

### ARB 文件结构

```
lib/l10n/
├── app_zh.arb                    # 中文翻译（基准语言）
├── app_en.arb                    # 英文翻译
├── intl_messages.arb             # 生成暂存（自动生成，不手动编辑）
└── intl_messages_all.dart        # 生成入口（自动生成，不手动编辑）
```

配置 `l10n.yaml`：

```yaml
arb-dir: lib/l10n
template-arb-file: app_zh.arb        # 中文为模板（项目基准语言）
output-localization-file: app_localizations.dart
output-class: EasyWorkLocalizations   # 自定义类名，避免与 Material 冲突
synthetic-package: false
untranslated-messages-file: lib/l10n/untranslated.json
use-deferred-loading: false
```

### 字符串命名规范

**格式：** `{模块}_{页面}_{描述}`

| 前缀 | 模块 | 示例 |
|---|---|---|
| `common_` | 全局通用 | `common_save`, `common_cancel`, `common_confirm` |
| `nav_` | 导航栏 | `nav_dashboard`, `nav_email`, `nav_tasks` |
| `dashboard_` | Dashboard | `dashboard_today_tasks`, `dashboard_unread_emails` |
| `task_` | 任务看板 | `task_create`, `task_drag_to_column`, `task_recurring_daily` |
| `email_` | 邮箱 | `email_inbox`, `email_compose`, `email_to_task` |
| `contact_` | 联系人 | `contact_import_vcf`, `contact_export`, `contact_group` |
| `calendar_` | 日历 | `calendar_lunar`, `calendar_holiday`, `calendar_dingtalk` |
| `note_` | 笔记 | `note_create`, `note_rich_text`, `note_tag` |
| `stock_` | 股票 | `stock_add_watch`, `stock_price`, `stock_change` |
| `accounting_` | 记账 | `accounting_income`, `accounting_expense`, `accounting_budget` |
| `exercise_` | 运动 | `exercise_running`, `exercise_cycling`, `exercise_duration` |
| `log_` | 日志 | `log_system`, `log_module_filter` |
| `settings_` | 设置 | `settings_language`, `settings_theme`, `settings_backup` |
| `error_` | 错误提示 | `error_network`, `error_imap_connect`, `error_generic` |
| `notification_` | 通知 | `notification_new_email`, `notification_task_due` |

### ARB 示例（中文基准）

```json
{
  "@@locale": "zh",

  "common_save": "保存",
  "@common_save": { "description": "通用保存按钮" },

  "common_cancel": "取消",
  "@common_cancel": { "description": "通用取消按钮" },

  "common_confirm": "确认",
  "@common_confirm": { "description": "通用确认按钮" },

  "common_search": "搜索",
  "@common_search": { "description": "通用搜索占位符" },

  "nav_dashboard": "首页",
  "nav_timeline": "时间线",
  "nav_tasks": "任务看板",
  "nav_calendar": "日历",
  "nav_email": "邮箱",
  "nav_notes": "笔记",
  "nav_stocks": "股票",
  "nav_accounting": "记账",
  "nav_exercise": "运动",
  "nav_log": "日志",
  "nav_settings": "设置",

  "task_create": "新建任务",
  "@task_create": { "description": "创建新任务的按钮/标题" },

  "task_priority_high": "高",
  "task_priority_medium": "中",
  "task_priority_low": "低",

  "task_status_todo": "待办",
  "task_status_in_progress": "进行中",
  "task_status_done": "已完成",
  "task_status_suspended": "挂起",
  "task_status_abandoned": "废弃",
  "task_status_archived": "归档",

  "task_recurring_daily": "每天",
  "task_recurring_weekly": "每周",
  "task_recurring_monthly": "每月",
  "task_recurring_weekdays": "工作日",

  "email_inbox": "收件箱",
  "email_sent": "已发送",
  "email_drafts": "草稿箱",
  "email_junk": "垃圾邮件",
  "email_unread_count": "{count} 封未读",
  "@email_unread_count": {
    "description": "未读邮件数量",
    "placeholders": {
      "count": { "type": "int", "example": "5" }
    }
  },

  "email_to_task": "转为任务",
  "email_signature_manage": "签名管理",
  "email_signature_default": "设为默认",

  "contact_new": "新建联系人",
  "contact_group_create": "新建分组",
  "contact_import_vcf": "导入 VCF",
  "contact_export_vcf": "导出 VCF",

  "calendar_lunar_date": "农历 {date}",
  "calendar_holiday": "节假日",
  "calendar_dingtalk_sync": "钉钉日历同步",

  "accounting_income": "收入",
  "accounting_expense": "支出",
  "accounting_budget_remaining": "预算剩余 {amount}",
  "@accounting_budget_remaining": {
    "description": "预算剩余金额",
    "placeholders": {
      "amount": { "type": "String", "example": "¥500" }
    }
  },

  "exercise_type_running": "跑步",
  "exercise_type_cycling": "骑行",
  "exercise_type_fitness": "健身",

  "notification_new_email_title": "新邮件",
  "notification_new_email_body": "来自 {sender}：{subject}",
  "@notification_new_email_body": {
    "placeholders": {
      "sender": { "type": "String" },
      "subject": { "type": "String" }
    }
  },

  "notification_task_due_title": "任务到期提醒",
  "notification_task_due_body": "「{taskName}」即将在 {time} 截止",
  "@notification_task_due_body": {
    "placeholders": {
      "taskName": { "type": "String" },
      "time": { "type": "String", "example": "2 小时" }
    }
  },

  "error_imap_connect": "无法连接到邮箱服务器，请检查网络和账户设置",
  "error_network": "网络连接失败，请稍后重试",
  "error_generic": "操作失败：{message}",
  "@error_generic": {
    "placeholders": {
      "message": { "type": "String" }
    }
  }
}
```

### ARB 示例（英文翻译）

```json
{
  "@@locale": "en",

  "common_save": "Save",
  "common_cancel": "Cancel",
  "common_confirm": "Confirm",
  "common_search": "Search",

  "nav_dashboard": "Dashboard",
  "nav_timeline": "Timeline",
  "nav_tasks": "Tasks",
  "nav_calendar": "Calendar",
  "nav_email": "Email",
  "nav_notes": "Notes",
  "nav_stocks": "Stocks",
  "nav_accounting": "Accounting",
  "nav_exercise": "Exercise",
  "nav_log": "Log",
  "nav_settings": "Settings",

  "task_create": "New Task",
  "task_priority_high": "High",
  "task_priority_medium": "Medium",
  "task_priority_low": "Low",
  "task_status_todo": "To Do",
  "task_status_in_progress": "In Progress",
  "task_status_done": "Done",
  "task_status_suspended": "Suspended",
  "task_status_abandoned": "Abandoned",
  "task_status_archived": "Archived",
  "task_recurring_daily": "Daily",
  "task_recurring_weekly": "Weekly",
  "task_recurring_monthly": "Monthly",
  "task_recurring_weekdays": "Weekdays",

  "email_inbox": "Inbox",
  "email_sent": "Sent",
  "email_drafts": "Drafts",
  "email_junk": "Spam",
  "email_unread_count": "{count} unread",
  "email_to_task": "Convert to Task",
  "email_signature_manage": "Manage Signatures",
  "email_signature_default": "Set as Default",

  "contact_new": "New Contact",
  "contact_group_create": "New Group",
  "contact_import_vcf": "Import VCF",
  "contact_export_vcf": "Export VCF",

  "calendar_lunar_date": "Lunar {date}",
  "calendar_holiday": "Holiday",
  "calendar_dingtalk_sync": "DingTalk Sync",

  "accounting_income": "Income",
  "accounting_expense": "Expense",
  "accounting_budget_remaining": "{amount} remaining",

  "exercise_type_running": "Running",
  "exercise_type_cycling": "Cycling",
  "exercise_type_fitness": "Fitness",

  "notification_new_email_title": "New Email",
  "notification_new_email_body": "From {sender}: {subject}",
  "notification_task_due_title": "Task Reminder",
  "notification_task_due_body": "\"{taskName}\" is due in {time}",

  "error_imap_connect": "Unable to connect to mail server. Please check network and account settings.",
  "error_network": "Network connection failed. Please try again later.",
  "error_generic": "Operation failed: {message}"
}
```

### 语言切换工作流

```
应用启动
  → 读取 shared_preferences 中用户选定的语言（如有）
  → 无则跟随系统 locale（LocaleSettings.useDeviceLocale）
  → 初始化 MaterialApp 的 supportedLocales 和 localizationsDelegates

用户切换语言（设置页 → 语言选择器）
  → 写入 shared_preferences
  → 触发 App 重建
  → MaterialApp 使用新 locale 重建所有 widget 树

Widget 中使用：
  final l10n = EasyWorkLocalizations.of(context)!;
  Text(l10n.common_save);                    // "保存"
  Text(l10n.email_unread_count(5));           // "5 封未读"
  Text(l10n.nav_email);                       // "邮箱"
```

### 日期/数字/货币格式化

```dart
// 日期 - 随 locale 自动变化
DateFormat.yMMMd(context.locale).format(date);       // 2026年7月1日 / Jul 1, 2026

// 数字 - 千分位随 locale
NumberFormat('#,##0.00', context.locale).format(1234.5); // 1,234.50 / 1,234.50

// 货币
NumberFormat.currency(locale: context.locale, symbol: '¥').format(99.9); // ¥99.90
```

## 跨模块事件总线（Event Bus）

### 设计目标

- 模块间**零直接依赖**：task_board 不 import email，email 不 import task_board
- **类型安全**：所有事件有明确的类型和负载
- **单向数据流**：事件发布 → 订阅者处理 → UI 更新
- **可测试**：EventBus 可注入 Mock 实现

### 技术方案

使用 `flutter_riverpod` 的 `Provider` + `StreamProvider` / `StateNotifierProvider` 组合，不引入额外的事件总线包：

```dart
// 中心事件总线 —— 基于 Riverpod StreamController
final eventBusProvider = Provider<EventBus>((ref) {
  return EventBus();
});
```

### 事件定义

```
lib/
└── shared/
    └── events/
        ├── event_bus.dart               # EventBus 核心实现
        ├── app_event.dart               # 事件基类
        ├── task_events.dart             # 任务模块事件
        ├── email_events.dart            # 邮箱模块事件
        ├── accounting_events.dart       # 记账模块事件
        ├── exercise_events.dart         # 运动模块事件
        ├── note_events.dart             # 笔记模块事件
        └── notification_events.dart     # 通知请求事件
```

### 事件基类

```dart
// app_event.dart
abstract class AppEvent {
  final DateTime occurredAt;
  final String moduleName;

  AppEvent({
    DateTime? occurredAt,
    required this.moduleName,
  }) : occurredAt = occurredAt ?? DateTime.now();
}

// 通用事件包装
class DataChangedEvent<T> extends AppEvent {
  final ChangeType changeType;  // created / updated / deleted
  final T data;
  final String? description;

  DataChangedEvent({
    required super.moduleName,
    required this.changeType,
    required this.data,
    this.description,
  });
}

enum ChangeType { created, updated, deleted }
```

### EventBus 核心

```dart
// event_bus.dart
class EventBus {
  final _controller = StreamController<AppEvent>.broadcast();

  Stream<T> on<T extends AppEvent>() => _controller.stream
      .where((event) => event is T)
      .cast<T>();

  void publish<T extends AppEvent>(T event) => _controller.add(event);

  void dispose() => _controller.close();
}
```

### 事件清单

#### 任务模块事件（task_events.dart）

```dart
class TaskCreatedEvent extends AppEvent {
  final int taskId;
  final String title;
  final String priority;
  TaskCreatedEvent({
    required this.taskId, required this.title, required this.priority,
  }) : super(moduleName: 'task_board');
}

class TaskStatusChangedEvent extends AppEvent {
  final int taskId;
  final String title;
  final String oldStatus;
  final String newStatus;
  TaskStatusChangedEvent({...});
}

class TaskDeletedEvent extends AppEvent {
  final int taskId;
  final String title;
  TaskDeletedEvent({...});
}
```

#### 邮箱模块事件（email_events.dart）

```dart
class NewEmailReceivedEvent extends AppEvent {
  final int emailId;
  final String fromAddress;
  final String subject;
  NewEmailReceivedEvent({...});
}

class EmailConvertedToTaskEvent extends AppEvent {
  final int emailId;
  final int taskId;
  final String subject;
  EmailConvertedToTaskEvent({...});
}

class UnreadCountChangedEvent extends AppEvent {
  final int totalUnread;
  UnreadCountChangedEvent({...}) : super(moduleName: 'email');
}
```

#### 记账模块事件（accounting_events.dart）

```dart
class TransactionRecordedEvent extends AppEvent {
  final double amount;
  final String type;      // income / expense
  final String category;
  TransactionRecordedEvent({...});
}
```

#### 运动模块事件（exercise_events.dart）

```dart
class ExerciseCompletedEvent extends AppEvent {
  final String exerciseType;
  final int durationMinutes;
  final double? distanceKm;
  ExerciseCompletedEvent({...});
}
```

#### 通知请求事件（notification_events.dart）

```dart
class RequestNotificationEvent extends AppEvent {
  final String title;
  final String body;
  final NotificationType type;  // email / task / system
  final String? routeOnTap;     // 点击通知后的路由
  RequestNotificationEvent({...});
}
```

### 模块间订阅关系图

```
发布者                      EventBus                       订阅者
─────────                ──────────                      ─────────
task_board ──TaskCreatedEvent────▶  ──▶ Timeline（记录事件流）
task_board ──TaskStatusChanged──▶  ──▶ Dashboard（更新待办计数）
task_board ──TaskDeletedEvent───▶  ──▶ Notification（到期提醒）
                                    
email ──────NewEmailReceived────▶  ──▶ Timeline
email ──────UnreadCountChanged──▶  ──▶ Dashboard（更新未读数）
email ──────EmailToTaskEvent────▶  ──▶ TaskBoard（刷新关联任务）
                                    
accounting ─TransactionRecorded─▶  ──▶ Timeline
accounting ─────────────────────▶  ──▶ Dashboard（更新月度图表）
                                    
exercise ──ExerciseCompleted────▶  ──▶ Timeline
exercise ───────────────────────▶  ──▶ Dashboard（更新运动摘要）
                                    
(任意模块) ─RequestNotification─▶  ──▶ NotificationService（弹窗）
```

### Provider 侧订阅示例

```dart
// providers/event_subscriptions.dart
final eventSubscriptionsProvider = Provider<EventSubscriptions>((ref) {
  return EventSubscriptions(ref);
});

class EventSubscriptions {
  final Ref _ref;
  late final List<StreamSubscription> _subscriptions;

  EventSubscriptions(this._ref) {
    final bus = _ref.read(eventBusProvider);
    _subscriptions = [
      bus.on<TaskCreatedEvent>().listen((e) {
        _ref.read(timelineProvider.notifier).addEvent(e);
        _ref.read(dashboardTasksProvider.notifier).refresh();
      }),
      bus.on<TaskStatusChangedEvent>().listen((e) {
        _ref.read(timelineProvider.notifier).addEvent(e);
        _ref.read(dashboardTasksProvider.notifier).refresh();
      }),
      bus.on<NewEmailReceivedEvent>().listen((e) {
        _ref.read(timelineProvider.notifier).addEvent(e);
        _ref.read(dashboardUnreadProvider.notifier).increment();
      }),
      bus.on<TransactionRecordedEvent>().listen((e) {
        _ref.read(timelineProvider.notifier).addEvent(e);
        _ref.read(dashboardBudgetProvider.notifier).refresh();
      }),
      bus.on<ExerciseCompletedEvent>().listen((e) {
        _ref.read(timelineProvider.notifier).addEvent(e);
        _ref.read(dashboardExerciseProvider.notifier).refresh();
      }),
      bus.on<RequestNotificationEvent>().listen((e) {
        _ref.read(notificationServiceProvider).show(e);
      }),
    ];
  }

  void dispose() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
  }
}
```

### 完整数据流示例：新邮件 → 通知 + Dashboard + Timeline

```
                 ┌──────────────────────────────────────┐
                 │  IMAP 收取新邮件                       │
                 │  → 存入 drift emails 表                │
                 │  → eventBus.publish(                  │
                 │      NewEmailReceivedEvent(...))      │
                 └────────────┬─────────────────────────┘
                              │
                              ▼
                 ┌──────────────────────┐
                 │     EventBus         │
                 │   (broadcast)        │
                 └──┬───────┬───────┬──┘
                    │       │       │
        ┌───────────┘       │       └───────────┐
        ▼                   ▼                   ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ TimelineProvider │ │ Dashboard    │ │ Notification     │
│ → addEvent(     │ │ UnreadProv   │ │ Service          │
│   "收到来自      │ │ → increment  │ │ → show toast     │
│   张三的邮件")   │ │ → UI更新     │ │ → Windows 弹窗   │
└─────────────────┘ └──────────────┘ └──────────────────┘
```

### 实现注意事项

| 关注点 | 方案 |
|---|---|
| 内存泄漏 | `EventSubscriptions` 在 Provider dispose 时 cancel 所有订阅 |
| 性能 | `StreamController.broadcast()` 支持多订阅者，零拷贝 |
| 错误隔离 | 单个订阅者异常不影响其他订阅者 |
| 测试 | EventBus 可在测试中注入，`publish` 后 `on<T>()` 验证收到 |

### EventBus 生命周期

EventBus 是全局单例 Provider（`Provider<EventBus>`），应用生命周期内不 dispose。各模块的 EventSubscriptions 在各自 Provider dispose 时取消订阅（cancel 所有 StreamSubscription）。EventBus 的 `StreamController.broadcast()` 支持多订阅者，无需担心内存泄漏。

```dart
// EventBus 全局单例 — 应用级，不 dispose
final eventBusProvider = Provider<EventBus>((ref) {
  return EventBus();  // 无 ref.onDispose，应用退出时自然回收
});
```

## Riverpod 状态管理架构

### 分层原则

```
UI (Widget)
  │  ref.watch(provider)        ← 自动重建
  │  ref.read(provider.notifier).method()  ← 触发副作用
  ▼
Provider 层
  │  调用 Repository 接口
  ▼
Repository 层（抽象）
  │  domain/repositories/*.dart
  ▼
Data Source 层
  ├── Drift (本地 SQLite)
  └── IMAP / SMTP (远程)
```

### Provider 类型选择

| 场景 | Provider 类型 | 说明 |
|---|---|---|
| 全局单例服务（EventBus、DB、Notification） | `Provider` | 只初始化一次，应用生命周期 |
| 可变状态（语言、主题） | `StateProvider` | 简单状态读写 |
| 异步数据列表 | `AsyncNotifierProvider` | 支持 loading/error/data 三态 |
| 需要副作用的复杂状态 | `NotifierProvider` | 含业务逻辑的 mutable 状态 |
| 依赖其他 Provider 的计算值 | `Provider` / `FutureProvider` | 派生/过滤/聚合 |
| 页面临时状态（搜索框、下拉刷新） | `StateProvider.autoDispose` | 离开页面自动释放 |

### Provider 依赖图（全局层）

```
                          ┌─────────────────────┐
                          │   appDatabaseProvider │  ← Provider (drift)
                          └──────────┬──────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
   │ emailRepoProvider   │ │ taskRepoProvider    │ │ accountingRepo     │
   │ (Provider)          │ │ (Provider)          │ │ (Provider)         │
   └────────┬───────────┘ └────────┬───────────┘ └────────┬───────────┘
            │                      │                      │
            ▼                      ▼                      ▼
   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
   │ eventBusProvider    │ │ eventSubscriptions  │ │ notificationProv   │
   │ (Provider)          │ │ (Provider)          │ │ (Provider)         │
   └────────────────────┘ └────────────────────┘ └────────────────────┘
```

### Provider 依赖图（模块级 - 以邮箱为例）

```
┌───────────────────┐
│ appDatabaseProv    │  ← core (drift 实例)
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ emailRepoProvider  │  ← data/repositories (封装 drift + IMAP)
└────────┬──────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   邮箱 Provider 群                        │
├─────────────────────────────────────────────────────────┤
│  emailAccountListProvider     (AsyncNotifierProvider)    │
│      └─ 账户列表 + 切换逻辑                               │
│                                                          │
│  emailListProvider(folder)    (AsyncNotifierProvider)    │
│      └─ 按文件夹分页获取邮件                              │
│      └─ folder 参数: inbox / sent / drafts / junk         │
│                                                          │
│  unreadCountProvider           (Provider<int>)           │
│      └─ 从 emailListProvider 派生（watch 后计算）         │
│                                                          │
│  emailDetailProvider(id)      (FutureProvider.autoDispose)│
│      └─ 根据 ID 获取单封邮件详情                          │
│                                                          │
│  composeEmailProvider          (StateNotifierProvider)   │
│      └─ 写邮件表单状态（收件人/主题/正文/签名/附件）       │
│                                                          │
│  contactListProvider           (AsyncNotifierProvider)   │
│      └─ 联系人列表 + 分组筛选                             │
│                                                          │
│  contactGroupProvider          (AsyncNotifierProvider)   │
│      └─ 分组 CRUD                                        │
│                                                          │
│  signatureProvider             (AsyncNotifierProvider)   │
│      └─ 签名管理                                          │
└──────────────────────────────────────────────────────────┘
```

### Riverpod 代码示例

#### 全局数据库 Provider

```dart
// core/providers/database_provider.dart
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});
```

#### AsyncNotifier 模式（推荐用于列表）

```dart
// features/email/providers/email_list_provider.dart
final emailListProvider = AsyncNotifierProvider.family<
  EmailListNotifier, List<Email>, EmailFolder>(
  EmailListNotifier.new,
);

class EmailListNotifier extends FamilyAsyncNotifier<List<Email>, EmailFolder> {
  @override
  Future<List<Email>> build(EmailFolder arg) async {
    final repo = ref.read(emailRepoProvider);
    return repo.getEmails(folder: arg, limit: 50);
  }

  Future<void> refresh() async {
    final repo = ref.read(emailRepoProvider);
    state = AsyncLoading();
    state = await AsyncValue.guard(() => repo.getEmails(folder: arg, limit: 50));
  }

  Future<void> markAsRead(int emailId) async {
    final repo = ref.read(emailRepoProvider);
    await repo.markAsRead(emailId);
    ref.invalidateSelf(); // 刷新列表
  }
}
```

#### 派生 Provider（计算未读数）

```dart
// features/email/providers/unread_count_provider.dart
final unreadCountProvider = Provider<int>((ref) {
  final inboxEmails = ref.watch(emailListProvider(EmailFolder.inbox));
  return inboxEmails.when(
    data: (emails) => emails.where((e) => !e.isRead).length,
    loading: () => 0,
    error: (_, __) => 0,
  );
});
```

#### Provider 内调用 EventBus

```dart
// features/task_board/providers/task_provider.dart
class TaskListNotifier extends AsyncNotifier<List<Task>> {
  @override
  Future<List<Task>> build() async {
    final repo = ref.read(taskRepoProvider);
    return repo.getAllTasks();
  }

  Future<void> createTask(Task task) async {
    final repo = ref.read(taskRepoProvider);
    final created = await repo.insert(task);
    // 发布事件 → Timeline / Dashboard 自动接收
    ref.read(eventBusProvider).publish(
      TaskCreatedEvent(taskId: created.id!, title: created.title, priority: created.priority),
    );
    ref.invalidateSelf();
  }

  Future<void> updateStatus(int taskId, String newStatus, String oldStatus) async {
    final repo = ref.read(taskRepoProvider);
    await repo.updateStatus(taskId, newStatus);
    final task = await repo.getById(taskId);
    ref.read(eventBusProvider).publish(
      TaskStatusChangedEvent(taskId: taskId, title: task!.title, oldStatus: oldStatus, newStatus: newStatus),
    );
    ref.invalidateSelf();
  }
}
```

### 模块间通信：EventBus 订阅者 Provider

```dart
// shared/events/event_subscriptions.dart
final eventSubscriptionsProvider = Provider<EventSubscriptions>((ref) {
  final subs = EventSubscriptions(ref);
  ref.onDispose(subs.dispose);
  return subs;
});
```

在 `main.dart` 中只需一次初始化：

```dart
void main() {
  runApp(
    ProviderScope(
      child: EasyWorkApp(),
    ),
  );
}

// MaterialApp 外层只需读取 eventSubscriptionsProvider 即可激活订阅
class EasyWorkApp extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(eventSubscriptionsProvider); // 保持订阅活跃
    // ... MaterialApp
  }
}
```

### Provider 最佳实践

| 原则 | 说明 |
|---|---|
| **模块自治** | 每个 module 的 provider 在自己目录下，不跨模块 import |
| **单向依赖** | Provider → Repository（interface），不反向 |
| **autoDispose 用在页面级** | 临时筛选/搜索/表单状态 |
| **keepAlive 用在全局级** | 数据库、服务、列表缓存 |
| **不滥用 watch** | 只有 UI 需要重建时才用 `watch`，副作用用 `listen` |
| **EventBus 替代跨模块 ref.read** | 避免 A 模块直接操作 B 模块的 provider |

### 典型数据流：用户完成任务

```
User 拖拽卡片到 "已完成" 列
  │
  ▼
ref.read(taskListProvider.notifier).updateStatus(taskId, 'done', 'in_progress')
  │
  ├── taskRepoProvider.updateStatus(taskId, 'done')
  │     └── drift: UPDATE tasks SET status='done' WHERE id=taskId
  │
  ├── eventBusProvider.publish(TaskStatusChangedEvent(...))
  │     │
  │     ├── (Timeline 订阅) → timelineProvider.addEvent(event)
  │     │     └── UI 重建：时间线新增一条记录
  │     │
  │     ├── (Dashboard 订阅) → dashboardTasksProvider.refresh()
  │     │     └── UI 重建：待办数减少
  │     │
  │     └── (Notification 可选) → 无（已完成不需要提醒）
  │
  └── ref.invalidateSelf()
        └── UI 重建：看板列刷新
```

## 路由与导航架构

### 技术选型

| 选型 | 说明 |
|---|---|
| `go_router` | Flutter 官方推荐声明式路由，支持 ShellRoute、Deep Link、路由守卫 |
| `ShellRoute` | 维持持久导航壳（NavigationRail + 内容区） |

### 路由结构总览

```
/                              → Dashboard
/timeline                      → Timeline
/tasks                         → 任务看板（看板视图）
/tasks/list                    → 任务列表视图
/tasks/calendar                → 任务日历视图
/tasks/new                     → 新建任务
/tasks/:id                     → 任务详情
/calendar                      → 日历
/email                         → 邮箱收件箱
/email/:id                     → 邮件详情
/email/compose                 → 写邮件
/email/accounts                → 邮箱账户管理
/contacts                      → 联系人列表
/contacts/new                  → 新建联系人
/contacts/:id                  → 联系人详情
/contacts/groups               → 联系人分组管理
/signatures                    → 签名管理
/notes                         → 笔记列表
/notes/:id                     → 笔记详情/编辑
/stocks                        → 股票页面
/accounting                    → 记账概览
/accounting/report             → 月度报表
/exercise                      → 运动记录
/log                           → 日志
/settings                      → 设置
/settings/backup               → 数据备份
/settings/accounts             → 邮箱账户设置
```

### go_router 配置

```dart
// core/router/app_router.dart
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: true,
    
    // ---- 路由守卫 ----
    redirect: (context, state) {
      // 当前无特殊守卫逻辑，保留扩展点
      return null;
    },

    // ---- Deep Link 支持 ----
    // Android: easywork://tasks/123
    // Windows: 命令行参数 / 协议注册

    // ---- 路由表 ----
    routes: [
      // ShellRoute：保持 NavigationRail / Drawer 持续存在
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/',
            name: 'dashboard',
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: '/timeline',
            name: 'timeline',
            builder: (context, state) => const TimelinePage(),
          ),

          // ---- 任务看板 ----
          GoRoute(
            path: '/tasks',
            name: 'tasks',
            builder: (context, state) => const TaskBoardPage(),
            routes: [
              GoRoute(
                path: 'list',
                name: 'task-list',
                builder: (context, state) => const TaskListPage(),
              ),
              GoRoute(
                path: 'calendar',
                name: 'task-calendar',
                builder: (context, state) => const TaskCalendarPage(),
              ),
              GoRoute(
                path: 'new',
                name: 'task-new',
                builder: (context, state) => const TaskFormPage(),
              ),
              GoRoute(
                path: ':id',
                name: 'task-detail',
                builder: (context, state) {
                  final id = int.parse(state.pathParameters['id']!);
                  return TaskDetailPage(taskId: id);
                },
              ),
            ],
          ),

          // ---- 邮箱 ----
          GoRoute(
            path: '/email',
            name: 'email',
            builder: (context, state) => const EmailListPage(),
            routes: [
              GoRoute(
                path: ':id',
                name: 'email-detail',
                builder: (context, state) {
                  final id = int.parse(state.pathParameters['id']!);
                  return EmailDetailPage(emailId: id);
                },
              ),
              GoRoute(
                path: 'compose',
                name: 'email-compose',
                builder: (context, state) => const ComposePage(),
              ),
              GoRoute(
                path: 'accounts',
                name: 'email-accounts',
                builder: (context, state) => const EmailAccountsPage(),
              ),
            ],
          ),

          // ---- 联系人 ----
          GoRoute(
            path: '/contacts',
            name: 'contacts',
            builder: (context, state) => const ContactListPage(),
            routes: [
              GoRoute(
                path: 'new',
                name: 'contact-new',
                builder: (context, state) => const ContactFormPage(),
              ),
              GoRoute(
                path: ':id',
                name: 'contact-detail',
                builder: (context, state) {
                  final id = int.parse(state.pathParameters['id']!);
                  return ContactDetailPage(contactId: id);
                },
              ),
              GoRoute(
                path: 'groups',
                name: 'contact-groups',
                builder: (context, state) => const ContactGroupPage(),
              ),
            ],
          ),

          // ---- 签名 ----
          GoRoute(
            path: '/signatures',
            name: 'signatures',
            builder: (context, state) => const SignatureManagePage(),
          ),

          // ---- 日历 ----
          GoRoute(
            path: '/calendar',
            name: 'calendar',
            builder: (context, state) => const CalendarPage(),
          ),

          // ---- 笔记 ----
          GoRoute(
            path: '/notes',
            name: 'notes',
            builder: (context, state) => const NotesListPage(),
            routes: [
              GoRoute(
                path: ':id',
                name: 'note-detail',
                builder: (context, state) {
                  final id = int.parse(state.pathParameters['id']!);
                  return NoteDetailPage(noteId: id);
                },
              ),
            ],
          ),

          // ---- 其他 ----
          GoRoute(
            path: '/stocks',
            name: 'stocks',
            builder: (context, state) => const StocksPage(),
          ),
          GoRoute(
            path: '/accounting',
            name: 'accounting',
            builder: (context, state) => const AccountingPage(),
            routes: [
              GoRoute(
                path: 'report',
                name: 'accounting-report',
                builder: (context, state) => const AccountingReportPage(),
              ),
            ],
          ),
          GoRoute(
            path: '/exercise',
            name: 'exercise',
            builder: (context, state) => const ExercisePage(),
          ),
          GoRoute(
            path: '/log',
            name: 'log',
            builder: (context, state) => const LogPage(),
          ),

          // ---- 设置 ----
          GoRoute(
            path: '/settings',
            name: 'settings',
            builder: (context, state) => const SettingsPage(),
            routes: [
              GoRoute(
                path: 'backup',
                name: 'settings-backup',
                builder: (context, state) => const BackupPage(),
              ),
              GoRoute(
                path: 'accounts',
                name: 'settings-accounts',
                builder: (context, state) => const EmailAccountsPage(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
```

### AppShell 组件

```dart
// core/router/app_shell.dart
class AppShell extends ConsumerWidget {
  final Widget child;
  const AppShell({required this.child, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isWide = MediaQuery.of(context).size.width > 900;

    if (isWide) {
      // Windows / 大屏 → NavigationRail
      return Row(
        children: [
          EasyWorkNavigationRail(), // 48px 固定宽度
          Expanded(child: child),
        ],
      );
    } else {
      // Android / 小屏 → Drawer
      return Scaffold(
        appBar: AppBar(
          leading: Builder(
            builder: (ctx) => IconButton(
              icon: const Icon(Icons.menu),
              onPressed: () => Scaffold.of(ctx).openDrawer(),
            ),
          ),
        ),
        drawer: EasyWorkDrawer(),
        body: child,
      );
    }
  }
}
```

### 导航栏状态同步

```dart
// 当前路由监听 → 高亮导航项
final currentLocationProvider = Provider<String>((ref) {
  final router = ref.watch(appRouterProvider);
  return router.location; // 当前路径，如 '/email/123'
});

// 导航栏根据 currentLocationProvider 高亮对应图标
// '/email'、'/email/123'、'/email/compose' → 邮箱图标高亮
```

### Deep Link 处理

```dart
// 支持以下 Deep Link 入口
// 1. Android Intent Filter: easywork://tasks/new
// 2. 通知点击：点击通知 → 导航到目标页面
// 3. Share Intent: Android SEND → 弹窗选择目标模块

// 通知点击导航示例
class NotificationService {
  Future<void> onNotificationTapped(String? route) async {
    if (route == null) return;
    final router = _ref.read(appRouterProvider);
    await router.push(route);
  }
}
```

### 导航操作示例

```dart
// Widget 中导航
ref.read(appRouterProvider).go('/email');
ref.read(appRouterProvider).push('/email/compose');
ref.read(appRouterProvider).push('/tasks/${task.id}');
ref.read(appRouterProvider).pop();

// 从通知深度跳转
final router = ref.read(appRouterProvider);
router.go('/email/$emailId'); // 替换当前页栈
```

## 数据层详细设计

### 架构分层

```
UI / Provider
    ↕  (interface)
Repository (domain/repositories/*.dart)   ← 纯抽象，无 drift 依赖
    ↕  (implements)
RepositoryImpl (data/repositories/*.dart)
    ↕
DAO (data/database/*_dao.dart)
    ↕
Drift 表定义 (data/database/tables/*.dart)
    ↕
SQLite
```

### AppDatabase 定义

```dart
// features/email/data/database/app_database.dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'tables/email_accounts.dart';
import 'tables/emails.dart';
import 'tables/email_attachments.dart';
// ... 其他表

part 'app_database.drift'; // 自动生成 DAO 方法

@DriftDatabase(
  tables: [
    EmailAccounts,
    Emails,
    EmailAttachments,
    Contacts,
    ContactGroups,
    ContactGroupMembers,
    EmailSignatures,
    EmailToTask,
    Tasks,
    TaskComments,
    Notes,
    NoteTags,
    AccountingRecords,
    AccountingCategories,
    AccountingBudgets,
    ExerciseRecords,
    Logs,
    TimelineEvents,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration {
    return MigrationStrategy(
      onCreate: (Migrator m) async {
        await m.createAll();
        // 插入默认分类等初始数据
      },
      onUpgrade: (Migrator m, int from, int to) async {
        // 版本迁移逻辑
      },
    );
  }

  // ---- Type Converters ----
  // JSON 字符串 ↔ List<String>
  static const jsonListConverter = TypeConverter.json<List<String>>();
}

// 数据库初始化
AppDatabase createAppDatabase() {
  final dbPath = path.join(
    await getApplicationDocumentsDirectory(), 'easywork.db',
  );
  return AppDatabase(LazyDatabase(() async {
    final file = File(dbPath);
    return NativeDatabase(file);
  }));
}
```

### 表定义（drift）

```dart
// features/email/data/database/tables/emails.dart
import 'package:drift/drift.dart';

class Emails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get messageId => text()();
  TextColumn get subject => text().nullable()();
  TextColumn get fromName => text().nullable()();
  TextColumn get fromAddress => text()();
  TextColumn get toList => text().nullable()();        // JSON array
  TextColumn get ccList => text().nullable()();
  TextColumn get bodyText => text().nullable()();
  TextColumn get bodyHtml => text().nullable()();
  BoolColumn get hasAttachments => boolean().withDefault(const Constant(false))();
  DateTimeColumn get receivedAt => dateTime()();
  BoolColumn get isRead => boolean().withDefault(const Constant(false))();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  TextColumn get folder => text().withDefault(const Constant('inbox'))();
  TextColumn get threadId => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}
```

```dart
// features/task_board/data/database/tables/tasks.dart
class Tasks extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  TextColumn get priority => text().withDefault(const Constant('medium'))();  // high/medium/low
  TextColumn get status => text().withDefault(const Constant('todo'))();
  DateTimeColumn get dueDate => dateTime().nullable()();
  TextColumn get tags => text().nullable()();          // JSON array
  TextColumn get attachments => text().nullable()();   // JSON array
  IntColumn get estimatedMinutes => integer().nullable()();
  IntColumn get actualMinutes => integer().nullable()();
  IntColumn get progressPercentage => integer().nullable()();  // 0-100
  BoolColumn get isRecurring => boolean().withDefault(const Constant(false))();
  TextColumn get recurrenceRule => text().nullable()();  // RRULE 字符串
  IntColumn get parentTaskId => integer().nullable()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get completedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}
```

```dart
// features/accounting/data/database/tables/accounting_records.dart
class AccountingRecords extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get type => text()();                     // income / expense
  IntColumn get categoryId => integer().references(AccountingCategories, #id)();
  RealColumn get amount => real()();
  DateTimeColumn get recordDate => dateTime()();
  TextColumn get note => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}
```

```dart
// features/accounting/data/database/tables/accounting_budgets.dart
class AccountingBudgets extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get categoryId => integer().references(AccountingCategories, #id)();
  TextColumn get month => text()();  // YYYY-MM 格式
  RealColumn get budgetAmount => real()();

  @override
  Set<Column> get primaryKey => {id};
}
```

```dart
// features/notes/data/database/tables/notes.dart
class Notes extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text().nullable()();
  TextColumn get content => text()();                  // HTML 富文本
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}
```

```dart
// features/notes/data/database/tables/note_tags.dart
class NoteTags extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  TextColumn get color => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}

class NoteTagMembers extends Table {
  IntColumn get noteId => integer().references(Notes, #id)();
  IntColumn get tagId => integer().references(NoteTags, #id)();
  @override
  Set<Column> get primaryKey => {noteId, tagId};
}
```

```dart
// features/timeline/data/database/tables/timeline_events.dart
class TimelineEvents extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get eventType => text()();       // task_created, task_completed, email_received, ...
  TextColumn get module => text()();           // task_board, email, accounting, exercise, notes
  IntColumn get refId => integer()();          // 源模块数据 ID
  TextColumn get title => text()();            // "完成任务「xxx」"
  TextColumn get description => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}
```

### DAO 模式（Data Access Object）

```dart
// features/email/data/database/email_dao.dart
@DriftAccessor(tables: [Emails, EmailAccounts, EmailAttachments])
class EmailDao extends DatabaseAccessor<AppDatabase> with _$EmailDaoMixin {
  EmailDao(super.db);

  // ---- 邮件 CRUD ----

  Future<List<Email>> getEmailsByFolder(int accountId, String folder, {int limit = 50}) {
    return (select(emails)
        ..where((e) => e.accountId.equals(accountId) & e.folder.equals(folder))
        ..orderBy([(e) => OrderingTerm(expression: e.receivedAt, mode: OrderingMode.desc)])
        ..limit(limit))
      .get();
  }

  Future<Email?> getEmailById(int id) {
    return (select(emails)..where((e) => e.id.equals(id))).getSingleOrNull();
  }

  Future<int> insertEmail(Email email) {
    return into(emails).insert(email);
  }

  Future<void> markAsRead(int id) {
    return (update(emails)..where((e) => e.id.equals(id)))
        .write(const EmailsCompanion(isRead: Value(true)));
  }

  Future<void> markAsStarred(int id, bool starred) {
    return (update(emails)..where((e) => e.id.equals(id)))
        .write(EmailsCompanion(isStarred: Value(starred)));
  }

  Future<int> getUnreadCount(int accountId) {
    return (select(emails)
        ..where((e) => e.accountId.equals(accountId) & e.isRead.equals(false) & e.folder.equals('inbox'))
      ).get().then((list) => list.length);
  }

  Future<void> deleteEmail(int id) async {
    await (delete(emails)..where((e) => e.id.equals(id))).go();
  }

  // ---- 账户 CRUD ----

  Future<List<EmailAccount>> getAccounts() => select(emailAccounts).get();

  Future<int> insertAccount(EmailAccount account) =>
      into(emailAccounts).insert(account);

  Future<void> deleteAccount(int id) async {
    await (delete(emails)..where((e) => e.accountId.equals(id))).go();
    await (delete(emailAccounts)..where((a) => a.id.equals(id))).go();
  }

  // ---- 附件查询 ----

  Future<List<EmailAttachment>> getAttachments(int emailId) {
    return (select(emailAttachments)..where((a) => a.emailId.equals(emailId))).get();
  }
}
```

```dart
// features/task_board/data/database/task_dao.dart
@DriftAccessor(tables: [Tasks, TaskComments, TaskDependencies])
class TaskDao extends DatabaseAccessor<AppDatabase> with _$TaskDaoMixin {
  TaskDao(super.db);

  Future<List<Task>> getAllTasks() => select(tasks).get();

  Future<List<Task>> getTasksByStatus(String status) {
    return (select(tasks)..where((t) => t.status.equals(status))).get();
  }

  Future<List<Task>> getTodayTasks() {
    final today = DateTime.now();
    final startOfDay = DateTime(today.year, today.month, today.day);
    final endOfDay = startOfDay.add(const Duration(days: 1));
    return (select(tasks)
      ..where((t) => t.dueDate.isBetweenValues(startOfDay, endOfDay))
      ..orderBy([(t) => OrderingTerm(expression: t.priority)])
    ).get();
  }

  Future<Task?> getTaskById(int id) =>
      (select(tasks)..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<int> insertTask(Task task) => into(tasks).insert(task);

  Future<bool> updateTask(Task task) => into(tasks).update(task);

  Future<void> updateStatus(int id, String status) {
    return (update(tasks)..where((t) => t.id.equals(id)))
        .write(TasksCompanion(
          status: Value(status),
          updatedAt: Value(DateTime.now()),
        ));
  }

  Future<void> deleteTask(int id) async {
    await (delete(tasks)..where((t) => t.id.equals(id))).go();
  }

  Future<int> getTaskCountByStatus(String status) {
    return (select(tasks)..where((t) => t.status.equals(status)))
        .get().then((list) => list.length);
  }
}
```

### Repository 模式

#### Domain 层接口

```dart
// features/email/domain/repositories/email_repository.dart
abstract class EmailRepository {
  Future<List<Email>> getEmails(int accountId, String folder, {int limit});
  Future<Email?> getEmailById(int id);
  Future<int> sendEmail(EmailDraft draft);
  Future<void> markAsRead(int emailId);
  Future<void> deleteEmail(int emailId);
  Future<int> getUnreadCount(int accountId);

  // 账户
  Future<List<EmailAccount>> getAccounts();
  Future<int> addAccount(EmailAccount account);
  Future<void> removeAccount(int accountId);

  // IMAP 同步
  Future<int> fetchNewEmails(int accountId);
}
```

```dart
// features/task_board/domain/repositories/task_repository.dart
abstract class TaskRepository {
  Future<List<Task>> getAllTasks();
  Future<List<Task>> getTodayTasks();
  Future<Task?> getTaskById(int id);
  Future<int> createTask(Task task);
  Future<void> updateTask(Task task);
  Future<void> updateTaskStatus(int taskId, String status);
  Future<void> deleteTask(int taskId);
}
```

#### Data 层实现

```dart
// features/email/data/repositories/email_repository_impl.dart
class EmailRepositoryImpl implements EmailRepository {
  final EmailDao _dao;
  final ImapDataSource _imap;
  final SmtpDataSource _smtp;

  EmailRepositoryImpl(this._dao, this._imap, this._smtp);

  @override
  Future<List<Email>> getEmails(int accountId, String folder, {int limit = 50}) {
    return _dao.getEmailsByFolder(accountId, folder, limit: limit);
  }

  @override
  Future<Email?> getEmailById(int id) => _dao.getEmailById(id);

  @override
  Future<int> getUnreadCount(int accountId) => _dao.getUnreadCount(accountId);

  @override
  Future<int> sendEmail(EmailDraft draft) async {
    await _smtp.send(draft);
    // 保存到已发送
    final sentEmail = Email(
      accountId: draft.accountId,
      messageId: '',
      subject: draft.subject,
      fromAddress: draft.fromAddress,
      toList: draft.toList,
      bodyHtml: draft.bodyHtml,
      receivedAt: DateTime.now(),
      folder: 'sent',
    );
    return _dao.insertEmail(sentEmail);
  }

  @override
  Future<int> fetchNewEmails(int accountId) async {
    final newMessages = await _imap.fetchUnread();
    int count = 0;
    for (final msg in newMessages) {
      await _dao.insertEmail(_mapImapToEmail(msg, accountId));
      count++;
    }
    return count;
  }

  // ...
}
```

```dart
// features/task_board/data/repositories/task_repository_impl.dart
class TaskRepositoryImpl implements TaskRepository {
  final TaskDao _dao;

  TaskRepositoryImpl(this._dao);

  @override
  Future<List<Task>> getAllTasks() => _dao.getAllTasks();

  @override
  Future<List<Task>> getTodayTasks() => _dao.getTodayTasks();

  @override
  Future<Task?> getTaskById(int id) => _dao.getTaskById(id);

  @override
  Future<int> createTask(Task task) => _dao.insertTask(task);

  @override
  Future<void> updateTask(Task task) => _dao.updateTask(task);

  @override
  Future<void> updateTaskStatus(int taskId, String status) =>
      _dao.updateStatus(taskId, status);

  @override
  Future<void> deleteTask(int taskId) => _dao.deleteTask(taskId);
}
```

### Repository Provider（Riverpod 注入）

```dart
// data/providers/repository_providers.dart

// Database 单例
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = createAppDatabase();
  ref.onDispose(db.close);
  return db;
});

// DAOs
final emailDaoProvider = Provider<EmailDao>((ref) => EmailDao(ref.watch(appDatabaseProvider)));
final taskDaoProvider = Provider<TaskDao>((ref) => TaskDao(ref.watch(appDatabaseProvider)));

// Data Sources
final imapDataSourceProvider = Provider<ImapDataSource>((ref) => ImapDataSource());
final smtpDataSourceProvider = Provider<SmtpDataSource>((ref) => SmtpDataSource());

// Repositories
final emailRepositoryProvider = Provider<EmailRepository>((ref) {
  return EmailRepositoryImpl(
    ref.watch(emailDaoProvider),
    ref.watch(imapDataSourceProvider),
    ref.watch(smtpDataSourceProvider),
  );
});

final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  return TaskRepositoryImpl(ref.watch(taskDaoProvider));
});
```

### 数据库迁移策略

```dart
// 版本管理
@override
int get schemaVersion => 3;  // 随发布版本增长

@override
MigrationStrategy get migration => MigrationStrategy(
  onCreate: (m) async {
    await m.createAll();
    // 插入默认数据（分类、账户模板等）
    await defaultDataInsertion();
  },
  onUpgrade: (m, from, to) async {
    // v1 → v2: 新增 exercise_records 表
    if (from < 2) {
      await m.createTable(exerciseRecords);
    }
    // v2 → v3: 新增签名表 + 添加附件列
    if (from < 3) {
      await m.createTable(emailSignatures);
      await m.addColumn(emails, emails.hasAttachments);
    }
  },
  onDataEntity: (m, from, to) async {
    // 数据迁移（非 schema 变更）
  },
);
```

### 模块完整 DAO + Repository 清单

| 模块 | DAO | Repository Interface | Repository Impl |
|---|---|---|---|
| 邮箱 | `EmailDao` | `EmailRepository` | `EmailRepositoryImpl` |
| 联系人 | `ContactDao` | (邮箱模块共用) | - |
| 任务看板 | `TaskDao` | `TaskRepository` | `TaskRepositoryImpl` |
| 日历 | 复用 TaskDao | - | - |
| 笔记 | `NoteDao` | `NoteRepository` | `NoteRepositoryImpl` |
| 股票 | `StockDao` | `StockRepository` | `StockRepositoryImpl` |
| 记账 | `AccountingDao` | `AccountingRepository` | `AccountingRepositoryImpl` |
| 运动 | `ExerciseDao` | `ExerciseRepository` | `ExerciseRepositoryImpl` |
| 日志 | `LogDao` | -（直接 DAO） | 无 |
| 设置 | `SettingsDao` | -（直接 DAO） | 无 |

## 测试策略

### 测试金字塔

```
         ╱╲
        ╱  ╲          E2E / Integration
       ╱    ╲         （少量关键流）
      ╱──────╲
     ╱        ╲       Widget / Golden
    ╱          ╲      （核心页面 + 组件）
   ╱────────────╲
  ╱              ╲    Provider / Repository / DAO
 ╱                ╲   （全量覆盖）
╱──────────────────╲
```

| 层级 | 速度 | 数量目标 | 工具 |
|---|---|---|---|
| DAO (drift) | 🚀 极快 | 覆盖所有 DAO 方法 | `NativeDatabase.memory()` |
| Repository / UseCase | 🚀 极快 | 覆盖所有业务逻辑 | `mocktail` |
| Provider (Riverpod) | ⚡ 快 | 覆盖所有 Provider 核心路径 | `ProviderContainer` |
| Widget | 🐢 中等 | 覆盖所有 Page + 关键 Widget | `ProviderScope` + `pumpWidget` |
| Integration | 🐢 慢 | 3-5 条核心用户流 | `integration_test` |

### 目录结构

```
test/
├── core/                          # 基础设施测试
│   └── event_bus_test.dart
├── features/
│   ├── email/
│   │   ├── data/
│   │   │   ├── dao/
│   │   │   │   └── email_dao_test.dart
│   │   │   └── repositories/
│   │   │       └── email_repository_impl_test.dart
│   │   ├── domain/
│   │   │   └── usecases/
│   │   │       └── send_email_test.dart
│   │   └── presentation/
│   │       ├── providers/
│   │       │   ├── email_list_provider_test.dart
│   │       │   └── unread_count_provider_test.dart
│   │       └── pages/
│   │           ├── email_list_page_test.dart
│   │           └── email_detail_page_test.dart
│   ├── task_board/
│   │   ├── data/
│   │   │   ├── dao/
│   │   │   │   └── task_dao_test.dart
│   │   │   └── repositories/
│   │   │       └── task_repository_impl_test.dart
│   │   └── presentation/
│   │       ├── providers/
│   │       │   └── task_list_provider_test.dart
│   │       └── pages/
│   │           └── task_board_page_test.dart
│   ├── accounting/
│   │   └── ...
│   └── ...
├── shared/
│   └── widgets/                   # 通用组件测试
│       └── responsive_grid_test.dart
└── integration_test/
    ├── app_flow_test.dart         # 完整用户流
    └── email_to_task_test.dart    # 邮件→任务联动
```

### 1. DAO 测试（drift 内存库）

```dart
// test/features/task_board/data/dao/task_dao_test.dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase db;
  late TaskDao dao;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dao = TaskDao(db);
  });

  tearDown(() => db.close());

  group('TaskDao', () {
    test('insert and retrieve task', () async {
      final task = Task(
        title: '测试任务',
        priority: 'high',
        status: 'todo',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final id = await dao.insertTask(task);
      final retrieved = await dao.getTaskById(id);

      expect(retrieved, isNotNull);
      expect(retrieved!.title, '测试任务');
      expect(retrieved.priority, 'high');
      expect(retrieved.status, 'todo');
    });

    test('get today tasks', () async {
      final today = DateTime.now();
      final yesterday = today.subtract(const Duration(days: 1));

      await dao.insertTask(Task(
        title: '今日任务',
        dueDate: today,
        createdAt: today, updatedAt: today,
      ));
      await dao.insertTask(Task(
        title: '昨日任务',
        dueDate: yesterday,
        createdAt: yesterday, updatedAt: yesterday,
      ));

      final todayTasks = await dao.getTodayTasks();
      expect(todayTasks.length, 1);
      expect(todayTasks.first.title, '今日任务');
    });

    test('update status', () async {
      final id = await dao.insertTask(Task(
        title: '任务A', status: 'todo',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      ));

      await dao.updateStatus(id, 'done');

      final updated = await dao.getTaskById(id);
      expect(updated!.status, 'done');
    });

    test('delete task', () async {
      final id = await dao.insertTask(Task(
        title: '待删除',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      ));

      await dao.deleteTask(id);
      final deleted = await dao.getTaskById(id);
      expect(deleted, isNull);
    });
  });
}
```

### 2. Repository 测试（mock DAO + DataSource）

```dart
// test/features/task_board/data/repositories/task_repository_impl_test.dart
import 'package:mocktail/mocktail.dart';

class MockTaskDao extends Mock implements TaskDao {}

void main() {
  late TaskDao mockDao;
  late TaskRepositoryImpl repo;

  setUp(() {
    mockDao = MockTaskDao();
    repo = TaskRepositoryImpl(mockDao);
  });

  group('TaskRepositoryImpl', () {
    test('createTask delegates to DAO', () async {
      final task = Task(
        title: '测试',
        status: 'todo',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      when(() => mockDao.insertTask(any())).thenAnswer((_) async => 1);

      final id = await repo.createTask(task);

      expect(id, 1);
      verify(() => mockDao.insertTask(task)).called(1);
    });

    test('getTodayTasks returns only today tasks', () async {
      final todayTasks = [
        Task(id: 1, title: '今日1', status: 'todo',
            createdAt: DateTime.now(), updatedAt: DateTime.now()),
      ];
      when(() => mockDao.getTodayTasks()).thenAnswer((_) async => todayTasks);

      final result = await repo.getTodayTasks();

      expect(result.length, 1);
      expect(result.first.title, '今日1');
    });

    test('deleteTask propagates to DAO', () async {
      when(() => mockDao.deleteTask(1)).thenAnswer((_) async {});

      await repo.deleteTask(1);

      verify(() => mockDao.deleteTask(1)).called(1);
    });
  });
}
```

### 3. Provider 测试（ProviderContainer）

```dart
// test/features/email/presentation/providers/unread_count_provider_test.dart
void main() {
  late ProviderContainer container;

  setUp(() {
    container = ProviderContainer(
      overrides: [
        // Mock Repository 注入
        emailRepositoryProvider.overrideWithValue(MockEmailRepository()),
      ],
    );
  });

  tearDown(() => container.dispose());

  test('unreadCountProvider returns 0 for empty inbox', () async {
    final repo = container.read(emailRepositoryProvider) as MockEmailRepository;
    when(() => repo.getUnreadCount(any())).thenAnswer((_) async => 0);

    final count = await container.read(unreadCountProvider.future);
    expect(count, 0);
  });

  test('unreadCountProvider returns correct count', () async {
    final repo = container.read(emailRepositoryProvider) as MockEmailRepository;
    when(() => repo.getUnreadCount(any())).thenAnswer((_) async => 5);

    final count = await container.read(unreadCountProvider.future);
    expect(count, 5);
  });
}
```

### 4. Widget 测试（ProviderScope overrides）

```dart
// test/features/task_board/presentation/pages/task_board_page_test.dart
Widget createTestApp() {
  return ProviderScope(
    overrides: [
      taskListProvider.overrideWith(() => TaskListNotifierMock()),
    ],
    child: const MaterialApp(home: TaskBoardPage()),
  );
}

void main() {
  testWidgets('shows task columns', (tester) async {
    await tester.pumpWidget(createTestApp());
    await tester.pump();

    expect(find.text('待办'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget);
    expect(find.text('已完成'), findsOneWidget);
  });

  testWidgets('tapping FAB navigates to create page', (tester) async {
    await tester.pumpWidget(createTestApp());
    await tester.pump();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(find.text('新建任务'), findsOneWidget);
  });
}
```

### 5. EventBus 测试

```dart
// test/core/event_bus_test.dart
void main() {
  test('publish and receive typed events', () async {
    final bus = EventBus();
    final received = <TaskCreatedEvent>[];

    final sub = bus.on<TaskCreatedEvent>().listen((e) => received.add(e));

    bus.publish(TaskCreatedEvent(
      taskId: 1, title: '测试任务', priority: 'high',
    ));

    await Future.delayed(Duration.zero); // 等待事件传播

    expect(received.length, 1);
    expect(received.first.title, '测试任务');

    sub.cancel();
    bus.dispose();
  });

  test('subscriber error does not affect others', () async {
    final bus = EventBus();
    final received = <TaskCreatedEvent>[];

    bus.on<TaskCreatedEvent>().listen((_) => throw Exception('boom'));
    bus.on<TaskCreatedEvent>().listen((e) => received.add(e));

    bus.publish(TaskCreatedEvent(
      taskId: 1, title: '测试', priority: 'low',
    ));

    await Future.delayed(Duration.zero);
    // 第二个订阅者仍然收到事件
    expect(received.length, 1);
  });
}
```

### 6. 集成测试

```dart
// integration_test/app_flow_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('full task creation flow', (tester) async {
    await tester.pumpWidget(const EasyWorkApp());
    await tester.pumpAndSettle();

    // 导航到任务看板
    await tester.tap(find.text('任务看板'));
    await tester.pumpAndSettle();

    // 点击新建
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    // 填写表单
    await tester.enterText(find.byType(TextFormField).at(0), '集成测试任务');
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();

    // 验证看板上出现新任务
    expect(find.text('集成测试任务'), findsOneWidget);
  });
}
```

```dart
// integration_test/email_to_task_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('email to task conversion', (tester) async {
    await tester.pumpWidget(const EasyWorkApp());
    await tester.pumpAndSettle();

    // 导航到邮箱
    await tester.tap(find.text('邮箱'));
    await tester.pumpAndSettle();

    // 点击第一封邮件
    await tester.tap(find.byType(EmailTile).first);
    await tester.pumpAndSettle();

    // 点击"转为任务"
    await tester.tap(find.text('转为任务'));
    await tester.pumpAndSettle();

    // 确认弹窗
    await tester.tap(find.text('确认'));
    await tester.pumpAndSettle();

    // 验证邮件详情页显示"已关联任务"
    expect(find.textContaining('已关联任务'), findsOneWidget);
  });
}
```

```dart
// integration_test/vcf_import_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('import VCF file', (tester) async {
    await tester.pumpWidget(const EasyWorkApp());
    await tester.pumpAndSettle();

    // 导航到联系人
    await tester.tap(find.text('联系人'));
    await tester.pumpAndSettle();

    // 点击导入 VCF
    await tester.tap(find.text('导入 VCF'));
    await tester.pumpAndSettle();

    // 验证联系人列表刷新
    expect(find.byType(ContactTile), findsWidgets);
  });
}
```

```dart
// integration_test/kanban_drag_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('drag task between kanban columns', (tester) async {
    await tester.pumpWidget(const EasyWorkApp());
    await tester.pumpAndSettle();

    // 导航到任务看板
    await tester.tap(find.text('任务看板'));
    await tester.pumpAndSettle();

    // 验证看板列存在
    expect(find.text('待办'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget);
    expect(find.text('已完成'), findsOneWidget);
    expect(find.text('挂起'), findsOneWidget);

    // 拖拽任务卡片（简化验证）
    // 实际测试中需要模拟拖拽手势
  });
}
```

### 测试关注点矩阵

| 模块 | 核心测试关注点 |
|---|---|
| 邮箱 | IMAP 收信、邮件→任务联动、VCF导入/导出、签名切换 |
| 任务看板 | CRUD、周期任务生成、看板拖拽、三视图切换 |
| Dashboard | 跨模块数据聚合、拖拽布局持久化 |
| 事件总线 | 发布/订阅、错误隔离、dispose 时清理 |
| 响应式UI | NavigationRail ↔ Drawer 切换、Grid 列数自适应 |
| 数据层 | 数据库迁移正确性、DAO 查询/写入、Repository 异常处理 |

### 持续集成

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter pub get
      - run: flutter analyze
      - run: flutter test --coverage --test-randomize-ordering-seed random
      - run: flutter test integration_test/
```

## 全模块搜索架构

### 设计目标

- **统一入口**：全局搜索框（NavigarionBar 顶部 / 快捷键），一次搜索覆盖所有模块
- **多模块聚合结果**：按模块分组展示，每条结果可点击跳转
- **实时搜索**：输入即搜，300ms 防抖
- **本地优先**：基于 SQLite FTS5 全文索引，剩余字段用 LIKE 补充

### 搜索范围

| 模块 | 搜索字段 | 技术方案 |
|---|---|---|
| 任务 | 标题、描述 | FTS5 |
| 邮件 | 主题、发件人、正文摘要 | FTS5 |
| 联系人 | 姓名、邮箱 | FTS5 |
| 笔记 | 标题、正文 | FTS5 |
| 记账 | 备注、分类名 | LIKE |
| 运动 | 运动类型 | LIKE |
| 日历日程 | 标题 | LIKE |

### 数据模型

```dart
// 统一搜索结果模型
class SearchResult {
  final String module;       // task / email / contact / note / accounting / exercise
  final int id;              // 源数据 ID
  final String title;        // 显示标题
  final String? subtitle;    // 显示副标题（摘要）
  final String? matchField;  // 匹配字段（用于高亮）
  final IconData icon;       // 模块图标
  final String route;        // 点击跳转路由
  final DateTime sortTime;   // 排序时间
}

// 搜索状态
class SearchState {
  final String query;
  final bool isSearching;
  final List<SearchResult> results;
  final String? error;
}
```

### FTS5 全文索引

利用 drift 的 FTS5 支持创建虚拟表：

```dart
// features/search/data/database/fts_tables.dart
// 任务全文索引
class TasksFts extends Table {
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
}

class EmailsFts extends Table {
  TextColumn get subject => text().nullable()();
  TextColumn get fromName => text().nullable()();
  TextColumn get fromAddress => text()();
  TextColumn get bodyText => text().nullable()();
}

class ContactsFts extends Table {
  TextColumn get displayName => text()();
  TextColumn get firstName => text().nullable()();
  TextColumn get lastName => text().nullable()();
  TextColumn get emailAddresses => text().nullable()();
}

class NotesFts extends Table {
  TextColumn get title => text().nullable()();
  TextColumn get content => text()();
}
```

```sql
-- 创建 FTS5 虚拟表（在数据库初始化时执行）
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title, description, content='tasks', content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
  subject, from_name, from_address, body_text,
  content='emails', content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
  display_name, first_name, last_name, email_addresses,
  content='contacts', content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content,
  content='notes', content_rowid='id'
);
```

### 索引同步触发器

```sql
-- 任务表 insert/update/delete 时自动同步 FTS
CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description)
  VALUES (new.id, new.title, new.description);
END;

CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
  VALUES('delete', old.id, old.title, old.description);
END;

CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
  VALUES('delete', old.id, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description)
  VALUES (new.id, new.title, new.description);
END;
```

### 搜索 DAO

```dart
// features/search/data/search_dao.dart
@DriftAccessor(tables: [TasksFts, EmailsFts, ContactsFts, NotesFts])
class SearchDao extends DatabaseAccessor<AppDatabase> with _$SearchDaoMixin {
  SearchDao(super.db);

  Future<List<SearchResult>> searchAll(String query, {int limit = 20}) async {
    final results = <SearchResult>[];
    final term = query.split(' ').join(' AND '); // 多词 AND 组合

    // 并行搜索各模块
    final futures = await Future.wait([
      _searchTasks(term),
      _searchEmails(term),
      _searchContacts(term),
      _searchNotes(term),
      _searchAccounting(query),
    ]);

    for (final r in futures) {
      results.addAll(r);
    }

    // 按时间排序（最新在前）
    results.sort((a, b) => b.sortTime.compareTo(a.sortTime));
    return results.take(limit).toList();
  }

  Future<List<SearchResult>> _searchTasks(String term) async {
    final rows = await customSelect(
      'SELECT rowid, title, description, rank '
      'FROM tasks_fts WHERE tasks_fts MATCH ?1 '
      'ORDER BY rank LIMIT 10',
      variables: [Variable(term)],
    ).get();

    return rows.map((r) => SearchResult(
      module: 'task',
      id: r.data['rowid'] as int,
      title: r.data['title'] as String,
      subtitle: r.data['description'] as String?,
      icon: Icons.task_alt,
      route: '/tasks/${r.data['rowid']}',
      sortTime: DateTime.now(), // 实际应从源表 join
    )).toList();
  }

  Future<List<SearchResult>> _searchEmails(String term) async {
    // 类似 tasks，搜索 emails_fts
  }

  Future<List<SearchResult>> _searchContacts(String term) async {
    // 搜索 contacts_fts
  }

  Future<List<SearchResult>> _searchNotes(String term) async {
    // 搜索 notes_fts
  }

  Future<List<SearchResult>> _searchAccounting(String query) async {
    // LIKE 查询（无需 FTS）
    final rows = await (select(accountingRecords)
      ..where((r) => r.note.like('%$query%'))
      ..limit(5)
    ).get();

    return rows.map((r) => SearchResult(
      module: 'accounting',
      id: r.id,
      title: '${r.type == 'income' ? '收入' : '支出'} ¥${r.amount}',
      subtitle: r.note,
      icon: Icons.account_balance_wallet,
      route: '/accounting',
      sortTime: r.recordDate,
    )).toList();
  }
}
```

### 搜索 Provider

```dart
// features/search/providers/search_provider.dart
final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<SearchResult>>((ref) {
  final query = ref.watch(searchQueryProvider);
  if (query.length < 2) return [];

  final dao = ref.watch(searchDaoProvider);
  return dao.searchAll(query);
});

final isSearchActiveProvider = Provider<bool>((ref) {
  return ref.watch(searchQueryProvider).isNotEmpty;
});
```

### 搜索 UI

```
搜索触发入口：
  ├── Windows: 导航栏顶部搜索图标 / Ctrl+F 快捷键
  ├── Android: AppBar 搜索图标
  └── Dashboard: 顶部搜索栏

搜索页面布局：

┌──────────────────────────────────┐
│  🔍 搜索任务、邮件、笔记...      │  ← TextField（自动聚焦）
├──────────────────────────────────┤
│                                  │
│  📋 任务（3）                     │  ← 模块分组标题 + 数量
│  ├── ● 整理会议笔记              │  ← 可点击跳转
│  ├── ● 回复张三邮件              │
│  └── ● 完成周报                  │
│                                  │
│  ✉️ 邮件（2）                     │
│  ├── 张三  Re: 项目进度          │
│  └── 李四  EasyWork 设计方案     │
│                                  │
│  📇 联系人（1）                   │
│  └── 张三  123@email.com         │
│                                  │
│  📝 笔记（1）                     │
│  └── 开发笔记  关于 Flutter...    │
│                                  │
│  没有更多结果                     │
└──────────────────────────────────┘
```

### 搜索 Widget

```dart
// features/search/presentation/search_page.dart
class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key});

  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).state = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final resultsAsync = ref.watch(searchResultsProvider);
    final query = ref.watch(searchQueryProvider);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: '搜索任务、邮件、笔记...',
            border: InputBorder.none,
          ),
          onChanged: _onSearchChanged,
        ),
      ),
      body: resultsAsync.when(
        data: (results) => _buildResults(context, results, query),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('搜索失败：$e')),
      ),
    );
  }

  Widget _buildResults(BuildContext context, List<SearchResult> results, String query) {
    if (query.isEmpty) {
      return const Center(child: Text('输入关键字开始搜索'));
    }
    if (results.isEmpty) {
      return const Center(child: Text('没有找到匹配的结果'));
    }

    // 按模块分组
    final grouped = groupBy(results, (r) => r.module);
    return ListView(
      children: grouped.entries.map((entry) {
        return _SearchGroupSection(
          module: entry.key,
          results: entry.value,
        );
      }).toList(),
    );
  }
}
```

### 搜索快捷键

```dart
// Windows: Ctrl+F 打开搜索页
// Android: AppBar 搜索图标

// core/widgets/global_search_action.dart
class GlobalSearchAction extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CallbackShortcuts(
      bindings: {
        SingleActivator(LogicalKeyboardKey.keyF, control: true): () {
          ref.read(appRouterProvider).push('/search');
        },
      },
      child: IconButton(
        icon: const Icon(Icons.search),
        tooltip: '搜索 (Ctrl+F)',
        onPressed: () => ref.read(appRouterProvider).push('/search'),
      ),
    );
  }
}
```

### 搜索路由

```dart
// 在 GoRouter 中添加搜索路由
GoRoute(
  path: '/search',
  name: 'search',
  builder: (context, state) => const SearchPage(),
  // 搜索在 ShellRoute 之外，不显示导航栏，沉浸式搜索体验
),
```

## 错误处理与安全

### 1. 统一错误处理架构

#### 异常层级

```dart
// core/errors/app_exception.dart
/// 应用异常基类
abstract class AppException implements Exception {
  String get userMessage;   // 展示给用户的文字（已国际化）
  String? get technical;    // 技术详情（日志用）
}

/// 网络异常
class NetworkException extends AppException {
  final String? url;
  final int? statusCode;
  @override
  String get userMessage => '网络连接失败，请检查网络后重试';
  NetworkException({this.url, this.statusCode, String? technical})
    : technical = technical ?? 'Network error: $url ($statusCode)';
}

/// IMAP 邮箱异常
class EmailException extends AppException {
  final EmailErrorType type;
  @override
  String get userMessage {
    switch (type) {
      case EmailErrorType.authFailed:     return '邮箱登录失败，请检查密码';
      case EmailErrorType.connectionFailed: return '无法连接到邮箱服务器';
      case EmailErrorType.timeout:        return '连接超时，请稍后重试';
      case EmailErrorType.sendFailed:     return '发送失败，请检查收件人地址';
    }
  }
  EmailException(this.type, {String? technical}) : technical = technical;
}

/// 数据库异常
class DatabaseException extends AppException {
  @override
  String get userMessage => '数据读写异常，请重试';
  DatabaseException(String? technical) : technical = technical;
}

/// 验证异常
class ValidationException extends AppException {
  final String field;
  @override
  String get userMessage;
  ValidationException(this.field, this.userMessage);
}
```

#### Result 类型（避免裸 throw）

```dart
// core/errors/result.dart
sealed class Result<T> {
  const Result();
}

final class Success<T> extends Result<T> {
  final T data;
  const Success(this.data);
}

final class Failure<T> extends Result<T> {
  final AppException error;
  const Failure(this.error);
}

// 用法示例
Future<Result<List<Task>>> getTasks() async {
  try {
    final tasks = await dao.getAllTasks();
    return Success(tasks);
  } on AppException catch (e) {
    return Failure(e);
  } catch (e) {
    return Failure(DatabaseException(e.toString()));
  }
}
```

#### 全局错误监听

```dart
// core/errors/error_reporter.dart
final errorReporterProvider = Provider<ErrorReporter>((ref) {
  return ErrorReporter(ref);
});

class ErrorReporter {
  final Ref _ref;
  ErrorReporter(this._ref);

  void report(AppException error, {StackTrace? stack}) {
    // 1. 写入日志
    _ref.read(logDaoProvider).insert(LogEntry(
      level: 'error',
      module: error.runtimeType.toString(),
      message: error.technical ?? error.userMessage,
      createdAt: DateTime.now(),
    ));

    // 2. 异常上报（后续可接 Sentry 等）
    // Sentry.captureException(error, stackTrace: stack);

    // 3. 通知用户（非关键错误静默处理）
    if (error is! DatabaseException) {
      _ref.read(notificationServiceProvider).showSnackBar(
        message: error.userMessage,
        type: SnackBarType.error,
      );
    }
  }
}

// Flutter 全局错误捕获
void main() {
  runZonedGuarded(() {
    FlutterError.onError = (details) {
      final reporter = /* 从 ProviderScope 获取 */;
      reporter.report(AppException(technical: details.exceptionAsString()));
    };
    runApp(const ProviderScope(child: EasyWorkApp()));
  }, (error, stack) {
    // 未捕获异常
    log(error.toString(), stackTrace: stack);
  });
}
```

### 2. 邮箱凭据安全存储

```dart
// core/security/credential_store.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final credentialStoreProvider = Provider<CredentialStore>((ref) {
  return CredentialStore(const FlutterSecureStorage());
});

class CredentialStore {
  final FlutterSecureStorage _storage;
  CredentialStore(this._storage);

  static const _accountPrefix = 'email_account_';

  Future<void> saveAccountCredentials(int accountId, String password) async {
    await _storage.write(
      key: '$_accountPrefix$accountId',
      value: password,
    );
  }

  Future<String?> getAccountPassword(int accountId) async {
    return _storage.read(key: '$_accountPrefix$accountId');
  }

  Future<void> deleteAccountCredentials(int accountId) async {
    await _storage.delete(key: '$_accountPrefix$accountId');
  }

  /// 应用卸载时清理所有凭据
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}

// IMAP 登录时读取凭据
class ImapDataSource {
  final CredentialStore _credentials;

  Future<void> login(int accountId, String host, String username) async {
    final password = await _credentials.getAccountPassword(accountId);
    if (password == null) throw EmailException(EmailErrorType.authFailed);
    await _client.login(username, password);
  }
}
```

### 3. 输入验证

```dart
// core/validation/validators.dart
class Validators {
  static String? email(String? value) {
    if (value == null || value.isEmpty) return '请输入邮箱地址';
    final regex = RegExp(r'^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!regex.hasMatch(value)) return '邮箱格式不正确';
    return null;
  }

  static String? password(String? value) {
    if (value == null || value.isEmpty) return '请输入密码';
    if (value.length < 6) return '密码至少 6 位';
    return null;
  }

  static String? imapHost(String? value) {
    if (value == null || value.isEmpty) return '请输入服务器地址';
    final regex = RegExp(r'^[\w.-]+$');
    if (!regex.hasMatch(value)) return '地址格式不正确';
    return null;
  }

  static String? port(String? value) {
    if (value == null || value.isEmpty) return '请输入端口号';
    final port = int.tryParse(value);
    if (port == null || port < 1 || port > 65535) return '端口号范围 1-65535';
    return null;
  }

  static String? required(String? value, String fieldName) {
    if (value == null || value.trim().isEmpty) return '请输入$fieldName';
    return null;
  }
}

// 使用示例：邮箱添加表单
class EmailAccountForm extends StatefulWidget {
  @override
  State<EmailAccountForm> createState() => _EmailAccountFormState();
}

class _EmailAccountFormState extends State<EmailAccountForm> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        children: [
          TextFormField(
            controller: _emailCtrl,
            decoration: const InputDecoration(labelText: '邮箱地址'),
            validator: Validators.email,
          ),
          TextFormField(
            controller: _passwordCtrl,
            decoration: const InputDecoration(labelText: '密码'),
            obscureText: true,
            validator: Validators.password,
          ),
          ElevatedButton(
            onPressed: _submit,
            child: const Text('添加账户'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    // 验证通过后提交
  }
}
```

### 4. 网络重试与离线处理

```dart
// core/network/retry.dart
class RetryHandler {
  /// 指数退避重试
  static Future<T> retry<T>({
    required Future<T> Function() action,
    int maxRetries = 3,
    Duration baseDelay = const Duration(seconds: 1),
  }) async {
    int attempt = 0;
    while (true) {
      try {
        return await action();
      } on AppException catch (_) {
        attempt++;
        if (attempt >= maxRetries) rethrow;
        await Future.delayed(baseDelay * (1 << attempt)); // 1s, 2s, 4s
      }
    }
  }

  /// 有网络监听的重试
  static Future<T> retryWithConnectivity<T>({
    required Future<T> Function() action,
    required Connectivity connectivity,
  }) async {
    try {
      return await action();
    } on NetworkException {
      // 等待网络恢复
      await connectivity.onReconnect;
      return await action();
    }
  }
}

// 使用示例：IMAP 连接 + 指数退避
Future<void> connectWithRetry(int accountId) async {
  await RetryHandler.retry(
    action: () => imapDataSource.connect(accountId),
    maxRetries: 3,
  );
}
```

### 5. 凭据存储方案对比

| 存储内容 | 方案 | 理由 |
|---|---|---|
| IMAP 密码 | `flutter_secure_storage` | 系统级加密（Windows: DPAPI, Android: KeyStore） |
| 邮箱账户配置（host/port/user） | drift（明文） | 非敏感信息 |
| 应用设置（主题/语言/布局） | `shared_preferences` | 性能好，不需要加密 |
| 数据库文件 | drift + SQLCipher（可选） | 全量加密，按需开启 |

### 6. 数据完整性保护

```dart
// core/security/data_integrity.dart
class DataIntegrity {
  /// 数据库写入使用事务
  Future<void> createTaskWithEvent(Task task) async {
    await db.transaction(() async {
      final id = await into(tasks).insert(task);
      // 写入事件日志（同一事务中，失败回滚）
      await into(timelineEvents).insert(TimelineEvent(
        type: 'task_created',
        refId: id,
        createdAt: DateTime.now(),
      ));
    });
  }

  /// 写前备份（关键操作前）
  Future<void> backupBeforeDestructiveOp() async {
    final src = File(dbPath);
    final backup = File('$dbPath.backup');
    await src.copy(backup.path);
  }
}
```

### 7. 安全清单

| 关注点 | 措施 |
|---|---|
| 邮箱密码 | `flutter_secure_storage`，不存 drift，不在日志中输出 |
| IMAP 连接 | 默认 TLS/SSL，证书验证 |
| 本地数据库 | 可选 SQLCipher 全量加密 |
| 日志脱敏 | log 中 password/token 自动替换为 `***` |
| 输入校验 | 所有用户输入在提交前验证（表单 + API） |
| 崩溃恢复 | `runZonedGuarded` + 500ms 自动保存状态 |
| 数据备份 | 每日自动备份 + 手动导出 |
| 应用卸载 | `flutter_secure_storage` 自动清除 |

## 性能优化策略

### 1. 列表性能（核心优化点）

#### 虚拟滚动

```dart
// 所有长列表统一使用 ListView.builder（非 ListView(children:[])）
ListView.builder(
  itemCount: emails.length,
  itemBuilder: (context, index) => EmailTile(email: emails[index]),
  // addAutomaticKeepAlives: true,  // 默认开启，Tab 切换保持状态
);

// 邮件/联系人等 100+ 条的大列表
// + SliverList + SliverAppBar 组合用于复杂布局
CustomScrollView(
  slivers: [
    SliverAppBar(title: Text('收件箱')),
    SliverList.builder(
      itemCount: emails.length,
      itemBuilder: (_, i) => EmailTile(email: emails[i]),
    ),
  ],
);
```

#### 分页加载

```dart
// features/email/providers/email_list_provider.dart
class EmailListNotifier extends FamilyAsyncNotifier<List<Email>, EmailFolder> {
  static const _pageSize = 30;
  int _currentPage = 0;
  bool _hasMore = true;

  @override
  Future<List<Email>> build(EmailFolder arg) async {
    _currentPage = 0;
    _hasMore = true;
    return _fetchPage();
  }

  Future<List<Email>> _fetchPage() async {
    final repo = ref.read(emailRepoProvider);
    final page = await repo.getEmails(
      folder: arg,
      limit: _pageSize,
      offset: _currentPage * _pageSize,
    );
    _currentPage++;
    if (page.length < _pageSize) _hasMore = false;
    return page;
  }

  Future<void> loadMore() async {
    if (!_hasMore) return;
    final current = state.valueOrNull ?? [];
    final nextPage = await _fetchPage();
    state = AsyncData([...current, ...nextPage]);
  }
}

// UI 端监听滚动到底部触发加载
NotificationListener<ScrollEndNotification>(
  onNotification: (notification) {
    if (notification.metrics.pixels >= notification.metrics.maxScrollExtent - 200) {
      ref.read(emailListProvider(folder).notifier).loadMore();
    }
    return false;
  },
  child: ListView.builder(...),
);
```

#### 列表项避免不必要重建

```dart
class EmailTile extends StatelessWidget {
  final Email email;
  const EmailTile({super.key, required this.email});  // const 构造

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      // 固定高度，不依赖 intrinsic 测量
      height: 72,
      child: Row(children: [
        // 用 ValueListenableBuilder 包裹频繁变化部分
        // 如未读状态
      ]),
    );
  }
}
```

### 2. 图片与缓存

```dart
// 使用 cached_network_image 缓存网络图片
CachedNetworkImage(
  imageUrl: contact.photoUrl,
  placeholder: (_, __) => const CircleAvatar(child: Icon(Icons.person)),
  memCacheWidth: 128,   // 内存缓存限制宽度
  memCacheHeight: 128,  // 限制高度，减少内存占用
  maxWidthDiskCache: 512, // 磁盘缓存限制
);

// 联系人头像预生成缩略图
Future<Uint8List> generateThumbnail(String photoPath) async {
  final file = File(photoPath);
  final decodedImage = await decodeImageFromList(await file.readAsBytes());
  final resizer = ResizeImage.resizeIfNeeded(128, 128, decodedImage);
  // 保存缩略图到 cache 目录
  return resizer.data;
}
```

### 3. 启动速度优化

```dart
// main.dart - 延迟加载非关键模块
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. 同步完成：主题 + 本地化配置（立即显示 Splash）
  runApp(const ProviderScope(child: EasyWorkApp()));

  // 2. 异步完成：数据库打开 + 凭据加载（后台进行）
  // 由 Provider 懒加载，首次使用才真正初始化
}
```

```dart
// Provider 懒加载策略
// ❌ 不这样写 - 应用启动时就初始化所有模块
final emailDaoProvider = Provider<EmailDao>((ref) {
  return EmailDao(ref.watch(appDatabaseProvider));
});

// ✅ 这样写 - 页面打开邮箱时才初始化
// Riverpod Provider 默认是懒加载的，只有在被 watch/read 时才创建
// 只要不在 MaterialApp 层 watch 所有 provider，就不会预先加载
```

```dart
// 关键模块预初始化（首屏后异步进行）
class AppPreloader extends ConsumerStatefulWidget {
  final Widget child;
  const AppPreloader({super.key, required this.child});

  @override
  ConsumerState<AppPreloader> createState() => _AppPreloaderState();
}

class _AppPreloaderState extends ConsumerState<AppPreloader> {
  @override
  void initState() {
    super.initState();
    // 首屏渲染完成后，后台预加载其他模块
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _preloadModules();
    });
  }

  Future<void> _preloadModules() async {
    // DB 连接在首次 DAO 调用时自动初始化
    // 提前触发：ref.read(emailRepoProvider);
    // 邮箱账户列表、任务列表在用户导航到时才加载
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
```

### 4. 数据库性能

#### 索引

```sql
-- 邮件：按账户 + 文件夹查询和排序
CREATE INDEX idx_emails_account_folder ON emails(account_id, folder);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);

-- 任务：按状态筛选 + 截止日期排序
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- 联系人搜索加速
CREATE INDEX idx_contacts_display_name ON contacts(display_name);

-- Timeline：按时间排序
CREATE INDEX idx_timeline_created_at ON timeline_events(created_at DESC);

-- 记账：按月汇总
CREATE INDEX idx_accounting_record_date ON accounting_records(record_date);
```

#### 批量操作

```dart
// IMAP 批量写入时使用 batch
Future<void> batchInsertEmails(List<Email> emails) async {
  await db.batch((batch) {
    for (final email in emails) {
      batch.insert(emails, email, mode: InsertMode.insertOrIgnore);
    }
  });
}

// 事务内批量更新
await db.transaction(() async {
  for (final (index, task) in reorderedTasks.indexed) {
    await (update(tasks)..where((t) => t.id.equals(task.id)))
        .write(TasksCompanion(sortOrder: Value(index)));
  }
});
```

### 5. 内存管理

```dart
// 1. StreamSubscription 及时取消
class _EmailListState extends ConsumerState<EmailListPage> {
  StreamSubscription? _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = ref.read(eventBusProvider)
        .on<NewEmailReceivedEvent>()
        .listen((_) => ref.read(emailListProvider(folder).notifier).refresh());
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}

// 2. ImageCache 限制
// 在 main.dart 中设置
PaintingBinding.instance.imageCache.maximumSize = 200;  // 最多缓存 200 张图片
PaintingBinding.instance.imageCache.maximumSizeBytes = 50 << 20; // 50 MB

// 3. TextEditingController 及时 dispose
class _SearchPageState extends State<SearchPage> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
```

### 6. Widget 构建优化

```dart
// 1. const widget 优先
const SizedBox(height: 16);
const Icon(Icons.email);
const Padding(padding: EdgeInsets.all(16));

// 2. RepaintBoundary 隔离重绘区域
RepaintBoundary(
  child: TaskTile(task: task),  // 单个任务卡片重绘不影响其他
);

// 3. Keys 保持状态
ListView.builder(
  key: const PageStorageKey('email-list'), // 保存滚动位置
  itemCount: emails.length,
  itemBuilder: (_, i) => EmailTile(key: ValueKey(emails[i].id), email: emails[i]),
);

// 4. AnimatedList / AnimatedSwitcher 替代 setState 全量重建
// 5. Select rebuild area
Consumer(
  builder: (context, ref, child) {
    final count = ref.watch(unreadCountProvider);
    return Badge(count: count, child: child!);
  },
  child: const Icon(Icons.email), // child 部分不重建
);
```

### 7. 网络优化

```dart
// 1. IMAP 连接池复用
class ImapConnectionPool {
  final _connections = <int, ImapClient>{};

  Future<ImapClient> getConnection(int accountId) async {
    if (_connections.containsKey(accountId)) {
      return _connections[accountId]!;
    }
    final client = ImapClient();
    await client.connectToServer(host, port, isSecure: true);
    _connections[accountId] = client;
    return client;
  }

  void release(int accountId) {
    _connections.remove(accountId)?.closeConnection();
  }

  void disposeAll() {
    for (final client in _connections.values) {
      client.closeConnection();
    }
    _connections.clear();
  }
}

// 2. 邮件列表仅获取元数据，正文延迟加载
// fetchPreference: FetchPreference.envelope   // 仅获取信封（发件人/主题/时间）
// 点击邮件详情时再 fetchPreference: FetchPreference.body
```

### 8. Drift 查询优化

```dart
// 1. 仅查询需要的列（避免 SELECT *）
Future<List<String>> getAllTaskTitles() async {
  return (select(tasks)..orderBy([(t) => OrderingTerm(expression: t.createdAt, mode: OrderingMode.desc)]))
      .map((row) => row.title)
      .get();
}

// 2. 使用 custom queries 优化复杂关联
Future<List<UnreadEmailSummary>> getUnreadSummary() async {
  return customSelect(
    'SELECT account_id, COUNT(*) AS count FROM emails '
    'WHERE folder = "inbox" AND is_read = 0 '
    'GROUP BY account_id',
  ).get().then((rows) => rows.map((r) => UnreadEmailSummary(
    accountId: r.data['account_id'] as int,
    count: r.data['count'] as int,
  )).toList());
}
```

### 9. 性能目标与监控

| 场景 | 目标 | 验证方式 |
|---|---|---|
| 应用冷启动 | < 2s 显示首屏 | `Flutter DevTools` Timeline |
| 邮件列表 500 条 | 滚动 60fps | Profile mode 下检查帧率 |
| 切换模块 | < 300ms 响应 | `Navigator.transitionDuration` |
| 数据库查询 10000 条 | < 100ms | `Stopwatch` 测量 |
| IMAP 收信（50 封） | < 5s（含写入） | 实际测量 |
| 内存峰值 | < 200MB | DevTools Memory tab |
| 数据库文件大小 | < 50MB（一年使用后） | 定期检查 |

```dart
// 性能监控工具（debug/profile 模式）
class PerfMonitor {
  static final _watchers = <String, Stopwatch>{};

  static void start(String label) {
    _watchers[label] = Stopwatch()..start();
  }

  static void end(String label) {
    final sw = _watchers.remove(label);
    if (sw != null) {
      debugPrint('[Perf] $label: ${sw.elapsedMilliseconds}ms');
    }
  }

  // 用法
  // PerfMonitor.start('email_list_query');
  // final emails = await dao.getEmailsByFolder(...);
  // PerfMonitor.end('email_list_query');
}
```

## 主题系统实现

### 架构概览

```
Design Tokens (design_system/tokens/*.dart)
    ↕ 映射
Flutter ThemeData (design_system/themes/light_theme.dart / dark_theme.dart)
    ↕ 注入
MaterialApp(theme:, darkTheme:)
    ↕ ref.watch
themeModeProvider (Riverpod)  ← 用户设置：light / dark / system
```

### Token 定义

```dart
// core/design_system/tokens/app_colors.dart
class AppColors {
  // Light
  static const primary = Color(0xFF2563EB);
  static const primaryContainer = Color(0xFFDBEAFE);
  static const onPrimary = Color(0xFFFFFFFF);
  static const secondary = Color(0xFF0D9488);
  static const secondaryContainer = Color(0xFFCCFBF1);
  static const surface = Color(0xFFF8FAFC);
  static const surfaceContainer = Color(0xFFFFFFFF);
  static const surfaceVariant = Color(0xFFF1F5F9);
  static const onSurface = Color(0xFF0F172A);
  static const onSurfaceVariant = Color(0xFF475569);
  static const outline = Color(0xFFCBD5E1);
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);
  static const error_ = Color(0xFFDC2626);
  static const frost = Color(0xB2FFFFFF); // rgba(255,255,255,0.7)

  // Dark
  static const darkPrimary = Color(0xFF60A5FA);
  static const darkPrimaryContainer = Color(0xFF1E3A5F);
  static const darkOnPrimary = Color(0xFF0F172A);
  static const darkSecondary = Color(0xFF2DD4BF);
  static const darkSecondaryContainer = Color(0xFF134E4A);
  static const darkSurface = Color(0xFF0F172A);
  static const darkSurfaceContainer = Color(0xFF1E293B);
  static const darkSurfaceVariant = Color(0xFF334155);
  static const darkOnSurface = Color(0xFFF1F5F9);
  static const darkOnSurfaceVariant = Color(0xFF94A3B8);
  static const darkOutline = Color(0xFF334155);
  static const darkSuccess = Color(0xFF4ADE80);
  static const darkWarning = Color(0xFFFBBF24);
  static const darkError = Color(0xFFF87171);
  static const darkFrost = Color(0xBF1E293B); // rgba(30,41,59,0.75)
}
```

```dart
// core/design_system/tokens/app_spacing.dart
class AppSpacing {
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double space10 = 40;

  // Edge insets shortcuts
  static const EdgeInsets pagePadding = EdgeInsets.all(space4);
  static const EdgeInsets cardPadding = EdgeInsets.all(space4);
  static const EdgeInsets listItemPadding = EdgeInsets.symmetric(
    horizontal: space4, vertical: space3,
  );
}
```

```dart
// core/design_system/tokens/app_radius.dart
class AppRadius {
  static const double sm = 6;
  static const double md = 10;
  static const double lg = 16;
  static const double full = 999;

  static const BorderRadius smBr = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdBr = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgBr = BorderRadius.all(Radius.circular(lg));
}
```

```dart
// core/design_system/tokens/app_typography.dart
class AppTypography {
  static const String fontFamily = 'system';

  static const TextStyle display = TextStyle(
    fontSize: 32, fontWeight: FontWeight.w700, fontFamily: fontFamily,
  );
  static const TextStyle headline = TextStyle(
    fontSize: 20, fontWeight: FontWeight.w600, fontFamily: fontFamily,
  );
  static const TextStyle title = TextStyle(
    fontSize: 16, fontWeight: FontWeight.w600, fontFamily: fontFamily,
  );
  static const TextStyle body = TextStyle(
    fontSize: 14, fontWeight: FontWeight.w400, fontFamily: fontFamily,
  );
  static const TextStyle bodySmall = TextStyle(
    fontSize: 12, fontWeight: FontWeight.w400, fontFamily: fontFamily,
  );
  static const TextStyle label = TextStyle(
    fontSize: 12, fontWeight: FontWeight.w500, fontFamily: fontFamily,
  );
  static const TextStyle caption = TextStyle(
    fontSize: 11, fontWeight: FontWeight.w400, fontFamily: fontFamily,
  );
}
```

### ThemeExtension（自定义 Design Token 注入 Flutter 主题）

```dart
// core/design_system/tokens/easy_work_theme.dart
class EasyWorkTheme extends ThemeExtension<EasyWorkTheme> {
  final Color frost;
  final Color success;
  final Color warning;
  final Color primaryContainer;
  final Color secondaryContainer;
  final Color surfaceVariant;

  const EasyWorkTheme({
    required this.frost,
    required this.success,
    required this.warning,
    required this.primaryContainer,
    required this.secondaryContainer,
    required this.surfaceVariant,
  });

  // Light
  static const light = EasyWorkTheme(
    frost: AppColors.frost,
    success: AppColors.success,
    warning: AppColors.warning,
    primaryContainer: AppColors.primaryContainer,
    secondaryContainer: AppColors.secondaryContainer,
    surfaceVariant: AppColors.surfaceVariant,
  );

  // Dark
  static const dark = EasyWorkTheme(
    frost: AppColors.darkFrost,
    success: AppColors.darkSuccess,
    warning: AppColors.darkWarning,
    primaryContainer: AppColors.darkPrimaryContainer,
    secondaryContainer: AppColors.darkSecondaryContainer,
    surfaceVariant: AppColors.darkSurfaceVariant,
  );

  @override
  ThemeExtension<EasyWorkTheme> copyWith({...}) => this;

  @override
  ThemeExtension<EasyWorkTheme> lerp(covariant EasyWorkTheme? other, double t) {
    if (other == null) return this;
    return EasyWorkTheme(
      frost: Color.lerp(frost, other.frost, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      primaryContainer: Color.lerp(primaryContainer, other.primaryContainer, t)!,
      secondaryContainer: Color.lerp(secondaryContainer, other.secondaryContainer, t)!,
      surfaceVariant: Color.lerp(surfaceVariant, other.surfaceVariant, t)!,
    );
  }
}

// Widget 中读取自定义 token
// final theme = Theme.of(context).extension<EasyWorkTheme>()!;
// Container(color: theme.frost);
```

### Light / Dark ThemeData 构建

```dart
// core/design_system/themes/light_theme.dart
ThemeData buildLightTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.light(
      primary: AppColors.primary,
      onPrimary: AppColors.onPrimary,
      primaryContainer: AppColors.primaryContainer,
      secondary: AppColors.secondary,
      secondaryContainer: AppColors.secondaryContainer,
      surface: AppColors.surface,
      error: AppColors.error_,
      outline: AppColors.outline,
    ),
    scaffoldBackgroundColor: AppColors.surface,

    // 字体
    textTheme: TextTheme(
      displayLarge: AppTypography.display,
      headlineMedium: AppTypography.headline,
      titleMedium: AppTypography.title,
      bodyLarge: AppTypography.body,
      bodyMedium: AppTypography.body,
      bodySmall: AppTypography.bodySmall,
      labelLarge: AppTypography.label,
    ),

    // 圆角
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: AppRadius.mdBr),
      color: AppColors.surfaceContainer,
    ),
    inputDecorationTheme: InputDecorationThemeData(
      border: OutlineInputBorder(
        borderRadius: AppRadius.smBr,
        borderSide: BorderSide(color: AppColors.outline),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.space3, vertical: AppSpacing.space2,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.smBr),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.space4, vertical: AppSpacing.space2,
        ),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: Colors.transparent,
      indicatorColor: AppColors.primaryContainer,
      width: 48,
    ),

    // 自定义 token
    extensions: const [EasyWorkTheme.light],
  );
}
```

```dart
// core/design_system/themes/dark_theme.dart
ThemeData buildDarkTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.dark(
      primary: AppColors.darkPrimary,
      onPrimary: AppColors.darkOnPrimary,
      primaryContainer: AppColors.darkPrimaryContainer,
      secondary: AppColors.darkSecondary,
      secondaryContainer: AppColors.darkSecondaryContainer,
      surface: AppColors.darkSurface,
      error: AppColors.darkError,
      outline: AppColors.darkOutline,
    ),
    scaffoldBackgroundColor: AppColors.darkSurface,

    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: AppRadius.mdBr),
      color: AppColors.darkSurfaceContainer,
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: Colors.transparent,
      indicatorColor: AppColors.darkPrimaryContainer,
      width: 48,
    ),

    extensions: const [EasyWorkTheme.dark],
  );
}
```

### Theme Provider（Riverpod 切换）

```dart
// core/design_system/providers/theme_provider.dart

/// 用户偏好的主题模式
final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref);
});

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final Ref _ref;

  ThemeModeNotifier(this._ref) : super(ThemeMode.system) {
    _loadFromPrefs();
  }

  Future<void> _loadFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    final value = prefs.getString('theme_mode') ?? 'system';
    state = switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> setTheme(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme_mode', mode.name);
  }
}

/// 构建的 ThemeData（响应 themeMode 变化）
final lightThemeProvider = Provider<ThemeData>((ref) => buildLightTheme());
final darkThemeProvider = Provider<ThemeData>((ref) => buildDarkTheme());
```

### MaterialApp 中注入

```dart
class EasyWorkApp extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final lightTheme = ref.watch(lightThemeProvider);
    final darkTheme = ref.watch(darkThemeProvider);

    return MaterialApp(
      title: 'EasyWork',
      theme: lightTheme,
      darkTheme: darkTheme,
      themeMode: themeMode,
      // ... 其他配置
    );
  }
}
```

### Widget 中消费主题

```dart
// 方式 1：标准 Flutter Token
Container(
  color: Theme.of(context).colorScheme.primaryContainer,
  child: Text(
    'Hello',
    style: Theme.of(context).textTheme.bodyLarge,
  ),
);

// 方式 2：Design Token 常量（不需要 BuildContext 的场景）
padding: const EdgeInsets.all(AppSpacing.space4),

// 方式 3：自定义 Token（毛玻璃等）
final easyTheme = Theme.of(context).extension<EasyWorkTheme>()!;
Container(
  decoration: BoxDecoration(
    color: easyTheme.frost,
    borderRadius: AppRadius.mdBr,
  ),
);
```

### 毛玻璃效果实现

```dart
// core/design_system/widgets/frost_container.dart
class FrostContainer extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsetsGeometry padding;

  const FrostContainer({
    super.key,
    required this.child,
    this.borderRadius = AppRadius.md,
    this.padding = const EdgeInsets.all(AppSpacing.space4),
  });

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).extension<EasyWorkTheme>()!.frost;
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(
              color: Theme.of(context).colorScheme.outline.withAlpha(60),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
```

### Design System 目录结构

```
core/design_system/
├── tokens/
│   ├── app_colors.dart          # 色板
│   ├── app_spacing.dart         # 间距系统
│   ├── app_radius.dart          # 圆角
│   ├── app_typography.dart      # 字体
│   └── easy_work_theme.dart     # ThemeExtension
├── themes/
│   ├── light_theme.dart         # Light ThemeData 构建
│   └── dark_theme.dart          # Dark ThemeData 构建
├── providers/
│   └── theme_provider.dart      # Riverpod 主题切换
├── widgets/
│   ├── frost_container.dart     # 毛玻璃组件
│   ├── easy_app_bar.dart        # 统一 AppBar 封装
│   └── easy_card.dart           # 统一卡片封装
└── design_system.dart           # barrel export
```

### 扩展：深色模式自动跟随

```dart
// 设置页主题选择器
ThemeModeSelector(
  current: ref.watch(themeModeProvider),
  onChanged: (mode) => ref.read(themeModeProvider.notifier).setTheme(mode),
);

// 选项：跟随系统 / 浅色 / 深色
// 默认：跟随系统
// 保存在 shared_preferences，重启后恢复
```

## 关键原则

- **YAGNI**：不在 MVP 阶段做非必要的功能
- **一次一个问题**：模块逐个推进
- **增量验证**：每个阶段完成后验证
- **同步预留**：Repository 模式预留接口，但 MVP 仅本地实现
