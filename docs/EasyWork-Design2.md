# EasyWork 架构规范

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
| 富文本编辑 | flutter_quill | ^10.0.0 |
| 图表 | fl_chart | 最新稳定版 |
| URL 启动 | url_launcher | 最新稳定版 |
| 权限管理 | permission_handler | 最新稳定版 |
| 文件选择 | file_picker | 最新稳定版 |
| 测试 Mock | mocktail | 最新稳定版 |

**依赖原则**：最新稳定版、非弃用、< 1 年未更新、评分良好。

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
└── email_feature.dart   # barrel export
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
    EmailAccounts, Emails, EmailAttachments,
    Contacts, ContactGroups, ContactGroupMembers,
    EmailSignatures, EmailToTask,
    Tasks, TaskComments,
    Notes, NoteTags, NoteTagMembers,
    AccountingRecords, AccountingCategories, AccountingBudgets,
    ExerciseRecords,
    Stocks,
    Settings,
    Logs, TimelineEvents,
  ],
)
class AppDatabase extends _$AppDatabase {
  @override
  int get schemaVersion => 1;

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
  TextColumn get localPath => text().nullable()();
  TextColumn get cid => text().nullable()();
}

// 联系人
// emailAddresses 和 phoneNumbers 存储为 JSON 数组字符串，如 '["a@b.com","c@d.com"]'
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
  IntColumn get taskId => integer()();
  TextColumn get attachmentPaths => text().nullable()(); // JSON 数组
  DateTimeColumn get linkedAt => dateTime()();
}
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
}
```

#### 2.2.5 笔记表

```dart
class Notes extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text().nullable()();
  TextColumn get content => text()();
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
  TextColumn get market => text()();            // sh / sz / hk / us
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

#### 2.2.11 Timeline 表（Logs 的派生视图）

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
| 日志 | `LogDao` | -（直接 DAO） | - |
| Timeline | `TimelineDao` | -（直接 DAO） | - |
| 设置 | `SettingsDao` | -（直接 DAO） | - |
| 搜索 | `SearchDao` | -（直接 DAO，含 FTS5） | - |

**联系人架构说明**：
- 联系人虽然与邮箱模块紧密相关（VCF 导入/导出、邮件收件人搜索），但设计为独立模块
- `ContactRepository` 提供独立的 CRUD 接口，不依赖 `EmailRepository`
- 邮箱模块的"从发件人添加联系人"功能通过 EventBus 间接调用（不直接 ref.read ContactRepository）
- 未来扩展：支持本地联系人（不绑定邮箱账户）、系统通讯录同步等

#### 2.2.15 Repository Provider 注入

```dart
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = createAppDatabase();
  ref.onDispose(db.close);
  return db;
});

final contactDaoProvider = Provider((ref) => ContactDao(ref.watch(appDatabaseProvider)));
final taskDaoProvider = Provider((ref) => TaskDao(ref.watch(appDatabaseProvider)));
final noteDaoProvider = Provider((ref) => NoteDao(ref.watch(appDatabaseProvider)));
final settingsDaoProvider = Provider((ref) => SettingsDao(ref.watch(appDatabaseProvider)));
final logDaoProvider = Provider((ref) => LogDao(ref.watch(appDatabaseProvider)));
final timelineDaoProvider = Provider((ref) => TimelineDao(ref.watch(appDatabaseProvider)));
final stockDaoProvider = Provider((ref) => StockDao(ref.watch(appDatabaseProvider)));
final accountingDaoProvider = Provider((ref) => AccountingDao(ref.watch(appDatabaseProvider)));
final exerciseDaoProvider = Provider((ref) => ExerciseDao(ref.watch(appDatabaseProvider)));
final searchDaoProvider = Provider((ref) => SearchDao(ref.watch(appDatabaseProvider)));

// 数据源定义
//   emailDaoProvider — drift 本地存储 (EmailDao)
//   mailDataSourceProvider — 每个邮箱账户一个 MailDataSource 实例（Map<int, MailDataSource>）
final emailDaoProvider = Provider((ref) => EmailDao(ref.watch(appDatabaseProvider)));
final mailDataSourcesProvider = Provider<Map<int, MailDataSource>>((ref) => {});

final emailRepositoryProvider = Provider<EmailRepository>((ref) {
  return EmailRepositoryImpl(
    ref.watch(emailDaoProvider),
    ref.watch(mailDataSourcesProvider),
  );
});

final contactRepositoryProvider = Provider<ContactRepository>((ref) {
  return ContactRepositoryImpl(ref.watch(contactDaoProvider));
});

final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  return TaskRepositoryImpl(ref.watch(taskDaoProvider));
});

final noteRepositoryProvider = Provider<NoteRepository>((ref) {
  return NoteRepositoryImpl(ref.watch(noteDaoProvider));
});

final accountingRepositoryProvider = Provider<AccountingRepository>((ref) {
  return AccountingRepositoryImpl(ref.watch(accountingDaoProvider));
});

final exerciseRepositoryProvider = Provider<ExerciseRepository>((ref) {
  return ExerciseRepositoryImpl(ref.watch(exerciseDaoProvider));
});

final stockRepositoryProvider = Provider<StockRepository>((ref) {
  return StockRepositoryImpl(ref.watch(stockDaoProvider));
});
```

