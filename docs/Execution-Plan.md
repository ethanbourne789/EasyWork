# EasyWork 执行计划

> 基于 EasyWork-Design4.md v4.4.0 | 生成日期：2026-07-02

---

## 总览

| Phase | 名称 | 复杂度 | 预估任务数 | 依赖 |
|---|---|---|---|---|
| 0 | 项目脚手架 | 高 | 12 | 无 |
| 1 | UI 骨架 + 导航 | 中 | 8 | Phase 0 |
| 2 | 邮箱模块 | 高 | 14 | Phase 0, 1 |
| 3 | 任务看板 | 中 | 9 | Phase 0, 1 |
| 4 | Dashboard + Timeline | 中 | 6 | Phase 0, 2, 3 |
| 5 | 日历 | 中 | 5 | Phase 0, 3 |
| 6 | 笔记 + 记账 | 中 | 8 | Phase 0 |
| 7 | 日志 + 设置 + 备份 + 托盘 | 中 | 9 | Phase 0, 2 |
| 8 | 扩展模块 | 中 | 6 | Phase 0 |

**总计：77 个任务**

---

## Phase 0：项目脚手架

> Flutter 初始化、目录结构、drift + Riverpod、主题、i18n、响应式布局、EventBus、错误处理、平台检测

### 0.1 Flutter 项目初始化
- [ ] `flutter create --org com.easywork easy_work`
- [ ] 配置 `pubspec.yaml`（所有依赖，见 Design4 §9.1）
- [ ] 配置 `analysis_options.yaml`（lint 规则，见 Design4 §14.1）
- [ ] 验证 `flutter pub get` 成功

### 0.2 目录结构
- [ ] 创建 `lib/core/`（design_system, router, database, errors, security, network, validation, platform, extensions）
- [ ] 创建 `lib/data/`（dao, datasource, database, model, repository）
- [ ] 创建 `lib/domain/`（entity, repository, usecase）
- [ ] 创建 `lib/presentation/`（page, widget, provider, state）
- [ ] 创建 `lib/shared/`（widgets, models, events）
- [ ] 创建 `lib/features/`（11 个模块子目录）
- [ ] 创建 `lib/l10n/`（ARB 文件）
- [ ] 创建 `test/` 目录结构

### 0.3 数据库（drift）
- [ ] 定义所有 24 个 `Table` 类（Emails, Contacts, Tasks, Notes 等，见 §2.2.3-2.2.11）
- [ ] 创建 `AppDatabase` 类，注册所有表（§2.2.2）
- [ ] 实现 Migration（schemaVersion=3，onCreate + onUpgrade）
- [ ] 创建 FTS5 虚拟表（tasks_fts, emails_fts, contacts_fts, notes_fts）
- [ ] 创建 FTS 同步触发器（INSERT/UPDATE/DELETE）
- [ ] 实现 `_insertDefaultData()`（预设记账分类 + 默认设置项）
- [ ] 配置 `DatabaseConnection`（支持 driftIsolate）
- [ ] 创建 `createAppDatabase()` 异步工厂函数

### 0.4 状态管理（Riverpod）
- [ ] `ProviderScope` 包裹 `main()`
- [ ] 定义核心 Provider：`appDatabaseProvider`, `connectivityProvider`, `notificationServiceProvider`
- [ ] 定义所有 15 个 DAO Provider（FutureProvider，见 §2.2.15）
- [ ] 定义 `eventBusProvider`, `eventSubscriptionsProvider`
- [ ] 定义 `credentialStoreProvider`

### 0.5 主题系统
- [ ] 创建 Design Tokens（app_colors, app_spacing, app_radius, app_typography）
- [ ] 实现 `EasyWorkTheme` ThemeExtension（§2.7.8）
- [ ] 创建 `LightTheme` 和 `DarkTheme` ThemeData 构建器
- [ ] 实现 `ThemeModeNotifier`（StateNotifierProvider，读写 Settings 表）
- [ ] 创建 `themeModeProvider`

### 0.6 国际化（中英双语）
- [ ] 配置 `l10n.yaml`（§2.8.2）
- [ ] 创建 `app_zh.arb` 和 `app_en.arb`（含 common_, nav_, task_, email_ 等前缀字符串）
- [ ] 运行 `flutter gen-l10n` 生成 `AppLocalizations`
- [ ] 实现语言切换逻辑（写入 SettingsDao）

### 0.7 路由（go_router）
- [ ] 创建 `GoRouter` 配置，注册所有路由（§2.5.1）
- [ ] 实现 ShellRoute（桌面 NavigationRail / 移动端底部导航）
- [ ] 实现 `AppShell`（§2.5.2，含 ExpandableNavigationRail）
- [ ] 配置 Deep Link 路由（easywork://）

### 0.8 EventBus 核心
- [ ] 实现 `EventBus` 类（StreamController.broadcast，§2.4.3）
- [ ] 创建 `AppEvent` 基类和 `DataChangedEvent<T>`
- [ ] 定义所有事件类（task_events, email_events, accounting_events, exercise_events, note_events, notification_events, network_events，§2.4.4）

