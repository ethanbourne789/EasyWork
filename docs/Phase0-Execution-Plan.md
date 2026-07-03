# Phase 0 执行计划：项目脚手架

> 基于 EasyWork-Design4.md v4.4.0 | 生成日期：2026-07-02

---

## 总览

Phase 0 包含 12 个子任务，产出约 45 个文件。目标是创建一个可编译运行的 Flutter 项目脚手架，包含完整的数据库定义、状态管理、主题系统、国际化、路由、事件总线、错误处理、平台检测和通用组件。

**完成条件**：`flutter run` 可启动，主题切换/i18n/路由导航/EventBus 发布订阅均工作正常。

---

## 0.1 Flutter 项目初始化

**目标**：创建 Flutter 项目，配置所有依赖和 lint 规则

### 步骤

1. `flutter create --org com.easywork easy_work`（Windows + Android 双平台）
2. 替换 `pubspec.yaml` 为设计文档 §9.1 的完整配置
3. 配置 `analysis_options.yaml`（§14.1）
4. 运行 `flutter pub get` 验证依赖解析成功

### 文件清单
- `pubspec.yaml` — 全量依赖配置
- `analysis_options.yaml` — lint 规则
- `l10n.yaml` — i18n 配置（§2.8.2）

### 关键依赖版本
| 依赖 | 版本 |
|---|---|
| flutter_riverpod | ^2.5.0 |
| drift | ^2.18.0 |
| go_router | ^14.0.0 |
| enough_mail | ^2.1.7 |
| enough_mail_flutter | ^2.1.2 |
| flutter_quill | ^10.0.0 |
| fl_chart | ^0.68.0 |
| table_calendar | ^3.1.0 |

---

## 0.2 目录结构

**目标**：创建完整的 Clean Architecture + Feature-first 目录树

### 步骤
创建以下目录结构（每个目录放 `.gitkeep` 或初始 barrel 文件）：

```
lib/
├── core/
│   ├── design_system/tokens/
│   ├── design_system/themes/
│   ├── design_system/providers/
│   ├── design_system/widgets/
│   ├── router/
│   ├── database/
│   ├── errors/
│   ├── security/
│   ├── network/
│   ├── validation/
│   ├── platform/
│   └── extensions/
├── l10n/
├── shared/
│   ├── widgets/
│   ├── models/
│   └── events/
├── features/
│   ├── dashboard/
│   ├── timeline/
│   ├── task_board/
│   ├── calendar/
│   ├── email/
│   ├── contacts/
│   ├── notes/
│   ├── accounting/
│   ├── stocks/
│   ├── exercise/
│   ├── log/
│   └── settings/
├── main.dart
└── app.dart
```

每个 feature 模块内创建：
```
feature/
├── domain/
│   ├── models/
│   ├── repositories/
│   └── usecases/
├── data/
│   ├── repositories/
│   ├── datasources/
│   └── database/
├── presentation/
│   ├── providers/
│   ├── pages/
│   └── widgets/
└── feature_feature.dart  # barrel export
```

---

## 0.3 数据库（drift）

**目标**：定义全部 24 个 drift Table 类，创建 AppDatabase，实现 FTS5 和迁移

### 步骤

1. 定义所有 24 个 Table 类（§2.2.3 - §2.2.11）：
   - EmailAccounts, Emails, EmailAttachments, PendingEmails
   - Contacts, ContactGroups, ContactGroupMembers
   - EmailSignatures, EmailToTask
   - Tasks, TaskComments
   - Notes, NoteTags, NoteTagMembers
   - AccountingRecords, AccountingCategories, AccountingBudgets
   - ExerciseRecords
   - Stocks
   - CalendarEvents
   - Settings
   - Logs, TimelineEvents

2. 创建 `AppDatabase` 类（§2.2.2）：
   - `@DriftDatabase` 注解注册所有表
   - `schemaVersion => 3`
   - `MigrationStrategy` 含 `onCreate`、`onUpgrade`、`beforeOpen`

3. 实现 FTS5 虚拟表创建（§2.2.12）：
   - tasks_fts, emails_fts, contacts_fts, notes_fts

4. 实现 FTS 同步触发器（INSERT/UPDATE/DELETE）

