# EasyWork 架构规范

> 版本：4.4.0 | 日期：2026-07-02 |

## 1. 概述与技术栈

### 1.1 项目概述

EasyWork 是一款个人效率工具，适配 Windows 和 Android 双端。以统一入口解决日常办公与生活中的常用工具需求：任务管理、邮件处理、日历、笔记、记账、运动记录、股票行情等。采用 Flutter + Dart 最新稳定版开发，一套代码双端运行，响应式 UI 自适应多分辨率。

### 1.2 技术栈

| 层 | 选型 | 版本策略 |
|---|---|---|
| 框架 | Flutter + Dart | 最新稳定版 |
| 状态管理 | Riverpod | 最新稳定版 |
| 本地存储 | drift (SQLite) | 最新稳定版 |
| 路由 | go_router | 最新稳定版 |
| 邮件协议 | enough_mail | ^2.1.7 |
| 邮件 UI | enough_mail_flutter | ^2.1.2 |
| 邮件 HTML 渲染 | enough_mail_html | ^2.0.2（enough_mail_flutter 传递依赖） |
| 编码转换 | enough_convert | ^1.6.0（enough_mail 传递依赖） |
| 内联 Web 视图 | flutter_inappwebview | ^6.0.0（enough_mail_flutter 传递依赖） |
| VCF 处理 | vcard | 最新稳定版 |
| 编码检测 | charset | 最新稳定版 |
| 国际化 | Flutter intl / ARB | SDK 内置 |
| 本地通知 | flutter_local_notifications | 最新稳定版 |
| 安全存储 | flutter_secure_storage | 最新稳定版 |
| Windows 托盘 | system_tray | 最新稳定版 |
| 窗口管理 | window_manager | 最新稳定版 |
| 后台任务(Android) | workmanager | 最新稳定版 |
| 网络检测 | connectivity_plus | 最新稳定版 |
| 图片缓存 | cached_network_image | 最新稳定版 |
| 日历组件 | table_calendar | 最新稳定版（候选） |
| 农历计算 | lunar | 最新稳定版 |
| RRULE 解析 | rrule | 最新稳定版 |
| 富文本编辑 | flutter_quill | ^10.0.0 |
| 图表 | fl_chart | 最新稳定版 |
| URL 启动 | url_launcher | 最新稳定版 |
| 权限管理 | permission_handler | 最新稳定版 |
| 文件选择 | file_picker | 最新稳定版 |
| 测试 Mock | mocktail | 最新稳定版 |

**依赖原则**：最新稳定版、非弃用、< 1 年未更新、评分良好。

**传递依赖说明**：`enough_mail_html`、`enough_convert`、`flutter_inappwebview` 是 `enough_mail_flutter` 的传递依赖，无需在 pubspec.yaml 中显式声明。但若需要直接 import 其中的类（如 `HtmlToPlainTextConverter`），则需手动添加到 dependencies。

#### enough_mail 生态依赖树

```
enough_mail ^2.1.7
  ├── 高级 API: MailClient (IMAP/POP3/SMTP, IDLE, 自动重连, EventBus)
  ├── 低级 API: ImapClient, SmtpClient, PopClient
  ├── MIME: MimeMessage, MimePart, MessageBuilder
  └── 发现: Discover.discover()

enough_mail_flutter ^2.1.2
  ├── MimeMessageViewer — 渲染已下载邮件
  ├── MimeMessageDownloader — 下载 + 渲染
  └── 依赖: flutter_inappwebview (WebView 渲染 HTML)

enough_mail_html ^2.0.2
  ├── transformToHtml() — MimeMessage → HTML 字符串
  ├── HtmlToPlainTextConverter — HTML → 纯文本
  ├── TransformConfiguration — 渲染配置
  └── DomTransformer — 自定义 DOM 变换

enough_convert ^1.6.0
  └── 字符编码: GBK, Big5, ISO-8859-*, Windows-125* 等
```

### 1.3 架构原则

- **Clean Architecture + Feature-first 分包**：每个功能模块内分层为 domain → data → presentation
- **Repository 模式**：domain 层定义抽象接口，data 层实现（本地 drift / 远程 IMAP），预留远端同步扩展点
- **EventBus 解耦**：模块间零直接依赖，通过类型安全事件通信
- **Riverpod 状态管理**：全局统一使用手动声明的 `Provider`/`NotifierProvider`/`FutureProvider` 等，保持风格一致（不引入 `riverpod_generator` 代码生成）。DAO 和 Service 使用 `Provider`，列表数据使用 `AsyncNotifierProvider`，表单/临时状态使用 `StateProvider.autoDispose`
- **数据不可变**：领域模型使用 `freezed`（或 `equatable`）确保不可变性和值语义，便于 Riverpod 检测状态变更
- **YAGNI**：不在 MVP 阶段做非必要功能，所有扩展点通过接口预留
- **平台降解**：不可用平台直接隐藏相关入口/按钮

---

## 2. 基础设施

### 2.1 目录结构

```
lib/
├── core/                              # 基础设施
│   ├── design_system/                 # 主题系统
│   │   ├── tokens/                    # Design Tokens（色彩/间距/圆角/字体）
│   │   ├── themes/                    # Light/Dark ThemeData 构建
│   │   ├── providers/                 # 主题切换 Provider
│   │   └── widgets/                   # 通用设计组件（毛玻璃等）
│   ├── router/                        # 路由配置（go_router）
│   ├── database/                      # AppDatabase 全局入口 + drift 代码生成
│   │   ├── app_database.dart
│   │   └── app_database.drift
│   ├── errors/                        # 异常定义 + Result 类型 + 全局错误监听
│   ├── security/                      # 凭据存储（flutter_secure_storage）
│   ├── network/                       # 网络重试 + 连接池
│   ├── validation/                    # 输入校验器
│   ├── platform/                      # 平台能力检测 + 降解
│   └── extensions/                    # 通用 Dart 扩展
├── l10n/                              # 国际化 ARB 文件（flutter gen-l10n）
│   ├── app_zh.arb
│   └── app_en.arb
├── shared/                            # 跨模块共用
│   ├── widgets/                       # 通用 UI 组件
│   ├── models/                        # 跨模块数据模型
│   └── events/                        # EventBus + 事件定义
├── features/
│   ├── dashboard/
│   ├── timeline/
│   ├── task_board/
│   ├── calendar/
│   ├── email/
│   ├── notes/
│   ├── accounting/
│   ├── stocks/
│   ├── exercise/
│   ├── log/
│   └── settings/
├── main.dart
└── app.dart
```

**Feature 模块内部分层：**

```
email/
├── domain/
│   ├── models/          # 实体
│   ├── repositories/    # 接口（abstract）
│   └── usecases/        # 用例
├── data/
│   ├── repositories/    # 实现
│   ├── datasources/     # 本地/远程数据源
│   └── database/        # drift 表 + DAO
├── presentation/
│   ├── providers/       # Riverpod providers
│   ├── pages/           # 页面
│   └── widgets/         # 组件
└── email_feature.dart   # barrel export：导出模块内所有 public API（Repository、Provider、Model），便于其他模块按需引用
```

### 2.2 数据层

#### 2.2.1 架构分层

```
UI / Provider
    ↕  (interface)
Repository (domain/repositories/*.dart)     ← 纯抽象
    ↕  (implements)
RepositoryImpl (data/repositories/*.dart)
    ↕
DAO (data/database/*_dao.dart)
    ↕
Drift 表定义 (data/database/tables/*.dart)
    ↕
SQLite
```

#### 2.2.2 AppDatabase

```dart
@DriftDatabase(
  tables: [
    EmailAccounts, Emails, EmailAttachments, PendingEmails,
    Contacts, ContactGroups, ContactGroupMembers,
    EmailSignatures, EmailToTask,
    Tasks, TaskComments,
    Notes, NoteTags, NoteTagMembers,
    AccountingRecords, AccountingCategories, AccountingBudgets,
    ExerciseRecords,
    Stocks,
    CalendarEvents,
    Settings,
    Logs, TimelineEvents,
  ],
)
class AppDatabase extends _$AppDatabase {
  @override
  int get schemaVersion => 3;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
      await _createFtsTables(m);
      await _createFtsTriggers(m);
      await _insertDefaultData();
    },
    onUpgrade: (m, from, to) async { /* 版本迁移逻辑 */ },
  );

  Future<void> _createFtsTables(Migrator m) async {
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
        title, description, content='tasks', content_rowid='id'
      );
    ''');
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
        subject, from_name, from_address, body_text,
        content='emails', content_rowid='id'
      );
    ''');
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
        display_name, first_name, last_name, email_addresses,
        content='contacts', content_rowid='id'
      );
    ''');
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title, content, content='notes', content_rowid='id'
      );
    ''');
  }
}

Future<AppDatabase> createAppDatabase() async {
  final dbPath = path.join(
    (await getApplicationDocumentsDirectory()).path, 'easywork.db',
  );
  return AppDatabase(LazyDatabase(() async {
    final file = File(dbPath);
    return NativeDatabase(file);
  }));
}
```

#### 2.2.3 邮箱模块表

```dart
// 邮箱账户
// enough_mail 的 MailAccount 对象以 JSON 格式存储在 mailAccountJson 中，
// 作为连接配置的单一数据源，以下字段是查询常用的部分冗余。
// 注意：mailAccountJson 中不包含 password 字段，密码仅存储在 flutter_secure_storage 中。
// 写入前需清除 MailAccount 的 password 属性，仅保留 host/port/ssl/auth 等连接配置。
class EmailAccounts extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get email => text()();
  TextColumn get displayName => text().nullable()();
  TextColumn get mailAccountJson => text()();    // MailAccount 序列化（JSON），含 IMAP/SMTP host/port/ssl/auth
  TextColumn get imapHost => text()();           // 冗余：常用查询
  IntColumn get imapPort => integer()();         // 冗余
  BoolColumn get imapUseSsl => boolean().withDefault(const Constant(true))();
  TextColumn get smtpHost => text()();           // 冗余
  IntColumn get smtpPort => integer()();         // 冗余
  BoolColumn get smtpUseSsl => boolean().withDefault(const Constant(true))();
  BoolColumn get supportsIdle => boolean().withDefault(const Constant(false))();
  TextColumn get discoveredConfigJson => text().nullable()();  // 自动发现的配置（Discover API 结果）
  TextColumn get loginType => text().withDefault(const Constant('normal'))();  // 认证方式：normal/login/ntlm
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}

// 邮件
class Emails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get messageId => text()();
  TextColumn get subject => text().nullable()();
  TextColumn get fromName => text().nullable()();
  TextColumn get fromAddress => text()();
  TextColumn get toList => text().nullable()();
  TextColumn get ccList => text().nullable()();
  TextColumn get bccList => text().nullable()();
  TextColumn get bodyText => text().nullable()();
  TextColumn get bodyHtml => text().nullable()();
  BoolColumn get hasAttachments => boolean().withDefault(const Constant(false))();
  DateTimeColumn get receivedAt => dateTime()();
  BoolColumn get isRead => boolean().withDefault(const Constant(false))();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  TextColumn get folder => text().withDefault(const Constant('inbox'))();
  TextColumn get threadId => text().nullable()();
  TextColumn get originalMessageJson => text().nullable()();  // 完整 MimeMessage 序列化（JSON），用于回复/转发时引用原文

  @override
  Set<Column> get primaryKey => {id};
}

// 附件
class EmailAttachments extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get emailId => integer().references(Emails, #id)();
  TextColumn get filename => text()();
  TextColumn get mimeType => text().nullable()();
  IntColumn get size => integer().nullable()();
  TextColumn get localPath => text().nullable()();  // 附件下载后的本地绝对路径
  TextColumn get cid => text().nullable()();        // Content-ID（内联图片引用）
}

// 附件物理存储路径规范：
// {应用文档目录}/email/{accountId}/{emailId}/{filename}
// 例：/data/user/0/com.easywork.app/files/email/1/42/report.pdf
// 未下载的附件 localPath 为 null，按需下载后更新
// 删除邮件时同步删除对应附件目录

// 附件下载流程：
// 1. 邮件详情页渲染 MimeMessageDownloader，内部自动检测本地是否已有完整正文
// 2. 未下载 → 调用 mailClient.fetchMessageContents() 下载完整 MIME
// 3. 下载完成 → onDownloaded 回调 → upsertFullMessage() 持久化到 drift
// 4. 附件元数据（filename/mimeType/size/cid）由 extractAttachments() 提取并写入 EmailAttachments 表
// 5. 附件二进制文件由 MimeMessageViewer 内部通过 flutter_inappwebview 按需加载
//    （内联图片通过 cid:// 协议从 MimePart 提取二进制数据渲染）
// 6. 用户点击附件时，MimeMessageViewer 提供保存/打开选项（调用系统默认应用）

/// 附件存储管理器：统一管理附件的下载、读取、删除、清理
class AttachmentStorageManager {
  /// 获取附件存储根目录: {应用文档目录}/email/
  static Future<Directory> getRootDir() async {
    final appDir = await getApplicationDocumentsDirectory();
    return Directory('${appDir.path}/email');
  }

  /// 获取指定邮件的附件目录: {root}/{accountId}/{emailId}/
  static Future<Directory> getEmailDir(int accountId, int emailId) async {
    final root = await getRootDir();
    final dir = Directory('${root.path}/$accountId/$emailId');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  /// 获取附件本地路径
  static Future<String> getAttachmentPath(
    int accountId,
    int emailId,
    String filename,
  ) async {
    final dir = await getEmailDir(accountId, emailId);
    return '${dir.path}/$filename';
  }

  /// 检查附件是否已下载
  static Future<bool> isDownloaded(
    int accountId,
    int emailId,
    String filename,
  ) async {
    final path = await getAttachmentPath(accountId, emailId, filename);
    return File(path).existsSync();
  }

  /// 保存附件到本地
  static Future<String> saveAttachment(
    int accountId,
    int emailId,
    String filename,
    Uint8List bytes,
  ) async {
    final path = await getAttachmentPath(accountId, emailId, filename);
    await File(path).writeAsBytes(bytes);
    return path;
  }

  /// 删除指定邮件的所有附件
  static Future<void> deleteEmailAttachments(int accountId, int emailId) async {
    final dir = await getEmailDir(accountId, emailId);
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  }

  /// 清理孤立附件（邮件已删除但附件残留）
  static Future<int> cleanupOrphanedAttachments(List<String> validPaths) async {
    int deletedCount = 0;
    final root = await getRootDir();
    if (!await root.exists()) return 0;

    await for (final entity in root.list(recursive: true)) {
      if (entity is File && !validPaths.contains(entity.path)) {
        await entity.delete();
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /// 获取附件存储总大小（字节）
  static Future<int> getTotalSize() async {
    int totalSize = 0;
    final root = await getRootDir();
    if (!await root.exists()) return 0;

    await for (final entity in root.list(recursive: true)) {
      if (entity is File) {
        totalSize += await entity.length();
      }
    }
    return totalSize;
  }
}

// 联系人
// emailAddresses 和 phoneNumbers 存储为 JSON 对象数组字符串，
// 格式：'[{"value":"a@b.com","label":"work"},{"value":"c@d.com","label":"home"}]'
// value 为邮箱/电话号码，label 为标签（可选）
class Contacts extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id).nullable()();
  TextColumn get firstName => text().nullable()();
  TextColumn get lastName => text().nullable()();
  TextColumn get displayName => text()();
  TextColumn get emailAddresses => text().nullable()();  // JSON 数组
  TextColumn get phoneNumbers => text().nullable()();    // JSON 数组
  TextColumn get organization => text().nullable()();
  TextColumn get department => text().nullable()();
  TextColumn get jobTitle => text().nullable()();
  TextColumn get notes => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}

// 联系人分组
class ContactGroups extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  TextColumn get color => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}

// 联系人-分组关联
class ContactGroupMembers extends Table {
  IntColumn get contactId => integer().references(Contacts, #id)();
  IntColumn get groupId => integer().references(ContactGroups, #id)();
  @override
  Set<Column> get primaryKey => {contactId, groupId};
}

// DAO 分配：ContactGroups 和 ContactGroupMembers 由 ContactDao 管理

// 邮件签名
class EmailSignatures extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get name => text()();
  TextColumn get contentType => text().withDefault(const Constant('text'))();
  TextColumn get content => text()();
  BoolColumn get isDefault => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}

// 邮件→任务关联
class EmailToTask extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get emailId => integer().references(Emails, #id)();
  IntColumn get taskId => integer().references(Tasks, #id)();
  TextColumn get attachmentPaths => text().nullable()(); // JSON 数组
  DateTimeColumn get linkedAt => dateTime()();

  // 级联删除：删除邮件或任务时自动清理关联记录（通过 AppDatabase.migration 中的 Foreign Key 配置）
}

// DAO 分配：由 EmailDao 管理（邮件→任务是邮箱模块的子功能）
```

#### 2.2.4 任务看板表

```dart
class Tasks extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  TextColumn get priority => text().withDefault(const Constant('medium'))();
  TextColumn get status => text().withDefault(const Constant('todo'))();
  DateTimeColumn get dueDate => dateTime().nullable()();
  TextColumn get tags => text().nullable()();
  TextColumn get attachments => text().nullable()();
  IntColumn get estimatedMinutes => integer().nullable()();
  IntColumn get actualMinutes => integer().nullable()();
  IntColumn get progressPercentage => integer().nullable()();
  BoolColumn get isRecurring => boolean().withDefault(const Constant(false))();
  TextColumn get recurrenceRule => text().nullable()();
  IntColumn get parentTaskId => integer().nullable()();
  IntColumn get recurrenceGeneration => integer().withDefault(const Constant(0))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get completedAt => dateTime().nullable()();
}

class TaskComments extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get taskId => integer().references(Tasks, #id)();
  TextColumn get content => text()();
  DateTimeColumn get createdAt => dateTime()();

  // 级联删除：删除父任务时自动删除关联评论（通过 AppDatabase.migration 中的 Foreign Key 配置）
}
```

#### 2.2.5 笔记表

```dart
class Notes extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text().nullable()();
  TextColumn get content => text()();  // Quill Delta JSON 格式（flutter_quill 序列化）
  TextColumn get imagePaths => text().nullable()();  // JSON 数组：该笔记引用的图片相对路径列表
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}

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

#### 2.2.6 记账表

```dart
class AccountingCategories extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  TextColumn get icon => text().nullable()();
  TextColumn get type => text()();             // income / expense
  RealColumn get monthlyBudget => real().nullable()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
}

class AccountingRecords extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get type => text()();
  IntColumn get categoryId => integer().references(AccountingCategories, #id)();
  RealColumn get amount => real()();
  DateTimeColumn get recordDate => dateTime()();
  TextColumn get note => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}

class AccountingBudgets extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get categoryId => integer().references(AccountingCategories, #id)();
  TextColumn get month => text()();              // YYYY-MM 格式
  RealColumn get budgetAmount => real()();
}
```

#### 2.2.7 运动记录表

```dart
class ExerciseRecords extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get type => text()();              // running / cycling / fitness
  IntColumn get durationMinutes => integer()();
  RealColumn get distanceKm => real().nullable()();
  RealColumn get calories => real().nullable()();
  DateTimeColumn get recordDate => dateTime()();
  TextColumn get note => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  // Repository 预留接口：syncFromThirdParty()
  // MVP 仅支持手动记录，第三方同步延后
}
```

#### 2.2.8 股票表

```dart
class Stocks extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  TextColumn get market => text()();            // sh / sz / hk / us（统一小写）
  DateTimeColumn get addedAt => dateTime()();

  // 股票代码 + 市场唯一约束（同一市场不能重复添加同一只股票）
  @override
  Set<Column> get primaryKey => {id};
  @override
  List<Set<Column>> get uniqueKeys => [{code, market}];
}

// 行情数据内存持有，不持久化
// 每次打开页面重新从新浪财经 API 拉取
```

#### 2.2.8a 日历事件表

```dart
// 日历事件：支持非任务类日历事件（会议、纪念日、提醒等）
// MVP 阶段：日历页面同时显示 tasks.dueDate 和 calendar_events
// Phase 5+：支持独立日历事件 CRUD + 农历/节假日
class CalendarEvents extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  DateTimeColumn get start => dateTime()();
  DateTimeColumn get end => dateTime().nullable()();  // null 表示无结束时间
  BoolColumn get isAllDay => boolean().withDefault(const Constant(false))();
  TextColumn get color => text().nullable()();        // hex color，null 使用默认色
  TextColumn get recurrenceRule => text().nullable()(); // RRULE 格式（与 Tasks 共用 rrule 包）
  TextColumn get location => text().nullable()();
  IntColumn get taskId => integer().nullable().references(Tasks, #id)();  // 关联任务（可选）
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  // 索引：按时间范围查询（月视图/周视图）
  // CREATE INDEX idx_calendar_events_start ON calendar_events(start);
  // CREATE INDEX idx_calendar_events_end ON calendar_events(end);
}
```

**数据来源说明**：
- 日历页面同时查询 `tasks.dueDate`（任务截止日）和 `calendar_events`（独立事件）
- 任务事件：从 `tasks` 表读取，颜色按优先级着色（高=红、中=琥珀、低=蓝）
- 独立事件：从 `calendar_events` 表读取，颜色由用户自定义
- 两者在日历视图中合并显示，点击时区分来源跳转到对应详情页

#### 2.2.9 设置表

```dart
class Settings extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  @override
  Set<Column> get primaryKey => {key};
}

// 设置项 Key 定义
class SettingKeys {
  static const language = 'language';
  static const themeMode = 'theme_mode';
  static const emailPollInterval = 'email_poll_interval';
  static const newEmailNotification = 'new_email_notification';
  static const taskDueNotification = 'task_due_notification';
  static const exerciseNotification = 'exercise_notification';
  static const autoStart = 'auto_start';
  static const lastBackupDate = 'last_backup_date';
  static const backupPath = 'backup_path';
  static const autoBackup = 'auto_backup';
  static const emailSyncDays = 'email_sync_days';
  static const emailSyncLimit = 'email_sync_limit';
  static const windowWidth = 'window_width';
  static const windowHeight = 'window_height';
  static const windowX = 'window_x';
  static const windowY = 'window_y';
  static const emailBlockExternalImages = 'email_block_external_images';
}

// SettingsDao 类型安全封装
@DriftAccessor(tables: [Settings])
class SettingsDao extends DatabaseAccessor<AppDatabase> with _$SettingsDaoMixin {
  SettingsDao(super.db);

  // 字符串
  Future<String?> getString(String key) async {
    final row = await (select(settings)..where((s) => s.key.equals(key))).getSingleOrNull();
    return row?.value;
  }
  Future<void> setString(String key, String value) async {
    await into(settings).insertOnConflictUpdate(SettingsCompanion.insert(key: key, value: value));
  }

  // 布尔值（序列化为 'true'/'false'）
  Future<bool> getBool(String key, {bool defaultValue = false}) async {
    final v = await getString(key);
    return v == null ? defaultValue : v == 'true';
  }
  Future<void> setBool(String key, bool value) => setString(key, value ? 'true' : 'false');

  // 整数
  Future<int> getInt(String key, {int defaultValue = 0}) async {
    final v = await getString(key);
    return v == null ? defaultValue : int.parse(v);
  }
  Future<void> setInt(String key, int value) => setString(key, value.toString());

  // 双精度浮点
  Future<double> getDouble(String key, {double defaultValue = 0.0}) async {
    final v = await getString(key);
    return v == null ? defaultValue : double.parse(v);
  }
  Future<void> setDouble(String key, double value) => setString(key, value.toString());

  // 日期时间
  Future<DateTime?> getDateTime(String key) async {
    final v = await getString(key);
    return v == null ? null : DateTime.parse(v);
  }
  Future<void> setDateTime(String key, DateTime value) => setString(key, value.toIso8601String());
}

// CalendarDao 类型安全封装
@DriftAccessor(tables: [CalendarEvents])
class CalendarDao extends DatabaseAccessor<AppDatabase> with _$CalendarDaoMixin {
  CalendarDao(super.db);

  /// 获取指定时间范围内的事件
  Future<List<CalendarEvent>> getEventsInRange(DateTime start, DateTime end) async {
    return (select(calendarEvents)
          ..where((e) => e.start.isBiggerOrEqualValue(start) & e.start.isSmallerOrEqualValue(end))
          ..orderBy([(e) => OrderingTerm.asc(e.start)]))
        .get();
  }

  /// 获取单个事件
  Future<CalendarEvent?> getEvent(int id) async {
    return (select(calendarEvents)..where((e) => e.id.equals(id))).getSingleOrNull();
  }

  /// 插入事件
  Future<int> insertEvent(CalendarEventsCompanion companion) =>
      into(calendarEvents).insert(companion);

  /// 更新事件
  Future<void> updateEvent(int id, CalendarEventsCompanion companion) =>
      (update(calendarEvents)..where((e) => e.id.equals(id))).write(companion);

  /// 删除事件
  Future<void> deleteEvent(int id) =>
      (delete(calendarEvents)..where((e) => e.id.equals(id))).go();

  /// 获取所有重复事件（用于日历视图展开重复实例）
  Future<List<CalendarEvent>> getRecurringEvents() async {
    return (select(calendarEvents)..where((e) => e.recurrenceRule.isNotNull())).get();
  }
}
```

#### 2.2.10 日志表

```dart
class Logs extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get level => text()();             // info / warn / error / debug
  TextColumn get module => text()();            // 来源模块
  TextColumn get action => text()();            // 操作类型
  IntColumn get refId => integer().nullable();  // 关联数据 ID
  TextColumn get message => text()();           // 英文技术消息
  TextColumn get userMessage => text().nullable(); // 中文用户消息
  TextColumn get stackTrace => text().nullable();
  DateTimeColumn get createdAt => dateTime()();
}
```

#### 2.2.11 Timeline 表（Logs 的派生记录）

```dart
class TimelineEvents extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get logId => integer().references(Logs, #id)();
  TextColumn get eventType => text()();         // task_created / email_received / ...
  TextColumn get module => text()();            // task_board / email / ...
  IntColumn get refId => integer()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}
```

**数据流**：操作 → 写入 logs 表 → 判断是否属于 Timeline 展示范围 → 是则同时写入 timeline_events。

#### 2.2.12 FTS5 全文索引

```sql
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

同步触发器：