### 0.9 错误处理框架
- [ ] 创建 `AppException` 基类 + 子类（NetworkException, EmailException, DatabaseException, ValidationException，§2.10.1）
- [ ] 实现 `Result<T>` sealed class（§2.10.2）
- [ ] 配置全局错误捕获（`FlutterError.onError` + `runZonedGuarded`）
- [ ] 实现错误写入 drift Logs 表

### 0.10 平台能力检测
- [ ] 实现 `PlatformCapabilities` 类（§4.1）
- [ ] 实现 `PermissionHelper`（通知、存储权限请求，§4.3.0）
- [ ] Android 通知渠道注册（§10.5）
- [ ] Windows 托盘/窗口管理初始化占位

### 0.11 工具类
- [ ] `PlatformUtil`（平台判断、桌面/移动检测）
- [ ] `DateUtil`（日期格式化、农历转换接口）
- [ ] `Validators`（email, password, imapHost, port, required，§2.10.5）
- [ ] `RetryHandler`（网络重试，§2.10.6）

### 0.12 通用组件
- [ ] `EmptyStateWidget`（图标 + 主文字 + 副文字 + CTA 按钮）
- [ ] `LoadingWidget`（CircularProgressIndicator 居中）
- [ ] `EasyWorkErrorWidget`（错误图标 + userMessage + 重试按钮）
- [ ] `ConfirmDialog`（确认/取消弹窗）
- [ ] `ResponsiveBuilder`（断点判断）
- [ ] `ResponsiveGrid`（自动列数计算）
- [ ] `AdaptiveScaffold`（NavigationRail / Drawer 切换）

---

## Phase 1：UI 骨架 + 导航

> 所有功能的空状态占位页面 + 导航切换

### 1.1 AppShell 导航实现
- [ ] 实现 `AppShell`（§2.5.2）：>900px 固定 NavigationRail，600-900px 可展开，<600px Drawer
- [ ] 实现 `EasyWorkNavigationRail`（核心 6 项 + "更多"折叠 5 项）
- [ ] 实现 `EasyWorkDrawer`（移动端侧栏）
- [ ] 导航栏未读邮件红点标记

### 1.2 核心模块占位页（6 个）
- [ ] `DashboardPage` 占位（Grid 区域骨架）
- [ ] `TaskBoardPage` 占位（看板列骨架）
- [ ] `CalendarPage` 占位（日历组件骨架）
- [ ] `EmailListPage` 占位（文件夹 Tab + 列表骨架）
- [ ] `NoteListPage` 占位（列表骨架）
- [ ] `AccountingPage` 占位（概览骨架）

### 1.3 更多模块占位页（5 个）
- [ ] `TimelinePage` 占位
- [ ] `StocksPage` 占位（空状态："暂无自选股"）
- [ ] `ExercisePage` 占位（空状态："暂无运动记录"）
- [ ] `LogPage` 占位
- [ ] `SettingsPage` 占位

### 1.4 路由注册
- [ ] 将所有占位页注册到 GoRouter
- [ ] 验证导航切换正常（Rail ↔ Drawer）

### 1.5 响应式布局验证
- [ ] 调整窗口宽度，验证断点切换（<600 / 600-900 / >900）
- [ ] 验证 ExpandableNavigationRail 展开/收起动画

---

## Phase 2：邮箱模块

> 账户配置 → IMAP 收信 → 邮件列表/详情 → 联系人 → 签名 → 邮件→任务 → 多账户并行

### 2.1 邮箱数据层
- [ ] 实现 `EmailDao`（findByMessageId, insertMessage, updateMessage, getAllAccounts, getByFolder, getUnreadCount 等）
- [ ] 实现 `EmailRepository` 接口（domain 层）
- [ ] 实现 `EmailRepositoryImpl`（data 层）
- [ ] 实现 `EmailSignatureDao` + `EmailAttachmentDao`
- [ ] 实现 `PendingEmailDao`（离线发送队列）

### 2.2 MailDataSource 核心
- [ ] 实现 `MailDataSource` 类（§2.2.16）：封装 MailClient + EventBus 桥接
- [ ] 实现 `MailDataSourcesNotifier`（§2.2.15）：addAccount, removeAccount, connectAll, disconnectAll
- [ ] 实现 `mailDataSourcesProvider`（StateNotifierProvider）
- [ ] 实现 `discoverConfig()`（Discover API 封装）

### 2.3 凭据安全
- [ ] 实现 `CredentialStore`（§2.10.4）：savePassword, getPassword, deletePassword
- [ ] 实现 `credentialStoreProvider`

### 2.4 连接测试
- [ ] 实现 `testConnection()` 函数（§7.15）：临时 MailClient 测试
- [ ] 实现 `ConnectionTestResult` 类
- [ ] 实现 `EmailErrorType` 枚举 + 用户消息映射