5. 实现 `_insertDefaultData()`（预设记账分类 + 默认设置项）

6. 实现 `_migrateToVersion()` 支持 v1→v3 跳跃升级

7. 配置 `DatabaseConnection`（支持 driftIsolate）

8. 创建 `createAppDatabase()` 异步工厂函数（§2.2.2）

### 文件清单
- `lib/core/database/app_database.dart`
- `lib/core/database/tables/email_accounts_table.dart`
- `lib/core/database/tables/emails_table.dart`
- `lib/core/database/tables/email_attachments_table.dart`
- `lib/core/database/tables/pending_emails_table.dart`
- `lib/core/database/tables/contacts_table.dart`
- `lib/core/database/tables/contact_groups_table.dart`
- `lib/core/database/tables/contact_group_members_table.dart`
- `lib/core/database/tables/email_signatures_table.dart`
- `lib/core/database/tables/email_to_task_table.dart`
- `lib/core/database/tables/tasks_table.dart`
- `lib/core/database/tables/task_comments_table.dart`
- `lib/core/database/tables/notes_table.dart`
- `lib/core/database/tables/note_tags_table.dart`
- `lib/core/database/tables/note_tag_members_table.dart`
- `lib/core/database/tables/accounting_records_table.dart`
- `lib/core/database/tables/accounting_categories_table.dart`
- `lib/core/database/tables/accounting_budgets_table.dart`
- `lib/core/database/tables/exercise_records_table.dart`
- `lib/core/database/tables/stocks_table.dart`
- `lib/core/database/tables/calendar_events_table.dart`
- `lib/core/database/tables/settings_table.dart`
- `lib/core/database/tables/logs_table.dart`
- `lib/core/database/tables/timeline_events_table.dart`

### 关键设计点
- schemaVersion = 3（跳过 v2）
- CalendarEvents 在 v3 时创建（`m.createTable(calendarEvents)`）
- Stock 表有 `uniqueKeys: [{code, market}]`
- Settings 表主键为 `key`（TextColumn）
- 所有时间字段使用 DateTimeColumn

---

## 0.4 状态管理（Riverpod）

**目标**：定义所有全局 Provider（数据库、DAO、EventBus、凭据存储）

### 步骤

1. `ProviderScope` 包裹 `main()` 中的 `EasyWorkApp`

2. 定义核心 Provider：
   - `appDatabaseProvider` — FutureProvider<AppDatabase>
   - `connectivityProvider` — StreamProvider<List<ConnectivityResult>>
   - `notificationServiceProvider` — Provider<NotificationService>

3. 定义所有 15 个 DAO Provider（FutureProvider，§2.2.15）：
   - emailDaoProvider
   - taskDaoProvider
   - settingsDaoProvider
   - contactDaoProvider
   - noteDaoProvider
   - accountingDaoProvider
   - searchDaoProvider
   - logDaoProvider
   - timelineDaoProvider
   - stockDaoProvider
   - exerciseDaoProvider
   - calendarDaoProvider
   - pendingEmailDaoProvider
   - emailSignatureDaoProvider
   - emailAttachmentDaoProvider

4. 定义 Repository Provider：
   - emailRepositoryProvider
   - taskRepositoryProvider
   - contactRepositoryProvider
   - noteRepositoryProvider
   - accountingRepositoryProvider
   - exerciseRepositoryProvider
   - stockRepositoryProvider

5. 定义 `eventBusProvider` — Provider<EventBus>
6. 定义 `eventSubscriptionsProvider` — Provider<EventSubscriptions>
7. 定义 `credentialStoreProvider` — Provider<CredentialStore>

### 文件清单
- `lib/core/providers/database_providers.dart`
- `lib/core/providers/event_providers.dart`
- `lib/core/providers/repository_providers.dart`

### 关键设计点
- 所有 DAO Provider 使用 `ref.watch(appDatabaseProvider.future)` 获取 DB 实例
- Repository Provider 使用 `.requireValue` 获取 DAO（需确保 DB 已初始化）
- EventBus 在 `ref.onDispose` 时关闭

---

## 0.5 主题系统

**目标**：实现 Design Tokens、ThemeExtension、Light/Dark ThemeData、主题切换

### 步骤