```sql
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

其余模块（emails/contacts/notes）的触发器同理，省略。

**技术方案**：原生 SQL + drift `customSelect` 混合（搜索模块是隔离的 DAO，不污染其他模块）。

**drift 兼容性说明**：
- drift 的 `batch` 操作是单事务内的批量 INSERT/UPDATE/DELETE，SQLite 的 `AFTER INSERT/UPDATE/DELETE` 触发器在 batch 内**仍会正常触发**
- drift 的 `insertOnConflictUpdate` 等方法底层使用 `INSERT OR REPLACE`，会触发 `DELETE + INSERT`，因此触发器中的 `DELETE` 和 `INSERT` 都会执行
- FTS5 同步触发器在 drift 操作下工作正常，无需额外处理
- 注意：如果直接使用 `customStatement` 绕过 drift 执行 SQL，仍需确保触发器逻辑正确

#### 2.2.13 数据库索引

```sql
CREATE INDEX idx_emails_account_folder ON emails(account_id, folder);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_contacts_display_name ON contacts(display_name);
CREATE INDEX idx_timeline_created_at ON timeline_events(created_at DESC);
CREATE INDEX idx_accounting_record_date ON accounting_records(record_date);
CREATE INDEX idx_accounting_category ON accounting_records(category_id);
CREATE INDEX idx_logs_module ON logs(module);
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);
```

#### 2.2.14 DAO + Repository 清单

| 模块 | DAO | Repository Interface | Repository Impl |
|---|---|---|---|
| 邮箱 | `EmailDao` | `EmailRepository` | `EmailRepositoryImpl` |
| 联系人 | `ContactDao` | `ContactRepository` | `ContactRepositoryImpl` |
| 任务看板 | `TaskDao` | `TaskRepository` | `TaskRepositoryImpl` |
| 笔记 | `NoteDao` | `NoteRepository` | `NoteRepositoryImpl` |
| 股票 | `StockDao` | `StockRepository` | `StockRepositoryImpl` |
| 记账 | `AccountingDao` | `AccountingRepository` | `AccountingRepositoryImpl` |
| 运动 | `ExerciseDao` | `ExerciseRepository` | `ExerciseRepositoryImpl` |
| 日历 | `CalendarDao` | -（直接 DAO） | - |
| 日志 | `LogDao` | -（直接 DAO） | - |
| Timeline | `TimelineDao` | -（直接 DAO） | - |
| 设置 | `SettingsDao` | -（直接 DAO） | - |
| 搜索 | `SearchDao` | -（直接 DAO，含 FTS5） | - |
| 离线邮件队列 | `PendingEmailDao` | -（直接 DAO） | - |
| 邮件签名 | `EmailSignatureDao` | -（直接 DAO） | - |
| 附件 | `EmailAttachmentDao` | -（直接 DAO） | - |

**联系人架构说明**：
- 联系人虽然与邮箱模块紧密相关（VCF 导入/导出、邮件收件人搜索），但设计为独立模块
- `ContactRepository` 提供独立的 CRUD 接口，不依赖 `EmailRepository`
- 邮箱模块的"从发件人添加联系人"功能通过 EventBus 间接调用（不直接 ref.read ContactRepository）
- 未来扩展：支持本地联系人（不绑定邮箱账户）、系统通讯录同步等

**联系人分组管理 UI**：

```
分组管理页（/contacts/groups）：
├── 分组列表
│   ├── 每行：颜色圆点 + 分组名称 + 成员数量 + 右箭头
│   ├── 左滑删除（有成员时弹窗确认："删除分组不会删除联系人，仅移除分组关联"）
│   └── 长按排序（拖拽调整顺序）
├── 新建分组按钮（底部固定）
│   → 弹出表单：分组名称（必填）+ 颜色选择器
│   → 保存 → 刷新列表
└── 点击分组 → 跳转到联系人列表（已筛选该分组成员）

联系人详情/编辑页：
├── 分组标签区域：已关联分组以 Chip 展示，点击 × 移除
└── "添加到分组"按钮 → 弹出分组选择弹窗（多选）

#### 2.2.15 Repository Provider 注入

```dart
// createAppDatabase() 是异步函数，因此使用 FutureProvider 延迟初始化
final appDatabaseProvider = FutureProvider<AppDatabase>((ref) async {
  final db = await createAppDatabase();
  ref.onDispose(db.close);
  return db;
});

// DAO Provider：使用 FutureProvider 依赖 appDatabaseProvider
// 注意：FutureProvider 的 state 是 AsyncValue<AppDatabase>，需 .requireValue 获取实例
final contactDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ContactDao(db);
});
final taskDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return TaskDao(db);
});
final noteDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return NoteDao(db);
});
final settingsDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return SettingsDao(db);
});
final logDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return LogDao(db);
});
final timelineDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return TimelineDao(db);
});
final stockDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return StockDao(db);
});
final accountingDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return AccountingDao(db);
});
final exerciseDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ExerciseDao(db);
});
final calendarDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return CalendarDao(db);
});
final searchDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return SearchDao(db);
});
final pendingEmailDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return PendingEmailDao(db);
});
final emailSignatureDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailSignatureDao(db);
});
final emailAttachmentDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailAttachmentDao(db);
});

// 数据源定义
//   emailDaoProvider — drift 本地存储 (EmailDao)
//   mailDataSourcesProvider — 每个邮箱账户一个 MailDataSource 实例（Map<int, MailDataSource>）
final emailDaoProvider = FutureProvider((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailDao(db);
});

/// MailDataSource 生命周期管理器
/// 每个邮箱账户对应一个 MailDataSource 实例，负责 IMAP 连接、IDLE/轮询、SMTP 发送。
/// 账户添加时创建实例，账户删除时销毁实例。
class MailDataSourcesNotifier extends StateNotifier<Map<int, MailDataSource>> {
  final Ref _ref;
  MailDataSourcesNotifier(this._ref) : super({});

  /// 为指定账户创建 MailDataSource 并连接
  /// 需要从 flutter_secure_storage 读取密码
  Future<void> addAccount(EmailAccount account) async {
    if (state.containsKey(account.id)) return;

    final credentialStore = _ref.read(credentialStoreProvider);
    final password = await credentialStore.getPassword(account.id);
    if (password == null) {
      throw StateError('Account ${account.id} has no stored password');
    }

    final appEventBus = _ref.read(eventBusProvider);
    final dataSource = MailDataSource(
      accountId: account.id,
      displayName: account.displayName ?? account.email,
      email: account.email,
      password: password,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapUseSsl: account.imapUseSsl,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpUseSsl: account.smtpUseSsl,
      appEventBus: appEventBus,
    );

    await dataSource.connect();
    state = {...state, account.id: dataSource};
  }

  /// 移除指定账户的 MailDataSource 并断开连接
  Future<void> removeAccount(int accountId) async {
    final dataSource = state[accountId];
    if (dataSource == null) return;

    await dataSource.disconnect();
    dataSource.dispose();
    state = {...state}..remove(accountId);
  }

  /// 连接所有已配置账户
  Future<void> connectAll(List<EmailAccount> accounts) async {
    for (final account in accounts) {
      if (!state.containsKey(account.id)) {
        await addAccount(account);
      }
    }
  }

  /// 断开所有连接
  Future<void> disconnectAll() async {
    for (final entry in state.entries) {
      await entry.value.disconnect();
      entry.value.dispose();
    }
    state = {};
  }

  /// 获取指定账户的 MailDataSource
  MailDataSource? get(int accountId) => state[accountId];

  @override
  void dispose() {
    for (final dataSource in state.values) {
      dataSource.dispose();
    }
    super.dispose();
  }
}

final mailDataSourcesProvider =
    StateNotifierProvider<MailDataSourcesNotifier, Map<int, MailDataSource>>(
  (ref) => MailDataSourcesNotifier(ref),
);

final emailRepositoryProvider = Provider<EmailRepository>((ref) {
  // 注意：emailDaoProvider 是 FutureProvider，此处使用 .requireValue。
  // 仅在 appDatabaseProvider 已完成初始化后调用此 Provider 才安全。
  // 应用启动流程保证：main() → createAppDatabase() → ProviderScope → UI 构建。
  return EmailRepositoryImpl(
    ref.watch(emailDaoProvider).requireValue,
    ref.watch(mailDataSourcesProvider),
  );
});

final contactRepositoryProvider = Provider<ContactRepository>((ref) {
  return ContactRepositoryImpl(ref.watch(contactDaoProvider).requireValue);
});

final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  return TaskRepositoryImpl(ref.watch(taskDaoProvider).requireValue);
});

final noteRepositoryProvider = Provider<NoteRepository>((ref) {
  return NoteRepositoryImpl(ref.watch(noteDaoProvider).requireValue);
});

final accountingRepositoryProvider = Provider<AccountingRepository>((ref) {
  return AccountingRepositoryImpl(ref.watch(accountingDaoProvider).requireValue);
});

final exerciseRepositoryProvider = Provider<ExerciseRepository>((ref) {
  return ExerciseRepositoryImpl(ref.watch(exerciseDaoProvider).requireValue);
});

final stockRepositoryProvider = Provider<StockRepository>((ref) {
  return StockRepositoryImpl(ref.watch(stockDaoProvider).requireValue);
});
```

#### 2.2.16 关键数据源类定义

**设计决策**：enough_mail 已提供 `MailClient` 高级 API（自动重连、内置 EventBus、IDLE/轮询），
因此 EasyWork 不再自行封装低层 IMAP/SMTP 协议，而是通过 `MailDataSource` 对 `MailClient` 做
轻量适配（状态同步 + 与 EasyWork EventBus 桥接）。

```dart
/// 邮箱数据源：对 enough_mail MailClient 的轻量封装 + EventBus 桥接
class MailDataSource {
  final int accountId;
  final MailAccount _account;
  final EventBus _appEventBus;
  late final MailClient _client;
  final List<StreamSubscription> _subscriptions = [];

  MailDataSource({
    required this.accountId,
    required String displayName,
    required String email,
    required String password,
    required String imapHost,
    int imapPort = 993,
    bool imapUseSsl = true,
    required String smtpHost,
    int smtpPort = 465,
    bool smtpUseSsl = true,
    required EventBus appEventBus,
  })  : _account = MailAccount.fromManualSettings(
          name: displayName,
          email: email,
          incomingHost: imapHost,
          incomingPort: imapPort,
          incomingSocketType: imapUseSsl ? SocketType.ssl : SocketType.none,
          outgoingHost: smtpHost,
          outgoingPort: smtpPort,
          outgoingSocketType: smtpUseSsl ? SocketType.ssl : SocketType.none,
          password: password,
        ),
        _appEventBus = appEventBus;

  /// 连接并登录 + 桥接 EventBus
  Future<void> connect() async {
    _client = MailClient(_account, isLogEnabled: false);
    await _client.connect(timeout: const Duration(seconds: 15));

    // 桥接 MailClient.eventBus → EasyWork EventBus
    _subscriptions.addAll([
      _client.eventBus.on<MailLoadEvent>().listen((event) {
        // 注意：此处 localEmailId 暂时为 0，后续由 EmailRepositoryImpl 写入 drift 后
        // 通过新的 NewEmailReceivedEvent（带正确 localEmailId）重新发布。
        // 本事件仅用于通知"有新邮件到达"，不携带本地 ID。
        _appEventBus.publish(NewEmailReceivedEvent(
          messageId: event.message.decodeMessageId() ?? '',
          localEmailId: 0, // 占位值，订阅者不应依赖此 ID
          fromAddress: event.message.from?.toString() ?? '',
          subject: event.message.decodeSubject() ?? '',
        ));
      }),
      _client.eventBus.on<MailConnectionLostEvent>().listen((_) {
        _appEventBus.publish(EmailConnectionLostEvent(accountId: accountId));
      }),
      _client.eventBus.on<MailConnectionReEstablishedEvent>().listen((_) {
        _appEventBus.publish(EmailConnectionReestablishedEvent(accountId: accountId));
      }),
    ]);
  }

  /// 获取文件夹列表（树形结构）
  Future<Tree<Mailbox?>> listMailboxes() => _client.listMailboxesAsTree();

  /// 选择收件箱
  Future<void> selectInbox() => _client.selectInbox();

  /// 获取最近 count 封邮件的头信息
  Future<List<MimeMessage>> fetchMessages({int count = 20}) =>
      _client.fetchMessages(count: count, fetchPreference: FetchPreference.envelope);

  /// 获取单封邮件的完整内容（含正文 + 附件）
  Future<MimeMessage> fetchFullMessage(MimeMessage message) =>
      _client.fetchMessage(message);

  /// 发送邮件
  Future<void> sendMessage(MimeMessage message) =>
      _client.sendMessage(message);

  /// 监听新邮件（IDLE 或轮询）
  Stream<MailLoadEvent> get onNewMessage => _client.eventBus.on<MailLoadEvent>();

  /// 监听连接丢失/恢复
  Stream<MailConnectionLostEvent> get onConnectionLost =>
      _client.eventBus.on<MailConnectionLostEvent>();
  Stream<MailConnectionReEstablishedEvent> get onConnectionReestablished =>
      _client.eventBus.on<MailConnectionReEstablishedEvent>();

  /// 开始自动轮询（非 IDLE 时使用）
  Future<void> startPolling({Duration interval = const Duration(minutes: 5)}) =>
      _client.startPolling(interval: interval);

  /// 停止轮询
  void stopPolling() => _client.stopPolling();

  /// 断开连接
  Future<void> disconnect() => _client.disconnect();

  /// 检测服务器是否支持 IDLE
  bool get supportsIdle => _client.isIdleSupported;

  void dispose() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    stopPolling();
    disconnect();
  }
}

/// 根据邮箱地址自动发现配置
Future<Discovered?> discoverConfig(String email) =>
    Discover.discover(email, isLogEnabled: false);
```

### 2.3 状态管理（Riverpod）

#### 2.3.1 分层原则

```
UI (Widget)
  │  ref.watch(provider)          ← 自动重建
  │  ref.read(provider.notifier)  ← 触发副作用
  ▼
Provider 层
  │  调用 Repository 接口
  ▼
Repository 层（抽象）
  ▼
Data Source 层（Drift / MailClient）
```

#### 2.3.2 Provider 类型选择

| 场景 | Provider 类型 | 说明 |
|---|---|---|
| 全局单例服务 | `Provider` | EventBus、DB、Notification 等 |
| 简单状态 | `StateProvider` | 语言、主题 |
| 异步数据列表 | `AsyncNotifierProvider` | 支持 loading/error/data 三态 |
| 复杂状态+副作用 | `NotifierProvider` | 含业务逻辑的 mutable 状态 |
| 派生/聚合 | `Provider` / `FutureProvider` | 过滤、计算值 |
| 页面临时状态 | `StateProvider.autoDispose` | 搜索框、表单、离开页面释放 |

#### 2.3.3 Provider 依赖图（全局层）

```
                     appDatabaseProvider
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  emailRepositoryProvider  taskRepositoryProvider  accountingRepositoryProvider  ...
        │                  │                  │
        ▼                  ▼                  ▼
  eventBusProvider    eventSubscriptions    notificationProvider
```

#### 2.3.4 Provider 依赖图（模块级 - 以邮箱为例）

```
appDatabaseProvider
      │
      ▼
emailDaoProvider ──────────────────── mailDataSourcesProvider
      │                                        │
      └──────────────┬─────────────────────────┘
                     ▼
             emailRepositoryProvider
                     │
                     ▼
 ┌──────────────────────────────────────────────────┐
 │              邮箱 Provider 群                      │
 │  emailAccountListProvider                         │
 │  emailListProvider(folder)                        │
 │  unreadCountProvider (派生)                       │
 │  emailDetailProvider(id) (autoDispose)            │
 │  composeEmailProvider                             │
 │  contactListProvider                              │
 │  contactGroupProvider                             │
 │  signatureProvider                                │
 └──────────────────────────────────────────────────┘

备注：mailDataSourcesProvider 根据当前邮箱账户列表动态创建/销毁 MailDataSource 实例。
每个 MailDataSource 对应一个 enough_mail MailClient，负责该账户的 IMAP 连接、
IDLE/轮询收信、SMTP 发送。连接状态变化通过 MailClient.eventBus 通知。
```

#### 2.3.5 典型数据流：创建任务

```
ref.read(taskListProvider.notifier).createTask(task)
  │
  ├── taskRepositoryProvider.createTask(task)
  │     ├── drift: INSERT INTO tasks ...
  │     ├── 通知调度: NotificationService.scheduleTaskDue(task.id, task.title, task.dueDate)
  │     └── 失败时: 抛出 DatabaseException → UI SnackBar "创建失败，请重试"
  │
  ├── eventBusProvider.publish(TaskCreatedEvent(...))
  │     ├── (Timeline) → timelineEvents 表写入
  │     ├── (Dashboard) → 待办计数刷新
  │     ├── (Notification) → 到期提醒检查
  │     └── (Logs) → logs 表写入
  │
  └── ref.invalidateSelf() → UI 重建：看板刷新
```

#### 2.3.6 Provider 最佳实践

| 原则 | 说明 |
|---|---|
| 模块自治 | 每个 module 的 provider 在自己目录下，不跨模块 import |
| 单向依赖 | Provider → Repository（interface），不反向 |
| autoDispose 用在页面级 | 临时筛选/搜索/表单状态 |
| keepAlive 用在全局级 | 数据库、服务、列表缓存 |
| 不滥用 watch | 只有 UI 需要重建时才用 `watch`，副作用用 `listen` |
| EventBus 替代跨模块 ref.read | 避免 A 模块直接操作 B 模块的 provider |

### 2.4 事件总线（EventBus）

#### 2.4.1 设计目标

- 模块间零直接依赖
- 类型安全的事件和负载
- 单向数据流：发布 → 订阅 → UI 更新
- 启动时全部订阅激活

#### 2.4.2 事件定义

```
shared/events/
├── event_bus.dart          # EventBus 核心
├── app_event.dart          # 基类 + ChangeType 枚举
├── task_events.dart        # TaskCreated / TaskStatusChanged / TaskDeleted
├── email_events.dart       # NewEmailReceived / EmailConvertedToTask / UnreadCountChanged / EmailConnectionLost / EmailConnectionReestablished
├── accounting_events.dart  # TransactionRecorded
├── exercise_events.dart    # ExerciseCompleted
├── note_events.dart        # NoteUpdated
├── notification_events.dart # RequestNotification
└── network_events.dart     # Online / Offline
```

#### 2.4.3 EventBus 核心实现

```dart
// app_event.dart
abstract class AppEvent {
  final DateTime occurredAt;
  final String moduleName;
  AppEvent({DateTime? occurredAt, required this.moduleName})
    : occurredAt = occurredAt ?? DateTime.now();
}

class DataChangedEvent<T> extends AppEvent {
  final ChangeType changeType;
  final T data;
  final String? description;
  DataChangedEvent({required super.moduleName, required this.changeType, required this.data, this.description});
}

enum ChangeType { created, updated, deleted }

// event_bus.dart
class EventBus {
  final _controller = StreamController<AppEvent>.broadcast();
  Stream<T> on<T extends AppEvent>() => _controller.stream.where((e) => e is T).cast<T>();
  void publish<T extends AppEvent>(T event) => _controller.add(event);
  void dispose() => _controller.close();
}
```

#### 2.4.4 事件清单

```dart
// task_events.dart
class TaskCreatedEvent extends AppEvent {
  final int taskId;
  final String title;
  final String priority;
  TaskCreatedEvent({required this.taskId, required this.title, required this.priority})
    : super(moduleName: 'task_board');
}

class TaskStatusChangedEvent extends AppEvent {
  final int taskId;
  final String title;
  final String oldStatus;
  final String newStatus;
  TaskStatusChangedEvent({required this.taskId, required this.title, required this.oldStatus, required this.newStatus})
    : super(moduleName: 'task_board');
}

class TaskDeletedEvent extends AppEvent {
  final int taskId;
  final String title;
  TaskDeletedEvent({required this.taskId, required this.title})
    : super(moduleName: 'task_board');
}

/// 应用层连接丢失事件（与 enough_mail 的 MailConnectionLostEvent 区分）
class EmailConnectionLostEvent extends AppEvent {
  final int accountId;
  EmailConnectionLostEvent({required this.accountId})
      : super(moduleName: 'email');
}

/// 应用层连接恢复事件
class EmailConnectionReestablishedEvent extends AppEvent {
  final int accountId;
  EmailConnectionReestablishedEvent({required this.accountId})
      : super(moduleName: 'email');
}

// email_events.dart
// 注意：enough_mail 的 MailClient 已有自己的 EventBus（mailClient.eventBus），
// 直接发出 MailLoadEvent（新邮件）、MailUpdateEvent（标记变更）、MailVanishedEvent（删除）、
// MailConnectionLostEvent / MailConnectionReEstablishedEvent（连接状态）。
// EasyWork 的 EventBus 在此基础上做模块间同步：

class NewEmailReceivedEvent extends AppEvent {
  final String messageId;       // MIME Message-ID
  final int localEmailId;       // 写入 drift 后的本地 ID
  final String fromAddress;
  final String subject;
  NewEmailReceivedEvent({required this.messageId, required this.localEmailId, required this.fromAddress, required this.subject})
    : super(moduleName: 'email');
}

class EmailConvertedToTaskEvent extends AppEvent {
  final int emailId;
  final int taskId;
  final String subject;
  EmailConvertedToTaskEvent({required this.emailId, required this.taskId, required this.subject})
    : super(moduleName: 'email');
}

class UnreadCountChangedEvent extends AppEvent {
  final int totalUnread;
  UnreadCountChangedEvent({required this.totalUnread})
    : super(moduleName: 'email');
}

// accounting_events.dart
class TransactionRecordedEvent extends AppEvent {
  final double amount;
  final String type;
  final String category;
  TransactionRecordedEvent({required this.amount, required this.type, required this.category})
    : super(moduleName: 'accounting');
}

// exercise_events.dart
class ExerciseCompletedEvent extends AppEvent {
  final String exerciseType;
  final int durationMinutes;
  final double? distanceKm;
  ExerciseCompletedEvent({required this.exerciseType, required this.durationMinutes, this.distanceKm})
    : super(moduleName: 'exercise');
}

class NoteUpdatedEvent extends AppEvent {
  final int noteId;
  final String? title;
  NoteUpdatedEvent({required this.noteId, this.title})
    : super(moduleName: 'notes');
}

// notification_events.dart
// 注意：NotificationType 枚举定义在 NotificationService 文件中（2.12.4），
// 被事件文件和 NotificationService 共同引用。未来可提取到 shared/events/ 中。

class RequestNotificationEvent extends AppEvent {
  final String title;
  final String body;
  final NotificationType type;
  final String? routeOnTap;
  RequestNotificationEvent({required this.title, required this.body, required this.type, this.routeOnTap})
    : super(moduleName: 'notification');
}

// network_events.dart
class OnlineEvent extends AppEvent {
  OnlineEvent() : super(moduleName: 'system');
}

class OfflineEvent extends AppEvent {
  OfflineEvent() : super(moduleName: 'system');
}
```

#### 2.4.5 订阅关系

**设计原则**：每个模块自行订阅所需事件，`eventSubscriptionsProvider` 仅处理横切关注点（通知、日志）。
模块内部自订阅由该模块的 `presentation/providers/` 中的 `订阅者 Provider` 负责。

```
发布者                     全局横切订阅（eventSubscriptionsProvider）
task_board ──► EventBus ──► NotificationService（弹窗提醒）
                          ──► Logs（写入 logs 底表）

email ─────── EventBus ──► NotificationService
                          ──► Logs

accounting ── EventBus ──► Logs

exercise ──── EventBus ──► Logs


模块内部自订阅（各模块 FeatureSubscriptions）：
task_board 模块：订阅 email 事件 → 刷新关联任务列表
Dashboard 模块：订阅 task/email/accounting/exercise → 更新各卡片数据
Timeline 模块：订阅所有模块 → 写入 timeline_events
```

#### 2.4.6 订阅者 Provider 实现

**全局横切订阅**（仅处理通知和日志）：

```dart
final eventBusProvider = Provider<EventBus>((ref) {
  final bus = EventBus();
  ref.onDispose(bus.dispose);
  return bus;
});

final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService(ref);
});

final eventSubscriptionsProvider = Provider<EventSubscriptions>((ref) {
  final subs = EventSubscriptions(ref);
  ref.onDispose(subs.dispose);
  return subs;
});

// ── 数据库与 DAO Provider ──

final appDatabaseProvider = FutureProvider<AppDatabase>((ref) async {
  return createAppDatabase();
});

final emailDaoProvider = FutureProvider<EmailDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailDao(db);
});

final taskDaoProvider = FutureProvider<TaskDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return TaskDao(db);
});

final settingsDaoProvider = FutureProvider<SettingsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return SettingsDao(db);
});

final contactDaoProvider = FutureProvider<ContactDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ContactDao(db);
});

final noteDaoProvider = FutureProvider<NoteDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return NoteDao(db);
});

final accountingDaoProvider = FutureProvider<AccountingDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return AccountingDao(db);
});

final searchDaoProvider = FutureProvider<SearchDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return SearchDao(db);
});

// ── Repository Provider ──

final emailRepositoryProvider = FutureProvider<EmailRepository>((ref) async {
  final emailDao = await ref.watch(emailDaoProvider.future);
  final contactDao = await ref.watch(contactDaoProvider.future);
  final bus = ref.watch(eventBusProvider);
  return EmailRepositoryImpl(emailDao, contactDao, bus);
});

final taskRepositoryProvider = FutureProvider<TaskRepository>((ref) async {
  final taskDao = await ref.watch(taskDaoProvider.future);
  final bus = ref.watch(eventBusProvider);
  return TaskRepositoryImpl(taskDao, bus);
});

final accountingRepositoryProvider = FutureProvider<AccountingRepository>((ref) async {
  final accountingDao = await ref.watch(accountingDaoProvider.future);
  final bus = ref.watch(eventBusProvider);
  return AccountingRepositoryImpl(accountingDao, bus);
});

// ── 模块级 Provider ──

final taskListProvider = StateNotifierProvider<TaskListNotifier, AsyncValue<List<TaskEntity>>>((ref) {
  final repo = ref.watch(taskRepositoryProvider);
  return TaskListNotifier(repo);
});

final emailAccountListProvider = FutureProvider<List<EmailAccount>>((ref) async {
  final emailDao = await ref.watch(emailDaoProvider.future);
  return emailDao.getAllAccounts();
});

class EventSubscriptions {
  final Ref _ref;
  late final List<StreamSubscription> _subscriptions;

  EventSubscriptions(this._ref) {
    final bus = _ref.read(eventBusProvider);
    _subscriptions = [
      bus.on<RequestNotificationEvent>().listen((e) {
        _ref.read(notificationServiceProvider).show(e);
      }),
      // Logs 写入由各模块 Repository 实现内部直接写入（调用 LogDao.insert()），
      // 不经过 EventBus。Logs 是审计底表，写入时机 = 业务操作发生时。
    ];
  }

  void dispose() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
  }
}
```

**模块内部自订阅示例（Dashboard）**：

```dart
// features/dashboard/presentation/providers/dashboard_subscriptions.dart
final dashboardSubscriptionsProvider = Provider<DashboardSubscriptions>((ref) {
  final subs = DashboardSubscriptions(ref);
  ref.onDispose(subs.dispose);
  return subs;
});

class DashboardSubscriptions {
  final Ref _ref;
  late final List<StreamSubscription> _subscriptions;

  DashboardSubscriptions(this._ref) {
    final bus = _ref.read(eventBusProvider);
    _subscriptions = [
      bus.on<TaskCreatedEvent>().listen((_) => _refreshTasks()),
      bus.on<TaskStatusChangedEvent>().listen((_) => _refreshTasks()),
      bus.on<NewEmailReceivedEvent>().listen((_) => _refreshUnread()),
      bus.on<TransactionRecordedEvent>().listen((_) => _refreshBudget()),
      bus.on<ExerciseCompletedEvent>().listen((_) => _refreshExercise()),
      bus.on<NoteUpdatedEvent>().listen((_) => _refreshNotes()),
    ];
  }

  void _refreshTasks() { /* invalidate dashboard task provider */ }
  void _refreshUnread() { /* invalidate unread provider */ }
  void _refreshBudget() { /* invalidate budget provider */ }
  void _refreshExercise() { /* invalidate exercise provider */ }
  void _refreshNotes() { /* invalidate dashboard notes provider */ }

  void dispose() {
    for (final sub in _subscriptions) { sub.cancel(); }
  }
}
```