#### 2.2.16 关键数据源类定义

**设计决策**：enough_mail 已提供 `MailClient` 高级 API（自动重连、内置 EventBus、IDLE/轮询），
因此 EasyWork 不再自行封装低层 IMAP/SMTP 协议，而是通过 `MailDataSource` 对 `MailClient` 做
轻量适配（状态同步 + 与 EasyWork EventBus 桥接）。

```dart
/// 邮箱数据源：对 enough_mail MailClient 的轻量封装
class MailDataSource {
  final MailAccount _account;
  late final MailClient _client;

  MailDataSource({
    required String displayName,
    required String email,
    required String password,
    required String imapHost,
    int imapPort = 993,
    bool imapUseSsl = true,
    required String smtpHost,
    int smtpPort = 465,
    bool smtpUseSsl = true,
  }) : _account = MailAccount.fromManualSettings(
         displayName, email, password,
         imapHost: imapHost, imapPort: imapPort, imapUseSsl: imapUseSsl,
         smtpHost: smtpHost, smtpPort: smtpPort, smtpUseSsl: smtpUseSsl,
       );

  /// 连接并登录
  Future<void> connect() async {
    _client = MailClient(_account, isLogEnabled: false);
    await _client.connect();
  }

  /// 获取文件夹列表
  Future<List<Mailbox>> listMailboxes() => _client.listMailboxesAsTree();

  /// 选择收件箱
  Future<void> selectInbox() => _client.selectInbox();

  /// 获取最近 count 封邮件的头信息
  Future<List<MimeMessage>> fetchMessages({int count = 20}) =>
      _client.fetchMessages(count: count, fetchPreference: FetchPreference.envelope);

  /// 获取单封邮件的完整内容（含正文 + 附件）
  Future<MimeMessage> fetchFullMessage(MimeMessage message) =>
      _client.fetchMessage(message);

  /// 发送邮件
  Future<Response> sendMessage(MimeMessage message) =>
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
    stopPolling();
    disconnect();
  }
}

/// 根据邮箱地址自动发现配置
Future<MailServerConfig?> discoverConfig(String email) =>
    Discover.discover(email);
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
  emailRepoProvider  taskRepoProvider  accountingRepoProvider  ...
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
             emailRepoProvider
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
  ├── taskRepoProvider.createTask(task)
  │     └── drift: INSERT INTO tasks ...
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
├── email_events.dart       # NewEmailReceived / EmailToTask / UnreadCountChanged
├── accounting_events.dart  # TransactionRecorded
├── exercise_events.dart    # ExerciseCompleted
├── note_events.dart        # NoteUpdated
└── notification_events.dart # RequestNotification
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

// notification_events.dart
class RequestNotificationEvent extends AppEvent {
  final String title;
  final String body;
  final NotificationType type;
  final String? routeOnTap;
  RequestNotificationEvent({required this.title, required this.body, required this.type, this.routeOnTap})
    : super(moduleName: 'notification');
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

class EventSubscriptions {
  final Ref _ref;
  late final List<StreamSubscription> _subscriptions;

  EventSubscriptions(this._ref) {
    final bus = _ref.read(eventBusProvider);
    _subscriptions = [
      bus.on<RequestNotificationEvent>().listen((e) {
        _ref.read(notificationServiceProvider).show(e);
      }),
      // Logs 写入由各模块 Repository 实现内部直接写入，不经过 EventBus
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
    ];
  }

  void _refreshTasks() { /* invalidate dashboard task provider */ }
  void _refreshUnread() { /* invalidate unread provider */ }
  void _refreshBudget() { /* invalidate budget provider */ }
  void _refreshExercise() { /* invalidate exercise provider */ }

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
- 底部展开按钮（或双击 Rail 区域）→ 切换到 72px 图标+文字模式
- 展开动画：宽度 48px → 72px，文字淡入（200ms）
- 自动收起：展开后 3 秒无操作自动收回（或手动点击收起按钮）
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
- 点击 Rail 底部展开按钮或双击 Rail 区域 → 切换到 72px 图标+文字模式
- 展开动画：宽度从 48px → 72px，文字淡入（200ms）
- 自动收起：展开后 3 秒无操作自动收回（或手动点击收起按钮）
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
| 最近笔记 | 前 3 条笔记标题 + 更新时间 | `/notes` |
| 今日运动 | 运动类型 + 时长 + 距离 | `/exercise` |
| 股票概览 | 自选股数量 + 涨跌概况 | `/stocks` |

#### 2.6.4 看板视图自适应

| 断点 | 看板列数 | 行为 |
|---|---|---|
| < 600px | 列折叠为横向滚动 | `PageView` 容器，每页显示 1 列，左右滑动切换列；顶部 Tab 指示当前列（待办/进行中/已完成/挂起） |
| 600-900px | 列压缩宽度 | `SingleChildScrollView` + `Row` 横向滚动容器，每列 min 200px，列间距 `space-4` |
| > 900px | 列自适应 | `Row` + `Expanded` 均分剩余空间，每列 min 240px，超出时横向滚动 |

**拖拽行为**：
- 所有断点下均支持长按拖拽卡片到目标列
- 拖拽过程中目标列显示虚线占位符
- 拖拽释放时：如果目标列不可达（如从"进行中"拖到"已完成"需要经过中间状态），弹出确认弹窗

#### 2.6.5 邮件详情 Master-Detail 布局

| 断点 | 布局模式 | 行为 |
|---|---|---|
| < 600px | 跳转式 | 点击邮件 → push 到详情页，返回按钮回到列表 |
| 600-900px | 可切换分栏 | 默认跳转式；AppBar 右侧"分栏模式"图标按钮（`ViewSplit` 图标），点击切换为左右分栏（列表 40% + 详情 60%）；分栏模式下点击其他邮件右侧实时刷新，再次点击按钮退回跳转式 |
| > 900px | 固定分栏 | 左侧邮件列表（40%宽度）+ 右侧邮件详情（60%宽度），选中邮件右侧实时刷新；无切换按钮 |

**分栏模式细节**：
- 分栏比例固定 40:60，不可拖拽调整（YAGNI）
- 分栏模式下选中邮件：左侧列表选中态高亮 + 右侧详情刷新
- 分栏模式下无邮件选中时：右侧显示空状态占位（"选择一封邮件"）
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
  // 从 SettingsDao 读取持久化的主题偏好
  // 支持：light / dark / system（默认）
  // 设置页主题选择器直接调用 setTheme(mode)
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
class SearchResult {
  final String module;
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
@DriftAccessor(tables: [])
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
      module: 'task',
      id: r.data['rowid'] as int,
      title: r.data['title'] as String,
      subtitle: r.data['description'] as String?,
      icon: Icons.task_alt,
      route: '/tasks/${r.data['rowid']}',
      sortTime: DateTime.now(),
    )).toList();
  }

  // _searchEmails / _searchContacts / _searchNotes / _searchAccounting 同理

  Future<List<SearchResult>> _searchExercise(String query) async {
    final rows = await (select(exerciseRecords)
      ..where((r) => r.type.like('%$query%') | r.note.like('%$query%'))
      ..limit(5)
    ).get();

    return rows.map((r) => SearchResult(
      module: 'exercise',
      id: r.id,
      title: r.type,
      subtitle: r.note,
      icon: Icons.fitness_center,
      route: '/exercise',
      sortTime: r.recordDate,
    )).toList();
  }
}
```