### 2.5 账户管理 UI
- [ ] `EmailAccountsPage`：账户列表 + 添加/编辑/删除
- [ ] `EmailAccountFormPage`：添加/编辑表单（IMAP 自动发现 + 手动配置）
- [ ] 连接测试流程 + 诊断信息展示
- [ ] 密码输入 → flutter_secure_storage 存储

### 2.6 邮件同步
- [ ] 首次同步逻辑（envelope fetch + unread body download）
- [ ] 增量同步（IDLE 或 polling，根据 supportsIdle）
- [ ] UIDVALIDITY/UIDNEXT 追踪
- [ ] `MimeMessageMapper`（MimeMessage → EmailsCompanion，§7.14）
- [ ] `extractAttachments()`（附件元数据提取）
- [ ] `upsertFullMessage()`（持久化完整 MIME）

### 2.7 邮件列表 UI
- [ ] `EmailListPage`（文件夹 Tab 切换 + 邮件列表）
- [ ] 分页加载（30 条/页，滚动到底部触发）
- [ ] 空状态处理（未配置账户 / 无邮件 / 文件夹为空）
- [ ] 未读标记（左侧 primary 竖条 + 主题加粗）

### 2.8 邮件详情 UI
- [ ] `EmailDetailPage`（MimeMessageDownloader + MimeMessageViewer）
- [ ] Master-Detail 响应式布局（§2.6.5）
- [ ] 自动标记已读（markAsSeen: true）
- [ ] 内联图片渲染（cid:// 协议）
- [ ] 附件保存/打开选项

### 2.9 写邮件/回复/转发
- [ ] `ComposePage`（MessageBuilder 集成）
- [ ] 收件人搜索选择（联系人/分组）
- [ ] 签名自动插入（默认签名，可切换）
- [ ] 附件添加（file_picker）
- [ ] 草稿自动保存（每 30 秒）
- [ ] 回复（prepareReplyToMessage）+ 转发（prepareForwardMessage）
- [ ] 发送失败处理 + 离线队列（PendingEmails）

### 2.10 联系人模块
- [ ] 实现 `ContactDao` + `ContactRepository` + `ContactRepositoryImpl`
- [ ] `ContactListPage`（搜索 + 分组筛选，分页 50 条/页）
- [ ] `ContactDetailPage`（详情 + 关联邮件）
- [ ] `ContactFormPage`（新建/编辑）
- [ ] `ContactGroupPage`（分组 CRUD + 成员管理）
- [ ] VCF 导入（charset 检测 + enough_convert + vcard 解析）
- [ ] VCF 导出（vcard 序列化 + file_picker 保存）
- [ ] "从发件人添加"（§7.5）

### 2.11 邮件签名
- [ ] `SignatureManagePage`（多签名管理）
- [ ] HTML/文本编辑器
- [ ] 默认签名设置
- [ ] 写邮件时签名切换

### 2.12 邮件→任务联动
- [ ] 邮件详情"转为任务"按钮
- [ ] 弹窗表单（标题、描述、优先级、截止日期、附件）
- [ ] 附件复制到 tasks/{task_id}/attachments/
- [ ] email_to_task 表写入
- [ ] 邮件详情显示"已关联任务"

### 2.13 Provider 定义
- [ ] `emailAccountListProvider`（FutureProvider）
- [ ] `emailListProvider`（按文件夹）
- [ ] `unreadCountProvider`（派生）
- [ ] `emailDetailProvider`（autoDispose）
- [ ] `composeEmailProvider`
- [ ] `contactListProvider`
- [ ] `contactGroupProvider`
- [ ] `signatureProvider`

### 2.14 邮箱模块 barrel export
- [ ] 创建 `email_feature.dart`（导出模块内所有 public API）

---

## Phase 3：任务看板

> 任务 CRUD、看板/列表/日历视图、拖拽排序、周期任务

### 3.1 任务数据层
- [ ] 实现 `TaskDao`（getAll, getByStatus, create, update, delete, updateStatusWithOptimisticLock）
- [ ] 实现 `TaskRepository` 接口
- [ ] 实现 `TaskRepositoryImpl`（含乐观锁、EventBus 发布）
- [ ] 定义 `TaskEntity`、`TaskPriority`、`TaskStatus` 枚举 + 映射（§3.3.1a）

### 3.2 看板视图
- [ ] `TaskBoardPage`（4 列：todo/in_progress/done/suspended）
- [ ] 拖拽卡片移动（允许的路径：§3.3.2）
- [ ] 响应式布局（<600px PageView 横向滚动，600-900px 横向 Row，>900px Expanded 均分）
- [ ] 空列占位框（虚线 + "拖拽任务到此处"）
- [ ] 拖拽触觉反馈（HapticFeedback.mediumImpact）

### 3.3 列表视图
- [ ] `TaskListPage`（表格/列表，支持按优先级/截止日期/标签排序筛选）
- [ ] 分页（30 条/页）