**模块内部自订阅示例（Timeline）**：

```dart
// features/timeline/presentation/providers/timeline_subscriptions.dart
final timelineSubscriptionsProvider = Provider<TimelineSubscriptions>((ref) {
  final subs = TimelineSubscriptions(ref);
  ref.onDispose(subs.dispose);
  return subs;
});

class TimelineSubscriptions {
  final Ref _ref;
  late final List<StreamSubscription> _subscriptions;

  TimelineSubscriptions(this._ref) {
    final bus = _ref.read(eventBusProvider);
    _subscriptions = [
      bus.on<TaskCreatedEvent>().listen((e) => _addTimelineEvent(e)),
      bus.on<TaskStatusChangedEvent>().listen((e) => _addTimelineEvent(e)),
      bus.on<NewEmailReceivedEvent>().listen((e) => _addTimelineEvent(e)),
      bus.on<TransactionRecordedEvent>().listen((e) => _addTimelineEvent(e)),
      bus.on<ExerciseCompletedEvent>().listen((e) => _addTimelineEvent(e)),
    ];
  }

  void _addTimelineEvent(AppEvent event) {
    // 写入 timeline_events 表
  }

  void dispose() {
    for (final sub in _subscriptions) { sub.cancel(); }
  }
}
```

main.dart 中初始化（激活全局 + 各模块订阅）：

```dart
void main() {
  runApp(
    ProviderScope(
      child: EasyWorkApp(),
    ),
  );
}

class EasyWorkApp extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(eventSubscriptionsProvider);         // 全局横切：通知
    ref.watch(dashboardSubscriptionsProvider);     // Dashboard 自订阅
    ref.watch(timelineSubscriptionsProvider);      // Timeline 自订阅
    return MaterialApp(/* ... */);
  }
}
```

### 2.5 路由与导航

#### 2.5.1 路由结构

```
/                              → Dashboard
/timeline                      → Timeline
/tasks                         → 任务看板（看板视图）
/tasks/list                    → 列表视图
/tasks/calendar                → 日历视图
/tasks/new                     → 新建任务
/tasks/:id                     → 任务详情
/calendar                      → 日历
/calendar/event/:id             → 日历事件详情（未来扩展）
/email                         → 收件箱
/email/:id                     → 邮件详情
/email/compose                 → 写邮件
/email/accounts                → 邮箱账户管理
/contacts                      → 联系人列表
/contacts/new                  → 新建联系人
/contacts/:id                  → 联系人详情
/contacts/groups               → 分组管理
/signatures                    → 签名管理
/notes                         → 笔记列表
/notes/:id                     → 笔记详情/编辑
/stocks                        → 股票（空状态骨架）
/accounting                    → 记账概览
/accounting/new                → 新建记账记录
/accounting/report             → 月度报表
/exercise                      → 运动记录（空状态骨架）
/log                           → 日志
/search                        → 全局搜索（ShellRoute 外，沉浸式）
/settings                      → 设置
/settings/backup               → 数据备份
```

#### 2.5.2 AppShell

```dart
class AppShell extends ConsumerWidget {
  final Widget child;
  const AppShell({required this.child, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final width = MediaQuery.of(context).size.width;
    if (width > 900) {
      // Windows 大屏：固定 48px NavigationRail
      return Row(
        children: [
          EasyWorkNavigationRail(), // 核心 6 项 + "更多" 5 项
          Expanded(child: child),
        ],
      );
    } else if (width > 600) {
      // 中间态：可展开 NavigationRail
      return Row(
        children: [
          ExpandableNavigationRail(), // 48px ↔ 72px 切换
          Expanded(child: child),
        ],
      );
    } else {
      // Android 竖屏：Drawer 模式
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

**ExpandableNavigationRail（600-900px）**：
- 默认 48px 仅图标模式
- 底部展开按钮 → 切换到 72px 图标+文字模式
- 展开动画：宽度 48px → 72px，文字淡入（200ms）
- 自动收起：展开后 5 秒无操作自动收回（或手动点击收起按钮）
- 内容区宽度随 Rail 宽度变化自适应（`Expanded` 自动计算）

#### 2.5.3 导航栏布局

**核心模块（6 项）**：Dashboard、任务看板、日历、邮箱、笔记、记账

**"更多"折叠菜单（5 项）**：Timeline、股票、运动、日志、设置

```
Windows NavigationRail:              Android Drawer:
┌──────┐                             ┌──── Drawer ────┐
│  🏠  │ ← Dashboard                 │  🏠  Dashboard │
│  📋  │ ← 任务看板                   │  📋  任务看板  │
│  📅  │ ← 日历                      │  📅  日历      │
│  ✉️  │ ← 邮箱（带未读红点）         │  ✉️  邮箱(3)  │
│  📝  │ ← 笔记                      │  📝  笔记      │
│  💰  │ ← 记账                      │  💰  记账      │
│ ──── │                             │ ─────────────  │
│  ⋯   │ ← 更多                      │  ⏰  Timeline  │
│      │   (弹出: Timeline/股票/      │  📈  股票      │
│      │    运动/日志/设置)            │  🏃  运动      │
└──────┘                             │  📊  日志      │
                                     │  ⚙️  设置      │
                                     └────────────────┘
```

#### 2.5.4 路由守卫与 Deep Link

路由守卫当前无需特殊逻辑，保留扩展点。

支持 Deep Link：
- Android: `easywork://tasks/123`
- 通知点击：导航到目标页面
- Share Intent: Android SEND → 弹窗选择目标模块

### 2.6 响应式 UI 策略

#### 2.6.1 断点

| 宽度 | 设备 | 导航方式 | 内容布局 |
|---|---|---|---|
| < 600px | Android 竖屏 | 隐藏侧栏，左上角汉堡菜单 → Drawer | 1列全宽 |
| 600-900px | Android 横屏/小窗 | 可展开 NavigationRail（48px 图标 / 72px 图标+文字） | 2列 |
| > 900px | Windows 大屏 | 图标导航栏锁定 48px | 3-4列 |

#### 2.6.2 布局

**Windows**：左侧固定 48px NavigationRail（核心 6 项 + 更多折叠），右侧内容区自适应。

**Android**：左上角汉堡菜单打开 Drawer（图标 + 文字），高度不够时启用滚动，内容区全宽。

**600-900px 中间态交互**：
- NavigationRail 默认显示 48px 仅图标模式
- 点击 Rail 底部展开按钮 → 切换到 72px 图标+文字模式
- 展开动画：宽度从 48px → 72px，文字淡入（200ms）
- 自动收起：展开后 5 秒无操作自动收回（或手动点击收起按钮）
- 内容区宽度随 Rail 宽度变化自适应（`Expanded` 自动计算）

#### 2.6.3 Dashboard 卡片布局

| 断点 | 列数 | 7张卡片排列 |
|---|---|---|
| < 600px | 1列 | `ListView` 垂直排列，每张卡片全宽 |
| 600-900px | 2列 | `GridView` 2列，卡片按顺序填充：第一行2张、第二行2张、第三行2张、第四行1张（末行居左） |
| > 900px | 4列 | `GridView` 4列，卡片按顺序填充：第一行4张、第二行3张（末行居左） |

卡片顺序固定：今日待办 → 待跟进邮件 → 未读邮件 → 本月支出/预算 → 最近笔记 → 今日运动 → 股票概览

**卡片内容摘要**：
| 卡片 | 核心数据 | 跳转目标 |
|---|---|---|
| 今日待办 | 任务数量 + 最近截止任务标题 | `/tasks` |
| 待跟进邮件 | 待跟进邮件数量 + 最近一封发件人 | `/email` |
| 未读邮件数 | 各账户未读数汇总 | `/email` |
| 本月支出/预算 | 本月总支出 + 预算进度条（已用/总额） | `/accounting` |
| 最近笔记 | 前 5 条笔记标题 + 更新时间 | `/notes` |
| 今日运动 | 运动类型 + 时长 + 距离 | `/exercise` |
| 股票概览 | 自选股数量 + 涨跌概况 | `/stocks` |

#### 2.6.4 看板视图自适应

| 断点 | 看板列数 | 行为 |
|---|---|---|
| < 600px | 列折叠为横向滚动 | `PageView` 容器，每页显示 1 列，左右滑动切换列；顶部 Tab 指示当前列（待办/进行中/已完成/挂起） |
| 600-900px | 列压缩宽度 | `SingleChildScrollView` + `Row` 横向滚动容器，每列 min 240px，列间距 `space-4` |
| > 900px | 列自适应 | `Row` + `Expanded` 均分剩余空间，每列 min 240px，超出时横向滚动 |

**拖拽行为**：
- 所有断点下均支持拖拽卡片到目标列（鼠标直接拖拽；触屏设备使用长按拖拽，长按阈值 500ms）
- 拖拽过程中目标列显示虚线占位符
- 触屏设备拖拽时提供触觉反馈（HapticFeedback.mediumImpact）
- 拖拽释放后自动保存状态 + 更新 `updatedAt` + 写入 Logs + 触发 EventBus

#### 2.6.5 邮件详情 Master-Detail 布局

| 断点 | 布局模式 | 行为 |
|---|---|---|
| < 600px | 跳转式 | 点击邮件 → push 到详情页，返回按钮回到列表 |
| 600-900px | 可切换分栏 | 默认跳转式；AppBar 右侧"分栏模式"图标按钮（`ViewSplit` 图标），点击切换为左右分栏（列表 40% + 详情 60%）；分栏模式下点击其他邮件右侧实时刷新，再次点击按钮退回跳转式 |
| > 900px | 固定分栏 | 左侧邮件列表（40%宽度）+ 右侧邮件详情（60%宽度），选中邮件右侧实时刷新；无切换按钮 |

**分栏模式细节**：
- 分栏比例固定 40:60，不可拖拽调整（YAGNI）
- 分栏模式下选中邮件：左侧列表选中态高亮 + 右侧详情刷新
- 分栏模式下无邮件选中时：右侧显示空状态占位（信封图标 + "选择一封邮件查看详情"文字，`onSurfaceVariant` 色）
- 分栏状态保存到页面级 StateProvider，不跨页面持久化

#### 2.6.6 通用响应式组件

| 组件 | 功能 |
|---|---|
| `ResponsiveBuilder` | 根据 `MediaQuery` 断点返回不同 Widget |
| `ResponsiveGrid` | 自动计算列数（1/2/3-4列），间距 `space-4` |
| `AdaptiveScaffold` | 自动切换 NavigationRail / Drawer |
| `MasterDetailRoute` | 根据 `isWide` 选择分栏或跳转式展示 |

#### 2.6.7 响应式网格

```dart
< 600px  → 1 列（移动端）
600-900px → 2 列（平板）
> 900px  → 3-4 列（桌面）
```

由 `ResponsiveGrid` 组件根据可用宽度自动计算列数。

### 2.7 设计系统

#### 2.7.1 设计语言

- **风格定位**：现代柔和（Modern Soft），圆角克制、留白充足、低信息密度
- **毛玻璃**：适度使用，导航栏、激活态卡片、弹窗背景采用 backdrop blur 效果
- **设计原则**：内容优先、减少视觉噪音、一致性的呼吸感

#### 2.7.2 色彩体系

**Light Mode**

| Token | Color | 用途 |
|---|---|---|
| `primary` | `#2563EB` | 主色 - 按钮、激活态、链接 |
| `primaryContainer` | `#DBEAFE` | 主色容器 - 选中背景、标签 |
| `onPrimary` | `#FFFFFF` | 主色上的文字/图标 |
| `secondary` | `#0D9488` | 辅助色 - 次要操作 |
| `secondaryContainer` | `#CCFBF1` | 辅助色容器 |
| `surface` | `#F8FAFC` | 页面背景 |
| `surfaceContainer` | `#FFFFFF` | 卡片/容器背景 |
| `surfaceVariant` | `#F1F5F9` | 二级容器背景 |
| `onSurface` | `#0F172A` | 主要文字 |
| `onSurfaceVariant` | `#475569` | 次要文字 |
| `outline` | `#CBD5E1` | 边框、分割线 |
| `success` | `#16A34A` | 成功状态 |
| `warning` | `#D97706` | 警告状态 |
| `error` | `#DC2626` | 错误/删除 |
| `frost` | `rgba(255,255,255,0.7)` | 毛玻璃背景 |

**Dark Mode**

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
| `frost` | `rgba(30,41,59,0.75)` | 毛玻璃背景 |

#### 2.7.3 字体

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

#### 2.7.4 间距系统

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

#### 2.7.5 圆角

| Token | Radius | 用途 |
|---|---|---|
| `radius-sm` | 6px | 按钮、输入框 |
| `radius-md` | 10px | 卡片、弹窗 |
| `radius-lg` | 16px | 大卡片、对话框 |
| `radius-full` | 999px | 标签、头像 |

#### 2.7.6 阴影 & 毛玻璃

| Token | 效果 | 用途 |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 卡片轻微深度 |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` | 浮动卡片 |
| `shadow-lg` | `0 10px 25px rgba(0,0,0,0.1)` | 弹窗 |
| `frost` | `backdrop-filter: blur(12px)` | 导航栏、激活卡片、弹窗背景 |

#### 2.7.7 关键组件

**导航栏（NavigationRail）**

- 宽度：48px（固定）
- 图标：24x24，outlined 风格
- 选中态：毛玻璃背景 + primary 图标色
- 未读标记：8px 红色圆点，右上角
- 核心 6 项常驻，其余收入"更多"折叠

**Dashboard 卡片**

- 背景：white（light）/ `#1E293B`（dark）
- 圆角：10px
- 内边距：16px
- 阴影：`shadow-sm`
- 标题区：headline 字号 + 右侧跳转箭头
- 拖拽时：阴影升至 `shadow-lg`

**任务卡片（Kanban）**

- 宽度：自适应列宽（min 240px）
- 圆角：8px
- 左框线按优先级着色（高=红、中=琥珀、低=蓝）
- 拖拽时卡片跟随指针 + 半透明阴影

**邮件列表项**

- 未读：左侧 4px primary 竖条 + 主题加粗
- 选中：primaryContainer 背景
- 分隔线：outline 色，1px

#### 2.7.8 ThemeExtension

```dart
class EasyWorkTheme extends ThemeExtension<EasyWorkTheme> {
  final Color frost;
  final Color success;
  final Color warning;
  final Color primaryContainer;
  final Color secondaryContainer;
  final Color surfaceVariant;

  // Light / Dark 静态实例
  static const light = EasyWorkTheme(/* ... */);
  static const dark = EasyWorkTheme(/* ... */);
}
```

Widget 中读取：`Theme.of(context).extension<EasyWorkTheme>()!.frost`

#### 2.7.9 主题切换 Provider

```dart
final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref);
});

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final Ref _ref;
  ThemeModeNotifier(this._ref) : super(ThemeMode.system);

  Future<void> setTheme(ThemeMode mode) async {
    state = mode;
    final settingsDao = await _ref.read(settingsDaoProvider.future);
    await settingsDao.setString('theme_mode', mode.name);
  }

  Future<void> loadTheme() async {
    final settingsDao = await _ref.read(settingsDaoProvider.future);
    final value = await settingsDao.getString('theme_mode');
    if (value != null) {
      state = ThemeMode.values.firstWhere((e) => e.name == value);
    }
  }
}
```

#### 2.7.10 Design System 目录结构

```
core/design_system/
├── tokens/
│   ├── app_colors.dart
│   ├── app_spacing.dart
│   ├── app_radius.dart
│   ├── app_typography.dart
│   └── easy_work_theme.dart
├── themes/
│   ├── light_theme.dart
│   └── dark_theme.dart
├── providers/
│   └── theme_provider.dart
├── widgets/
│   ├── frost_container.dart
│   ├── easy_app_bar.dart
│   └── easy_card.dart
└── design_system.dart
```

### 2.8 国际化（i18n）

#### 2.8.1 技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | `flutter_localizations` (SDK) | Material/Cupertino 组件内置翻译 |
| 核心 | `intl` | 消息格式化、日期/数字/货币格式化 |
| 格式 | ARB (App Resource Bundle) | Flutter 标准字符串资源格式 |
| 生成 | `flutter gen-l10n` | 官方代码生成器 |

#### 2.8.2 配置

```yaml
# l10n.yaml
arb-dir: lib/l10n
template-arb-file: app_zh.arb
output-localization-file: app_localizations.dart
output-class: EasyWorkLocalizations
synthetic-package: false
```

#### 2.8.3 字符串命名规范

格式：`{模块}_{页面}_{描述}`

| 前缀 | 模块 | 示例 |
|---|---|---|
| `common_` | 全局通用 | `common_save`, `common_cancel`, `common_confirm` |
| `nav_` | 导航栏 | `nav_dashboard`, `nav_email` |
| `task_` | 任务看板 | `task_create`, `task_recurring_daily` |
| `email_` | 邮箱 | `email_inbox`, `email_to_task` |
| `contact_` | 联系人 | `contact_import_vcf`, `contact_group` |
| `calendar_` | 日历 | `calendar_lunar`, `calendar_holiday` |
| `note_` | 笔记 | `note_create`, `note_tag` |
| `stock_` | 股票 | `stock_add_watch` |
| `accounting_` | 记账 | `accounting_income`, `accounting_budget` |
| `exercise_` | 运动 | `exercise_running` |
| `log_` | 日志 | `log_system` |
| `settings_` | 设置 | `settings_language`, `settings_theme` |
| `error_` | 错误 | `error_network`, `error_imap_connect` |
| `notification_` | 通知 | `notification_new_email` |

#### 2.8.4 语言切换工作流

应用启动 → 读取 SettingsDao 中用户语言设置 → 无则跟随系统 locale → 初始化 MaterialApp。

用户在设置页切换语言 → 写入 SettingsDao → 触发 App 重建 → 新 locale 生效。

### 2.9 全模块搜索

#### 2.9.1 搜索范围

| 模块 | 搜索字段 | 技术方案 | 搜索范围 |
|---|---|---|---|
| 任务 | 标题、描述 | FTS5 | 仅本地已同步数据 |
| 邮件 | 主题、发件人、正文摘要 | FTS5 | 仅本地已同步邮件（不支持 IMAP 服务器端搜索） |
| 联系人 | 姓名、邮箱 | FTS5 | 仅本地联系人 |
| 笔记 | 标题、正文 | FTS5 | 仅本地笔记 |
| 记账 | 备注、分类名 | LIKE | 仅本地记录 |
| 运动 | 运动类型 | LIKE | 仅本地记录 |

**搜索限制**：
- 邮件搜索范围限于已同步到本地的邮件（最多 200 封/30 天）
- 不支持 IMAP 服务器端搜索（IMAP SEARCH 命令），因为需要保持连接且结果不可靠
- 未来扩展：可在设置中提供"扩大搜索范围"选项，触发 IMAP SEARCH 并临时同步更多邮件

#### 2.9.2 数据模型

```dart
enum SearchModule { task, email, contact, note, accounting, exercise }

class SearchResult {
  final SearchModule module;
  final int id;
  final String title;
  final String? subtitle;
  final IconData icon;
  final String route;
  final DateTime sortTime;
}
```

#### 2.9.3 SearchDao（原生 SQL + drift customSelect）

```dart
// SearchDao 不依赖 drift 表类型（所有查询通过 customSelect 原生 SQL 执行），
// 无需 @DriftAccessor 注解中的 tables 参数。
// FTS5 虚拟表（tasks_fts, emails_fts, contacts_fts, notes_fts）和
// 普通表（exercise_records, accounting_records）均通过 customSelect 访问。
class SearchDao extends DatabaseAccessor<AppDatabase> with _$SearchDaoMixin {
  SearchDao(super.db);

  Future<List<SearchResult>> searchAll(String query, {int limit = 20}) async {
    final results = <SearchResult>[];
    final term = query.split(' ').join(' AND ');

    final futures = await Future.wait([
      _searchTasks(term),
      _searchEmails(term),
      _searchContacts(term),
      _searchNotes(term),
      _searchAccounting(query),
      _searchExercise(query),
    ]);

    for (final r in futures) {
      results.addAll(r);
    }

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
      module: SearchModule.task,
      id: r.data['rowid'] as int,
      title: r.data['title'] as String,
      subtitle: r.data['description'] as String?,
      icon: Icons.task_alt,
      route: '/tasks/${r.data['rowid']}',
      sortTime: DateTime.now(),
    )).toList();
  }

  // _searchEmails / _searchContacts / _searchNotes / _searchAccounting 同理

  Future<List<SearchResult>> _searchEmails(String term) async {
    final rows = await customSelect(
      'SELECT rowid, subject, from_name, from_address FROM emails_fts '
      'WHERE emails_fts MATCH ?1 ORDER BY rank LIMIT 10',
      variables: [Variable(term)],
    ).get();
    return rows.map((r) => SearchResult(
      module: SearchModule.email,
      id: r.data['rowid'] as int,
      title: r.data['subject'] as String? ?? '(无主题)',
      subtitle: '${r.data['from_name'] ?? ''} <${r.data['from_address'] ?? ''}>',
      icon: Icons.email_outlined,
      route: '/email/${r.data['rowid']}',
      sortTime: DateTime.now(),
    )).toList();
  }

  Future<List<SearchResult>> _searchContacts(String term) async {
    final rows = await customSelect(
      'SELECT rowid, display_name, email_addresses FROM contacts_fts '
      'WHERE contacts_fts MATCH ?1 ORDER BY rank LIMIT 5',
      variables: [Variable(term)],
    ).get();
    return rows.map((r) => SearchResult(
      module: SearchModule.contact,
      id: r.data['rowid'] as int,
      title: r.data['display_name'] as String,
      subtitle: r.data['email_addresses'] as String?,
      icon: Icons.person_outline,
      route: '/contacts/${r.data['rowid']}',
      sortTime: DateTime.now(),
    )).toList();
  }

  Future<List<SearchResult>> _searchNotes(String term) async {
    final rows = await customSelect(
      'SELECT rowid, title, content FROM notes_fts '
      'WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT 5',
      variables: [Variable(term)],
    ).get();
    return rows.map((r) => SearchResult(
      module: SearchModule.note,
      id: r.data['rowid'] as int,
      title: r.data['title'] as String? ?? '(无标题)',
      subtitle: (r.data['content'] as String?)?.substring(0, 50.clamp(0, (r.data['content'] as String? ?? '').length)),
      icon: Icons.note_outlined,
      route: '/notes/${r.data['rowid']}',
      sortTime: DateTime.now(),
    )).toList();
  }

  Future<List<SearchResult>> _searchAccounting(String query) async {
    final rows = await customSelect(
      'SELECT id, type, category_name, amount, note, record_date '
      'FROM accounting_records '
      'WHERE note LIKE ?1 OR category_name LIKE ?1 '
      'ORDER BY record_date DESC LIMIT 5',
      variables: [Variable('%$query%')],
    ).get();
    return rows.map((r) => SearchResult(
      module: SearchModule.accounting,
      id: r.data['id'] as int,
      title: '${r.data['type'] == 'income' ? '+' : '-'}¥${r.data['amount']} ${r.data['category_name']}',
      subtitle: r.data['note'] as String?,
      icon: Icons.account_balance_wallet_outlined,
      route: '/accounting',
      sortTime: DateTime.parse(r.data['record_date'] as String),
    )).toList();
  }

  Future<List<SearchResult>> _searchExercise(String query) async {
    final rows = await customSelect(
      'SELECT id, type, note, record_date FROM exercise_records '
      'WHERE type LIKE ?1 OR note LIKE ?1 '
      'ORDER BY record_date DESC LIMIT 5',
      variables: [Variable('%$query%')],
    ).get();

    return rows.map((r) => SearchResult(
      module: SearchModule.exercise,
      id: r.data['id'] as int,
      title: r.data['type'] as String,
      subtitle: r.data['note'] as String?,
      icon: Icons.fitness_center,
      route: '/exercise',
      sortTime: DateTime.parse(r.data['record_date'] as String),
    )).toList();
  }
}
```

#### 2.9.4 搜索 Provider

搜索增加 300ms 防抖，避免每次按键触发 FTS5 查询。防抖逻辑在 UI 层的 `onChanged` 回调中实现，而非 Provider 层。

```dart
final searchQueryProvider = StateProvider.autoDispose<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<SearchResult>>((ref) async {
  final query = ref.watch(searchQueryProvider);
  if (query.length < 2) return [];
  final searchDao = await ref.watch(searchDaoProvider.future);
  return searchDao.searchAll(query);
});
```

**UI 层防抖实现**：

```dart
class SearchPage extends ConsumerStatefulWidget {
  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  Timer? _debounce;

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).state = query;
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      autofocus: true,
      onChanged: _onSearchChanged,
      decoration: const InputDecoration(
        hintText: '搜索任务、邮件、笔记...',
      ),
    );
  }
}
```

**搜索防抖交互**：用户在搜索框中输入时，通过 `onChanged` 回调启动 Debouncer，仅在 300ms 无新输入后才更新 `searchQueryProvider`，从而触发 FTS5 查询。

**搜索结果缓存**：`searchResultsProvider` 使用 `FutureProvider`，Riverpod 自动缓存相同查询词的结果。相同搜索词的重复访问（如返回搜索页）直接返回缓存，无需重新执行 FTS5 查询。缓存在 Provider 被 invalidate 或页面 dispose（autoDispose）时清除。

#### 2.9.5 搜索 UI 布局

```
┌──────────────────────────────────┐
│  🔍 搜索任务、邮件、笔记...      │  ← TextField（自动聚焦）
├──────────────────────────────────┤
│  📋 任务（3）                     │  ← 模块分组标题
│  ├── ● 整理会议笔记              │
│  ├── ● 回复张三邮件              │
│  └── ● 完成周报                  │
│  ✉️ 邮件（2）                     │
│  ├── 张三  Re: 项目进度          │
│  └── 李四  EasyWork 设计方案     │
│  📇 联系人（1）                   │
│  └── 张三  123@email.com         │
│  📝 笔记（1）                     │
│  └── 开发笔记  关于 Flutter...    │
└──────────────────────────────────┘
```

#### 2.9.6 搜索触发入口

- Windows: 导航栏顶部搜索图标 / Ctrl+F 快捷键
- Android: AppBar 搜索图标
- Dashboard: 顶部搜索栏

搜索页在 ShellRoute 之外（不显示导航栏，沉浸式体验）。

### 2.10 错误处理与安全

#### 2.10.1 异常层级