1. 创建 Design Tokens（§2.7.2-2.7.5）：
   - `AppColors` — 所有颜色常量（Light + Dark）
   - `AppSpacing` — 间距常量（space-1 到 space-10）
   - `AppRadius` — 圆角常量（radius-sm/md/lg/full）
   - `AppTypography` — 字体样式（display/headline/title/body/bodySmall/label/caption）

2. 实现 `EasyWorkTheme` ThemeExtension（§2.7.8）：
   - frost, success, warning, primaryContainer, secondaryContainer, surfaceVariant
   - static const light 和 static const dark 实例

3. 创建 `LightTheme` ThemeData 构建器（§2.7.2 Light Mode）
4. 创建 `DarkTheme` ThemeData 构建器（§2.7.2 Dark Mode）

5. 实现 `ThemeModeNotifier`（StateNotifierProvider，§2.7.9）：
   - setTheme() — 写入 SettingsDao
   - loadTheme() — 从 SettingsDao 读取

6. 创建 `themeModeProvider`

### 文件清单
- `lib/core/design_system/tokens/app_colors.dart`
- `lib/core/design_system/tokens/app_spacing.dart`
- `lib/core/design_system/tokens/app_radius.dart`
- `lib/core/design_system/tokens/app_typography.dart`
- `lib/core/design_system/tokens/easy_work_theme.dart`
- `lib/core/design_system/themes/light_theme.dart`
- `lib/core/design_system/themes/dark_theme.dart`
- `lib/core/design_system/providers/theme_provider.dart`

### 关键颜色值
| Token | Light | Dark |
|---|---|---|
| primary | #2563EB | #60A5FA |
| surface | #F8FAFC | #0F172A |
| surfaceContainer | #FFFFFF | #1E293B |
| onSurface | #0F172A | #F1F5F9 |
| error | #DC2626 | #F87171 |

---

## 0.6 国际化（中英双语）

**目标**：配置 i18n，创建 ARB 文件，生成 AppLocalizations

### 步骤

1. 配置 `l10n.yaml`（§2.8.2）：
   ```yaml
   arb-dir: lib/l10n
   template-arb-file: app_zh.arb
   output-localization-file: app_localizations.dart
   output-class: EasyWorkLocalizations
   synthetic-package: false
   ```

2. 创建 `app_zh.arb` — 中文字符串（含 common_/nav_/task_/email_ 等前缀）
3. 创建 `app_en.arb` — 英文字符串
4. 运行 `flutter gen-l10n` 生成 `AppLocalizations`

### 文件清单
- `lib/l10n/app_zh.arb`
- `lib/l10n/app_en.arb`
- `lib/l10n/app_localizations.dart`（生成）

### 字符串前缀规范（§2.8.3）
| 前缀 | 模块 | 示例 |
|---|---|---|
| common_ | 全局通用 | common_save, common_cancel, common_confirm |
| nav_ | 导航栏 | nav_dashboard, nav_email |
| task_ | 任务看板 | task_create |
| email_ | 邮箱 | email_inbox |
| settings_ | 设置 | settings_language, settings_theme |
| error_ | 错误 | error_network |

---

## 0.7 路由（go_router）

**目标**：创建 GoRouter 配置，实现 ShellRoute 和 AppShell

### 步骤

1. 创建 `GoRouter` 配置，注册所有路由（§2.5.1）：
   - / → Dashboard
   - /tasks → TaskBoardPage
   - /tasks/list → TaskListPage
   - /tasks/calendar → TaskCalendarPage
   - /tasks/new → TaskFormPage
   - /tasks/:id → TaskDetailPage
   - /calendar → CalendarPage
   - /email → EmailListPage
   - /email/:id → EmailDetailPage
   - /email/compose → ComposePage
   - /email/accounts → EmailAccountsPage
   - /contacts → ContactListPage
   - /contacts/new → ContactFormPage
   - /contacts/:id → ContactDetailPage
   - /contacts/groups → ContactGroupPage
   - /signatures → SignatureManagePage
   - /notes → NoteListPage
   - /notes/:id → NoteDetailPage
   - /stocks → StocksPage
   - /accounting → AccountingPage
   - /accounting/new → AccountingFormPage
   - /accounting/report → AccountingReportPage
   - /exercise → ExercisePage
   - /log → LogPage
   - /search → SearchPage
   - /settings → SettingsPage
   - /settings/backup → SettingsBackupPage