### 3.4 日历视图
- [ ] `TaskCalendarPage`（有 dueDate 的任务标记在日历上）
- [ ] 拖拽调整截止日

### 3.5 任务表单
- [ ] `TaskFormPage`（新建/编辑，共用）
- [ ] 必填：标题
- [ ] 可选：描述、优先级、截止日期、标签、预估时长、周期规则
- [ ] 周期规则：仅当"周期任务"开关打开时显示 RRULE 选择器

### 3.6 任务详情
- [ ] `TaskDetailPage`（评论、子任务列表、邮件关联）
- [ ] 子任务进度条（progressPercentage）
- [ ] 删除父任务确认弹窗（连同子任务）

### 3.7 周期任务（RRULE）
- [ ] 完成周期任务 → 自动创建下一个（继承描述、标签、附件）
- [ ] parentTaskId 链式引用
- [ ] 代次限制（recurrenceGeneration >= 100 停止）
- [ ] 暂停/恢复周期任务
- [ ] 查看所有周期实例

### 3.8 Provider
- [ ] `taskListProvider`（StateNotifierProvider）
- [ ] `taskDetailProvider`（autoDispose）

### 3.9 任务模块 barrel export
- [ ] 创建 `task_board_feature.dart`

---

## Phase 4：Dashboard + Timeline

> Dashboard 固定卡片聚合 + Timeline 事件持久化

### 4.1 Dashboard 数据层
- [ ] 实现各卡片数据 Provider：
  - `dashboardTasksProvider`（今日待办数量 + 最近截止任务）
  - `dashboardUnreadProvider`（各账户未读数汇总）
  - `dashboardBudgetProvider`（本月支出 + 预算进度）
  - `dashboardExerciseProvider`（今日运动摘要）
  - `dashboardNotesProvider`（最近 5 条笔记）
  - `dashboardStocksProvider`（自选股概览）
  - `dashboardFollowUpProvider`（待跟进邮件）

### 4.2 Dashboard UI
- [ ] `DashboardPage`（固定顺序 Grid，§2.6.3）
- [ ] 7 个数据卡片组件（task_card, email_card, budget_card, note_card, exercise_card, stock_card, follow_up_card）
- [ ] 响应式列数（<600px 1列，600-900px 2列，>900px 4列）
- [ ] 空状态引导卡片（未配置模块 → "添加xxx"按钮）

### 4.3 Dashboard 事件订阅
- [ ] 实现 `DashboardSubscriptions`（§2.4.6）：订阅 task/email/accounting/exercise/note 事件
- [ ] 实现 `dashboardSubscriptionsProvider`
- [ ] 事件触发 → invalidate 对应 Provider → UI 刷新

### 4.4 Timeline 数据层
- [ ] 实现 `TimelineDao`（getAll, getByDateRange, getLatest）
- [ ] 实现 `LogDao`（insert, getByModule, getByLevel, search, cleanupOld）

### 4.5 Timeline UI
- [ ] `TimelinePage`（按日期分组的列表，分页 50 条/页）
- [ ] 空状态（"暂无动态"）
- [ ] 点击跳转到源模块

### 4.6 Timeline 事件订阅
- [ ] 实现 `TimelineSubscriptions`（§2.4.6）：订阅所有模块事件 → 写入 timeline_events
- [ ] 实现 `timelineSubscriptionsProvider`

---

## Phase 5：日历

> 农历 + 中国节假日 + 任务标记 + 独立事件 CRUD + 拖拽

### 5.1 日历数据层
- [ ] 实现 `CalendarDao`（§2.2.9 已定义，补充查询方法）
- [ ] 实现 `getEventsInRange()`（合并 tasks.dueDate + calendar_events）

### 5.2 日历视图
- [ ] `CalendarPage`（table_calendar 集成，月/周/日视图切换）
- [ ] 任务标记（按优先级着色：高=红、中=琥珀、低=蓝）
- [ ] 独立事件标记（用户自定义 hex color）

### 5.3 农历 + 节假日
- [ ] `lunar` 包集成（农历日期、节气显示）
- [ ] 中国法定节假日标注
- [ ] 调休日标注

### 5.4 独立事件 CRUD
- [ ] `CalendarEventFormPage`（新建/编辑，标题、时间、颜色、RRULE、位置）
- [ ] `CalendarEventDetailPage`（详情 + 编辑/删除）
- [ ] 重复事件展开（RRULE 实例展开）

### 5.5 拖拽交互
- [ ] 拖拽任务到其他日期 → taskRepository.updateDueDate()
- [ ] 拖拽独立事件到其他日期 → calendarDao.updateDate()

---

## Phase 6：笔记 + 记账

> 笔记（富文本 + FTS5 + 标签）+ 记账（收支 + 预算 + 报表）

### 6.1 笔记数据层
- [ ] 实现 `NoteDao`（CRUD + FTS5 搜索 + 标签筛选）
- [ ] 实现 `NoteRepository` + `NoteRepositoryImpl`
- [ ] 定义 `NoteEntity`、`NoteTagEntity`