```dart
// core/errors/app_exception.dart
abstract class AppException implements Exception {
  String get userMessage;   // 面向用户的文字（走 i18n）
  String? get technical;    // 英文技术详情（日志用）
}

class NetworkException extends AppException { /* ... */ }

/// 邮箱异常：包装 enough_mail 的 BaseMailException / ImapException / SmtpException
class EmailException extends AppException {
  final EmailErrorType type;  // authFailed / connectionFailed / timeout / sendFailed
  final BaseMailException? originalException;
  final String? _userMessage;

  EmailException({required this.type, this.originalException, String? userMessage})
      : _userMessage = userMessage;

  @override
  String get userMessage => _userMessage ?? _defaultMessage(type);

  @override
  String get technical => originalException?.toString() ?? type.name;

  static String _defaultMessage(EmailErrorType type) {
    switch (type) {
      case EmailErrorType.authFailed:
        return '邮箱地址或密码错误，请检查后重试';
      case EmailErrorType.connectionFailed:
        return '无法连接到邮件服务器，请检查网络和服务器地址';
      case EmailErrorType.timeout:
        return '连接超时，请检查网络状态';
      case EmailErrorType.sslError:
        return 'SSL 证书验证失败，可能需要使用非标准端口';
      case EmailErrorType.smtpAuthFailed:
        return '发送失败：邮箱认证错误';
      case EmailErrorType.sendFailed:
        return '发送失败：无法连接邮件服务器';
    }
  }
}
class DatabaseException extends AppException { /* ... */ }
class ValidationException extends AppException {
  final String field;
}
```

**国际化策略**：
- 面向用户的错误消息：通过 i18n `EasyWorkLocalizations` 获取（中文/英文）
- 技术错误：英文日志记录 + 中文用户消息，两者并存

#### 2.10.2 Result 类型

```dart
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
```

#### 2.10.3 全局错误监听

```dart
// main.dart
void main() {
  runZonedGuarded(() {
    FlutterError.onError = (details) {
      // 写入 logs 表 + SnackBar 提示用户
    };
    runApp(const ProviderScope(child: EasyWorkApp()));
  }, (error, stack) {
    // 未捕获异常：写入 logs 底表
  });
}
```

#### 2.10.4 邮箱凭据安全

```dart
class CredentialStore {
  final FlutterSecureStorage _storage;

  Future<void> savePassword(int accountId, String password) async {
    await _storage.write(key: 'email_account_$accountId', value: password);
  }

  Future<String?> getPassword(int accountId) async {
    return _storage.read(key: 'email_account_$accountId');
  }

  Future<void> deletePassword(int accountId) async {
    await _storage.delete(key: 'email_account_$accountId');
  }
}
```

凭据存储方案：

| 存储内容 | 方案 | 理由 |
|---|---|---|
| IMAP 密码 | `flutter_secure_storage` | 系统级加密（Windows: DPAPI, Android: KeyStore） |
| 邮箱账户配置（host/port/user） | drift（明文） | 非敏感信息 |
| 应用设置 | drift Settings 表 | 统一管理 |
| 数据库文件 | drift + SQLCipher（可选） | 全量加密，按需开启 |

#### 2.10.5 输入校验

```dart
class Validators {
  static String? email(String? value) { /* 正则校验 */ }
  static String? password(String? value) { /* 长度校验 */ }
  static String? imapHost(String? value) { /* 格式校验 */ }
  static String? port(String? value) { /* 1-65535 */ }
  static String? required(String? value, String fieldName) { /* 非空 */ }
}
```

#### 2.10.6 网络重试

仅对瞬时错误（网络/连接超时）进行重试，认证/校验/数据库错误不重试。

```dart
class RetryHandler {
  static Future<T> retry<T>({
    required Future<T> Function() action,
    int maxRetries = 3,
    Duration baseDelay = const Duration(seconds: 1),
    Set<Type> retryableExceptions = const {NetworkException},
  }) async {
    int attempt = 0;
    while (true) {
      try {
        return await action();
      } on AppException catch (e) {
        if (!retryableExceptions.contains(e.runtimeType)) rethrow;
        attempt++;
        if (attempt >= maxRetries) rethrow;
        await Future.delayed(baseDelay * (1 << attempt));
      }
    }
  }
}
```

#### 2.10.7 安全清单

| 关注点 | 措施 |
|---|---|
| 邮箱密码 | `flutter_secure_storage`，不存 drift，不在日志中输出 |
| IMAP 连接 | 默认 TLS/SSL，证书验证 |
| 本地数据库 | 可选 SQLCipher 全量加密 |
| 日志脱敏 | password/token 自动替换为 `***` |
| 输入校验 | 所有用户输入在提交前验证 |
| 崩溃恢复 | `runZonedGuarded` + 自动保存状态 |
| 数据备份 | 每日自动备份 + 手动导出 |
| 应用卸载 | `flutter_secure_storage` 自动清除 |

### 2.11 性能优化策略

#### 2.11.1 列表性能

- 所有长列表使用 `ListView.builder`（非 `ListView(children:[])`）
- 大列表使用 `SliverList + SliverAppBar` 组合
- 分页加载：邮件等大数据量列表，每页 30 条，滚动到底部触发 `loadMore()`
- 列表项使用 `const` 构造，固定高度，`ValueListenableBuilder` 包裹频繁变化部分

#### 2.11.2 图片缓存

```dart
CachedNetworkImage(
  imageUrl: url,
  memCacheWidth: 128,
  memCacheHeight: 128,
  maxWidthDiskCache: 512,
);
```

#### 2.11.3 启动速度

- 首屏渲染同步完成（主题 + 本地化）
- 数据库、凭据、邮箱账户等 Provider 懒加载（首次 watch 时才初始化）
- 不在 MaterialApp 层 watch 所有 provider
- Dashboard 预加载：应用启动后异步预加载 Dashboard 关键数据（未读数、今日待办），减少 Dashboard 首次渲染延迟

#### 2.11.4 数据库性能

- 选择需要的列（避免 `SELECT *`）
- 批量操作使用 drift `batch`
- 复杂关联使用 `customSelect`
- 索引覆盖核心查询路径

#### 2.11.5 内存管理

- StreamSubscription 在页面 dispose 时取消
- ImageCache 限制：最大 200 张 / 50MB
- TextEditingController 及时 dispose
- RepaintBoundary 隔离重绘区域

#### 2.11.6 Widget 构建优化

- const widget 优先
- Keys 保持状态（`PageStorageKey`、`ValueKey`）
- `Consumer` 的 child 参数避免重建
- AnimatedList / AnimatedSwitcher 替代全量 rebuild

#### 2.11.7 网络优化

- IMAP 连接池复用
- 邮件列表仅获取元数据（envelope），正文延迟加载
- 邮件正文首次同步时下载（限 30 天内 / 最多 200 封，取交集，排除 >10MB 附件）

#### 2.11.8 性能目标

| 场景 | 目标 |
|---|---|
| 应用冷启动 | < 2s 显示首屏 |
| 邮件列表 500 条 | 滚动 60fps |
| 切换模块 | < 300ms |
| 数据库查询 10000 条 | < 100ms |
| IMAP 收信（50 封） | < 5s |
| 内存峰值 | < 200MB |
| 数据库文件（一年后） | < 50MB |

### 2.12 通知系统

#### 2.12.1 技术选型

`flutter_local_notifications`，跨平台本地通知。

#### 2.12.2 通知渠道

```dart
email_channel:   id='email',   name='邮件通知', importance=high
task_channel:    id='task',    name='任务提醒', importance=high
system_channel:  id='system',  name='系统通知', importance=low
```

#### 2.12.3 通知分类

| 通知类型 | 触发条件 | 点击行为 | 按钮操作 |
|---|---|---|---|
| 新邮件 | IMAP 收取到新邮件 | 打开主窗口 → 邮件详情 | 标记已读 / 转为任务 |
| 任务到期 | 定时检查截止日期 | 打开主窗口 → 任务详情 | 标记完成 / 推迟一天 |
| 数据备份 | 每日备份完成 | 打开设置页 | - |

#### 2.12.4 NotificationService

```dart
// lib/features/notification/presentation/providers/notification_service.dart
class NotificationService {
  final Ref _ref;
  final FlutterLocalNotificationsPlugin _plugin;

  NotificationService(this._ref) : _plugin = FlutterLocalNotificationsPlugin();

  /// 显示本地通知
  Future<void> show(RequestNotificationEvent event) async {
    final androidDetails = AndroidNotificationDetails(
      _channelId(event.type), _channelName(event.type),
      importance: Importance.high, priority: Priority.high,
    );
    await _plugin.show(
      event.hashCode,
      event.title,
      event.body,
      NotificationDetails(android: androidDetails),
    );
  }

  /// 按 dueDate 调度任务到期通知
  Future<void> scheduleTaskDue(int taskId, String title, DateTime dueDate) async {
    final now = DateTime.now();
    if (dueDate.isBefore(now)) return;
    final delay = dueDate.difference(now);
    // 使用 Android AlarmManager 或 Windows 定时器调度
    await _plugin.zonedSchedule(
      taskId, '任务到期', '任务「$title」即将到期',
      dueDate, const NotificationDetails(
        android: AndroidNotificationDetails('task', '任务提醒'),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    );
  }

  /// 取消任务到期通知
  Future<void> cancelScheduled(int notificationId) async {
    await _plugin.cancel(notificationId);
  }

  String _channelId(NotificationType type) { /* email/task/system */ }
  String _channelName(NotificationType type) { /* 根据 type 返回 */ }
}

enum NotificationType { email, task, system }
```

#### 2.12.5 任务到期通知调度

任务创建/更新时自动调度通知：

```
ref.read(taskRepositoryProvider.future).then((repo) => repo.createTask(task))
  → 写入 drift
  → eventBus.publish(TaskCreatedEvent)
  → NotificationService.scheduleTaskDue(task.id, task.title, task.dueDate)
  → （task.dueDate == null 时跳过）

ref.read(taskRepositoryProvider.future).then((repo) => repo.updateTask(task))
  → 写入 drift
  → NotificationService.cancelScheduled(task.id)
  → if task.dueDate != null:
    → NotificationService.scheduleTaskDue(task.id, task.title, task.dueDate)

ref.read(taskRepositoryProvider.future).then((repo) => repo.deleteTask(task.id))
  → NotificationService.cancelScheduled(task.id)
```

#### 2.12.6 通知开关

在 SettingsDao 中通过 key 控制：
- `new_email_notification`
- `task_due_notification`
- `exercise_notification`

### 2.13 数据备份

#### 2.13.1 自动备份

每天首次启动时自动备份 drift 数据库：

```
备份文件路径：{文档目录}/EasyWork/backups/easywork_backup_{YYYY-MM-dd_HHmmss}.db
保留策略：最近 30 天，超过自动清理
手动备份：不自动清理
```

#### 2.13.2 触发判断（双重校验）

```dart
class BackupService {
  final AppDatabase db;
  final SettingsDao settingsDao;
  final Directory backupDir;

  BackupService({required this.db, required this.settingsDao, required this.backupDir});

  /// 检查是否需要备份（每日首次启动时调用）
  Future<void> checkAndBackup() async {
    final lastBackup = await settingsDao.getString('last_backup_date');
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());

    // 1. 检查设置表记录
    if (lastBackup == today) return;

    // 2. 验证文件系统（模糊匹配日期前缀，因为备份文件名包含时间戳）
    final todayFile = backupDir.listSync().where(
      (f) => f.path.contains('easywork_backup_$today'),
    ).isNotEmpty;

    if (todayFile) {
      // 设置表记录丢失，补写
      await settingsDao.setString('last_backup_date', today);
      return;
    }

    // 执行备份
    await _performBackup();
    await settingsDao.setString('last_backup_date', today);
  }

  /// 执行备份：逐表导出为 JSON
  Future<File> _performBackup() async {
    final timestamp = DateFormat('yyyy-MM-dd_HHmmss').format(DateTime.now());
    final file = File('${backupDir.path}/easywork_backup_$timestamp.json');

    final data = await _exportAllTables();
    final jsonStr = const JsonEncoder.withIndent('  ').convert(data);
    await file.writeAsString(jsonStr);

    // 清理超过 30 天的旧备份
    await _cleanOldBackups();

    return file;
  }

  /// 导出所有表数据
  Future<Map<String, dynamic>> _exportAllTables() async {
    return {
      'version': '1.0',
      'exportDate': DateTime.now().toIso8601String(),
      'appVersion': '0.1.0+1',
      'data': {
        // 逐表查询并序列化
        'emailAccounts': await _exportTable(db.emailAccounts),
        'emails': await _exportTable(db.emails),
        'emailAttachments': await _exportTable(db.emailAttachments),
        'contacts': await _exportTable(db.contacts),
        'contactGroups': await _exportTable(db.contactGroups),
        'contactGroupMembers': await _exportTable(db.contactGroupMembers),
        'emailSignatures': await _exportTable(db.emailSignatures),
        'emailToTask': await _exportTable(db.emailToTask),
        'pendingEmails': await _exportPendingEmails(),  // 仅导出 status='pending'
        'tasks': await _exportTable(db.tasks),
        'taskComments': await _exportTable(db.taskComments),
        'notes': await _exportTable(db.notes),
        'noteTags': await _exportTable(db.noteTags),
        'noteTagMembers': await _exportTable(db.noteTagMembers),
        'accountingCategories': await _exportTable(db.accountingCategories),
        'accountingRecords': await _exportTable(db.accountingRecords),
        'accountingBudgets': await _exportTable(db.accountingBudgets),
        'exerciseRecords': await _exportTable(db.exerciseRecords),
        'stocks': await _exportTable(db.stocks),
        'calendarEvents': await _exportTable(db.calendarEvents),
        'settings': await _exportTable(db.settings),
        'logs': await _exportLogs(),  // 排除 debug 级别
        'timelineEvents': await _exportTable(db.timelineEvents),
      },
      'metadata': {
        'totalRecords': 0,  // 计算所有表记录数之和
        'tableCounts': {},  // 每个表的记录数
      },
    };
  }

  /// 导出单表（通用方法）
  Future<List<Map<String, dynamic>>> _exportTable<T extends Table>(
    TableInfo<T> table,
  ) async {
    final rows = await db.select(table as TableInfo<T>).get();
    return rows.map((row) => row.data).toList();
  }

  /// 仅导出 status='pending' 的离线邮件
  Future<List<Map<String, dynamic>>> _exportPendingEmails() async {
    final rows = await (db.select(db.pendingEmails)
          ..where((e) => e.status.equals('pending')))
        .get();
    return rows.map((row) => row.data).toList();
  }

  /// 导出日志（排除 debug 级别）
  Future<List<Map<String, dynamic>>> _exportLogs() async {
    final rows = await (db.select(db.logs)
          ..where((l) => l.level.equals('debug').not()))
        .get();
    return rows.map((row) => row.data).toList();
  }

  /// 从备份恢复
  Future<RestoreResult> restoreFromBackup(File backupFile) async {
    try {
      // 1. 读取并校验 JSON 格式
      final jsonStr = await backupFile.readAsString();
      final data = jsonDecode(jsonStr) as Map<String, dynamic>;

      // 2. 校验版本兼容性（major version 必须一致）
      final backupVersion = data['version'] as String?;
      if (backupVersion == null || !backupVersion.startsWith('1.')) {
        return RestoreResult.failure('备份版本不兼容');
      }

      // 3. 先自动备份当前数据库（以防恢复后后悔）
      final preRestoreBackup = await _performBackup();

      // 4. 清空当前所有表（事务内执行）
      await db.transaction(() async {
        // 按外键依赖顺序清空
        await db.customStatement('DELETE FROM timeline_events');
        await db.customStatement('DELETE FROM logs');
        await db.customStatement('DELETE FROM note_tag_members');
        await db.customStatement('DELETE FROM note_tags');
        await db.customStatement('DELETE FROM notes');
        await db.customStatement('DELETE FROM task_comments');
        await db.customStatement('DELETE FROM tasks');
        await db.customStatement('DELETE FROM email_to_task');
        await db.customStatement('DELETE FROM email_attachments');
        await db.customStatement('DELETE FROM emails');
        await db.customStatement('DELETE FROM email_signatures');
        await db.customStatement('DELETE FROM contact_group_members');
        await db.customStatement('DELETE FROM contact_groups');
        await db.customStatement('DELETE FROM contacts');
        await db.customStatement('DELETE FROM accounting_budgets');
        await db.customStatement('DELETE FROM accounting_records');
        await db.customStatement('DELETE FROM accounting_categories');
        await db.customStatement('DELETE FROM exercise_records');
        await db.customStatement('DELETE FROM stocks');
        await db.customStatement('DELETE FROM calendar_events');
        await db.customStatement('DELETE FROM pending_emails');
        await db.customStatement('DELETE FROM settings');
        await db.customStatement('DELETE FROM email_accounts');
      });

      // 5. 导入备份数据（事务内执行）
      final importData = data['data'] as Map<String, dynamic>;
      await db.transaction(() async {
        // 逐表导入（按外键依赖顺序）
        for (final entry in importData.entries) {
          await _importTable(entry.key, entry.value as List);
        }
      });

      // 6. 校验导入完整性
      final metadata = data['metadata'] as Map<String dynamic>?;
      final tableCounts = metadata?['tableCounts'] as Map<String, dynamic>?;
      // 校验逻辑：对比每个表的记录数是否匹配

      return RestoreResult.success(preRestoreBackup: preRestoreBackup);
    } catch (e) {
      return RestoreResult.failure('恢复失败: ${e.toString()}');
    }
  }

  Future<void> _importTable(String tableName, List<dynamic> rows) async {
    // 根据表名调用对应的 drift insert 方法
    // 实现略：逐行插入到对应表
  }

  /// 清理超过 30 天的旧备份
  Future<void> _cleanOldBackups() async {
    final cutoff = DateTime.now().subtract(const Duration(days: 30));
    final files = backupDir.listSync().whereType<File>();
    for (final file in files) {
      if (file.path.contains('easywork_backup_')) {
        final stat = await file.stat();
        if (stat.modified.isBefore(cutoff)) {
          await file.delete();
        }
      }
    }
  }
}

/// 恢复结果
class RestoreResult {
  final bool isSuccess;
  final String? error;
  final File? preRestoreBackup;

  RestoreResult.success({this.preRestoreBackup})
      : isSuccess = true,
        error = null;

  RestoreResult.failure(this.error)
      : isSuccess = false,
        preRestoreBackup = null;
}
```

#### 2.13.3 手动备份/恢复

- 导出：通过 drift `DatabaseConnection.select()` 逐表查询 → `jsonEncode` 序列化为 JSON → `file_picker` 保存
- 恢复：`file_picker` 选择文件 → `jsonDecode` 反序列化 → 逐表批量写入（事务内） → 校验记录数匹配

### 2.14 日志系统（Logs）

#### 2.14.1 定位

`logs` 表是全量审计底表，记录所有操作（含业务操作）。`timeline_events` 是从 logs 中筛选的关键事件子集（独立物理表，通过 INSERT 写入，非 SQL VIEW），仅展示面向用户的关键事件。

#### 2.14.2 数据流

```
操作发生
  → 写入 logs 表（全量审计）
  → 判断是否属于 Timeline 展示范围
  → 是：同时写入 timeline_events（派生视图）
```

#### 2.14.3 日志级别

| 级别 | 用途 |
|---|---|
| `info` | 正常业务操作（任务创建、邮件收取等） |
| `warn` | 非致命异常（IMAP 重连、备份跳过等） |
| `error` | 错误（IMAP 连接失败、数据库写入异常等） |
| `debug` | 开发调试信息（仅 `kDebugMode` 时收集） |

#### 2.14.4 保留策略

保留最近 90 天，支持手动清理。超过 90 天的日志自动删除（定时任务或首次启动时清理）。

#### 2.14.4a 日志列表空状态与分页

**空状态**：
- 无日志：图标（`bug_report_outlined`，64px）+ "暂无日志"

**分页**：
- 日志列表使用 `ListView.builder` + 滚动到底部加载更多，每页 50 条

#### 2.14.5 查看方式

日志页面（`/log`）：按时间倒序，支持按模块和级别筛选。仅展示技术性日志，不与 Timeline 重复。

**筛选功能**：
- 按模块筛选：下拉菜单，选项 = 所有模块 / task_board / email / accounting / exercise / notes / system
- 按级别筛选：Chip 组，可多选 = info / warn / error（默认选中全部）
- 搜索框：按日志内容关键词搜索
- 筛选结果实时更新列表

#### 2.14.6 日志导出

日志支持导出为文本文件，便于问题排查和远程支持。

```
日志页 → 右上角"导出"按钮
  → 弹出导出选项：
    ├── 时间范围：最近 7 天 / 30 天 / 全部
    ├── 级别筛选：info / warn / error（可多选）
    └── 导出格式：纯文本（默认）
  → file_picker 保存对话框
  → 写入文件（{文档目录}/EasyWork/logs/log_export_{YYYY-MM-dd_HHmmss}.txt）
  → SnackBar "日志已导出" + 打开文件所在目录按钮
```

---

### 2.15 网络状态与离线处理

#### 2.15.1 网络检测

使用 `connectivity_plus`（^6.1.0+，返回 `List<ConnectivityResult>`）检测网络状态：

```dart
final connectivityProvider = StreamProvider<List<ConnectivityResult>>((ref) {
  return Connectivity().onConnectivityChanged;
});

final isOnlineProvider = Provider<bool>((ref) {
  final result = ref.watch(connectivityProvider);
  return result.when(
    data: (r) => r.isNotEmpty && !r.contains(ConnectivityResult.none),
    loading: () => true,  // 默认在线
    error: (_, __) => false,
  );
});
```

#### 2.15.2 离线行为

| 模块 | 离线行为 |
|---|---|
| 邮箱 | 暂停 IMAP 同步；用户可查看已同步邮件；发送操作排队（存入 drift `pending_emails` 表），恢复连接后自动发送 |
| 任务/笔记/记账/运动 | 不受影响（纯本地操作） |
| 日历 | 不受影响（读取本地 tasks.dueDate，纯本地操作） |
| 联系人 | 不受影响（纯本地操作） |
| Timeline | 不受影响（读取本地 timeline_events 表） |
| 股票 | 显示"网络不可用"空状态，不请求 API |
| 搜索 | 仅搜索本地数据，不受影响 |
| 备份 | 本地备份正常；云端备份（未来）暂停 |

#### 2.15.3 网络恢复时的同步策略

```
网络恢复 → 发布 OnlineEvent
  → IMAP 重新连接（IDLE 或轮询）
  → 对比本地最新 UID 与服务器 UID
  → 增量同步新邮件
  → 发送排队中的邮件（如果有）
```

#### 2.15.4 离线邮件发送队列

**实现方案**：新增 `PendingEmails` 表存储离线期间用户编辑的待发送邮件。

```dart
class PendingEmails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get toAddresses => text()();       // JSON 数组
  TextColumn get ccAddresses => text().nullable()();  // JSON 数组
  TextColumn get bccAddresses => text().nullable()(); // JSON 数组
  TextColumn get subject => text()();
  TextColumn get bodyText => text().nullable()();
  TextColumn get bodyHtml => text().nullable()();
  TextColumn get attachmentPaths => text().nullable()();  // JSON 数组：本地附件路径
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get status => text().withDefault(const Constant('pending'))();  // pending / sending / sent / failed
  TextColumn get errorMessage => text().nullable()();
}
```

**发送队列流程**：
```
用户点击发送 → 检查 isOnlineProvider
  ├── 在线 → mailClient.sendMessage() → 成功则返回
  └── 离线 → 写入 pending_emails 表（status='pending', retryCount=0）→ SnackBar "邮件已保存，将在网络恢复后发送"
      → 网络恢复 → EventBus.on<OnlineEvent>() → 遍历 pending_emails（status='pending' AND retryCount < 3）
        → mailClient.sendMessage() → 成功 → status='sent' + 删除记录
        → 失败 → retryCount += 1, status='failed', errorMessage 记录
          → retryCount < 3 → 等待 30s 后自动重试（指数退避：30s, 60s, 120s）
          → retryCount >= 3 → status='failed' → 用户可在发件箱查看手动重试
```

---

### 2.16 数据库版本迁移

#### 2.16.1 迁移策略

```dart
@override
int get schemaVersion => 3;  // 当前版本：1=初始, 2=预留, 3=预留

@override
MigrationStrategy get migration => MigrationStrategy(
  onCreate: (m) async {
    await m.createAll();
    await _createFtsTables(m);
    await _createFtsTriggers(m);
    await _insertDefaultData();
  },
  onUpgrade: (m, from, to) async {
    // 逐版本迁移，支持跳跃升级
    for (var version = from; version < to; version++) {
      await _migrateToVersion(m, version + 1);
    }
  },
  beforeOpen: (details) async {
    // 每次打开数据库时执行
    if (details.hadUpgrade) {
      // 仅在升级后重建 FTS 表和触发器（onCreate 已处理全新安装，无需重复执行）
      await _createFtsTables(Migrator(this));
      await _createFtsTriggers(Migrator(this));
    }
  },
);

Future<void> _migrateToVersion(Migrator m, int version) async {
  switch (version) {
    case 2:
      // 预留：未来版本添加 subtaskCount 列（当前子任务进度通过计算得出）
      // await m.addColumn(tasks, tasks.subtaskCount);
      // await m.createIndex('idx_tasks_parent_id');
      break;
    case 3:
      // 创建 CalendarEvents 表（日历独立事件）
      await m.createTable(calendarEvents);
      break;
    // 未来版本...
  }
}

Future<void> _createFtsTables(Migrator m) async {
  // 创建 FTS5 虚拟表（tasks_fts, emails_fts, contacts_fts, notes_fts）
  await customStatement('CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(title, description)');
  await customStatement('CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(subject, from_name, from_address)');
  await customStatement('CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(display_name, email_addresses)');
  await customStatement('CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, content)');
}

Future<void> _createFtsTriggers(Migrator m) async {
  // 创建 FTS 同步触发器（INSERT/UPDATE/DELETE 时自动同步 FTS 表）
  await customStatement('''
    CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
    END
  ''');
  await customStatement('''
    CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
      DELETE FROM tasks_fts WHERE rowid = old.id;
      INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
    END
  ''');
  await customStatement('''
    CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
      DELETE FROM tasks_fts WHERE rowid = old.id;
    END
  ''');
  // emails_fts, contacts_fts, notes_fts 同理
}

Future<void> _insertDefaultData() async {
  // 插入预设记账分类（支出 10 个 + 收入 5 个）
  // 插入默认设置项
}
```

**迁移失败处理**：
- drift 在事务内执行迁移，失败时自动回滚到迁移前状态（数据库 schema 保持旧版本号）
- 回滚后 `beforeOpen` 不会再次执行，数据库保持旧版本
- 应用启动时检测 `details.hadUpgrade` 为 true 但 schema 版本未变化 → 说明迁移失败
- 此时显示 SnackBar 提示："数据版本升级失败，部分功能可能不可用。建议备份数据后重新安装。"
- 同时写入 logs 表（level: 'error', action: 'migration_failed'）
- 用户可操作：关闭应用重新尝试、在设置中手动备份当前数据、或卸载重装
- 注意：drift 的 `onUpgrade` 回滚是自动的，无需手动处理回滚逻辑

#### 2.16.2 迁移原则

- 每个版本的迁移逻辑独立封装在 `_migrateToVersion` 方法中
- 支持跳跃升级（如从 v1 直接升级到 v3，会依次执行 v2 和 v3 的迁移）
- 迁移失败时回滚（drift 自动支持事务回滚）
- 新增字段使用 `nullable` 或 `defaultValue`，避免破坏现有数据
- 重大重构（如表拆分）需在迁移中处理数据转换

#### 2.16.3 测试验证