#### 2.9.4 搜索 Provider

搜索增加 300ms 防抖，避免每次按键触发 FTS5 查询。

```dart
final searchQueryProvider = StateProvider<String>((ref) => '');

final _searchDebounceProvider = Provider.autoDispose<Debouncer>((ref) {
  final debouncer = Debouncer(const Duration(milliseconds: 300));
  ref.onDispose(debouncer.dispose);
  return debouncer;
});

class Debouncer {
  final Duration delay;
  Timer? _timer;
  Debouncer(this.delay);
  void run(VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }
  void dispose() => _timer?.cancel();
}

final searchResultsProvider = FutureProvider<List<SearchResult>>((ref) {
  final query = ref.watch(searchQueryProvider);
  if (query.length < 2) return [];
  // 通过 Debouncer 延迟查询（在 UI 层配合 searchQueryProvider 的 set 防抖）
  return ref.watch(searchDaoProvider).searchAll(query);
});
```

**搜索防抖交互**：用户在搜索框中输入时，通过 `onChanged` 回调启动 Debouncer，仅在 300ms 无新输入后才更新 `searchQueryProvider`，从而触发 FTS5 查询。

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
  EmailException({required this.type, this.originalException, String? userMessage}) : super();
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

  Future<void> saveAccountCredentials(int accountId, String password) async {
    await _storage.write(key: 'email_account_$accountId', value: password);
  }

  Future<String?> getAccountPassword(int accountId) async {
    return _storage.read(key: 'email_account_$accountId');
  }

  Future<void> deleteAccountCredentials(int accountId) async {
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
- 邮件正文首次同步时下载（限 30 天/200 封取交集，排除 >10MB 附件）

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
taskRepository.createTask(task)
  → 写入 drift
  → eventBus.publish(TaskCreatedEvent)
  → NotificationService.scheduleTaskDue(task.id, task.title, task.dueDate)
  → （task.dueDate == null 时跳过）

taskRepository.updateTask(task)
  → 写入 drift
  → NotificationService.cancelScheduled(task.id)
  → if task.dueDate != null:
    → NotificationService.scheduleTaskDue(task.id, task.title, task.dueDate)

taskRepository.deleteTask(task)
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
备份文件路径：{文档目录}/EasyWork/backups/easywork_backup_{YYYY-MM-DD_HHmmss}.db
保留策略：最近 30 天，超过自动清理
手动备份：不自动清理
```

#### 2.13.2 触发判断（双重校验）

```dart
class BackupService {
  Future<void> checkAndBackup() async {
    final lastBackup = await settingsDao.get('last_backup_date');
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());

    // 1. 检查设置表记录
    if (lastBackup == today) return;

    // 2. 验证文件系统
    final todayFile = backupDir.listSync().where(
      (f) => f.path.contains(today),
    ).isNotEmpty;

    if (todayFile) {
      // 设置表记录丢失，补写
      await settingsDao.set('last_backup_date', today);
      return;
    }

    // 执行备份
    await _performBackup();
    await settingsDao.set('last_backup_date', today);
  }
}
```

#### 2.13.3 手动备份/恢复

- 导出：生成完整 JSON 包（drift 数据库序列化）
- 恢复：选择备份文件恢复

### 2.14 日志系统（Logs）

#### 2.14.1 定位

`logs` 表是全量审计底表，记录所有操作（含业务操作）。`timeline_events` 是 logs 的派生视图子集，仅展示面向用户的关键事件。

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

#### 2.14.5 查看方式

日志页面（`/log`）：按时间倒序，支持按模块和级别筛选。仅展示技术性日志，不与 Timeline 重复。

**筛选功能**：
- 按模块筛选：下拉菜单，选项 = 所有模块 / task_board / email / accounting / exercise / notes / system
- 按级别筛选：Chip 组，可多选 = info / warn / error（默认选中全部）
- 搜索框：按日志内容关键词搜索
- 筛选结果实时更新列表

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
| 邮箱 | 暂停 IMAP 同步；用户可查看已同步邮件；发送操作排队，恢复连接后自动发送 |
| 任务/笔记/记账/运动 | 不受影响（纯本地操作） |
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

---

### 2.16 数据库版本迁移

#### 2.16.1 迁移策略

```dart
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
    if (details.wasCreated || details.hadUpgrade) {
      await _createFtsTables(Migrator(this));
      await _createFtsTriggers(Migrator(this));
    }
  },
);