### 6.2 笔记 UI
- [ ] `NoteListPage`（搜索 + 标签筛选，分页 30 条/页）
- [ ] `NoteDetailPage`（flutter_quill 富文本编辑器）
- [ ] `NoteTagPage`（标签 CRUD）
- [ ] 图片插入（file_picker → notes/{note_id}/images/）
- [ ] Quill Delta 中以 block embed 引用本地路径
- [ ] 空状态（"暂无笔记"）

### 6.3 记账数据层
- [ ] 实现 `AccountingDao`（CRUD + 月度汇总 + 预算查询）
- [ ] 实现 `AccountingRepository` + `AccountingRepositoryImpl`
- [ ] 定义 `AccountingRecordEntity`、`AccountingCategoryEntity`

### 6.4 记账 UI
- [ ] `AccountingPage`（概览 + 最近记录）
- [ ] `AccountingFormPage`（新建/编辑，金额数字键盘）
- [ ] `AccountingReportPage`（月度报表：饼图按分类 + 柱状图按天，fl_chart）
- [ ] `AccountingCategoryPage`（分类管理）
- [ ] 预算进度条
- [ ] 空状态（"暂无记账记录"）

### 6.5 Provider
- [ ] `noteListProvider`
- [ ] `noteDetailProvider`
- [ ] `accountingRecordListProvider`
- [ ] `accountingReportProvider`

---

## Phase 7：日志 + 设置 + 备份 + Windows 托盘

> 日志查看 + 设置 + 自动备份 + Windows 托盘 + 后台收信 + 通知

### 7.1 日志模块
- [ ] `LogPage`（按模块/级别筛选，搜索，分页 50 条/页）
- [ ] 日志导出（文本文件，file_picker 保存）
- [ ] 90 天保留策略（自动清理）

### 7.2 设置模块
- [ ] `SettingsPage`（分组 UI，§3.10.3）
- [ ] 语言切换（写入 SettingsDao → App 重建）
- [ ] 主题切换（浅色/深色/跟随系统）
- [ ] 邮箱设置（通知开关、收取间隔、同步天数/数量限制）
- [ ] 数据设置（自动备份开关、备份路径、手动备份/恢复按钮）
- [ ] 关于（版本号、开源许可）

### 7.3 备份/恢复
- [ ] 实现 `BackupService`（§2.13.2，逐表 JSON 导出/导入）
- [ ] 自动备份（每日首次启动）
- [ ] 手动备份（file_picker 保存）
- [ ] 恢复流程（版本校验 → 预备份 → 清空 → 导入 → 完整性校验）
- [ ] 旧备份清理（30 天）

### 7.4 通知系统
- [ ] 实现 `NotificationService`（§2.12.4）
- [ ] 邮件通知渠道（email_channel）
- [ ] 任务通知渠道（task_channel）
- [ ] 系统通知渠道（system_channel）
- [ ] 任务到期通知调度（zonedSchedule）
- [ ] 通知开关（SettingsDao 控制）

### 7.5 Windows 托盘
- [ ] system_tray 集成（托盘图标 + 右键菜单）
- [ ] 关闭按钮 → 隐藏到托盘（不退出）
- [ ] 双击托盘 → 显示主窗口
- [ ] 新邮件 → 图标闪烁 + 气泡通知
- [ ] 窗口大小/位置记忆（window_manager + SettingsDao）
- [ ] 最小尺寸 800x600

### 7.6 Windows 自启动
- [ ] 注册表 Run 键读写（§4.2.4）
- [ ] 设置页开关控制

### 7.7 Android 后台收信
- [ ] workmanager 注册 PeriodicTask（15 分钟间隔）
- [ ] `backgroundEmailFetch` 回调（临时 MailClient 检测新邮件）
- [ ] 通知弹窗

### 7.8 离线邮件发送队列
- [ ] PendingEmails 表写入（离线时）
- [ ] 网络恢复 → EventBus.on<OnlineEvent>() → 遍历发送
- [ ] 重试策略（指数退避：30s, 60s, 120s，最多 3 次）

### 7.9 文件关联
- [ ] `.vcf` 文件关联（Windows + Android）

---

## Phase 8：扩展模块

> 股票行情 + 运动第三方同步

### 8.1 股票数据层
- [ ] 实现 `StockDao`（CRUD + uniqueKey 约束）
- [ ] 实现 `StockRepository` + `StockRepositoryImpl`
- [ ] 定义 `StockEntity`、`StockQuote`、`StockMarket`

### 8.2 股票 API
- [ ] 实现 `SinaFinanceApi`（fetchQuotes + search，§3.8.3）
- [ ] 实现 `StockQuoteCache`（内存缓存，30s TTL，§3.8.4）
- [ ] 解析新浪行情响应格式