```dart
// 测试迁移正确性
testWidgets('database migration from v1 to v2', (tester) async {
  // 1. 创建 v1 版本数据库
  // 2. 插入测试数据
  // 3. 执行迁移
  // 4. 验证数据完整性
  // 5. 验证新字段可用
});
```

---

## 3. 功能模块

### 3.1 Dashboard

#### 3.1.1 数据卡片（固定顺序）

| 数据卡片 | 数据来源 |
|---|---|
| 今日待办 | task_board：截止日期为今天的任务，按优先级排序 |
| 待跟进邮件 | email：标记为待跟进或附件任务的邮件 |
| 未读邮件数 | email：各账户未读数汇总 |
| 本月支出/预算 | accounting：本月收支汇总 + 预算进度条 |
| 最近笔记 | notes：最近编辑的前 5 条 |
| 今日运动 | exercise：今天的运动记录摘要 |
| 股票概览 | stocks：自选股快照 |

布局固定，不可配置，不可拖拽。

**未配置模块卡片行为**：
| 卡片 | 未配置时显示 |
|---|---|
| 待跟进邮件 / 未读邮件数 | 未添加邮箱账户 → 显示"添加邮箱账户"引导（图标 + 文字 + 跳转按钮） |
| 本月支出/预算 | 无记账记录 → 显示"开始记账"引导 |
| 最近笔记 | 无笔记 → 显示"创建笔记"引导 |
| 今日运动 | 今日无记录 → 显示"记录运动"引导 |
| 股票概览 | 未添加自选股 → 显示"添加自选股"引导 |

所有引导卡片点击后跳转到对应模块的创建/配置页面。

#### 3.1.2 页面结构

```
├── AppBar（日期显示 + 快捷搜索入口）
├── 固定顺序 Grid 区域
│   └── 每个卡片有标题 + 核心数据 + 点击跳转
└── 各卡片按固定顺序排列
```

#### 3.1.3 Dashboard 状态类型

```dart
// Dashboard 各卡片对应的 Notifier 状态类型

// 今日待办：待办任务数量
class DashboardTasksState {
  final int taskCount;
  final String? nearestTaskTitle;
  const DashboardTasksState({this.taskCount = 0, this.nearestTaskTitle});
}

// 邮箱未读数：各账户未读数汇总
class DashboardUnreadState {
  final int totalUnread;
  final Map<int, int> perAccountUnread;  // accountId → count
  const DashboardUnreadState({this.totalUnread = 0, this.perAccountUnread = const {}});
}

// 本月预算进度
class DashboardBudgetState {
  final double totalExpense;
  final double totalBudget;
  final double budgetUsedPercent;        // 0.0 ~ 1.0
  const DashboardBudgetState({this.totalExpense = 0, this.totalBudget = 0, this.budgetUsedPercent = 0});
}

// 今日运动摘要
class DashboardExerciseState {
  final bool hasRecordToday;
  final String? exerciseType;
  final int? durationMinutes;
  const DashboardExerciseState({this.hasRecordToday = false, this.exerciseType, this.durationMinutes});
}
```

### 3.2 Timeline

#### 3.2.1 事件来源

| 事件类型 | 来源模块 | 显示内容 |
|---|---|---|
| 任务状态变更 | task_board | "完成任务「xxx」"、"创建任务「xxx」" |
| 新邮件收到 | email | "收到来自张三的邮件" |
| 邮件转任务 | email | "将邮件「xxx」转为任务" |
| 笔记更新 | notes | "编辑笔记「xxx」" |
| 账目记录 | accounting | "记录支出 ¥xxx - 餐饮" |
| 运动完成 | exercise | "完成跑步 5km" |

#### 3.2.2 显示方式

按日期分组的时间线列表，每条记录包含图标 + 时间 + 文字描述 + 可点击跳转到源模块。

#### 3.2.2a Timeline 空状态与分页

**空状态**：
- 无动态：图标（`timeline`，64px）+ "暂无动态" + "完成任务或记录运动来生成动态"

**分页**：
- Timeline 列表使用 `ListView.builder` + 滚动到底部加载更多，每页 50 条

#### 3.2.3 数据来源

从 `timeline_events` 表读取（drift 持久化），支持时间范围查询和模块筛选。

### 3.3 任务看板

#### 3.3.1 数据模型

```dart
// Tasks 表字段（见 2.2.4）
// TaskComments 表字段（见 2.2.4）
```

任务状态：`todo` / `in_progress` / `done` / `suspended` / `abandoned` / `archived`

废弃和归档任务不直接显示在看板，通过筛选器/按钮查看。

#### 3.3.1a 领域模型

```dart
enum TaskPriority { high, medium, low }
enum TaskStatus { todo, inProgress, done, suspended, abandoned, archived }

/// TaskStatus ↔ 数据库字符串映射（drift 表中存储为 snake_case）
extension TaskStatusMapping on TaskStatus {
  String toDbValue() => switch (this) {
    TaskStatus.todo => 'todo',
    TaskStatus.inProgress => 'in_progress',
    TaskStatus.done => 'done',
    TaskStatus.suspended => 'suspended',
    TaskStatus.abandoned => 'abandoned',
    TaskStatus.archived => 'archived',
  };

  static TaskStatus fromDbValue(String value) => switch (value) {
    'todo' => TaskStatus.todo,
    'in_progress' => TaskStatus.inProgress,
    'done' => TaskStatus.done,
    'suspended' => TaskStatus.suspended,
    'abandoned' => TaskStatus.abandoned,
    'archived' => TaskStatus.archived,
    _ => TaskStatus.todo,
  };
}

class TaskEntity {
  final int? id;
  final String title;
  final String? description;
  final TaskPriority priority;
  final TaskStatus status;
  final DateTime? dueDate;
  final List<String> tags;
  final List<String> attachments;
  final int? estimatedMinutes;
  final int? actualMinutes;
  final int? progressPercentage;
  final bool isRecurring;
  final String? recurrenceRule;
  final int? parentTaskId;
  final int recurrenceGeneration;
  final int sortOrder;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? completedAt;
}
```

#### 3.3.1b 页面结构

```
task_board/presentation/pages/
├── task_board_page.dart       # 看板视图（默认）
├── task_list_page.dart        # 列表视图
├── task_calendar_page.dart    # 日历视图
├── task_form_page.dart        # 新建/编辑任务（共用）
└── task_detail_page.dart      # 任务详情（含评论、子任务）
```

#### 3.3.2 视图

| 视图 | 说明 |
|---|---|
| 看板视图 | 按状态分列（待办/进行中/已完成/挂起），支持拖拽移动卡片 |
| 列表视图 | 表格/列表形式，支持按优先级/截止日期/标签排序筛选 |
| 日历视图 | 在日历上标记有截止日期的任务，支持拖拽调整截止日 |

**空状态**：
- 无任务时：图标（`task_alt`，outlined，64px）+ "暂无任务" + "创建任务"按钮
- 某状态列无任务时（看板视图）：显示虚线占位框 + "拖拽任务到此处"

**分页**：
- 任务列表使用 `ListView.builder` + 滚动到底部加载更多，每页 30 条

**看板拖拽规则**：
- 允许的拖拽路径：`todo ↔ in_progress ↔ done`，`todo/in_progress → suspended`，`suspended → todo`
- 不允许的拖拽：`abandoned` 和 `archived` 不显示在看板列中，只能通过筛选器查看
- 拖拽到不允许的目标列：目标列不显示虚线占位符，拖拽手势无响应（不弹窗）
- 拖拽释放后自动保存状态 + 更新 `updatedAt` + 写入 Logs + 触发 EventBus

**并发编辑处理**（乐观锁）：
- Tasks 表使用 `updatedAt` 字段作为版本标识
- 更新任务时 WHERE 条件附加 `AND updated_at = ?`（传入原始 updatedAt）
  - 示例 SQL：`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ? AND updated_at = ?`
  - 示例 drift：`(update(tasks)..where((t) => t.id.equals(id) & t.updatedAt.equals(originalUpdatedAt))).write(companion)`
- 更新影响 0 行 → 说明被其他端修改 → SnackBar 提示"数据已被其他设备修改，请刷新后重试"
- MVP 阶段仅做提示，不做自动合并

#### 3.3.3 周期任务（RRULE）

| 周期 | RRULE 示例 |
|---|---|
| 每日 | `FREQ=DAILY` |
| 每周一 | `FREQ=WEEKLY;BYDAY=MO` |
| 每月15日 | `FREQ=MONTHLY;BYMONTHDAY=15` |
| 工作日 | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |

**完成周期任务时的逻辑**：
1. 原任务 `status=done`，`completed_at` 记录时间
2. 自动创建新任务（`status=todo`），继承：描述、标签、附件（复制文件）
3. 新任务 `due_date` 按 RRULE 计算下次日期
4. 新任务 `parent_task_id` 指向原任务（链式引用）
5. 新任务继承原任务的 `recurrenceRule`，保持周期性

**代次限制机制**：
- Tasks 表新增 `recurrenceGeneration` 整数列（默认 0，根任务 = 0，首次生成 = 1，递增）
- 代次限制为**单链最大深度**：沿 parent_task_id 链向上追溯，若任意祖先的 recurrenceGeneration >= 100 → 停止生成
- 生成新任务时检查：当前任务的 recurrenceGeneration >= 100 → 停止生成，不创建新任务，写入 logs（action: 'recurrence_limit_reached'）
- 同时写入 timeline_events 记录 "周期任务「xxx」已达生成上限（100 代）"
- 此限制防止偶发 bug 导致无限循环，正常情况下用户不会在单次使用中产生 100 个周期实例

**周期任务管理**：
- 删除周期任务模板（`isRecurring=true` 的原始任务）→ 确认弹窗："此操作将停止后续自动创建，已完成的子任务不受影响。确认删除？"
- 暂停周期任务（`status=suspended`）→ 停止后续自动创建，恢复（`status=todo`）→ 恢复自动创建
- 查看所有周期任务实例：任务详情页 → "查看所有周期实例"按钮 → 列表展示（含已完成/待办）

#### 3.3.4 邮件→任务联动

```
邮件详情页 → "转为任务" 按钮
  → 弹窗表单（标题=邮件主题、描述=邮件摘要、优先级、截止日期、关联联系人、关联附件）
  → 确认 → 写入 tasks + email_to_task
  → 附件复制到 tasks/{task_id}/attachments/
  → email_to_task.attachment_paths 存储复制后的路径（JSON 数组）
  → 邮件详情页显示 "已关联任务：xxx" + 跳转按钮
  → Timeline 记录
  → Dashboard 待办更新
  → 任务删除时清理对应附件目录
```

### 3.4 日历

#### 3.4.1 功能

| 功能 | 说明 |
|---|---|
| 月/周/日视图 | 三种时间粒度切换 |
| 任务标记 | 有截止日期的任务在日历上显示为彩色标记（按优先级着色） |
| 农历显示 | 中国节假日模式下显示农历日期和节气 |
| 节假日标注 | 中国法定节假日、调休日自动标注 |
| 任务拖拽 | 日历视图下可拖拽任务到其他日期调整截止日 |

#### 3.4.2 数据来源

日历页面同时显示两类事件：

```
日历页面显示逻辑：
  → 1. 查询 tasks.dueDate 不为空的任务（任务事件）
  → 2. 查询 calendar_events 表（独立事件）
  → 3. 合并按日期分组显示在日历对应日期上
  → 任务颜色：高=红、中=琥珀、低=蓝（与看板优先级着色一致）
  → 独立事件颜色：用户自定义（hex color），默认 primary 色
  → 点击日历上的事件：
      ├── 任务事件 → 跳转到任务详情页
      └── 独立事件 → 跳转到日历事件详情页
  → 拖拽任务到其他日期 → taskRepository.updateDueDate(taskId, newDate)
  → 拖拽独立事件到其他日期 → calendarDao.updateDate(eventId, newDate)
  → 更新后 EventBus 发布 TaskStatusChangedEvent → Dashboard 待办刷新
```

**独立事件 CRUD**：
- 新建事件：标题（必填）、开始时间（必填）、结束时间（可选）、全天事件、颜色、重复规则、位置、描述
- 编辑事件：修改任意字段
- 删除事件：确认后删除
- 重复事件：使用 RRULE 格式（与 Tasks 共用 rrule 包），日历视图展开重复实例

**未来扩展**（Phase 8+）：
- 钉钉日历同步（只读）
- Google Calendar 双向同步

#### 3.4.3 技术方案

- 农历：`lunar` 包（已确定）
- 日历组件：`table_calendar`（已确定）

#### 3.4.4 页面结构

```
calendar/presentation/pages/
├── calendar_page.dart              # 月/周/日视图
├── calendar_event_form_page.dart   # 新建/编辑日历事件
└── calendar_event_detail_page.dart # 日历事件详情
```

### 3.5 邮箱

#### 3.5.1 功能总览

```
邮箱模块
├── 账户管理（多账户、IMAP 自动发现、添加/删除/编辑）
├── 邮件管理（收件箱/已发送/草稿/垃圾邮件、列表/详情、回复/转发/删除、搜索、附件）
├── 联系人管理（列表/详情、CRUD、分组管理、VCF 导入/导出、从发件人添加）
├── 邮件签名（多签名管理、HTML/文本编辑器、默认签名、写邮件时切换）
├── 邮件 → 任务（一键转为任务，关联附件，跟踪进度）
└── Windows 后台（托盘常驻、IDLE/轮询收信、通知弹窗）
```

**账户管理 CRUD 详细流程**：

```
添加账户：
  → 输入邮箱地址 → 自动发现配置（Discover API）
  → 自动发现失败 → 手动输入 IMAP/SMTP 配置
  → 输入密码 → 测试连接（临时 MailClient，不复用于同步）
  → 成功 → 保存账户配置到 drift EmailAccounts 表 + 密码到 flutter_secure_storage
           + 记录 supportsIdle 到 EmailAccounts.supportsIdle 字段
  → 创建 MailDataSource → 连接 → 开始同步

编辑账户：
  → 进入账户管理页 → 选择账户 → 编辑配置/密码
  → 修改密码 → 更新 flutter_secure_storage → 重新测试连接 → 成功则更新 MailDataSource
  → 修改服务器配置 → 更新 drift → 重新测试连接 → 成功则重建 MailDataSource 连接

删除账户：
  → 确认弹窗："删除账户将同时删除该账户的所有本地邮件数据和签名，此操作不可撤销。"
  → 确认 → 1. 删除 flutter_secure_storage 中的密码
           → 2. 删除 drift 中该账户的 emails/emailAttachments/emailSignatures/contacts
           → 3. 断开 MailDataSource 连接
           → 4. 从 mailDataSourcesProvider 中移除

切换默认账户：
  → 设置页 → 邮箱 → "默认账户"下拉选择
  → 写邮件时自动使用默认账户的签名和发件人地址
```

#### 3.5.1a 邮件列表空状态与分页

**空状态**：
- 未添加邮箱账户：图标（`mail_outline`，64px）+ "未配置邮箱账户" + "添加账户"按钮
- 已配置但无邮件：图标（`inbox`，64px）+ "暂无邮件" + "收取邮件"按钮
- 某文件夹无邮件：图标 + "此文件夹为空"

**分页**：
- 邮件列表使用 `ListView.builder` + 滚动到底部加载更多，每页 30 条
- 仅加载 envelope（头信息），正文按需下载

#### 3.5.2 邮件同步策略

**整体方案**：通过 `MailDataSource`（封装 enough_mail `MailClient`）进行同步。

- **首次同步**：
  1. `mailClient.fetchMessages(count: syncLimit, fetchPreference: FetchPreference.envelope)` 获取头信息列表
  2. 将头信息写入本地 drift `emails` 表
  3. 对未读邮件逐一调用 `mailClient.fetchMessage()` 获取完整正文（含 MIME 结构）
  4. 排除 >10MB 的附件（仅在需要时按需下载）
- **同步范围**：最近 `emailSyncDays` 天内，且最多 `emailSyncLimit` 封。取交集逻辑：先按时间范围筛选，再取前 N 封（按接收时间倒序）
- **收取间隔**：
  - 支持 IDLE 的账户：`MailClient` 通过 IMAP IDLE 实时接收新邮件推送，无需轮询
  - 不支持 IDLE 的账户：`mailClient.startPolling(interval: Duration(minutes: pollInterval))` 进行轮询
  - 默认 5 分钟，可在设置页调整（1/5/15/30 分钟）
- **IDLE 支持**：`MailClient` 自动检测 IMAP CAPABILITY，通过 `mailClient.isIdleSupported` 查询
- **断开自动重连**：`MailClient` 内置自动重连 + `MailConnectionLostEvent` / `MailConnectionReEstablishedEvent` 通知
- **增量同步**：
  1. `MailClient` 收到新邮件事件（`MailLoadEvent`）→ 下载正文 → 写入本地 drift → 触发 `NewEmailReceivedEvent`
  2. 利用 IMAP `UIDVALIDITY` + `UIDNEXT` 机制：记录每个文件夹的 `UIDVALIDITY` 和最新 `UID`，仅获取 UID >= 本地记录的新邮件，避免全量对比
  3. `UIDVALIDITY` 变化时（服务器邮箱重置）：清空该文件夹的本地邮件，重新全量同步

#### 3.5.2a 联系人列表空状态与分页

**空状态**：
- 无联系人：图标（`person_outline`，64px）+ "暂无联系人" + "添加联系人"按钮
- 分组无成员：图标 + "此分组暂无联系人"

**分页**：
- 联系人列表使用 `ListView.builder` + 滚动到底部加载更多，每页 50 条

#### 3.5.3 VCF 导入/导出

**编码处理**：
- enough_mail 已通过传递依赖 `enough_convert` 支持多种中文字符编码（GB2312、GBK、GB18030、Big5 等）
- VCF 编码检测引入 `charset` 包辅助，兜底 UTF-8

导出流程：
```
选中联系人 → "导出VCF" → vcard 包生成 vCard 对象
→ 序列化为 .vcf → file_picker 保存对话框 → 写入文件
支持多选批量导出为单个多记录 .vcf
```

导入流程：
```
选择 .vcf 文件 → 读取内容 → charset 自动检测编码 → enough_convert 转换（若编码不在 charset 范围内）
→ vcard 包解析 → 映射为 Contact 模型 → 按 email 去重 → 批量写入 drift → 刷新列表
```

#### 3.5.4 写邮件流程

```
新建邮件 → 收件人选择（搜索联系人/分组）
→ 编辑正文 → 签名自动插入默认签名（可切换）
→ 添加附件 → mailClient.sendMessage(builder.buildMimeMessage())
```

#### 3.5.5 邮箱模块页面结构

```
email/presentation/pages/
├── email_list_page.dart          # 邮件列表（文件夹切换 + 搜索）
├── email_detail_page.dart        # 邮件详情（使用 enough_mail_flutter MimeMessageDownloader）
├── compose_page.dart             # 写邮件（使用 enough_mail MessageBuilder）
├── contact_list_page.dart        # 联系人列表（搜索 + 分组筛选）
├── contact_detail_page.dart      # 联系人详情 + 关联邮件
├── contact_form_page.dart        # 新建/编辑联系人
├── contact_group_page.dart       # 分组管理
└── signature_manage_page.dart    # 签名管理
```

**邮件详情 UI 集成**：

```dart
// 使用 MimeMessageDownloader 实现按需下载 + 显示
// 列表页仅下载了 Envelope（邮件头），点击后 MimeMessageDownloader 自动：
//   1. 检查本地正文是否已下载
//   2. 未下载 → 调用 mailClient.fetchMessage() 获取完整 MIME
//   3. 使用 MimeMessageViewer 渲染 HTML/纯文本/附件

Widget buildEmailDetail(MimeMessage message, MailClient client, int accountId) {
  return MimeMessageDownloader(
    mimeMessage: message,
    mailClient: client,
    onDownloaded: (msg) {
      // 将完整 MIME 消息持久化到本地 drift（需传入 accountId）
      upsertFullMessage(msg, accountId);
    },
    blockExternalImages: false,    // 设置项控制
    markAsSeen: true,             // 自动标记为已读
    mailtoDelegate: handleMailto, // mailto: 链接处理
  );
}
```

**写邮件 UI 集成**：

```dart
// 使用 MessageBuilder 构建邮件
final builder = MessageBuilder()
  ..from = [MailAddress(displayName, email)]
  ..to = [MailAddress(recipientName, recipientEmail)]
  ..subject = subject
  ..addMultipartAlternative(plainText: bodyText, htmlText: bodyHtml);
// 通过 mailClient.sendMessage(builder.buildMimeMessage()) 发送
```

### 3.6 笔记

| 功能 | 说明 |
|---|---|
| 编辑器 | WYSIWYG 富文本编辑器（`flutter_quill`） |
| 笔记列表 | 按更新时间倒序，支持全文搜索（FTS5） |
| 分类/标签 | 独立 note_tags + note_tag_members 关联表，支持 CRUD 和按标签筛选 |
| 附件 | 支持插入图片 |
| 导出 | 导出为纯文本/html |

#### 3.6.1 领域模型

```dart
class NoteEntity {
  final int? id;
  final String? title;
  final String content;         // Quill Delta JSON
  final List<String> imagePaths; // 本地图片路径列表（映射 drift Notes.imagePaths JSON 数组）
  final List<NoteTagEntity> tags;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class NoteTagEntity {
  final int? id;
  final String name;
  final String? color;         // hex color
}
```

#### 3.6.1a 笔记列表空状态与分页

**空状态**：
- 无笔记：图标（`note_outlined`，64px）+ "暂无笔记" + "创建笔记"按钮

**分页**：
- 笔记列表使用 `ListView.builder` + 滚动到底部加载更多，每页 30 条

**并发编辑**：
- MVP 阶段不处理笔记并发编辑（单用户场景）
- 未来扩展可使用 updatedAt 乐观锁（与任务相同策略）

#### 3.6.2 图片存储方案

```
图片存储路径：{应用文档目录}/notes/{note_id}/images/
文件命名：{timestamp}_{hash}.{ext}（如 1719849600_abc123.jpg）

插入流程：
  用户点击"插入图片" → file_picker 选择图片
  → 复制到 notes/{temp_id}/images/（编辑时暂存）
  → 保存笔记时：
    ├── 新建笔记：创建 notes/{note_id}/ 目录，移动图片文件
    └── 编辑笔记：对比旧图片列表，删除不再引用的图片，移动新图片
  → Quill Delta 中以 block embed 引用本地路径

笔记表扩展：
  Notes 表增加 imagePaths 字段（TEXT，JSON 数组格式）
  存储该笔记引用的所有图片相对路径

删除笔记时：
  删除 notes/{note_id}/ 整个目录
```

#### 3.6.3 页面结构

```
notes/presentation/pages/
├── note_list_page.dart        # 笔记列表（搜索 + 标签筛选）
├── note_detail_page.dart      # 笔记详情/编辑（富文本编辑器）
└── note_tag_page.dart         # 标签管理
```

### 3.7 记账

#### 3.7.1 功能

| 功能 | 说明 |
|---|---|
| 收支记录 | 单笔记录：类型(收入/支出)、分类、金额、日期、备注 |
| 分类管理 | 预设分类（餐饮/交通/购物/住房/娱乐/工资/投资收益等） |
| 周度汇总 | 本周收支统计（柱状图，按天） |
| 月度汇总 | 月度收支统计图表（饼图按分类 + 柱状图按天） |
| 预算管理 | 每个分类可设置月度预算，实时显示预算进度 |

#### 3.7.2 领域模型

```dart
enum AccountingType { income, expense }

class AccountingRecordEntity {
  final int? id;
  final AccountingType type;
  final AccountingCategoryEntity category;
  final double amount;
  final DateTime recordDate;
  final String? note;
  final DateTime createdAt;
}

class AccountingCategoryEntity {
  final int? id;
  final String name;
  final String? icon;         // Material icon name
  final AccountingType type;
  final double? monthlyBudget;
  final int sortOrder;
}
```

#### 3.7.3 预设分类

**支出分类**（默认 10 个）：

| 名称 | 图标 | 月度预算建议 |
|---|---|---|
| 餐饮 | `restaurant` | - |
| 交通 | `directions_car` | - |
| 购物 | `shopping_bag` | - |
| 住房 | `home` | - |
| 娱乐 | `sports_esports` | - |
| 医疗 | `local_hospital` | - |
| 教育 | `school` | - |
| 通讯 | `phone` | - |
| 服饰 | `checkroom` | - |
| 其他支出 | `more_horiz` | - |

**收入分类**（默认 5 个）：

| 名称 | 图标 |
|---|---|
| 工资 | `payments` |
| 奖金 | `emoji_events` |
| 投资收益 | `trending_up` |
| 兼职 | `work` |
| 其他收入 | `more_horiz` |

预设数据在 `AppDatabase._insertDefaultData()` 中插入（schemaVersion=1 时执行）。

#### 3.7.4 页面结构

```
accounting/presentation/pages/
├── accounting_page.dart           # 记账概览（本月汇总 + 最近记录）
├── accounting_form_page.dart      # 新建/编辑记录
├── accounting_report_page.dart    # 月度报表（饼图/柱状图）
└── accounting_category_page.dart  # 分类管理
```

**空状态**：
- 无记账记录时：图标（`account_balance_wallet`，outlined，64px）+ "暂无记账记录" + "开始记账"按钮
- 无预算设置时：显示预算引导卡片"设置月度预算，掌控开支"

**大数据量分页**：
- 记账记录列表使用 `ListView.builder` + 滚动到底部加载更多
- 每页 30 条，按 `recordDate DESC` 排序
- 月度报表查询限定当月数据（`WHERE recordDate BETWEEN monthStart AND monthEnd`）
- 搜索结果同样分页，每页 20 条

### 3.7.5 各列表空状态与分页汇总

| 列表 | 空状态 | 分页策略 |
|---|---|---|
| 邮件列表 | 图标（`mail_outline`，64px）+ "暂无邮件" + "收取邮件"按钮 | 每页 30 条，滚动到底部加载更多 |
| 联系人列表 | 图标（`person_outline`，64px）+ "暂无联系人" + "添加联系人"按钮 | 每页 50 条，滚动到底部加载更多 |
| 笔记列表 | 图标（`note_outlined`，64px）+ "暂无笔记" + "创建笔记"按钮 | 每页 30 条，滚动到底部加载更多 |
| 任务看板/列表 | 图标（`task_alt`，64px）+ "暂无任务" + "创建任务"按钮 | 每页 30 条，滚动到底部加载更多 |
| Timeline | 图标（`timeline`，64px）+ "暂无动态" | 每页 50 条，滚动到底部加载更多 |
| 日志列表 | 图标（`bug_report_outlined`，64px）+ "暂无日志" | 每页 50 条，滚动到底部加载更多 |
| 搜索结果 | 图标（`search_off`，64px）+ "未找到相关结果" | 每页 20 条（由 SearchDao.limit 控制） |

### 3.8 股票

#### 3.8.1 功能

| 功能 | 说明 |
|---|---|
| 自选股管理 | 添加/删除自选股（代码+市场） |
| 实时行情 | 新浪财经 API 拉取最新价、涨跌幅 |
| 行情列表 | 按涨跌幅排序，显示代码/名称/最新价/涨跌幅 |
| 搜索添加 | 输入股票代码或名称搜索，支持 sh/sz/hk/us 市场 |