2. 实现 ShellRoute（§2.5.2）：
   - 桌面（>900px）：NavigationRail
   - 中间态（600-900px）：ExpandableNavigationRail
   - 移动端（<600px）：Drawer

3. 实现 `AppShell`（§2.5.2）：响应式布局切换

4. 配置 Deep Link 路由（easywork://）

### 文件清单
- `lib/core/router/app_router.dart`
- `lib/presentation/app_shell.dart`
- `lib/presentation/navigation_rail.dart`
- `lib/presentation/navigation_drawer.dart`

---

## 0.8 EventBus 核心

**目标**：实现 EventBus 类和所有事件定义

### 步骤

1. 实现 `EventBus` 类（§2.4.3）：
   - StreamController.broadcast
   - on<T>() — 类型安全的事件监听
   - publish<T>() — 发布事件
   - dispose() — 关闭 StreamController

2. 创建 `AppEvent` 基类 + `DataChangedEvent<T>`（§2.4.3）

3. 定义所有事件类（§2.4.4）：
   - task_events.dart: TaskCreatedEvent, TaskStatusChangedEvent, TaskDeletedEvent
   - email_events.dart: NewEmailReceivedEvent, EmailConvertedToTaskEvent, UnreadCountChangedEvent, EmailConnectionLostEvent, EmailConnectionReestablishedEvent
   - accounting_events.dart: TransactionRecordedEvent
   - exercise_events.dart: ExerciseCompletedEvent
   - note_events.dart: NoteUpdatedEvent
   - notification_events.dart: RequestNotificationEvent
   - network_events.dart: OnlineEvent, OfflineEvent

### 文件清单
- `lib/core/event/event_bus.dart`
- `lib/core/event/app_event.dart`
- `lib/shared/events/task_events.dart`
- `lib/shared/events/email_events.dart`
- `lib/shared/events/accounting_events.dart`
- `lib/shared/events/exercise_events.dart`
- `lib/shared/events/note_events.dart`
- `lib/shared/events/notification_events.dart`
- `lib/shared/events/network_events.dart`

---

## 0.9 错误处理框架

**目标**：实现异常层级、Result 类型、全局错误捕获

### 步骤

1. 创建 `AppException` 基类 + 子类（§2.10.1）：
   - NetworkException
   - EmailException（含 EmailErrorType 枚举）
   - DatabaseException
   - ValidationException

2. 实现 `Result<T>` sealed class（§2.10.2）：
   - Success<T>
   - Failure<T>

3. 配置全局错误捕获（§2.10.3）：
   - `FlutterError.onError`
   - `runZonedGuarded`

4. 实现错误写入 drift Logs 表

### 文件清单
- `lib/core/errors/app_exception.dart`
- `lib/core/errors/result.dart`
- `lib/core/errors/global_error_handler.dart`

### EmailErrorType 枚举值
- authFailed, connectionFailed, timeout, sslError, smtpAuthFailed, sendFailed

---

## 0.10 平台能力检测

**目标**：实现平台能力检测、权限管理、通知渠道注册

### 步骤

1. 实现 `PlatformCapabilities` 类（§4.1）：
   - hasSystemTray → Platform.isWindows
   - hasBackgroundService → Platform.isAndroid
   - hasDeepLinks → Platform.isAndroid
   - hasShareIntent → Platform.isAndroid
   - hasAutoStart → Platform.isWindows
   - hasFileAssociation → Platform.isWindows

2. 实现 `PermissionHelper`（§4.3.0）：
   - 通知权限请求
   - 存储权限请求

3. Android 通知渠道注册（§10.5）：
   - email_channel
   - task_channel
   - system_channel

4. Windows 托盘/窗口管理初始化占位

### 文件清单
- `lib/core/platform/platform_capabilities.dart`
- `lib/core/platform/permission_helper.dart`
- `lib/core/platform/notification_channel_helper.dart`

---

## 0.11 工具类

**目标**：实现平台判断、日期格式化、输入校验、网络重试

### 步骤

1. `PlatformUtil`（§2.6.1）：
   - isDesktop, isMobile, isTablet
   - getBreakpoint(width) → mobile/tablet/desktop