### 8.3 股票 UI
- [ ] `StocksPage`（自选股列表 + 行情卡片 + 下拉刷新）
- [ ] `StockAddPage`（搜索 + 热门推荐）
- [ ] 空状态（"暂无自选股"）
- [ ] 红涨绿跌颜色

### 8.4 运动第三方同步
- [ ] 定义 `ExerciseSyncService` 抽象接口（§3.9.3）
- [ ] 定义 `SyncSource` 枚举
- [ ] 实现 `HuaweiHealthSyncService` 存根（Phase 8 实际实现）
- [ ] 实现 `KeepSyncService` 存根
- [ ] `ExerciseRecordWithSource` 模型
- [ ] 同步去重（thirdPartyId）

### 8.5 运动统计
- [ ] `ExerciseStatsPage`（周/月统计图表）
- [ ] 时长、距离、次数汇总

### 8.6 股票模块 barrel export
- [ ] 创建 `stocks_feature.dart`

---

## 测试计划

### 单元测试（与各 Phase 并行）

| Phase | 测试文件 | 测试内容 |
|---|---|---|
| 0 | `core/event_bus_test.dart` | EventBus 发布/订阅、dispose |
| 0 | `core/errors/result_test.dart` | Result 类型 Success/Failure |
| 2 | `email/data/dao/email_dao_test.dart` | EmailDao 所有方法 |
| 2 | `email/data/repositories/email_repository_impl_test.dart` | EmailRepository 业务逻辑 |
| 2 | `email/presentation/providers/*_test.dart` | 邮箱 Provider 核心路径 |
| 3 | `task_board/data/dao/task_dao_test.dart` | TaskDao 所有方法 |
| 3 | `task_board/data/repositories/task_repository_impl_test.dart` | 任务业务逻辑 |
| 3 | `task_board/presentation/providers/task_list_provider_test.dart` | TaskListProvider |
| 6 | `notes/data/dao/note_dao_test.dart` | NoteDao |
| 6 | `accounting/data/dao/accounting_dao_test.dart` | AccountingDao |
| 7 | `log/data/dao/log_dao_test.dart` | LogDao |

### 集成测试（Phase 4+ 后）

| 测试文件 | 测试内容 |
|---|---|
| `integration_test/app_flow_test.dart` | 应用启动 → 导航切换 |
| `integration_test/email_to_task_test.dart` | 邮件→任务完整流程 |
| `integration_test/vcf_import_test.dart` | VCF 导入（含编码检测） |
| `integration_test/kanban_drag_test.dart` | 看板拖拽 + 状态保存 |

### Widget 测试（与各 Phase 并行）

| 测试文件 | 测试内容 |
|---|---|
| `shared/widgets/responsive_grid_test.dart` | 响应式网格列数 |
| `features/email/presentation/pages/*_test.dart` | 邮箱页面渲染 |
| `features/task_board/presentation/pages/*_test.dart` | 任务页面渲染 |

---

## 关键里程碑

| 里程碑 | 完成条件 | 对应 Phase |
|---|---|---|
| **M0: 脚手架就绪** | 项目可编译运行，主题/i18n/路由/EventBus 工作正常 | Phase 0 |
| **M1: 导航可用** | 所有页面可导航切换，响应式布局正常 | Phase 0 + 1 |
| **M2: 邮箱可用** | 能添加账户、收发邮件、查看联系人 | Phase 0 + 1 + 2 |
| **M3: 任务可用** | 能创建/编辑/拖拽任务，看板三视图 | Phase 0 + 1 + 3 |
| **M4: Dashboard 聚合** | Dashboard 显示各模块数据，Timeline 记录事件 | Phase 0 + 1 + 2 + 3 + 4 |
| **M5: 日历可用** | 月/周/日视图，任务标记，独立事件 CRUD | Phase 0 + 1 + 3 + 5 |
| **M6: 笔记+记账可用** | 富文本编辑、标签、记账报表 | Phase 0 + 1 + 6 |
| **M7: 系统功能完整** | 日志、设置、备份、通知、Windows 托盘 | Phase 0 + 1 + 2 + 7 |
| **M8: 扩展模块完成** | 股票行情、运动同步 | Phase 0 + 1 + 8 |
| **M9: MVP 发布** | 所有 Phase 完成，测试通过，CI 绿色 | All |

---

## 文件清单（按 Phase）