**数据策略**：自选股列表持久化到 drift `stocks` 表，行情数据内存持有不持久化，每次打开页面重新从 API 拉取。

#### 3.8.2 领域模型

```dart
enum StockMarket { sh, sz, hk, us }

class StockEntity {
  final int? id;
  final String code;        // 股票代码（如 600519、00700）
  final String name;        // 股票名称
  final StockMarket market; // 市场
  final DateTime addedAt;
}

/// 行情数据（内存持有，不持久化）
class StockQuote {
  final String code;
  final String name;
  final StockMarket market;
  final double currentPrice;   // 最新价
  final double changePercent;  // 涨跌幅（%）
  final double changeAmount;   // 涨跌额
  final double openPrice;      // 开盘价
  final double highPrice;      // 最高价
  final double lowPrice;       // 最低价
  final int volume;            // 成交量（手）
  final double turnover;       // 成交额（万元）
  final DateTime updateTime;   // 更新时间
}
```

#### 3.8.3 API 集成（新浪财经）

```dart
/// 新浪财经实时行情 API
/// URL: https://hq.sinajs.cn/list={market}{code}
/// 返回格式: var hq_str_sh600519="贵州茅台,1800.00,1795.00,...";
class SinaFinanceApi {
  /// 批量获取行情（单次请求最多 50 只）
  static Future<List<StockQuote>> fetchQuotes(List<StockEntity> stocks) async {
    if (stocks.isEmpty) return [];

    final codes = stocks.map((s) => '${s.market.name}${s.code}').join(',');
    final url = Uri.parse('https://hq.sinajs.cn/list=$codes');
    final response = await http.get(url, headers: {
      'Referer': 'https://finance.sina.com.cn',
    });

    return _parseResponse(response.body, stocks);
  }

  /// 搜索股票（新浪搜索 API）
  static Future<List<StockEntity>> search(String keyword) async {
    final url = Uri.parse(
      'https://suggest3.sinajs.cn/suggest/type=&key=$keyword',
    );
    final response = await http.get(url);
    return _parseSearchResults(response.body);
  }

  static List<StockQuote> _parseResponse(String body, List<StockEntity> stocks) {
    // 解析新浪行情响应
    // 每行格式: var hq_str_{market}{code}="name,open,prev_close,price,high,low,...";
    final lines = body.split('\n');
    final quotes = <StockQuote>[];
    for (final line in lines) {
      if (line.isEmpty) continue;
      // 解析逻辑...
    }
    return quotes;
  }
}
```

**API 限制**：
- 新浪财经 API 免费、无需认证、有频率限制（约 3 次/秒）
- 批量请求单次最多 50 只股票
- 仅支持 A 股（sh/sz）、港股（hk）、美股（us）

#### 3.8.4 缓存策略

```dart
/// 行情缓存：内存缓存 + 定时刷新
class StockQuoteCache {
  final Map<String, StockQuote> _cache = {};
  DateTime? _lastFetch;
  static const _cacheDuration = Duration(seconds: 30);

  /// 获取行情（优先缓存，过期则重新拉取）
  Future<List<StockQuote>> getQuotes(List<StockEntity> stocks) async {
    if (_lastFetch != null && DateTime.now().difference(_lastFetch!) < _cacheDuration) {
      return stocks.map((s) => _cache['${s.market.name}${s.code}']).whereType<StockQuote>().toList();
    }

    final quotes = await SinanceFinanceApi.fetchQuotes(stocks);
    for (final quote in quotes) {
      _cache['${quote.market.name}${quote.code}'] = quote;
    }
    _lastFetch = DateTime.now();
    return quotes;
  }

  void clear() {
    _cache.clear();
    _lastFetch = null;
  }
}
```

#### 3.8.5 页面结构

```
stocks/presentation/pages/
├── stocks_page.dart           # 自选股列表（行情卡片 + 下拉刷新）
└── stock_add_page.dart        # 添加股票（搜索 + 热门推荐）
```

**空状态**：
- 无自选股：图标（`show_chart`，outlined，64px）+ "暂无自选股" + "添加股票"按钮

**列表项**：
- 股票名称 + 代码
- 最新价（大字）
- 涨跌幅（红涨绿跌，百分比）
- 点击 → 跳转到行情详情（预留，MVP 可跳转到新浪财经网页版）

### 3.9 运动记录

#### 3.9.1 功能

| 功能 | 说明 |
|---|---|
| 手动记录 | 运动类型、时长、距离、卡路里、日期、备注 |
| 第三方同步 | 预留华为健康/Keep 同步接口（Phase 8） |
| 统计图表 | 周/月运动汇总（时长、距离、次数） |
| 运动提醒 | 可选定时提醒（设置页控制） |

#### 3.9.2 领域模型

```dart
/// 运动类型：running=跑步, cycling=骑行, fitness=健身
enum ExerciseType { running, cycling, fitness }

class ExerciseRecordEntity {
  final int? id;
  final ExerciseType type;
  final int durationMinutes;
  final double? distanceKm;
  final double? calories;
  final DateTime recordDate;
  final String? note;
  final DateTime createdAt;
}

/// 第三方同步状态
enum SyncSource { manual, huaweiHealth, keep }

/// 运动记录扩展：支持来源标记
class ExerciseRecordWithSource {
  final ExerciseRecordEntity record;
  final SyncSource source;
  final String? thirdPartyId;  // 第三方平台记录 ID（用于去重）
}
```

#### 3.9.3 第三方同步接口设计

```dart
/// 第三方运动数据同步接口
/// Phase 8 实现：华为健康（Android）、Keep（API）
abstract class ExerciseSyncService {
  /// 同步来源标识
  SyncSource get source;

  /// 检查是否已授权
  Future<bool> isAuthorized();

  /// 请求授权
  Future<bool> requestAuthorization();

  /// 拉取指定时间范围内的运动记录
  Future<List<ExerciseRecordWithSource>> fetchRecords({
    required DateTime since,
    DateTime? until,
  });

  /// 将本地记录推送到第三方平台（可选，双向同步时使用）
  Future<void> pushRecord(ExerciseRecordEntity record);
}

/// 华为健康同步（Android）
class HuaweiHealthSyncService implements ExerciseSyncService {
  @override
  SyncSource get source => SyncSource.huaweiHealth;

  // 基于 Huawei Health Kit API
  // 需要用户在华为健康 App 中授权
  // 支持读取：跑步、骑行、健身记录
  // 数据映射：华为运动类型 → ExerciseType
}

/// Keep 同步（HTTP API）
class KeepSyncService implements ExerciseSyncService {
  @override
  SyncSource get source => SyncSource.keep;

  // 基于 Keep 开放 API（需要用户登录）
  // 支持读取：跑步、骑行、健身记录
  // 数据映射：Keep 运动类型 → ExerciseType
}
```

**同步策略**：
- MVP 阶段仅支持手动记录，`syncFromThirdParty()` 返回空列表
- Phase 8 实现具体同步服务
- 同步时使用 `thirdPartyId` 去重，避免重复导入
- 同步方向：单向拉取（第三方 → EasyWork），不推送到第三方

#### 3.9.4 页面结构

```
exercise/presentation/pages/
├── exercise_page.dart         # 运动记录列表 + 统计图表
├── exercise_form_page.dart    # 新建/编辑运动记录
└── exercise_stats_page.dart   # 周/月统计详情
```

**空状态**：
- 今日无运动记录：图标（`fitness_center`，outlined，64px）+ "今日还没有运动记录" + "记录运动"按钮
- 历史无记录：图标 + "暂无运动记录" + "开始记录"按钮

### 3.10 设置

#### 3.10.1 设置项

| 分组 | 设置项 | 说明 |
|---|---|---|
| 通用 | 语言（中文/英文） | 应用语言 |
| 通用 | 主题（浅色/深色/跟随系统） | 主题模式 |
| 邮箱 | 新邮件通知开关 | 控制新邮件到达通知 |
| 邮箱 | 收取间隔（1/5/15/30分钟） | IMAP 轮询间隔，支持 IDLE 时此设置为备份 |
| 邮箱 | 同步天数（7/14/30/90天） | 首次同步的邮件时间范围 |
| 邮箱 | 同步数量限制（100/200/500/1000） | 首次同步的最大邮件数量 |
| 邮箱 | "邮箱账户"快捷跳转 | 跳转到邮箱模块账户管理页 |
| 数据 | 自动备份开关 | 每日自动备份 |
| 数据 | 备份路径 | 备份文件存储位置 |
| 数据 | 手动备份/恢复 | 触发备份或恢复数据 |
| 关于 | 版本号 | 仅显示，不可编辑 |
| 关于 | 开源许可 | 查看第三方库许可证 |

#### 3.10.2 设置存储

统一使用 drift `Settings` 表管理（KV 格式），不再使用 shared_preferences。

#### 3.10.3 设置页 UI 布局

```
设置页（/settings）：
├── 通用分组
│   ├── 语言 → 下拉选择（中文/英文）→ 切换后 App 重建
│   ├── 主题 → 下拉选择（浅色/深色/跟随系统）
│   └── 开机自启动 → Switch（仅 Windows，Android 隐藏）
├── 邮箱分组
│   ├── 新邮件通知 → Switch
│   ├── 收取间隔 → 下拉选择（1/5/15/30 分钟）
│   ├── 同步天数 → 下拉选择（7/14/30/90 天）
│   ├── 同步数量限制 → 下拉选择（100/200/500/1000）
│   └── 邮箱账户 → 点击跳转到账户管理页
├── 数据分组
│   ├── 自动备份 → Switch
│   ├── 备份路径 → 点击选择目录
│   └── 手动备份/恢复 → 两个按钮（备份/恢复）
├── 关于分组
│   ├── 版本号 → 仅显示
│   └── 开源许可 → 点击查看第三方库许可证
└── 日志分组
    └── 查看日志 → 点击跳转到日志页
```

---

## 4. 平台特性

### 4.1 平台能力检测

```dart
// core/platform/platform_capabilities.dart
class PlatformCapabilities {
  static bool get hasSystemTray => Platform.isWindows;
  static bool get hasBackgroundService => Platform.isAndroid;
  static bool get hasDeepLinks => Platform.isAndroid;
  static bool get hasShareIntent => Platform.isAndroid;
  static bool get hasAppShortcuts => Platform.isAndroid;
  static bool get hasAutoStart => Platform.isWindows;
  static bool get hasFileAssociation => Platform.isWindows;
}
```

**降级策略**：不可用平台直接隐藏相关入口/按钮。

### 4.2 Windows

#### 4.2.1 System Tray

| 技术选型 | 说明 |
|---|---|
| `system_tray` | 托盘图标、右键菜单、气泡通知 |
| `window_manager` | 窗口控制 |

**行为**：

```
点击关闭按钮 → 隐藏窗口到托盘（不退出）
双击托盘图标 → 显示主窗口
托盘右键菜单：
  ├── 显示 EasyWork
  ├── ─────────────
  ├── 新建任务           → show() + 导航到任务创建页
  ├── 写邮件             → show() + 导航到写邮件页
  ├── ─────────────
  └── 退出 EasyWork      → 释放资源（关闭 IMAP、取消定时器、关闭数据库）→ 退出
```

**托盘图标状态**：
- 常态：EasyWork 图标
- 新邮件：图标闪烁 + 气泡通知
- 点击气泡 → 打开主窗口 → 邮件详情

#### 4.2.2 Window Management

| 功能 | 实现 |
|---|---|
| 窗口大小/位置记忆 | `window_manager` 监听 resize/move，退出前写入 SettingsDao |
| 最小尺寸 | `setMinimumSize(800, 600)` |
| 启动行为 | 恢复上次位置/尺寸 |
| 关闭行为 | `on_window_close` → `setPreventClose(true)` → 隐藏到托盘 |

#### 4.2.3 后台收信

**底层实现**：每个邮箱账户对应一个 `MailDataSource`（封装 `MailClient`），
由 `mailDataSourcesProvider` 统一管理生命周期。

```
应用运行中（含托盘隐藏状态）:
  mailDataSourcesProvider 遍历所有已配置邮箱账户
    → 对每个账户的 MailClient:
      ├── 支持 IDLE → mailClient 长连接（自动重连）
      │   └── mailClient.eventBus.on<MailLoadEvent>() 监听新邮件
      └── 不支持 IDLE → mailClient.startPolling(interval: Duration(minutes: 5))
          └── 轮询新邮件
    → MailLoadEvent 触发 → 下载 MIME → 写入 drift → 触发 NewEmailReceivedEvent
    → 触发通知弹窗 → Dashboard 未读数更新
```

IMAP 凭据读取：并行读取所有账户密码，再并行建立 `MailClient` 连接。

`MailClient` 内置自动重连（指数退避），通过 `MailConnectionLostEvent`
和 `MailConnectionReEstablishedEvent` 通知应用层。

#### 4.2.4 Windows 自启动

可选设置项：`设置 → 通用 → 开机自启动`

```
开启 → 写注册表 Run 键：
  HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
  EasyWork = "C:\path\to\easywork.exe"
关闭 → 删除该注册表项
```

#### 4.2.5 文件关联

| 文件类型 | 关联操作 |
|---|---|
| `.vcf` | 双击用 EasyWork 打开 → 导入联系人 |
| （未来）`mailto:` | 点击 mailto 链接 → 打开写邮件页 |

### 4.3 Android

#### 4.3.0 权限请求

| 权限 | 用途 | 请求时机 | 拒绝后降级 |
|---|---|---|---|
| `INTERNET` | 网络访问 | 自动授予（普通权限） | 无法使用邮箱/股票；邮箱模块入口显示"网络不可用"提示；股票页面显示离线空状态 |
| `ACCESS_NETWORK_STATE` | 网络状态检测 | 自动授予 | 默认视为在线 |
| `POST_NOTIFICATIONS` | 通知（Android 13+） | 首次启动时请求 | 关闭通知入口 |
| `RECEIVE_BOOT_COMPLETED` | 开机自启 | 设置页开启时请求 | 无法开机自启 |
| `READ/WRITE_EXTERNAL_STORAGE` | 文件导入导出 | 首次使用文件操作时请求 | 无法导入导出 VCF/备份 |

```dart
// 权限请求工具类
class PermissionHelper {
  static Future<bool> requestNotificationPermission() async {
    if (Platform.isAndroid) {
      final status = await Permission.notification.request();
      if (status.isDenied) {
        // 显示说明弹窗："通知权限被拒绝，新邮件和任务提醒将无法显示。您可以稍后在系统设置中开启。"
        return false;
      }
      if (status.isPermanentlyDenied) {
        // 显示说明弹窗："通知权限被永久拒绝，请在系统设置中开启。" + 跳转设置按钮
        return false;
      }
    }
    return true;
  }

  static Future<bool> requestStoragePermission() async {
    if (Platform.isAndroid) {
      // Android 13+ 使用细粒度权限
      final status = await Permission.photos.request();
      if (status.isDenied || status.isPermanentlyDenied) {
        // 显示说明弹窗
        return false;
      }
      // Android 12 及以下使用传统存储权限
      final legacyStatus = await Permission.storage.request();
      if (legacyStatus.isDenied || legacyStatus.isPermanentlyDenied) {
        // 显示说明弹窗
        return false;
      }
    }
    return true;
  }
}
```

**权限拒绝后的降级策略**：
- 通知权限拒绝 → 邮箱模块设置页显示"通知权限未开启"警告，点击跳转系统设置
- 存储权限拒绝 → VCF 导入/导出按钮禁用，备份导出按钮禁用
- 所有权限拒绝不影响本地功能（任务/笔记/记账/运动）

#### 4.3.1 Background Service

| 技术选型 | 说明 |
|---|---|
| `workmanager` | 后台周期性任务，最低 15 分钟间隔 |

**轻量触发模式**：WorkManager 运行在隔离进程中，无法直接访问 MailClient 实例和 drift 数据库。
因此 WorkManager 仅做轻量触发（检查未读数 + 弹出通知），完整的 MailClient 连接由前台应用管理。

```dart
Workmanager().registerPeriodicTask(
  'email-fetch',
  'backgroundEmailFetch',
  frequency: Duration(minutes: 15),
  constraints: Constraints(networkType: NetworkType.connected),
);

// Dart 层回调（Top-level 函数，非 Provider 上下文）
@pragma('vm:entry-point')
void backgroundEmailFetch() async {
  // 1. 从 flutter_secure_storage 读取所有账户密码
  // 2. 从 flutter_secure_storage 读取账户连接配置（JSON）
  //    （注：隔离进程无法直接访问 drift 数据库文件，因此账户配置需预存到安全存储）
  // 3. 创建临时 MailClient → connect() → selectInbox() → fetchMessages(count: 1)
  // 4. 对比本地最新 messageId，判断是否有新邮件
  // 5. 有新邮件 → 弹出本地通知（不写入 drift，前台打开时再同步）
  // 6. disconnect() → 释放资源
}

// 注意：WorkManager 运行在隔离进程中，无法访问 drift 数据库（可能存在锁冲突）。
// 因此后台任务仅做新邮件检测通知，不做完整同步。完整同步在应用恢复前台时由 MailDataSource 执行。
// 账户配置需在主进程中预存到 flutter_secure_storage，供后台任务读取。
```

**注意**：Android 应用被杀后 WorkManager 任务仍可存活（系统调度），但隔离进程无法访问 drift 数据库文件（可能存在锁冲突）。因此后台任务仅做新邮件检测通知，不做完整同步。完整同步在应用恢复前台时由 `MailDataSource` 执行。

#### 4.3.2 App Shortcuts

```xml
<shortcuts>
  <shortcut android:shortcutId="new_task" ...>
    <intent android:data="easywork://tasks/new" />
  </shortcut>
  <shortcut android:shortcutId="compose_email" ...>
    <intent android:data="easywork://email/compose" />
  </shortcut>
  <shortcut android:shortcutId="quick_accounting" ...>
    <intent android:data="easywork://accounting/new" />
  </shortcut>
</shortcuts>
```

#### 4.3.3 Deep Links

| URI | 目标 |
|---|---|
| `easywork://tasks/new` | 新建任务 |
| `easywork://tasks/:id` | 任务详情 |
| `easywork://email/compose` | 写邮件 |
| `easywork://email/:id` | 邮件详情 |
| `easywork://accounting/new` | 快速记账 |

#### 4.3.4 Share Intent

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="text/plain" />
</intent-filter>
```

从其他 App 分享文字 → EasyWork 弹出选择：创建笔记 / 创建任务。

### 4.4 Windows 通知

| 通知类型 | 触发条件 | 点击行为 | 按钮操作 |
|---|---|---|---|
| 新邮件 | IMAP 收取到新邮件 | 打开主窗口 → 邮件详情 | "标记已读"、"转为任务" |
| 任务到期 | 定时检查截止日期 | 打开主窗口 → 任务详情 | "标记完成"、"推迟一天" |
| 数据备份 | 每日备份完成 | 打开设置页 | - |

---

## 5. 测试策略

### 5.1 测试金字塔

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
| DAO (drift) | 极快 | 覆盖所有 DAO 方法 | `NativeDatabase.memory()` |
| Repository / UseCase | 极快 | 覆盖所有业务逻辑 | `mocktail` |
| Provider (Riverpod) | 快 | 覆盖所有 Provider 核心路径 | `ProviderContainer` |
| Widget | 中等 | 覆盖所有 Page + 关键 Widget | `ProviderScope` + `pumpWidget` |
| Integration | 慢 | 3-5 条核心用户流 | `integration_test` |

### 5.2 目录结构

```
test/
├── core/
│   ├── event_bus_test.dart
│   └── errors/
│       └── result_test.dart
├── features/
│   ├── email/
│   │   ├── data/dao/email_dao_test.dart
│   │   ├── data/repositories/email_repository_impl_test.dart
│   │   └── presentation/providers/
│   │       ├── email_list_provider_test.dart
│   │       └── unread_count_provider_test.dart
│   ├── task_board/
│   │   ├── data/dao/task_dao_test.dart
│   │   ├── data/repositories/task_repository_impl_test.dart
│   │   └── presentation/providers/task_list_provider_test.dart
│   ├── notes/
│   │   └── ...
│   ├── accounting/
│   │   └── ...
│   └── ...
├── shared/widgets/
│   └── responsive_grid_test.dart
└── integration_test/
    ├── app_flow_test.dart
    ├── email_to_task_test.dart
    ├── vcf_import_test.dart
    └── kanban_drag_test.dart
```

### 5.3 测试关注点矩阵

| 模块 | 核心测试关注点 |
|---|---|
| 邮箱 | IMAP 收信、邮件→任务联动、VCF导入/导出（含编码检测）、签名切换 |
| 任务看板 | CRUD、周期任务生成、看板拖拽、三视图切换 |
| Dashboard | 跨模块数据聚合 |
| 事件总线 | 发布/订阅、错误隔离、dispose 时清理 |
| 响应式UI | NavigationRail ↔ Drawer 切换、Grid 列数自适应、更多折叠 |
| 数据层 | 数据库迁移正确性、DAO 查询/写入、Repository 异常处理 |
| 搜索 | FTS5 全文搜索、多模块聚合、防抖 |
| 备份 | 双重校验逻辑、自动清理过期备份 |
| 安全 | 凭据加密存储、日志脱敏 |

### 5.4 持续集成

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

---

## 6. 开发路线

### Phase 0：项目脚手架

Flutter 初始化、目录结构、drift + Riverpod 配置、主题系统、国际化（中英双语）、响应式布局框架、EventBus 核心、错误处理框架、平台能力检测。

#### Phase 0 详细检查清单

**1. Flutter 项目初始化**
- [ ] `flutter create --org com.easywork easy_work`
- [ ] `pubspec.yaml` 配置最低 SDK 版本、依赖（drift, riverpod, enough_mail, go_router 等）
- [ ] 配置 `analysis_options.yaml`（lint 规则）

**2. 目录结构（Clean Architecture + Feature-first）**
```
lib/
├── core/                    # 核心通用代码
│   ├── config/              # App配置（theme, routes, constants）
│   ├── error/               # 异常与失败类
│   ├── event/               # EventBus 核心实现
│   ├── provider/            # 核心 Provider（appDatabase, connectivity, notification等）
│   ├── router/              # go_router 路由配置
│   ├── theme/               # Material 3 主题、响应式断点
│   └── utils/               # 工具类（date, string, platform等）
├── data/                    # 数据层
│   ├── dao/                 # Drift DAO 类
│   ├── datasource/          # 邮箱连接器、API 等数据源
│   ├── database/            # AppDatabase、Migration、表定义
│   ├── model/               # 数据模型（DTO、API 模型）
│   └── repository/          # Repository 实现
├── domain/                  # 领域层
│   ├── entity/              # 领域实体
│   ├── repository/          # Repository 接口（abstract class）
│   └── usecase/             # 用例（可选）
├── presentation/            # 表现层
│   ├── page/                # 页面
│   ├── widget/              # 可复用组件
│   ├── provider/            # Riverpod providers
│   └── state/               # 页面状态类
└── shared/                  # 跨模块共享
    ├── widget/              # 通用组件（empty_state, loading, error）
    └── extension/           # Dart 扩展方法
```

**3. 数据库（drift）**
- [ ] `AppDatabase` 类定义，注册所有表
- [ ] Migration 实现（case 1: 初始建表，case 2: schemaVersion 2+ 变更）
- [ ] 各表 `Table` 类定义（Emails, Contacts, Tasks, Notes 等）
- [ ] `DatabaseConnection` 配置（支持 driftIsolate 多 isolate）

**4. 状态管理（Riverpod）**
- [ ] `ProviderScope` 在 `main()` 中包裹
- [ ] 核心 Provider 定义：`appDatabaseProvider`, `connectivityProvider`, `notificationServiceProvider`
- [ ] 各模块 Repository Provider 定义
- [ ] 状态类设计（AsyncValue 模式）

**5. 主题系统**
- [ ] `MaterialColorSwatchGenerator` 创建主色板
- [ ] `ThemeData.light()` / `ThemeData.dark()` 定义
- [ ] 响应式断点类（`Breakpoints`）
- [ ] 暗色模式切换逻辑（`ThemeMode`）

**6. 国际化（中英双语）**
- [ ] `AppLocalizations` 生成（`flutter_localizations` + ARB 文件）
- [ ] 支持语言：`Locale('zh', 'CN')`, `Locale('en', 'US')`
- [ ] 语言切换逻辑（保存到 Settings 表）

**7. 路由（go_router）**
- [ ] `GoRouter` 配置，注册所有路由
- [ ] 底部导航栏路由（shell route）
- [ ] 响应式路由：桌面侧栏 / 移动端底部导航

**8. EventBus 核心**
- [ ] `EventBus` 单例实现
- [ ] 各事件类定义（NewEmailReceivedEvent, TaskStatusChangedEvent 等）
- [ ] 事件注册与取消订阅

**9. 错误处理框架**
- [ ] `AppException` 基类（网络异常、数据异常、业务异常等）
- [ ] 全局错误捕获（`FlutterError.onError` + `runZonedGuarded`）
- [ ] 错误上报机制（日志写入 drift Logs 表）

**10. 平台能力检测**
- [ ] 平台判断（Windows / Android / Web）
- [ ] 权限请求封装（通知、存储、网络等）
- [ ] 平台特定初始化（Windows 托盘、Android 通知渠道）

**11. 工具类**
- [ ] `PlatformUtil`（判断平台、桌面/移动）
- [ ] `DateUtil`（日期格式化、农历转换）
- [ ] `ConnectivityUtil`（网络状态检测）

**12. 通用组件**
- [ ] `EmptyStateWidget`（空状态占位组件）
- [ ] `LoadingWidget`（加载动画）
- [ ] `ErrorWidget`（错误展示组件）
- [ ] `ConfirmDialog`（确认对话框）

### Phase 1：UI 骨架 + 导航

所有功能的 UI 空状态占位页面 + 导航切换（侧栏 + Drawer），含：
- 核心模块：Dashboard、任务看板、日历、邮箱、笔记、记账
- 更多模块：Timeline、股票（空状态）、运动（空状态）、日志、设置

### Phase 2：邮箱模块

账户配置 → IMAP 收信 → 邮件列表/详情 → 联系人 CRUD + VCF（含编码检测）→ 签名 → 邮件→任务联动 → 账户并行连接。

### Phase 3：任务看板

任务 CRUD、看板/列表/日历视图、拖拽排序、周期任务（RRULE）。

### Phase 4：Dashboard + Timeline

Dashboard 固定卡片聚合 + Timeline 事件持久化（logs → timeline_events 派生）。

### Phase 5：日历

农历 + 中国节假日 + 任务标记 + 拖拽调整截止日。

### Phase 6：笔记 + 记账

笔记（富文本编辑器 + FTS5 搜索 + 标签关联表）+ 记账（收支 + 预算 + 月度报表）。

### Phase 7：日志 + 设置 + 备份 + Windows 托盘

日志查看页 + 设置（drift Settings 表）+ 自动备份 + Windows 托盘常驻 + 后台收信 + 通知系统。

### Phase 8：扩展模块（优先级待定）

股票行情（新浪财经 API）、钉钉日历同步、华为健康/Keep 运动同步。

---

## 附录

> **附录位置说明**：附录 A/B 包含完整数据流示例和关键原则总结，作为后续第 7 章补充工作流的参考上下文，因此放置在第 6 章之后、第 7 章之前。

### A. 完整数据流示例

#### 新邮件 → 通知 + Dashboard + Timeline + Logs

```
MailClient 通过 IDLE/轮询发现新邮件
  → mailClient.eventBus 发出 MailLoadEvent
  → MailDataSource 接收 MailLoadEvent（桥接层）：
      → 立即发布 NewEmailReceivedEvent（localEmailId=0，仅作为通知信号）
  → EmailRepositoryImpl 收到 NewEmailReceivedEvent 后：
      ├── 下载完整 MIME 消息（mailClient.fetchMessage）
      ├── 存入 drift emails 表（含 bodyText/bodyHtml/附件元数据）
      ├── 写入 logs 表（action: 'email_received'）
      └── 同时写入 timeline_events（派生记录）
  → （可选）发布第二个 NewEmailReceivedEvent（带正确 localEmailId）供需要 ID 的订阅者使用
  │
  ├── Timeline 订阅 → UI 重建：时间线新增记录
  ├── Dashboard 订阅 → 未读数 +1
  ├── Notification → Windows 弹窗 / Android 通知栏
  └── Logs 底表已有记录