2. `DateUtil`：
   - formatDate(), formatTime(), formatRelative()
   - 农历转换接口（预留）

3. `Validators`（§2.10.5）：
   - email(String?)
   - password(String?)
   - imapHost(String?)
   - port(String?)
   - required(String?, String fieldName)

4. `RetryHandler`（§2.10.6）：
   - retry<T>({action, maxRetries, baseDelay, retryableExceptions})
   - 指数退避：baseDelay * (1 << attempt)

### 文件清单
- `lib/core/utils/platform_util.dart`
- `lib/core/utils/date_util.dart`
- `lib/core/utils/validators.dart`
- `lib/core/utils/retry_handler.dart`

---

## 0.12 通用组件

**目标**：实现空状态、加载、错误、确认弹窗、响应式组件

### 步骤

1. `EmptyStateWidget`（§8.1）：
   - icon（模块相关，outlined，64px）
   - 主文字（"暂无xxx"）
   - 副文字（"点击+号添加"）
   - CTA 按钮（"立即添加"）

2. `LoadingWidget`：
   - CircularProgressIndicator 居中

3. `EasyWorkErrorWidget`（§8.1）：
   - 错误图标（error 色，64px）
   - userMessage（i18n）
   - 重试按钮
   - kDebugMode 时可展开 technical 信息

4. `ConfirmDialog`：
   - 标题 + 内容 + 确认/取消按钮

5. `ResponsiveBuilder`（§2.6.6）：
   - 根据 MediaQuery 断点返回不同 Widget

6. `ResponsiveGrid`（§2.6.7）：
   - 自动计算列数（<600: 1列, 600-900: 2列, >900: 3-4列）

7. `AdaptiveScaffold`（§2.6.2）：
   - 自动切换 NavigationRail / Drawer

### 文件清单
- `lib/shared/widgets/empty_state_widget.dart`
- `lib/shared/widgets/loading_widget.dart`
- `lib/shared/widgets/error_widget.dart`
- `lib/shared/widgets/confirm_dialog.dart`
- `lib/shared/widgets/responsive_builder.dart`
- `lib/shared/widgets/responsive_grid.dart`
- `lib/shared/widgets/adaptive_scaffold.dart`

---

## 依赖顺序

```
0.1 项目初始化
  ↓
0.2 目录结构
  ↓
0.3 数据库（drift Tables + AppDatabase）
  ↓
0.4 状态管理（Riverpod Providers）
  ↓
0.5 主题系统
  ↓
0.6 国际化
  ↓
0.7 路由（go_router + AppShell）
  ↓
0.8 EventBus
  ↓
0.9 错误处理
  ↓
0.10 平台能力检测
  ↓
0.11 工具类
  ↓
0.12 通用组件
```

**验证点**：完成 0.1-0.4 后可验证 `flutter analyze` 无错误；完成 0.12 后可验证 `flutter run` 可启动。

---

## 验证清单

- [ ] `flutter pub get` 成功
- [ ] `flutter analyze` 无错误（仅 warnings）
- [ ] `flutter build windows` / `flutter build apk` 成功
- [ ] `dart run build_runner build --delete-conflicting-outputs` 成功（drift 代码生成）
- [ ] `flutter gen-l10n` 成功
- [ ] 应用可启动，显示默认主题
- [ ] 路由导航可切换（ShellRoute 工作正常）
- [ ] EventBus 发布/订阅工作正常
- [ ] 主题切换（浅色/深色）工作正常
- [ ] 语言切换（中文/英文）工作正常

---

## 风险与注意事项

1. **drift 代码生成**：首次需运行 `dart run build_runner build`，否则 `.g.dart` 文件不存在会导致编译错误
2. **enough_mail 传递依赖**：`enough_mail_html`、`enough_convert`、`flutter_inappwebview` 无需在 pubspec.yaml 中显式声明
3. **schemaVersion=3**：迁移逻辑必须处理 v1→v3 跳跃（v2 为预留空操作）
4. **Provider 依赖顺序**：appDatabaseProvider 必须先于所有 DAO Provider 初始化
5. **Windows 平台**：system_tray、window_manager 仅 Windows 可用，需条件导入或运行时检查