### Phase 0 新建文件（约 45 个）
```
lib/main.dart
lib/app.dart
lib/core/database/app_database.dart
lib/core/database/tables/*.dart                    (24 个表定义)
lib/core/router/app_router.dart
lib/core/design_system/tokens/app_colors.dart
lib/core/design_system/tokens/app_spacing.dart
lib/core/design_system/tokens/app_radius.dart
lib/core/design_system/tokens/app_typography.dart
lib/core/design_system/tokens/easy_work_theme.dart
lib/core/design_system/themes/light_theme.dart
lib/core/design_system/themes/dark_theme.dart
lib/core/design_system/providers/theme_provider.dart
lib/core/event/event_bus.dart
lib/core/event/app_event.dart
lib/core/errors/app_exception.dart
lib/core/errors/result.dart
lib/core/security/credential_store.dart
lib/core/platform/platform_capabilities.dart
lib/core/platform/permission_helper.dart
lib/core/utils/platform_util.dart
lib/core/utils/date_util.dart
lib/core/utils/validators.dart
lib/core/utils/retry_handler.dart
lib/l10n/app_zh.arb
lib/l10n/app_en.arb
lib/shared/events/task_events.dart
lib/shared/events/email_events.dart
lib/shared/events/accounting_events.dart
lib/shared/events/exercise_events.dart
lib/shared/events/note_events.dart
lib/shared/events/notification_events.dart
lib/shared/events/network_events.dart
lib/shared/widgets/empty_state_widget.dart
lib/shared/widgets/loading_widget.dart
lib/shared/widgets/error_widget.dart
lib/shared/widgets/confirm_dialog.dart
lib/shared/widgets/responsive_builder.dart
lib/shared/widgets/responsive_grid.dart
lib/shared/widgets/adaptive_scaffold.dart
lib/core/design_system/widgets/frost_container.dart
lib/core/design_system/widgets/easy_app_bar.dart
lib/core/design_system/widgets/easy_card.dart
test/core/event_bus_test.dart
test/core/errors/result_test.dart
```

### Phase 1 新建文件（约 20 个）
```
lib/presentation/app_shell.dart
lib/presentation/navigation_rail.dart
lib/presentation/navigation_drawer.dart
lib/features/dashboard/presentation/pages/dashboard_page.dart
lib/features/task_board/presentation/pages/task_board_page.dart
lib/features/task_board/presentation/pages/task_list_page.dart
lib/features/task_board/presentation/pages/task_calendar_page.dart
lib/features/calendar/presentation/pages/calendar_page.dart
lib/features/email/presentation/pages/email_list_page.dart
lib/features/email/presentation/pages/email_detail_page.dart
lib/features/email/presentation/pages/compose_page.dart
lib/features/notes/presentation/pages/note_list_page.dart
lib/features/accounting/presentation/pages/accounting_page.dart
lib/features/stocks/presentation/pages/stocks_page.dart
lib/features/exercise/presentation/pages/exercise_page.dart
lib/features/log/presentation/pages/log_page.dart
lib/features/settings/presentation/pages/settings_page.dart
lib/features/timeline/presentation/pages/timeline_page.dart
lib/features/settings/presentation/pages/settings_backup_page.dart
lib/features/email/accounts/presentation/pages/email_accounts_page.dart
```

### Phase 2 新建文件（约 35 个）
```
lib/features/email/domain/repositories/email_repository.dart
lib/features/email/data/repositories/email_repository_impl.dart
lib/features/email/data/dao/email_dao.dart
lib/features/email/data/dao/email_signature_dao.dart
lib/features/email/data/dao/email_attachment_dao.dart
lib/features/email/data/dao/pending_email_dao.dart
lib/features/email/data/datasources/mail_data_source.dart
lib/features/email/data/datasources/mime_message_mapper.dart
lib/features/email/domain/models/email_entity.dart
lib/features/email/presentation/providers/mail_data_sources_provider.dart
lib/features/email/presentation/providers/email_providers.dart
lib/features/email/presentation/pages/email_accounts_page.dart
lib/features/email/presentation/pages/email_account_form_page.dart
lib/features/email/presentation/pages/email_list_page.dart
lib/features/email/presentation/pages/email_detail_page.dart
lib/features/email/presentation/pages/compose_page.dart
lib/features/email/presentation/pages/signature_manage_page.dart
lib/features/email/email_feature.dart
lib/features/contacts/domain/repositories/contact_repository.dart
lib/features/contacts/data/repositories/contact_repository_impl.dart
lib/features/contacts/data/dao/contact_dao.dart
lib/features/contacts/domain/models/contact_entity.dart
lib/features/contacts/presentation/providers/contact_providers.dart
lib/features/contacts/presentation/pages/contact_list_page.dart
lib/features/contacts/presentation/pages/contact_detail_page.dart
lib/features/contacts/presentation/pages/contact_form_page.dart
lib/features/contacts/presentation/pages/contact_group_page.dart
lib/core/security/attachment_storage_manager.dart
lib/core/security/credential_store.dart
test/features/email/data/dao/email_dao_test.dart
test/features/email/data/repositories/email_repository_impl_test.dart
test/features/email/presentation/providers/email_list_provider_test.dart
test/features/email/presentation/providers/unread_count_provider_test.dart
```