```

#### 用户完成任务

```
拖拽卡片到 "已完成" 列
  → ref.read(taskRepositoryProvider.future).then((repo) => repo.updateStatus(taskId, 'done', 'in_progress'))
  │
  ├── drift: UPDATE tasks SET status='done' WHERE id=? AND updated_at=?
  │   → 影响 0 行 → 说明被其他端修改 → SnackBar 提示"数据已被其他设备修改，请刷新后重试"
  │
  ├── 写入 logs 表（action: 'task_status_changed'）
  │   → 同时写入 timeline_events
  │
  ├── eventBus.publish(TaskStatusChangedEvent(...))
  │   ├── Dashboard → 待办数减少
  │   ├── Timeline → UI 重建
  │   └── Notification → 无（已完成不需要提醒）
  │
  └── ref.invalidateSelf() → UI 重建：看板刷新
```

#### TaskRepository 接口定义

```dart
abstract class TaskRepository {
  Future<void> createTask(TaskEntity task);
  Future<void> updateTask(TaskEntity task);
  Future<void> updateStatus(int taskId, String newStatus, String oldStatus);
  Future<void> deleteTask(int taskId);
  Future<void> updateDueDate(int taskId, DateTime? newDate);
  Future<List<TaskEntity>> getAllTasks();
  Future<List<TaskEntity>> getTasksByStatus(String status);
}

class TaskRepositoryImpl implements TaskRepository {
  final TaskDao _taskDao;
  final EventBus _eventBus;

  TaskRepositoryImpl(this._taskDao, this._eventBus);

  @override
  Future<void> updateStatus(int taskId, String newStatus, String oldStatus) async {
    final rows = await _taskDao.updateStatusWithOptimisticLock(
      taskId: taskId,
      newStatus: newStatus,
      oldStatus: oldStatus,
    );
    if (rows == 0) {
      throw OptimisticLockException();
    }
    _eventBus.publish(TaskStatusChangedEvent(
      taskId: taskId,
      title: '',
      oldStatus: oldStatus,
      newStatus: newStatus,
    ));
  }
  // ... 其他方法实现
}
```

### B. 关键原则总结

- **YAGNI**：不在 MVP 阶段做非必要的功能
- **模块自治**：每个模块独立，通过 EventBus 通信
- **单一数据源**：设置统一进 drift，日志统一进 logs，Timeline 从 logs 派生
- **平台降解**：不可用平台直接隐藏入口
- **增量验证**：每个阶段完成后验证
- **同步预留**：Repository 接口预留，但 MVP 仅本地实现

---

## 7. 补充工作流

### 7.1 IMAP 自动发现

利用 enough_mail 内置的 `Discover.discover(email)` 方法：

```
用户输入邮箱地址（如 zhangsan@163.com）
  → final config = await Discover.discover(email, isLogEnabled: false);
  → config 为 null → 用户手动输入配置（host/port/ssl）
  → config 不为 null →
    final account = MailAccount.fromDiscoveredSettings(
      name: 'my account',
      email: email,
      password: password,
      config: config,
      userName: email.split('@').first,
    );
    // MailAccount 自动填充 IMAP/SMTP host/port/ssl/authMechanism
    自动填充到 UI 表单
  → 用户可手动修改自动发现的配置
  → 输入密码 → 测试连接（mailClient.connect()）→ 成功则保存账户
```

`Discovered` 支持 IMAP/POP3/SMTP 的服务发现（基于 DNS SRV 和 MX 记录），
覆盖常见邮箱（163、QQ、Gmail、Outlook 等）。无需手动维护内置配置表。

### 7.1a 邮箱账户连接失败处理

**底层机制**：`MailClient.connect()` 内部使用 `ImapClient`/`SmtpClient`，
抛出 `MailException` 或 `ImapException`/`SmtpException`（均继承 `BaseMailException`）。
EasyWork 将协议异常翻译为用户消息。

```
测试连接按钮 → 显示 CircularProgressIndicator
  → mailClient.connect() 尝试（超时 10 秒）
  → 失败时：
    ├── ImapException.authFailed → 错误提示："邮箱地址或密码错误，请检查后重试"
    ├── ImapException.connectionFailed / SocketException → 错误提示："无法连接到邮件服务器，请检查网络和服务器地址"
    ├── TimeoutException → 错误提示："连接超时，请检查网络状态"
    ├── ImapException.sslError / HandshakeException → 错误提示："SSL 证书验证失败，可能需要使用非标准端口"
    └── BaseMailException / 其他 → 错误提示："连接失败：{error.userMessage}"

  → 底部显示"诊断信息"折叠区域（`kDebugMode` 为 true 时始终展开）：
    ├── 服务器地址:xxx 端口:xxx SSL:xxx
    ├── 错误类型: xxx (imap/smtp)
    └── 技术详情: xxx（脱敏后的异常信息，error.technical）

  → 用户可：
    ├── 修改配置后重新测试
    └── 取消添加
```

### 7.1b 邮件发送失败处理

**底层机制**：`mailClient.sendMessage(mimeMessage)` 内部使用 `SmtpClient`，
抛出 `SmtpException`（继承 `BaseMailException`）。

```
SMTP 发送 → 显示发送中状态（按钮替换为 CircularProgressIndicator）
  → 失败时：
    ├── SmtpException.authFailed → SnackBar："发送失败：邮箱认证错误" → 保持编辑状态
    ├── SmtpException / SocketException → SnackBar："发送失败：无法连接邮件服务器" → 保持编辑状态
    ├── TimeoutException → SnackBar："发送失败：发送超时" → 保持编辑状态
    └── BaseMailException / 其他 → SnackBar："发送失败：{error.userMessage}" → 保持编辑状态

  → 用户可：
    ├── 重试发送（不丢失编辑内容）
    ├── 保存为草稿（保存到 drafts 文件夹）
    └── 放弃编辑
```

### 7.2 邮件文件夹

**MVP 文件夹体系**（本地映射 IMAP 标准文件夹）：

| 文件夹 | folder 值 | 说明 | IMAP 映射 |
|---|---|---|---|
| 收件箱 | `inbox` | 默认文件夹 | INBOX |
| 已发送 | `sent` | 发送的邮件 | Sent |
| 草稿 | `drafts` | 未发送的草稿 | Drafts |
| 垃圾邮件 | `junk` | 垃圾/垃圾邮件 | Junk |
| 已删除 | `trash` | 删除后移至此处 | Trash |

**文件夹操作**：

```
删除操作：
  ├── 收件箱/已发送/草稿 → 移至"已删除"文件夹（folder='trash'）
  └── 已删除中删除 → 彻底删除（从 drift 中移除 + 释放附件空间）

移动操作：
  邮件详情/列表长按 → "移动到"菜单
  → 可选文件夹：收件箱/已发送/草稿/垃圾邮件/已删除
  → 确认 → UPDATE emails SET folder = '新文件夹'

标记为垃圾邮件：
  → 等同于移动到 junk 文件夹
```

**IMAP 同步映射**（未来扩展）：
- 本地 folder 值与 IMAP 文件夹名称的映射关系存储在 `EmailAccounts` 表中
- MVP 阶段仅本地操作，不做 IMAP 文件夹同步（如 COPY/STORE FLAGS）
- Phase 8 可选：添加"IMAP 文件夹同步"开关，开启后本地删除/移动操作同步到服务器

### 7.3 草稿保存

```
写邮件页面（compose_page）：
  ├── 自动保存：每 30 秒检测表单有变更 → 保存到 emails 表（folder='drafts'）
  ├── 手动保存：点击"存草稿"按钮 → 立即保存
  ├── 保存逻辑：
  │   ├── 新草稿：INSERT INTO emails (folder='drafts', ...)
  │   └── 已有草稿：UPDATE emails SET ... WHERE id=draftId
  └── 退出确认：有未保存变更时 pop 确认弹窗（"放弃编辑？" → 放弃/存草稿）

草稿续编：
  打开草稿 → 加载到 compose_page → 继续编辑
  发送成功 → 删除对应草稿
```

### 7.4 任务子任务

```
任务详情页 → "添加子任务"按钮
  → 弹出简化表单（仅标题 + 优先级，无周期）
  → 创建任务，parentTaskId = 当前任务 id
  → 子任务在详情页以缩进列表展示（最多显示 5 条，超出折叠）

父任务详情页：
  ├── 子任务列表（缩进显示，状态同步显示）
  ├── 子任务进度：父任务的 progressPercentage = 已完成子任务数/总子任务数 * 100
  └── 删除父任务 → 确认弹窗："连同 N 个子任务一起删除？"

看板视图：子任务不独立显示在看板列中，仅在父任务卡片上显示进度条
```

### 7.5 联系人"从发件人添加"

```
邮件详情页 → 发件人姓名/地址旁的"+"按钮
  → 检查该邮箱地址是否已存在于联系人中
  ├── 已存在 → SnackBar 提示"联系人已存在"
  └── 不存在 → 打开联系人编辑表单
      → 自动填充：displayName = fromName, emailAddresses = [fromAddress]
      → 用户补充其他信息 → 保存
      → SnackBar 提示"已添加联系人"
```

### 7.6 邮件回复

**底层实现**：使用 enough_mail `MessageBuilder` + `MailClient.sendMessage()`。

```
邮件详情页 → "回复"按钮
  → 创建 MessageBuilder（基于原 MimeMessage）：
    final builder = MessageBuilder.prepareReplyToMessage(
      originalMessage,
      MailAddress('我的名字', 'my@email.com'),
    );
    // 自动设置：to = original.from, subject = "Re: " + original.subject
    // 引用原文、保持原邮件 ID 关联（In-Reply-To / References 头）
  → 打开 compose_page（回复模式）：
    ├── 收件人：自动填充（来自 MailAddress）
    ├── 主题：自动预填 "Re: xxx"
    ├── 签名：自动插入默认签名（可切换/删除）
    └── 正文区域上方引用原文（由 prepareReplyToMessage 自动处理）：
        ┌─────────────────────────────┐
        │ [签名区域]                  │
        │                             │
        │ ── 原始邮件 ──              │
        │ 发件人: xxx                 │
        │ 日期: xxx                   │
        │ 主题: xxx                   │
        │                             │
        │ [原文正文内容]              │
        └─────────────────────────────┘
  → 用户编辑回复内容 → builder.buildMimeMessage() → mailClient.sendMessage()
  → 发送成功 → 返回邮件详情页 → SnackBar "回复已发送"
```

### 7.7 邮件转发

**底层实现**：使用 enough_mail `MessageBuilder.prepareForwardMessage()` + `MailClient.sendMessage()`。

```
邮件详情页 → "转发"按钮
  → 创建 MessageBuilder（基于原 MimeMessage）：
    final builder = MessageBuilder.prepareForwardMessage(originalMessage);
    // 自动设置：subject = "Fwd: " + original.subject
    // 自动附加原邮件所有附件
  → 打开 compose_page（转发模式）：
    ├── 收件人：空（用户手动填写）
    ├── 主题：自动预填 "Fwd: xxx"
    ├── 签名：不自动插入（转发场景通常不需要）
    └── 正文区域上方引用原文（由 prepareForwardMessage 自动处理）：
        ┌─────────────────────────────┐
        │ ── 转发邮件 ──              │
        │ 发件人: xxx                 │
        │ 日期: xxx                   │
        │ 主题: xxx                   │
        │ 收件人: xxx                 │
        │                             │
        │ [原文正文内容]              │
        └─────────────────────────────┘
  → 附件处理：原邮件附件自动附加（可删除）
  → 用户填写收件人 → 编辑内容 → builder.buildMimeMessage() → mailClient.sendMessage()
  → 发送成功 → 返回邮件详情页 → SnackBar "转发已发送"
```

### 7.8 记账快速录入

```
触发方式：
  ├── Android Deep Link: easywork://accounting/new
  ├── Android App Shortcut: 长按图标 → "快速记账"
  └── Dashboard 卡片快捷按钮

快速录入流程：
  → 打开简化记账表单（BottomSheet 或独立页面）
  → 默认：支出、今天、常用分类（最近5个）
  → 必填：金额（自动聚焦数字键盘）、分类
  → 可选：备注
  → 保存 → SnackBar 确认 → 自动关闭
  → EventBus 发布 TransactionRecordedEvent
```

### 7.9 数据恢复完整流程

```
设置 → 数据 → 恢复
  → 选择备份文件（file_picker）
  → 校验文件：
    ├── 文件格式校验（是否为合法的 EasyWork 备份 JSON：检查顶层 "version" 和 "data" 字段）
    ├── 版本校验（备份版本是否兼容当前版本：major version 必须一致）
    ├── 数据完整性预校验（检查必需表是否存在、记录数是否合理）
    └── 校验失败 → 错误提示（具体原因：格式错误/版本不兼容/数据损坏），中止
  → 显示备份摘要：备份日期、包含记录数（任务/邮件/笔记等数量）
  → 确认弹窗：
    "恢复将覆盖当前所有数据，且不可撤销。是否继续？"
    → 取消 → 中止
    → 确认 → 执行恢复
      1. 先自动备份当前数据库（以防恢复后后悔）
      2. 清空当前所有表
      3. 导入备份数据（不含密码，密码存储在 flutter_secure_storage 中）
      4. 校验导入完整性（记录数是否匹配）
      ├── 成功 → 重载 Widget 树（Navigator.pushReplacementNamed('/') + ref.invalidateAll()），数据已替换生效
      └── 失败 → 回滚到步骤1的自动备份，提示"恢复失败，已回滚"

密码处理说明：
  备份 JSON 中不包含邮箱密码（密码存储在系统级安全存储 flutter_secure_storage 中）
  恢复后邮箱账户配置会导入，但密码字段为空
  → 应用检测逻辑：遍历 EmailAccounts 表中所有账户，尝试从 flutter_secure_storage 读取对应密码
    → 检测到有账户但读取密码为 null 时：
      → 邮箱模块入口显示红色徽标（未配置警告）
      → 进入邮箱模块后，账户列表中该账户显示红色感叹号 + "需要重新输入密码"提示
      → 用户点击 → 弹出密码输入对话框 → 输入密码 → 测试连接 → 成功则更新 flutter_secure_storage
      → 恢复完成后红色警告消失