Future<void> _migrateToVersion(Migrator m, int version) async {
  switch (version) {
    case 2:
      await m.addColumn(tasks, tasks.subtaskCount);
      await m.createIndex('idx_tasks_parent_id');
      break;
    case 3:
      await m.createTable(calendarEvents);
      break;
    // 未来版本...
  }
}
```

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

**看板拖拽规则**：
- 允许的拖拽路径：`todo ↔ in_progress ↔ done`，`todo/in_progress → suspended`，`suspended → todo`
- 不允许的拖拽：`abandoned` 和 `archived` 不显示在看板列中，只能通过筛选器查看
- 拖拽到不允许的目标列：目标列不显示虚线占位符，拖拽手势无响应（不弹窗）
- 拖拽释放后自动保存状态 + 更新 `updatedAt` + 写入 Logs + 触发 EventBus

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
- 生成新任务时检查 `recurrenceGeneration >= 100` → 停止生成，不创建新任务，写入 logs（action: 'recurrence_limit_reached'）
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

**MVP 阶段**：日历事件 = 任务的 `dueDate` 字段，无独立日历事件表。

```
日历页面显示逻辑：
  → 查询 Tasks 表中 dueDate 不为空的任务
  → 按日期分组显示在日历对应日期上
  → 任务颜色：高=红、中=琥珀、低=蓝（与看板优先级着色一致）
  → 点击日历上的任务标记 → 跳转到任务详情页
  → 拖拽任务到其他日期 → 更新 tasks.dueDate