### Phase 3 新建文件（约 15 个）
```
lib/features/task_board/domain/repositories/task_repository.dart
lib/features/task_board/data/repositories/task_repository_impl.dart
lib/features/task_board/data/dao/task_dao.dart
lib/features/task_board/domain/models/task_entity.dart
lib/features/task_board/presentation/providers/task_list_provider.dart
lib/features/task_board/presentation/pages/task_board_page.dart
lib/features/task_board/presentation/pages/task_list_page.dart
lib/features/task_board/presentation/pages/task_calendar_page.dart
lib/features/task_board/presentation/pages/task_form_page.dart
lib/features/task_board/presentation/pages/task_detail_page.dart
lib/features/task_board/presentation/widgets/task_card.dart
lib/features/task_board/task_board_feature.dart
test/features/task_board/data/dao/task_dao_test.dart
test/features/task_board/data/repositories/task_repository_impl_test.dart
test/features/task_board/presentation/providers/task_list_provider_test.dart
```

### Phase 4 新建文件（约 15 个）
```
lib/features/dashboard/presentation/pages/dashboard_page.dart
lib/features/dashboard/presentation/providers/dashboard_providers.dart
lib/features/dashboard/presentation/providers/dashboard_subscriptions.dart
lib/features/dashboard/presentation/widgets/task_card.dart
lib/features/dashboard/presentation/widgets/email_card.dart
lib/features/dashboard/presentation/widgets/budget_card.dart
lib/features/dashboard/presentation/widgets/note_card.dart
lib/features/dashboard/presentation/widgets/exercise_card.dart
lib/features/dashboard/presentation/widgets/stock_card.dart
lib/features/dashboard/presentation/widgets/follow_up_card.dart
lib/features/timeline/data/dao/timeline_dao.dart
lib/features/timeline/presentation/pages/timeline_page.dart
lib/features/timeline/presentation/providers/timeline_providers.dart
lib/features/timeline/presentation/providers/timeline_subscriptions.dart
lib/features/log/data/dao/log_dao.dart
```

### Phase 5 新建文件（约 8 个）
```
lib/features/calendar/data/dao/calendar_dao.dart
lib/features/calendar/presentation/pages/calendar_page.dart
lib/features/calendar/presentation/pages/calendar_event_form_page.dart
lib/features/calendar/presentation/pages/calendar_event_detail_page.dart
lib/features/calendar/presentation/providers/calendar_providers.dart
lib/features/calendar/presentation/widgets/task_event_marker.dart
lib/features/calendar/presentation/widgets/independent_event_marker.dart
lib/features/calendar/calendar_feature.dart
```

### Phase 6 新建文件（约 18 个）
```
lib/features/notes/domain/repositories/note_repository.dart
lib/features/notes/data/repositories/note_repository_impl.dart
lib/features/notes/data/dao/note_dao.dart
lib/features/notes/domain/models/note_entity.dart
lib/features/notes/presentation/providers/note_providers.dart
lib/features/notes/presentation/pages/note_list_page.dart
lib/features/notes/presentation/pages/note_detail_page.dart
lib/features/notes/presentation/pages/note_tag_page.dart
lib/features/notes/notes_feature.dart
lib/features/accounting/domain/repositories/accounting_repository.dart
lib/features/accounting/data/repositories/accounting_repository_impl.dart
lib/features/accounting/data/dao/accounting_dao.dart
lib/features/accounting/domain/models/accounting_entity.dart
lib/features/accounting/presentation/providers/accounting_providers.dart
lib/features/accounting/presentation/pages/accounting_page.dart
lib/features/accounting/presentation/pages/accounting_form_page.dart
lib/features/accounting/presentation/pages/accounting_report_page.dart
lib/features/accounting/presentation/pages/accounting_category_page.dart
lib/features/accounting/accounting_feature.dart
test/features/notes/data/dao/note_dao_test.dart
test/features/accounting/data/dao/accounting_dao_test.dart
```

### Phase 7 新建文件（约 12 个）
```
lib/features/log/presentation/pages/log_page.dart
lib/features/log/presentation/providers/log_providers.dart
lib/features/settings/presentation/pages/settings_page.dart
lib/features/settings/presentation/providers/settings_providers.dart
lib/core/backup/backup_service.dart
lib/core/notification/notification_service.dart
lib/core/platform/windows_tray.dart
lib/core/platform/window_manager_helper.dart
lib/core/platform/work_manager_helper.dart
lib/features/log/log_feature.dart
test/features/log/data/dao/log_dao_test.dart
```

### Phase 8 新建文件（约 12 个）
```
lib/features/stocks/domain/repositories/stock_repository.dart
lib/features/stocks/data/repositories/stock_repository_impl.dart
lib/features/stocks/data/dao/stock_dao.dart
lib/features/stocks/data/datasources/sina_finance_api.dart
lib/features/stocks/data/datasources/stock_quote_cache.dart
lib/features/stocks/domain/models/stock_entity.dart
lib/features/stocks/presentation/providers/stock_providers.dart
lib/features/stocks/presentation/pages/stocks_page.dart
lib/features/stocks/presentation/pages/stock_add_page.dart
lib/features/stocks/stocks_feature.dart
lib/features/exercise/data/datasources/exercise_sync_service.dart
lib/features/exercise/presentation/pages/exercise_stats_page.dart
```