```

### 7.10 邮件 HTML 渲染管线

#### 渲染流程

```
MimeMessage (enough_mail)
    │
    ├── 已下载完整正文 ──→ MimeMessageViewer
    │                         │
    │                         ├── 内部调用 transformToHtml() (enough_mail_html)
    │                         │   → MimeMessage 转可渲染 HTML
    │                         │   → 处理内联图片 (cid:// 协议)
    │                         │   → 纯文本到 HTML 转换
    │                         │
    │                         └── flutter_inappwebview 渲染 HTML
    │
    └── 仅有 Envelope ──→ MimeMessageDownloader
                              │
                              ├── mailClient.fetchMessageContents()
                              │   → 下载完整 MIME
                              │
                              └── 完成后 → MimeMessageViewer 渲染
```

#### TransformConfiguration 默认配置

```dart
final config = TransformConfiguration.create(
  blockExternalImages: false,      // 默认不阻止外部图片
  emptyMessageText: '（空邮件）',
  preferPlainText: false,          // 优先 HTML
  enableDarkMode: isDarkMode,      // 暗色模式适配
  maxImageWidth: 600,              // 限制内联图片宽度
  customDomTransformers: [],       // EasyWork 可注入样式覆盖
);
```

**设置项控制**：Settings 表新增 `email_block_external_images` 键，默认 `false`。用户开启后，`blockExternalImages` 切换为 `true`。

#### MimeMessageDownloader 集成

```dart
MimeMessageDownloader(
  mimeMessage: mimeMessage,                    // 仅有 envelope
  mailClient: mailClient,                      // MailClient 实例
  onDownloaded: (msg) {
    upsertFullMessage(msg, accountId); // 持久化到本地（需 accountId）
  },
  blockExternalImages: blockExternalImages,    // 从 Settings 读取
  markAsSeen: true,                            // 自动标记已读
  mailtoDelegate: handleMailto,                // mailto: 链接处理
  fetchMessageContents: mailClient.fetchMessageContents,  // 关键：内容下载委托
);
```

**注意**：`fetchMessageContents` 是 enough_mail_flutter 要求的委托参数，类型为 `Future<MimeMessage> Function(MimeMessage, {List<MediaToptype>? includedInlineTypes, bool markAsSeen, int? maxSize, Duration? responseTimeout})`。`MailClient.fetchMessageContents` 方法签名完全匹配，直接传入即可。Widget 内部在需要时调用此委托下载完整 MIME，完成后通过 `onDownloaded` 回调通知。

#### MimeMessageViewer 集成（已下载内容）

```dart
MimeMessageViewer(
  mimeMessage: mimeMessage,
  blockExternalImages: blockExternalImages,
  mailtoDelegate: handleMailto,
  preferPlainText: false,
  enableDarkMode: isDarkMode,
);
```

#### 内联图片处理

`enough_mail_html` 将内联附件（Content-ID）转换为 `cid://` 链接。`MimeMessageViewer` 内部通过 `flutter_inappwebview` 的自定义 URL scheme 处理，从 `MimePart` 提取二进制数据渲染。

#### 暗色模式适配

`enough_mail_html` 的 `enableDarkMode` 在生成 HTML 中注入暗色背景和文字颜色适配样式。EasyWork 主题切换 Provider 需将当前模式传递给 `MimeMessageViewer`。

### 7.11 MailClient 连接管理

#### 连接生命周期

```
MailAccount (配置)
    │
    ▼
MailClient (高级 API)
    │
    ├── connect()              → 建立 IMAP 连接 + 登录
    ├── selectInbox()          → 选择收件箱
    ├── fetchMessages()        → 首次同步
    │
    ├── 支持 IDLE？
    │   ├── 是 → MailClient 内部自动 IDLE
    │   │         → MailLoadEvent 推送新邮件
    │   │         → 断开自动重连（指数退避）
    │   └── 否 → startPolling(interval: Duration(minutes: 5))
    │             → 定期 fetchMessages 对比 UID
    │
    ├── eventBus.on<MailLoadEvent>()                    → 新邮件
    ├── eventBus.on<MailUpdateEvent>()                  → 标记变更
    ├── eventBus.on<MailVanishedEvent>()                → 邮件删除
    ├── eventBus.on<MailConnectionLostEvent>()          → 连接丢失
    └── eventBus.on<MailConnectionReEstablishedEvent>() → 重连成功
```

#### EasyWork EventBus 桥接

**MailDataSource 已在 2.2.16 中统一定义**，包含 EventBus 桥接逻辑。此处不再重复定义。

```dart
// MailDataSource.connect() 内部已自动桥接：
//   MailClient.eventBus → EasyWork EventBus
//   MailLoadEvent → NewEmailReceivedEvent
//   MailConnectionLostEvent → EmailConnectionLostEvent
//   MailConnectionReEstablishedEvent → EmailConnectionReestablishedEvent
```

#### IDLE 实现

```dart
bool get supportsIdle => _client.isIdleSupported;

Future<void> startListening() async {
  if (supportsIdle) {
    // MailClient 内部自动管理 IDLE 会话
    // 新邮件通过 MailLoadEvent 推送
  } else {
    await _client.startPolling(
      interval: Duration(minutes: _pollIntervalMinutes),
    );
  }
}
```

#### 自动重连

`MailClient` 内置自动重连（指数退避），通过 `MailConnectionLostEvent` 和 `MailConnectionReEstablishedEvent` 通知应用层。EasyWork 不需要自行实现重连逻辑。

#### 多账户并行连接

```dart
// 通过 MailDataSourcesNotifier 统一管理所有账户连接
// 在应用启动时调用：
final accounts = await emailDao.getAllAccounts();
await ref.read(mailDataSourcesProvider.notifier).connectAll(accounts);

// 单个账户操作：
// 添加账户
await ref.read(mailDataSourcesProvider.notifier).addAccount(newAccount);
// 移除账户
await ref.read(mailDataSourcesProvider.notifier).removeAccount(accountId);
// 获取指定账户的 MailDataSource
final dataSource = ref.read(mailDataSourcesProvider)[accountId];
```

### 7.12 邮件构建与发送（MessageBuilder 详解）

#### 新建邮件

```dart
final builder = MessageBuilder()
  ..from = [MailAddress('显示名', 'email@domain.com')]
  ..to = [MailAddress('收件人名', 'recipient@domain.com')]
  ..cc = [MailAddress('抄送人名', 'cc@domain.com')]
  ..subject = '邮件主题'
  ..addMultipartAlternative(
    plainText: '纯文本内容',
    htmlText: '<p>HTML 内容</p>',
  );

// 添加附件
builder.addFile(
  File('/path/to/file.pdf'),
  mediaType: MediaType('application', 'pdf'),
  disposition: ContentDisposition.attachment,
  fileName: 'file.pdf',
);

// 添加内联图片
builder.addFile(
  File('/path/to/image.png'),
  mediaType: MediaType('image', 'png'),
  disposition: ContentDisposition.inline,
  contentId: 'image001',
);

await mailClient.sendMessage(builder.buildMimeMessage());
```

#### 回复邮件

```dart
final builder = MessageBuilder.prepareReplyToMessage(
  originalMessage,
  MailAddress('我的名字', 'my@email.com'),
);
// 自动处理: to = original.from, subject = "Re: ...", In-Reply-To/References 头

builder.text = '回复内容\n\n${builder.text ?? ''}';
await mailClient.sendMessage(builder.buildMimeMessage());
```

#### 转发邮件

```dart
final builder = MessageBuilder.prepareForwardMessage(
  originalMessage,
  from: MailAddress('我的名字', 'my@email.com'),
);
// 自动处理: subject = "Fwd: ...", 附加原邮件所有附件

builder.to = [MailAddress('转发目标', 'forward@domain.com')];
await mailClient.sendMessage(builder.buildMimeMessage());
```

#### 签名插入

```dart
String insertSignature(String bodyHtml, EmailSignature signature) {
  if (signature.contentType == 'html') {
    return '$bodyHtml<hr class="signature-separator">${signature.content}';
  } else {
    return '$bodyHtml<pre>${signature.content}</pre>';
  }
}

// compose_page 中使用
builder.addMultipartAlternative(
  plainText: bodyText,
  htmlText: insertSignature(bodyHtml, defaultSignature),
);
```

#### 草稿保存

草稿保存策略：**本地 drift 优先**（离线可用），不依赖 IMAP 连接。

```
写邮件页面（compose_page）：
  ├── 自动保存：每 30 秒检测表单有变更 → 保存到 emails 表（folder='drafts'）
  │   └── 保存失败时：SnackBar "草稿保存失败" + 日志记录（不影响用户继续编辑）
  ├── 手动保存：点击"存草稿"按钮 → 立即保存
  │   └── 保存失败时：SnackBar "草稿保存失败，请重试"
  ├── 保存逻辑：
  │   ├── 新草稿：INSERT INTO emails (folder='drafts', ...)
  │   └── 已有草稿：UPDATE emails SET ... WHERE id=draftId
  └── 退出确认：有未保存变更时 pop 确认弹窗（"放弃编辑？" → 放弃/存草稿）

草稿续编：
  打开草稿 → 加载到 compose_page → 继续编辑
  发送成功 → 删除对应草稿
```

**注意**：草稿不自动同步到 IMAP Drafts 文件夹（需要网络连接），仅存储在本地 drift。未来扩展可在设置中提供"草稿同步到服务器"选项。

#### 发送失败处理

```dart
try {
  final response = await mailClient.sendMessage(mimeMessage);
  if (!response.isOkStatus) {
    throw EmailException(type: EmailErrorType.sendFailed);
  }
} on SmtpException catch (e) {
  throw EmailException(type: _mapSmtpError(e), originalException: e);
} on TimeoutException {
  throw EmailException(type: EmailErrorType.timeout);
}
```

### 7.13 IMAP 搜索能力

#### enough_mail Search API

enough_mail 使用 `MailSearch` 类封装搜索条件，通过 `MailClient.searchMessages()` 执行 IMAP SEARCH 命令。

```dart
// 按主题搜索
final search = MailSearch('项目进度', SearchQueryType.subject);
final result = await mailClient.searchMessages(search);
// result 包含: List<MimeMessage> messages, int totalCount

// 按发件人搜索
final search = MailSearch('zhangsan@', SearchQueryType.from);

// 按存储日期搜索
final search = MailSearch(
  '',
  SearchQueryType.all,
  since: DateTime.now().subtract(Duration(days: 30)),
);

// 按发送日期搜索
final search = MailSearch(
  '',
  SearchQueryType.all,
  sentSince: DateTime.now().subtract(Duration(days: 30)),
);

// 分页加载下一页
final nextPage = await mailClient.searchMessagesNextPage(result);
```

#### SearchQueryType 速查

| SearchQueryType | 用途 |
|---|---|
| `SearchQueryType.subject` | 按主题 |
| `SearchQueryType.from` | 按发件人 |
| `SearchQueryType.to` | 按收件人 |
| `SearchQueryType.body` | 按正文（慢） |
| `SearchQueryType.all` | 搜索所有文本头 |
| `SearchQueryType.bcc` | 按密送收件人 |
| `SearchQueryType.cc` | 按抄送收件人 |

#### MailSearch 可选参数

| 参数 | 类型 | 用途 |
|---|---|---|
| `since` | `DateTime?` | 存储日期之后 |
| `before` | `DateTime?` | 存储日期之前 |
| `sentSince` | `DateTime?` | 发送日期之后 |
| `sentBefore` | `DateTime?` | 发送日期之前 |
| `messageType` | `SearchMessageType?` | 消息类型过滤 |
| `pageSize` | `int` | 每页加载数量（默认 20） |

#### EasyWork 搜索策略：本地 FTS5 优先

```
用户输入搜索词
  │
  ├── 本地 FTS5 搜索（主路径）
  │   → SearchDao._searchEmails(term)
  │   → 查询 emails_fts 虚拟表
  │   → 返回匹配结果（毫秒级）
  │
  └── IMAP 搜索（可选扩展）
      → 设置页"扩大搜索范围"开关
      → 开启时：MailSearch + mailClient.searchMessages()
      → 结果写入本地 drift → 再从 FTS5 查询
      → 关闭时：仅搜索本地已同步邮件
```

#### IMAP 搜索结果持久化

```dart
Future<void> persistImapSearchResults(
  List<MimeMessage> messages,
  MailClient client,
) async {
  for (final message in messages) {
    final existing = await emailDao.findByMessageId(
      message.decodeMessageId() ?? '',
    );
    if (existing == null) {
      final fullMessage = await client.fetchMessage(message);
      await emailDao.insertFromMimeMessage(fullMessage, accountId);
    }
  }
}
```

### 7.14 MimeMessage 数据映射

#### MimeMessage → Emails 表映射

```dart
class MimeMessageMapper {
  static EmailsCompanion fromMimeMessage(MimeMessage message, int accountId) {
    return EmailsCompanion(
      accountId: Value(accountId),
      messageId: Value(message.decodeMessageId() ?? ''),
      subject: Value(message.decodeSubject()),
      fromName: Value(message.from?.displayName),
      fromAddress: Value(message.from?.email ?? ''),
      toList: Value(_encodeAddresses(message.to)),
      ccList: Value(_encodeAddresses(message.cc)),
      bccList: Value(_encodeAddresses(message.bcc)),
      bodyText: Value(_extractPlainText(message)),
      bodyHtml: Value(_extractHtml(message)),
      hasAttachments: Value(_hasAttachments(message)),
      receivedAt: Value(message.decodeDate() ?? DateTime.now()),
      isRead: Value(message.flags?.contains(MessageFlags.seen) ?? false),
      isStarred: Value(message.flags?.contains(MessageFlags.flagged) ?? false),
      folder: Value('inbox'),
    );
  }

  static String? _extractPlainText(MimeMessage message) {
    final textPart = message.textPart;
    if (textPart != null) return textPart;
    final htmlPart = message.htmlPart;
    if (htmlPart != null) {
      return HtmlToPlainTextConverter.convert(htmlPart);
    }
    return null;
  }

  static String? _extractHtml(MimeMessage message) => message.htmlPart;

  static bool _hasAttachments(MimeMessage message) {
    for (final part in message.parts) {
      if (part.contentDisposition?.disposition == ContentDisposition.attachment ||
          part.contentDisposition?.filename != null) {
        return true;
      }
    }
    return false;
  }

  static String? _encodeAddresses(List<MailAddress>? addresses) {
    if (addresses == null || addresses.isEmpty) return null;
    return jsonEncode(addresses.map((a) => {
      'name': a.displayName,
      'email': a.email,
    }).toList());
  }
}
```

#### 附件元数据提取

```dart
List<EmailAttachmentCompanion> extractAttachments(
  MimeMessage message,
  int localEmailId,
) {
  final attachments = <EmailAttachmentCompanion>[];
  _processParts(message, attachments, localEmailId);
  return attachments;
}

void _processParts(
  MimePart part,
  List<EmailAttachmentCompanion> attachments,
  int localEmailId,
) {
  for (final subPart in part.parts) {
    final contentDisposition = subPart.contentDisposition;
    final contentType = subPart.contentType;

    if (contentType?.mediaType == MediaSubtype.textPlain ||
        contentType?.mediaType == MediaSubtype.textHtml) {
      continue;
    }

    if (contentDisposition?.disposition == ContentDisposition.attachment ||
        contentDisposition?.filename != null) {
      attachments.add(EmailAttachmentCompanion(
        emailId: Value(localEmailId),
        filename: Value(contentDisposition?.filename ?? 'unknown'),
        mimeType: Value(contentType?.mimeType),
        size: Value(subPart.data?.length),
        cid: Value(_extractContentId(subPart)),
      ));
    }

    if (subPart.parts.isNotEmpty) {
      _processParts(subPart, attachments, localEmailId);
    }
  }
}

String? _extractContentId(MimePart part) {
  final contentId = part.contentId;
  if (contentId != null) {
    return contentId.replaceAll(RegExp(r'[<>]'), '');
  }
  return null;
}
```

#### 编码处理

enough_mail 内部已使用 enough_convert 处理字符编码，支持：
- UTF-8, ASCII
- ISO-8859-1 ~ ISO-8859-16
- Windows-1250 ~ Windows-1256
- GBK (兼容 GB-2312)
- Big5
- KOI8-R, KOI8-U

VCF 导入时的编码检测补充 `charset` 包：

```dart
import 'package:charset/charset.dart';

String detectAndDecode(List<int> bytes) {
  final detected = Charset.detect(bytes);
  if (detected != null) return detected.decode(bytes);
  return utf8.decode(bytes, allowMalformed: true);
}
```

#### MimeMessage 持久化

```dart
/// 独立函数：将 MimeMessage 持久化到本地 drift（用于 onDownloaded 回调）
Future<void> upsertFullMessage(MimeMessage message, int accountId) async {
  final messageId = message.decodeMessageId() ?? '';
  final existing = await emailDao.findByMessageId(messageId);
  final companion = MimeMessageMapper.fromMimeMessage(message, accountId);

  if (existing != null) {
    await emailDao.updateMessage(existing.id, companion);
  } else {
    final localId = await emailDao.insertMessage(companion);
    final attachments = extractAttachments(message, localId);
    for (final attachment in attachments) {
      await emailAttachmentDao.insertAttachment(attachment);
    }
  }
}
```

#### EmailDao 方法清单

```dart
class EmailDao extends DatabaseAccessor<AppDatabase> with _$EmailDaoMixin {
  EmailDao(super.db);

  /// 根据 MIME Message-ID 查找本地邮件（用于去重）
  Future<Email?> findByMessageId(String messageId) async {
    final rows = await (select(emails)..where((t) => t.messageId.equals(messageId))).get();
    return rows.isEmpty ? null : rows.first;
  }

  /// 插入邮件并返回本地 ID
  Future<int> insertMessage(EmailsCompanion companion) =>
      into(emails).insert(companion, mode: InsertMode.insertOrReplace);

  /// 更新邮件内容（完整 MIME 下载后补充 bodyText/bodyHtml 等）
  Future<void> updateMessage(int id, EmailsCompanion companion) =>
      (update(emails)..where((t) => t.id.equals(id))).write(companion);

  // ... 其他已有方法（getAll, getByFolder, getUnreadCount 等）
}

class EmailAttachmentDao extends DatabaseAccessor<AppDatabase> with _$EmailAttachmentDaoMixin {
  EmailAttachmentDao(super.db);

  /// 插入附件元数据
  Future<int> insertAttachment(EmailAttachmentCompanion companion) =>
      into(emailAttachments).insert(companion, mode: InsertMode.insertOrReplace);

  // ... 其他已有方法
}
```

### 7.15 账户配置与发现（Discover API 详解）

#### Discover API

```dart
Future<MailServerConfig?> discoverConfig(String email) =>
    Discover.discover(email, isLogEnabled: false);

// 使用
final config = await Discover.discover('zhangsan@163.com');
if (config != null) {
  // config.imapHost, config.imapPort, config.imapSocketType
  // config.smtpHost, config.smtpPort, config.smtpSocketType
  // config.loginType (plain/login/ntlm)
}
```

#### MailAccount 创建

```dart
// 从自动发现结果创建
final account = MailAccount.fromDiscoveredSettings(
  name: '我的邮箱',
  email: 'zhangsan@163.com',
  password: password,
  config: config,
  userName: 'zhangsan',
);

// 手动配置
final account = MailAccount.fromManualSettings(
  name: '我的邮箱',
  email: 'zhangsan@163.com',
  incomingHost: 'imap.163.com',
  incomingPort: 993,
  incomingSocketType: SocketType.ssl,
  outgoingHost: 'smtp.163.com',
  outgoingPort: 465,
  outgoingSocketType: SocketType.ssl,
  password: password,
);

// 手动配置 + 认证方式
final account = MailAccount.fromManualSettingsWithAuth(
  name: '我的邮箱',
  email: 'zhangsan@163.com',
  incomingHost: 'imap.163.com',
  outgoingHost: 'smtp.163.com',
  auth: MailAuthentication.plainText(password),
  userName: 'zhangsan',
  incomingPort: 993,
  incomingSocketType: SocketType.ssl,
  outgoingPort: 465,
  outgoingSocketType: SocketType.ssl,
);
```

#### 连接测试与诊断

**设计决策**：连接测试使用**临时 MailClient 实例**，测试完成后立即断开，不复用于后续同步。实际同步连接由 `MailDataSource` 独立管理，两者生命周期完全独立。

```dart
/// 连接测试结果
class ConnectionTestResult {
  final bool isSuccess;
  final bool supportsIdle;
  final EmailErrorType? errorType;
  final String? technical;

  ConnectionTestResult._({
    required this.isSuccess,
    this.supportsIdle = false,
    this.errorType,
    this.technical,
  });

  factory ConnectionTestResult.success({required bool supportsIdle}) =>
      ConnectionTestResult._(isSuccess: true, supportsIdle: supportsIdle);

  factory ConnectionTestResult.failure({
    required EmailErrorType type,
    String? technical,
  }) =>
      ConnectionTestResult._(
        isSuccess: false,
        errorType: type,
        technical: technical,
      );
}

/// 连接测试：使用临时 MailClient，测试完成后断开
/// 与 MailDataSource 的实际同步连接完全独立
Future<ConnectionTestResult> testConnection(MailAccount account) async {
  final client = MailClient(account, isLogEnabled: false);
  try {
    await client.connect();
    await client.selectInbox();
    await client.fetchMessages(count: 1, fetchPreference: FetchPreference.envelope);
    await client.disconnect();  // 测试完成，断开临时连接
    return ConnectionTestResult.success(supportsIdle: client.isIdleSupported);
  } on ImapException catch (e) {
    return ConnectionTestResult.failure(
      type: _classifyImapError(e),
      technical: e.toString(),
    );
  } on SmtpException catch (e) {
    return ConnectionTestResult.failure(
      type: EmailErrorType.smtpAuthFailed,
      technical: e.toString(),
    );
  } on TimeoutException {
    return ConnectionTestResult.failure(type: EmailErrorType.timeout);
  } on SocketException catch (e) {
    return ConnectionTestResult.failure(
      type: EmailErrorType.connectionFailed,
      technical: e.toString(),
    );
  }
}

enum EmailErrorType {
  authFailed,
  connectionFailed,
  timeout,
  sslError,
  smtpAuthFailed,
  sendFailed,
}
```

#### 凭据安全存储

**CredentialStore 已在 2.10.4 中统一定义**（含 savePassword/getPassword/deletePassword）。此处不再重复定义。

### 7.16 邮箱模块 Provider 依赖图

```
appDatabaseProvider
      │
      ▼
emailDaoProvider ──────────── mailDataSourcesProvider
      │                                │
      └──────────────┬─────────────────┘
                     ▼
             emailRepositoryProvider
                     │
                     ▼
 ┌──────────────────────────────────────────────┐
 │              邮箱 Provider 群                  │
 │  emailAccountListProvider                     │
 │  emailListProvider(folder)                    │
 │  unreadCountProvider (派生)                   │
 │  emailDetailProvider(id) (autoDispose)        │
 │  composeEmailProvider                         │
 │  contactListProvider                          │
 │  contactGroupProvider                         │
 │  signatureProvider                            │
 └──────────────────────────────────────────────┘
```

### 7.17 邮箱模块异常处理

#### 邮箱异常类型

**EmailException 和 EmailErrorType 已在 2.10.1 中统一定义**（含 `userMessage` getter 和默认消息映射）。

此处不再重复定义，参见 2.10.1 异常层级中的 `EmailException` 类。

#### 用户消息映射

| 错误类型 | 用户消息 |
|---|---|
| `authFailed` | 邮箱地址或密码错误，请检查后重试 |
| `connectionFailed` | 无法连接到邮件服务器，请检查网络和服务器地址 |
| `timeout` | 连接超时，请检查网络状态 |
| `sslError` | SSL 证书验证失败，可能需要使用非标准端口 |
| `smtpAuthFailed` | 发送失败：邮箱认证错误 |
| `sendFailed` | 发送失败：无法连接邮件服务器 |

### 7.18 邮箱模块页面结构

```
email/presentation/pages/
├── email_list_page.dart          # 邮件列表（文件夹切换 + 搜索）
├── email_detail_page.dart        # 邮件详情（MimeMessageDownloader → MimeMessageViewer）
├── compose_page.dart             # 写邮件（MessageBuilder + 签名 + 附件）
├── contact_list_page.dart        # 联系人列表（搜索 + 分组筛选）
├── contact_detail_page.dart      # 联系人详情 + 关联邮件
├── contact_form_page.dart        # 新建/编辑联系人
├── contact_group_page.dart       # 分组管理
└── signature_manage_page.dart    # 签名管理

email/accounts/presentation/pages/
└── email_accounts_page.dart      # 邮箱账户管理（列表 + 添加/编辑/删除）

settings/presentation/pages/
├── settings_page.dart            # 设置主页
└── settings_backup_page.dart     # 数据备份页

log/presentation/pages/
└── log_page.dart                 # 日志列表（按模块/级别筛选）

dashboard/presentation/pages/
└── dashboard_page.dart           # Dashboard 主页（固定卡片 Grid）
```

### 7.19 邮件关键工作流

#### 邮件同步流程

```
1. 应用启动 → 遍历 EmailAccounts 表
2. 对每个账户：
   a. 从 flutter_secure_storage 读取密码
   b. 创建 MailAccount（fromDiscoveredSettings / fromManualSettings）
   c. 创建 MailClient → connect()
   d. selectInbox()
   e. fetchMessages(count: syncLimit, fetchPreference: FetchPreference.envelope)
   f. 将 envelope 写入本地 drift emails 表
   g. 对未读邮件逐一 fetchMessage() 获取完整正文
   h. 调用 upsertFullMessage() 持久化
   i. 根据 supportsIdle 选择 IDLE 或 startPolling()
3. 桥接 MailClient.eventBus → EasyWork EventBus
```

#### 邮件详情展示流程

```
1. 邮件列表点击 → 导航到详情页
2. 详情页接收 MimeMessage（仅有 envelope）
3. 渲染 MimeMessageDownloader：
   a. 检查本地是否已有完整正文
   b. 未下载 → mailClient.fetchMessageContents() 下载
   c. 下载完成 → onDownloaded 回调 → upsertFullMessage() 持久化
   d. MimeMessageViewer 渲染 HTML（内部调用 transformToHtml）
4. 自动标记已读（markAsSeen: true）
```

#### 写邮件流程

```
1. 新建 → 创建 MessageBuilder
2. 收件人选择 → 搜索联系人/分组
3. 编辑正文 → 富文本编辑器
4. 插入默认签名（可切换/删除）
5. 添加附件 → builder.addFile()
6. 发送 → mailClient.sendMessage(builder.buildMimeMessage())
7. 发送成功 → 返回详情页 → SnackBar 确认
8. 失败 → SnackBar 错误提示 → 保持编辑状态
```

---

## 8. UI 状态规范与表单交互

### 8.1 统一空状态/错误/加载状态 UI 规范

**加载状态**：
- 首次加载：`CircularProgressIndicator` 居中
- 列表加载更多：底部 24px 高度的 `LinearProgressIndicator`
- 刷新：`RefreshIndicator` 下拉刷新

**空状态**：
- 图标（模块相关，outlined 风格，64px，`onSurfaceVariant` 色）
- 主文字（"暂无xxx"，`title` 字号）
- 副文字（"点击+号添加"，`bodySmall` 字号，`onSurfaceVariant` 色）
- CTA 按钮（"立即添加"，primary 色 text button）

**错误状态**：
- 错误图标（`error` 色，64px）
- 错误描述（`error.userMessage`，i18n）
- 重试按钮（"重试"，outlined button）
- 错误详情展开（`kDebugMode` 为 true 时可展开查看 technical 信息）

### 8.2 表单交互规范

**通用规则**：
- 所有表单使用 `AutovalidateMode.onUserInteraction`
- 必填字段标签前加 `*` 号（`error` 色）
- 提交按钮在表单校验未通过时 disabled（opacity 0.5）
- 提交中按钮显示 `CircularProgressIndicator`（20px）替换文字，防止重复提交
- 成功后 SnackBar 提示 + 自动 pop 返回上一页

**任务创建表单**：
- 必填：标题
- 可选：描述、优先级（默认 medium）、截止日期、标签、预估时长、周期规则
- 周期规则：仅当"周期任务"开关打开时显示 RRULE 选择器

**记账录入表单**：
- 必填：类型（收入/支出切换，默认支出）、分类、金额
- 可选：日期（默认今天）、备注
- 金额输入：数字键盘，最多2位小数

**运动记录表单**：
- 必填：运动类型、时长（分钟）
- 可选：距离（km，跑步/骑行时显示）、消耗卡路里、日期（默认今天）、备注

**邮件写邮件表单**：
- 必填：收件人、主题
- 可选：正文、签名（默认插入）、附件
- 收件人输入：输入时搜索联系人，选择后以 chip 展示

---

## 9. 项目配置规范

### 9.1 pubspec.yaml 关键配置

```yaml
name: easywork
description: 个人效率工具
version: 0.1.0+1

environment:
  sdk: ^3.5.0
  flutter: ^3.24.0

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  flutter_riverpod: ^2.5.0
  riverpod_annotation: ^2.3.0
  freezed_annotation: ^2.4.0
  json_annotation: ^4.9.0
  drift: ^2.18.0
  sqlite3_flutter_libs: ^0.5.0
  go_router: ^14.0.0
  enough_mail: ^2.1.7
  enough_mail_flutter: ^2.1.2
  enough_convert: ^1.6.0
  vcard: ^0.2.0
  charset: ^2.0.1
  flutter_secure_storage: ^9.2.0
  flutter_local_notifications: ^17.0.0
  system_tray: ^2.0.3
  window_manager: ^0.4.0
  workmanager: ^0.5.0
  connectivity_plus: ^6.1.0
  cached_network_image: ^3.3.0
  fl_chart: ^0.68.0
  url_launcher: ^6.2.0
  permission_handler: ^11.3.0
  table_calendar: ^3.1.0
  lunar: ^3.1.0
  rrule: ^3.0.0
  flutter_quill: ^10.0.0
  file_picker: ^8.0.0
  intl: any
  path: ^1.9.0
  path_provider: ^2.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  integration_test:
    sdk: flutter
  build_runner: ^2.4.0
  drift_dev: ^2.18.0
  freezed: ^2.5.0
  json_serializable: ^6.8.0
  mocktail: ^1.0.0
  flutter_lints: ^4.0.0
  flutter_launcher_icons: ^0.13.0
  flutter_native_splash: ^2.4.0
```

### 9.2 代码生成命令

```bash
# 生成 drift 代码
dart run build_runner build --delete-conflicting-outputs

# 持续监听生成
dart run build_runner watch --delete-conflicting-outputs

# 生成国际化
flutter gen-l10n
```

---

## 10. 平台原生配置

### 10.1 Windows - `windows/runner/main.cpp` 修改要点

- 窗口管理器集成（需在 Flutter 窗口创建后注册）
- 系统托盘初始化
- 文件关联注册（.vcf）
- 自启动注册表项由 Dart 层操作

### 10.2 Windows - `windows/runner/Runner.rc`

- 应用图标替换
- 版本信息设置

### 10.3 Android - `android/app/src/main/AndroidManifest.xml`

```xml
<manifest>
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

  <application>
    <activity>
      <!-- Deep Link -->
      <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="easywork" />
      </intent-filter>

      <!-- Share Intent -->
      <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
      </intent-filter>
    </activity>

    <!-- Workmanager 后台任务 -->
    <service
      android:name="com.example.easywork.BackgroundEmailFetch"
      android:exported="false" />
  </application>
</manifest>
```

### 10.4 Android - `android/app/build.gradle` 关键配置

```groovy
android {
    defaultConfig {
        minSdkVersion 24
        targetSdkVersion 34
        multiDexEnabled true
    }
}
```

### 10.5 Android 通知渠道注册

```dart
class NotificationChannels {
  static const emailChannel = AndroidNotificationChannel(
    'email', '邮件通知',
    description: '新邮件到达时通知',
    importance: Importance.high,
  );

  static const taskChannel = AndroidNotificationChannel(
    'task', '任务提醒',
    description: '任务到期时提醒',
    importance: Importance.high,
  );

  static const systemChannel = AndroidNotificationChannel(
    'system', '系统通知',
    description: '系统级通知（备份完成等）',
    importance: Importance.low,
  );

  static Future<void> registerAll() async {
    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannels([
        emailChannel, taskChannel, systemChannel,
      ]);
  }
}

// main.dart 中初始化
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationChannels.registerAll();
  runApp(const ProviderScope(child: EasyWorkApp()));
}
```

---

## 11. 数据导出 JSON 格式规范

```json
{
  "version": "1.0",
  "exportDate": "2026-07-01T10:30:00Z",
  "appVersion": "0.1.0+1",
  "data": {
    "emailAccounts": [],
    "emails": [],
    "emailAttachments": [],
    "contacts": [],
    "contactGroups": [],
    "contactGroupMembers": [],
    "emailSignatures": [],
    "emailToTask": [],
    "pendingEmails": [],
    // 仅导出 status='pending' 的记录，跳过 'sending' 和 'failed'
    "tasks": [],
    "taskComments": [],
    "notes": [],
    "noteTags": [],
    "noteTagMembers": [],
    "accountingCategories": [],
    "accountingRecords": [],
    "accountingBudgets": [],
    "exerciseRecords": [],
    "stocks": [],
    "settings": [],
    "logs": [],
    "timelineEvents": []
  },
  "metadata": {
    "totalRecords": 0,
    "tableCounts": {
      "emails": 0,
      "tasks": 0,
      "notes": 0,
      "logs": 0
    }
  }
}
```

恢复时校验 `version` 字段兼容性，`metadata.tableCounts` 用于完整性校验。

**导出注意事项**：
- `logs` 表导出时排除 `debug` 级别日志（仅导出 info/warn/error）
- `emailAttachments` 仅导出元数据，不导出实际附件文件（体积过大）
- `settings` 表导出时排除 `lastBackupDate`（恢复后需重新触发备份）

---

## 12. 应用图标与启动页

### 12.1 应用图标

- 尺寸：1024x1024px（源文件），由 `flutter_launcher_icons` 生成各平台尺寸
- 风格：简约扁平，primary 蓝（#2563EB）为主色
- 内容：抽象字母 E + 箭头/对勾组合图形（代表效率/完成）
- 背景：圆角正方形，primary 渐变（#2563EB → #0D9488）

```yaml
flutter_launcher_icons:
  android: true
  windows: true
  image_path: "assets/icon/app_icon.png"
```

### 12.2 启动页

- 白色/深色背景（跟随主题）
- 居中显示应用图标（120x120px）
- 下方应用名称 "EasyWork"（headline 字号）
- 无动画、无 loading 文字（由 Flutter `splash` 机制自动管理）

```yaml
flutter_native_splash:
  color: "#F8FAFC"
  color_dark: "#0F172A"
  image: assets/icon/splash_icon.png
  android: true
  windows: true
```

---

## 13. 键盘快捷键（Windows）

| 快捷键 | 功能 | 上下文 |
|---|---|---|
| `Ctrl+F` | 全局搜索 | 全局 |
| `Ctrl+N` | 新建任务 | 全局 |
| `Ctrl+M` | 写邮件 | 全局 |
| `Ctrl+B` | 快速记账 | 全局 |
| `Ctrl+1` | 跳转 Dashboard | 全局 |
| `Ctrl+2` | 跳转任务看板 | 全局 |
| `Ctrl+3` | 跳转日历 | 全局 |
| `Ctrl+4` | 跳转邮箱 | 全局 |
| `Ctrl+5` | 跳转笔记 | 全局 |
| `Ctrl+6` | 跳转记账 | 全局 |
| `Ctrl+W` | 关闭当前页/返回 | 全局 |
| `Escape` | 关闭弹窗/取消搜索 | 全局 |
| `Delete` | 删除选中项 | 列表项 |
| `Enter` | 打开选中项 | 列表项 |
| `Ctrl+,` | 打开设置 | 全局 |

实现方式：在 `AppShell` 外层包裹 `CallbackShortcuts`，全局生效。Android 端自动忽略快捷键。

---

## 14. 工程规范

### 14.1 analysis_options.yaml

```yaml
include: package:flutter_lints/flutter.yaml

analyzer:
  errors:
    missing_return: error
    dead_code: warning
    unused_import: warning
  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"
  language:
    strict-casts: true
    strict-raw-types: true
    strict-inference: true

linter:
  rules:
    # 安全性
    - avoid_print
    - avoid_debugger
    - no_duplicate_case_values
    # 可读性
    - always_declare_return_types
    - annotate_overrides
    - avoid_empty_else
    - prefer_const_constructors
    - prefer_const_declarations
    - prefer_final_fields
    - prefer_final_locals
    # 架构
    - avoid_relative_lib_imports
    - avoid_web_libraries_in_flutter
    - depend_on_referenced_packages
    # 命名
    - non_constant_identifier_names
    - use_key_in_widget_constructors
```

### 14.2 Git 分支策略

```
main                    ← 稳定发布版本，仅合并 develop
  └── develop           ← 开发主线，所有 feature 分支合并到这里
       ├── feature/xxx  ← 功能分支（从 develop 创建）
       ├── fix/xxx      ← 修复分支（从 develop 创建）
       └── release/x.x.x ← 发布准备分支（从 develop 创建）
```

**分支命名规范**：
- `feature/` 前缀 + 功能描述：`feature/email-sync`、`feature/task-drag`
- `fix/` 前缀 + 问题描述：`fix/imap-timeout`、`fix/vcf-encoding`
- `release/` 前缀 + 版本号：`release/1.0.0`

**提交信息规范**（Conventional Commits）：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | 说明 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构（不新增功能/修复 bug） |
| `test` | 测试相关 |
| `chore` | 构建/工具/配置变更 |
| `perf` | 性能优化 |

**示例**：
```
feat(email): add IMAP IDLE support for real-time email sync
fix(task): prevent drag to invalid kanban columns
docs(design): add calendar data model section
```

### 14.3 Windows 打包配置

**安装包方案**：MSIX（Windows 原生格式，支持自动更新）

```yaml
# pubspec.yaml 中添加
msix_config:
  display_name: EasyWork
  publisher_display_name: EasyWork Team
  identity_name: com.easywork.app
  publisher: CN=EasyWork
  msix_version: 1.0.0.0
  logo_path: assets/icon/app_icon.png
  capabilities: internetClient, privateNetworkClientServer
  languages: zh-cn, en-us
```

**构建命令**：
```bash
# 构建 MSIX
dart run msix:create

# 构建发布版本
flutter build windows --release
dart run msix:create --version 1.0.0
```

**自动更新（未来扩展）**：
- 方案 A：MSIX 自动更新（通过 App Installer manifest）
- 方案 B：自建更新服务器 + 应用内检查更新
- MVP 阶段不实现自动更新，用户手动下载安装

### 14.4 代码格式化

```bash
# 格式化代码
dart format .

# 检查格式
dart format --set-exit-if-changed .

# 代码分析
flutter analyze
```

### 14.5 提交前检查清单

每次提交前必须通过：
```bash
dart format --set-exit-if-changed .
flutter analyze
flutter test
```

CI 中额外检查：
- 测试覆盖率不低于当前基线
- 无 `TODO` 注释（或标记为 `// TODO(#issue):`）