```

**未来扩展**（Phase 8+）：
- 独立 `CalendarEvents` 表，支持非任务类日历事件
- 钉钉日历同步（只读）
- Google Calendar 双向同步

#### 3.4.3 技术方案

- 农历：`lunar` 包（已确定）
- 日历组件：`table_calendar`（已确定）

#### 3.4.4 页面结构

```
calendar/presentation/pages/
├── calendar_page.dart         # 月/周/日视图
└── calendar_event_detail_page.dart  # 日历上的事件详情
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

#### 3.5.2 邮件同步策略

**整体方案**：通过 `MailDataSource`（封装 enough_mail `MailClient`）进行同步。

- **首次同步**：
  1. `mailClient.fetchMessages(count: syncLimit, fetchPreference: FetchPreference.envelope)` 获取头信息列表
  2. 将头信息写入本地 drift `emails` 表
  3. 对未读邮件逐一调用 `mailClient.fetchMessage()` 获取完整正文（含 MIME 结构）
  4. 排除 >10MB 的附件（仅在需要时按需下载）
- **同步范围**：最近 `emailSyncDays` 天内，且最多 `emailSyncLimit` 封（取交集，参见 3.10 设置页）
- **收取间隔**：
  - 支持 IDLE 的账户：`MailClient` 通过 IMAP IDLE 实时接收新邮件推送，无需轮询
  - 不支持 IDLE 的账户：`mailClient.startPolling(interval: Duration(minutes: pollInterval))` 进行轮询
  - 默认 5 分钟，可在设置页调整（1/5/15/30 分钟）
- **IDLE 支持**：`MailClient` 自动检测 IMAP CAPABILITY，通过 `mailClient.isIdleSupported` 查询
- **断开自动重连**：`MailClient` 内置自动重连 + `MailConnectionLostEvent` / `MailConnectionReEstablishedEvent` 通知
- **增量同步**：
  1. `MailClient` 收到新邮件事件（`MailLoadEvent`）→ 下载正文 → 写入本地 drift → 触发 `NewEmailReceivedEvent`
  2. 对比本地 `emails` 表中存储的 `messageId` 与服务器最新 UID，避免重复存储

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

Widget buildEmailDetail(MimeMessage message, MailClient client) {
  return MimeMessageDownloader(
    mimeMessage: message,
    mailClient: client,
    onDownloaded: (msg) {
      // 将完整 MIME 消息持久化到本地 drift
      emailDao.upsertFullMessage(msg);
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
  final List<String> imagePaths; // 本地图片路径列表
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

#### 3.7.3 页面结构

```
accounting/presentation/pages/
├── accounting_page.dart           # 记账概览（本月汇总 + 最近记录）
├── accounting_form_page.dart      # 新建/编辑记录
├── accounting_report_page.dart    # 月度报表（饼图/柱状图）
└── accounting_category_page.dart  # 分类管理
```

### 3.8 股票（空状态骨架）

Phase 1 仅做空状态占位页，后续统一决定优先级。

仅一张自选股表（`stocks`），行情数据内存持有，不持久化，每次打开页面重新从新浪财经 API 拉取。

#### 3.8.1 页面结构

```
stocks/presentation/pages/
├── stocks_page.dart           # 自选股列表（骨架：空状态占位）
└── stock_add_page.dart        # 添加股票（骨架）
```

### 3.9 运动记录（空状态骨架）

Phase 1 仅做空状态占位页，后续统一决定优先级。

MVP 仅支持手动记录。Repository 接口中预留 `syncFromThirdParty()` 抽象方法，第三方同步（华为健康、Keep）延后到 Phase 8。

#### 3.9.1 领域模型

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
```

#### 3.9.2 页面结构

```
exercise/presentation/pages/
├── exercise_page.dart         # 运动记录列表（骨架：空状态占位）
└── exercise_form_page.dart    # 新建运动记录
```

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
| `INTERNET` | 网络访问 | 自动授予（普通权限） | 无法使用邮箱/股票 |
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

```dart
Workmanager().registerPeriodicTask(
  'email-fetch',
  'backgroundEmailFetch',
  frequency: Duration(minutes: 15),
  constraints: Constraints(networkType: NetworkType.connected),
);
```

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

### A. 完整数据流示例

#### 新邮件 → 通知 + Dashboard + Timeline + Logs

```
MailClient 通过 IDLE/轮询发现新邮件
  → mailClient.eventBus 发出 MailLoadEvent
  → EmailRepositoryImpl 接收 MailLoadEvent：
      ├── 下载完整 MIME 消息（mailClient.fetchMessage）
      ├── 存入 drift emails 表（含 bodyText/bodyHtml/附件元数据）
      ├── 写入 logs 表（action: 'email_received'）
      └── 同时写入 timeline_events（派生）
  → EasyWork eventBus.publish(NewEmailReceivedEvent(...))
  │
  ├── Timeline 订阅 → UI 重建：时间线新增记录
  ├── Dashboard 订阅 → 未读数 +1
  ├── Notification → Windows 弹窗 / Android 通知栏
  └── Logs 底表已有记录
```

#### 用户完成任务

```
拖拽卡片到 "已完成" 列
  → taskRepoProvider.updateStatus(taskId, 'done', 'in_progress')
  │
  ├── drift: UPDATE tasks SET status='done'
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
    final account = MailAccount.fromDiscoveredSettings('my account', email, password, config);
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
    final builder = MessageBuilder.prepareReplyMessage(originalMessage);
    // 自动设置：to = original.from, subject = "Re: " + original.subject
    // 引用原文、保持原邮件 ID 关联（In-Reply-To / References 头）
  → 打开 compose_page（回复模式）：
    ├── 收件人：自动填充（来自 MailAddress）
    ├── 主题：自动预填 "Re: xxx"
    ├── 签名：自动插入默认签名（可切换/删除）
    └── 正文区域上方引用原文（由 prepareReplyMessage 自动处理）：
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
    ├── 文件格式校验（是否为合法的 EasyWork 备份 JSON）
    ├── 版本校验（备份版本是否兼容当前版本）
    └── 校验失败 → 错误提示，中止
  → 显示备份摘要：备份日期、包含记录数（任务/邮件/笔记等数量）
  → 确认弹窗：
    "恢复将覆盖当前所有数据，且不可撤销。是否继续？"
    → 取消 → 中止
    → 确认 → 执行恢复
      1. 先自动备份当前数据库（以防恢复后后悔）
      2. 清空当前所有表
      3. 导入备份数据（不含密码，密码存储在 flutter_secure_storage 中）
      4. 校验导入完整性（记录数是否匹配）
      ├── 成功 → 重启应用（数据已替换）
      └── 失败 → 回滚到步骤1的自动备份，提示"恢复失败，已回滚"

密码处理说明：
  备份 JSON 中不包含邮箱密码（密码存储在系统级安全存储 flutter_secure_storage 中）
  恢复后邮箱账户配置会导入，但密码字段为空
  → 应用检测到有邮箱账户但无对应密码时：
    → 邮箱模块显示红色提示："部分邮箱账户需要重新输入密码"
    → 用户点击 → 跳转到邮箱账户管理页 → 逐个重新输入密码
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
  riverpod_generator: ^2.4.0
  freezed: ^2.5.0
  freezed_annotation: ^2.4.0
  json_annotation: ^4.9.0
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
