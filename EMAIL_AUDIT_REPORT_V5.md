# EasyWork 邮箱模块 · 全量审阅报告 (V5)

**审阅时间**: 2026-07-08  
**审阅基准**: `enough_mail` ^2.1.7 + `enough_mail_html` ^2.0.0 官方能力清单  
**审阅范围**: `lib/features/email/**`、`lib/presentation/pages/email/**`、`lib/core/database/tables/emails*`、`lib/core/platform/*sync*`、`lib/core/platform/notification_service.dart`、`lib/shared/events/email_events.dart`  
**前置说明**: 本报告基于 V4 审计报告之后已实施的修复（BUG-22/29/30、签名管理 UI、联系人自动补全），对当前代码进行**全量重新审阅**，标注 V4 已修复项的复核结果，并新增本轮发现的问题。

---

## 目录

1. [V4 修复复核结果](#1)
2. [已实现功能总表](#2)
3. [待实现 / 仅数据层无 UI 的功能](#3)
4. [BUG / 逻辑错误 / 工作流错误 / UI 问题](#4)
5. [enough_mail 能力覆盖率总表](#5)
6. [修复优先级建议](#6)

---

<a id="1"></a>
## 1. V4 修复复核结果

| V4 BUG | 修复状态 | 复核结论 |
|--------|----------|----------|
| BUG-01 回复实为回复全部 | ✅ **已修复** | `ComposePage` 新增 `isReplyAll` 参数，`_send()` 中显式传 `replyAll: widget.isReplyAll`。详情页 `_reply` 传 `isReplyAll: false`，`_replyAll` 传 `isReplyAll: true` |
| BUG-02 增量同步 UID 忽略 | ✅ **已修复** | `_searchSinceUid` 现在接收 `lastUid` 并本地过滤 `uid > lastUid`；`incrementalSync` 循环中跳过 `uid <= maxUid` |
| BUG-15 服务端搜索不可点击 | ❌ **编译错误** | `onTap` 已添加，但 `_persistAndOpenServerResult` 引用了未定义的 `messageId` 变量（见 BUG-31） |
| BUG-16 宽屏不支持多账户 | ✅ **已修复** | 宽屏布局改用 `EmailListView`，内部 watch `unifiedEmailListProvider`，显示所有账户邮件 |
| BUG-17 EmailListView 死代码 | ✅ **已修复** | `EmailListView` 已在宽屏布局中启用 |
| BUG-18 无分页加载 | ✅ **已修复** | `_EmailFolderList` 和 `EmailListView` 均添加了滚动到底部触发 `fetchOlderMessages` 的分页逻辑 |
| BUG-19 文件夹过滤不一致 | ✅ **已修复** | `_EmailFolderList` 改用 `accountFolderEmailListProvider` → `watchEmailsByAccountAndFolderType`，SQL 级别过滤与 `MailboxMerger` 逻辑对齐 |
| BUG-20 静态缓存内存泄漏 | ✅ **已修复** | 添加 `_maxCacheSize = 20` 限制和 `_evictIfNeeded()` LRU 驱逐 |
| BUG-21 HTML 横向滚动 | ✅ **已修复** | 移除 `SingleChildScrollView(horizontal)`，`HtmlWidget` 自然渲染 |
| BUG-22 IDLE 未启用 | ✅ **已修复** | `supportsIdle` 改为 `_connected && _client.isIdleSupported`；`startPolling` 由 enough_mail 自动选择 IDLE 或轮询 |
| BUG-23 待发队列未接入 | ✅ **已修复** | `sendEmail`/`sendEmailBuilder` 失败时调用 `_saveToPendingQueue`；`connectAndSync` 成功后调用 `retryPendingCallback` |
| BUG-24 草稿无法管理 | ✅ **已修复** | `ComposePage` 支持 `draftEmail` 参数加载草稿；保存时删除旧草稿；列表/详情页识别草稿并打开编辑 |
| BUG-25 deleteDuplicateEmails 返回值 | ✅ **已修复** | 改为返回 `beforeCount - afterCount`（删除数量） |
| BUG-26 _autoSelectFirstEmail 仅查 INBOX | ✅ **已修复** | 改用 `unifiedEmailListProvider(selectedFolder)` |
| BUG-27 宽屏固定第一个账户 | ✅ **已修复** | 宽屏布局使用 `EmailListView` 统一列表 |
| BUG-28 copyWith 缺 smtpStartTls | ✅ **已修复** | `copyWith` 已包含 `bool? smtpStartTls` 参数 |
| BUG-29 _NarrowEmailFolderList 命名 | ✅ **已修复** | 重命名为 `_EmailFolderList` |
| BUG-30 连接失败被吞掉 | ⚠️ **修复无效** | 虽添加了 SnackBar 错误提示，但 `_connectAndSync` 以 fire-and-forget 方式调用，导航先于异步错误完成，`mounted` 为 false 时 SnackBar 永不显示（见 BUG-34） |

---

<a id="2"></a>
## 2. 已实现功能总表

| # | 功能 | 实现位置 | UI 接入 | 备注 |
|---|------|----------|---------|------|
| 1 | IMAP 连接 / 登录 | `mail_data_source.dart:connect()` | ✅ | 含连接日志 |
| 2 | 邮箱文件夹列表 | `listMailboxes` + `syncMailboxes` | ✅ | 持久化 + 统一文件夹视图 |
| 3 | 统一文件夹视图 | `mailbox_merger.dart` + `unifiedMailboxListProvider` | ✅ | 多账户文件夹合并 |
| 4 | 拉取邮件列表 | `fetchMessages` | ✅ | 首次同步 + 增量同步 |
| 5 | 拉取邮件正文 | `fetchFullMessage` | ✅ | 详情页 |
| 6 | 附件展示 + 下载 | `attachment_list_widget.dart` | ✅ | 支持按需拉取大附件 |
| 7 | SMTP 发送 | `sendEmail` + `MessageBuilder` | ✅ | 写/回复/转发/草稿 |
| 8 | 带附件发送 | `_build*WithAttachmentsAsync` | ✅ | |
| 9 | 保存草稿 + 草稿编辑 | `ds.saveDraft` + `ComposePage(draftEmail:)` | ✅ | V5: 草稿管理已接入 |
| 10 | 标记已读/未读 | `markSeenByUid` / `markUnseenByUid` + DAO | ✅ | 基于 UID |
| 11 | 星标 | `markFlaggedByUid` / `markUnflaggedByUid` + DAO | ✅ | 基于 UID |
| 12 | 删除（移回收站） | `moveToTrashByUid` | ✅ | 服务端优先 + 撤销 |
| 13 | 邮箱自动发现 | `Discover.discover` | ✅ | |
| 14 | HTML 安全渲染 | `EmailHtmlProcessor` + `HtmlWidget` | ✅ | 后台 isolate 处理 |
| 15 | 邮件转任务 | `EmailToTaskService` | ✅ | |
| 16 | 签名加载 + 管理 | `email_signatures_dao` + `SignaturesPage` | ✅ | V5: 设置页入口已接入 |
| 17 | 本地 FTS5 搜索 | `EmailSearchService.searchLocal` | ✅ | |
| 18 | 服务端 IMAP 搜索 | `EmailSearchService.searchServer` | ✅ | V5: 结果可点击（但有编译错误） |
| 19 | 回复/转发后标记 | `markAnsweredByUid` / `markForwardedByUid` | ✅ | |
| 20 | 邮箱服务商预设 | `email_providers_config.dart` | ✅ | 28+ 家 |
| 21 | 连接测试 | `testConnection` | ✅ | 探测 IDLE/QUOTA |
| 22 | 后台轮询同步 | `BackgroundSyncManager` | ✅ | 跨平台 |
| 23 | 新邮件通知 | `NotificationService` | ✅ | 跨平台本地通知 |
| 24 | 联系人跳转 | `email_toolbar.dart` | ✅ | |
| 25 | 同步日志 | `EmailSyncLogger` | ✅ | |
| 26 | 密码安全存储 | `CredentialStore` | ✅ | flutter_secure_storage |
| 27 | 连接断线重连 | `reconnect()` / `resume()` | ✅ | 事件监听 + 自动重连 |
| 28 | 邮件消失处理 | `_handleMessagesVanished` | ✅ | 自动删除本地副本 |
| 29 | 离线发送队列 | `PendingEmailsDao` + `_saveToPendingQueue` + `retryPendingEmails` | ✅ | V5: 已完整接入 |
| 30 | 联系人自动补全 | `_RecipientAutocompleteField` | ✅ | V5: 收件人/抄送/密送字段 |
| 31 | 分页加载 | `_EmailFolderList._onScroll` + `EmailListView._loadMore` | ✅ | V5: 宽屏和窄屏均支持 |
| 32 | IDLE 推送 | `startPolling` (enough_mail 自动选择) | ✅ | V5: 已启用 |
| 33 | UID 增量同步 | `_searchSinceUid` + `uid <= maxUid` 跳过 | ✅ | V5: 已修复 |

---

<a id="3"></a>
## 3. 待实现 / 仅数据层无 UI 的功能

> 以下为 `enough_mail` 已支持，项目代码部分已写进 data 层，但**无任何 UI 入口**或**彻底未使用**的功能。

| # | 功能 | 代码状态 | 缺失表现 |
|---|------|----------|----------|
| 1 | **POP3 协议** | 完全未用 | 仅支持 IMAP+SMTP |
| 2 | **SORT / THREAD 会话视图** | `fetchThreadData`/`fetchThreads` 已封装 | 从未调用，无会话视图 |
| 3 | **移动到指定文件夹** | `repo.moveToFolder` 已实现 | 无"移动到…"对话框/菜单 |
| 4 | **新建/重命名/删除文件夹** | `createMailbox`/`deleteMailbox` 已封装 | 无 UI；`renameMailbox` 连 data 层都未实现 |
| 5 | **举报垃圾邮件** | `junkMessages` / `moveToJunk` 已封装 | 无"标记为垃圾"动作按钮 |
| 6 | **`mailto:` 链接处理** | `url_launcher` 已用 | 未解析 mailto 唤起 compose |
| 7 | **DKIM 签名** | — | 未实现 |
| 8 | **QUOTA 展示** | `supportsQuota` 已探测 | 无邮箱容量展示 UI |
| 9 | **enough_mail_icalendar** | — | 无法解析/回复会议邀请 |
| 10 | **METADATA / ENABLE / UNSELECT / ESORT** | — | 未使用（非关键） |
| 11 | **待发邮件队列 UI** | `PendingEmailsDao.watchPendingCount` 已定义 | 无待发队列列表/管理 UI |
| 12 | **UIDPLUS / QRESYNC / CONDSTORE** | 增量同步用本地过滤替代 | 未利用服务端 UID SEARCH 优化 |

---

<a id="4"></a>
## 4. BUG / 逻辑错误 / 工作流错误 / UI 问题

### 🔴 P0 — 严重（影响核心功能正确性 / 编译失败）

---

**BUG-31 `_persistAndOpenServerResult` 引用未定义的 `messageId` 变量 — 编译错误（NEW）**

- **文件**: `email_list_page.dart:391`
- **现象**: `_persistAndOpenServerResult` 方法在第 391 行使用了变量 `messageId`，但该变量在方法作用域内**未定义**：
  ```dart
  Future<void> _persistAndOpenServerResult(
      ({int accountId, MimeMessage message}) item) async {
    try {
      final emailsDao = await ref.read(emailsDaoProvider.future);
      final companion = MimeMessageMapper.toCompanion(
        item.message, item.accountId,
      );
      await emailsDao.upsertEmail(companion);
      if (messageId != null && messageId.isNotEmpty) {  // ← messageId 未定义！
        final match = await emailsDao.findByMessageId(messageId, accountId: item.accountId);
  ```
- **结果**: **代码无法编译**。服务端搜索结果点击后，代码无法执行。
- **修复建议**: 在 `if` 之前提取 `messageId`：
  ```dart
  final messageId = item.message.decodeHeaderValue('message-id');
  if (messageId != null && messageId.isNotEmpty) { ... }
  ```

---

**BUG-34 `_connectAndSync` fire-and-forget 导致 BUG-30 修复无效（NEW）**

- **文件**: `email_account_form_page.dart:270-274`
- **现象**: `_save()` 方法中调用 `_connectAndSync(accountId, account)` **未加 `await`**，紧接着执行 `Navigator.of(context).popUntil((route) => route.isFirst)` 导航：
  ```dart
  // Connect and sync BEFORE navigation — ref must be alive for provider reads.
  _connectAndSync(accountId, account);  // ← 无 await，fire-and-forget

  if (mounted) {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }
  ```
  `_connectAndSync` 内部的 `await dataSources.addAccount(...)` 是异步操作（网络连接），需要数秒。在等待期间，`popUntil` 已执行，表单页面被销毁，`mounted` 变为 `false`。当连接失败抛出异常时：
  ```dart
  } catch (e) {
    if (mounted) {  // ← false！SnackBar 永不显示
      ScaffoldMessenger.of(context).showSnackBar(...);
    }
  }
  ```
- **结果**: BUG-30 的修复（连接失败提示 SnackBar）**完全无效**。用户保存账户后页面立即跳转，连接失败时**无任何提示**，用户以为保存成功但实际未连接。
- **修复建议**: 将 `_connectAndSync` 改为 `await _connectAndSync(accountId, account)`，在连接完成后再导航。或改用 `ScaffoldMessenger` 的 root key 以在 widget dispose 后仍能显示提示。

---

### 🟠 P1 — 重要（功能缺失 / 逻辑错误）

---

**BUG-32 `_RecipientAutocompleteField` 未移除 controller listener — 潜在崩溃（NEW）**

- **文件**: `compose_page.dart:622-632`
- **现象**: `initState` 中注册了 `widget.controller.addListener(_onTextChanged)`，但 `dispose` 中**未移除**：
  ```dart
  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_onFocusChanged);
    widget.controller.addListener(_onTextChanged);  // ← 注册
    ...
  }

  @override
  void dispose() {
    _focusNode.removeListener(_onFocusChanged);
    _focusNode.dispose();
    _hideOverlay();
    // ← 缺少 widget.controller.removeListener(_onTextChanged)!
    super.dispose();
  }
  ```
  `widget.controller` 由父组件 `ComposePage` 拥有，`_RecipientAutocompleteField` dispose 后 controller 仍然存活。后续 controller 文本变化时，`_onTextChanged` 会在已 dispose 的 State 上调用，尝试 `Overlay.of(context)` 操作已失效的 `context`，引发 `FlutterError`。
- **结果**: 在 compose 页面关闭后，如果 controller 的文本被外部修改（如父组件 dispose 调用 `controller.clear()`），可能触发崩溃。
- **修复建议**: 在 `dispose` 中添加 `widget.controller.removeListener(_onTextChanged)`。

---

**BUG-33 `searchLocal` 的 LIKE 回退路径未过滤 accountId（NEW）**

- **文件**: `email_search_service.dart:16-26`
- **现象**:
  ```dart
  Future<List<Email>> searchLocal(String query, {required int accountId}) async {
    try {
      final results = await _emailsDao.searchEmails(query);
      return results.where((e) => e.accountId == accountId).toList();  // ← FTS5 路径过滤
    } catch (e) {
      dev.log('FTS5 search failed, falling back to LIKE: $e', ...);
      return _emailsDao.searchEmailsLike(query);  // ← LIKE 路径未过滤！
    }
  }
  ```
  FTS5 路径正确过滤了 `accountId`，但 LIKE 回退路径返回**所有账户**的搜索结果。
- **结果**: 当 FTS5 索引不可用时（如数据库升级后），搜索结果包含其他账户的邮件。
- **修复建议**: LIKE 回退路径也添加 `.where((e) => e.accountId == accountId)` 过滤。

---

**BUG-35 `retryPendingEmails` 不保留附件（NEW）**

- **文件**: `email_repository_impl.dart:453-468`
- **现象**: `retryPendingEmails` 从 `pending_emails` 表重建 `MimeMessage`，但 `pending_emails` 表不存储附件数据。重建的邮件仅包含 `from`/`to`/`cc`/`bcc`/`subject`/`bodyText`/`bodyHtml`，**不包含任何附件**。
- **结果**: 带附件的邮件发送失败后，重试发送的邮件**丢失所有附件**，收件人无法收到附件。
- **修复建议**: 在 `pending_emails` 表中增加附件存储（如 JSON 序列化的附件列表），或在 `_saveToPendingQueue` 中将附件保存到本地文件并在重试时重新加载。

---

**BUG-36 `_saveDraft` 未连接时静默失败（NEW）**

- **文件**: `compose_page.dart:536-552`
- **现象**:
  ```dart
  final ds = ref.read(mailDataSourcesProvider)[_selectedAccount!.id!];
  if (ds != null) {
    // ... 保存草稿
  }
  // ← ds 为 null 时无任何提示
  ```
  当账户未连接（`ds == null`）时，草稿不会被保存，用户也**收不到任何反馈**。
- **结果**: 用户离线时点击"保存草稿"，看似无反应，草稿实际未保存。
- **修复建议**: `ds == null` 时显示 SnackBar 提示"账户未连接，草稿未保存"。

---

### 🟡 P2 — 次要（代码质量 / UX 细节）

---

**BUG-37 回复邮件时 To 字段编辑被忽略（NEW）**

- **文件**: `compose_page.dart:301-308`
- **现象**: 回复邮件时，`_send()` 调用 `_buildReplyWithAttachmentsAsync`，该方法使用 `MessageBuilder.prepareReplyToMessage(originalMessage, ..., replyAll: replyAll)` 来设置收件人。`_toController.text`（UI 中显示的 To 字段）**完全不传递**给 builder。
- **结果**: 用户在 To 字段中增删收件人后，实际发送的邮件收件人由 `prepareReplyToMessage` 决定，用户的修改被忽略。UI 误导用户以为可以编辑收件人。
- **修复建议**: 要么将 To 字段设为只读（回复模式），要么使用 To 字段内容替代 `prepareReplyToMessage` 的收件人逻辑。

---

**BUG-38 `_searchSinceUid` 未使用真正的 IMAP UID SEARCH（NEW）**

- **文件**: `email_sync_service.dart:477-498`
- **现象**: `_searchSinceUid` 方法名为 "search since UID"，但实际是 fetch 最近 100 封邮件后本地过滤 `uid > lastUid`。未使用 IMAP `UID SEARCH` 命令。
- **结果**: 如果两次同步之间新邮件超过 100 封，部分邮件会被遗漏。
- **修复建议**: 使用 `MailSearch` 配合 `SearchQueryType.uid` 或直接构造 `UID SEARCH UID lastUid:*` 命令。当前方案在邮件量不大时可接受。

---

**BUG-39 `EmailListView.accountId` 参数为残留代码（NEW）**

- **文件**: `email_list_view.dart:11-14`
- **现象**: `EmailListView` 接受 `accountId` 参数，但 `build()` 方法中完全不使用它（改用 `unifiedEmailListProvider`）。仅在 `_loadMore()` 中用于遍历所有账户（忽略传入的 `accountId`）。
- **修复建议**: 移除 `accountId` 参数，或将 `_loadMore` 改为仅加载指定账户的更多邮件。

---

**BUG-40 宽屏布局 `accountId: -1` 哨兵值脆弱（NEW）**

- **文件**: `email_list_page.dart:108,113`
- **现象**: 宽屏布局中 `EmailDetailView(accountId: -1)` 和 `EmailToolbar(accountId: -1)` 使用 `-1` 作为"使用邮件自身 accountId"的哨兵值。`_EmailDetailBodyState` 中通过 `widget.accountId == -1 ? email.accountId : widget.accountId` 判断。
- **修复建议**: 改用 `accountId: null` 并以 `null` 表示"自动检测"，或使用专门的 enum。

---

### 关于「UI 遮罩」

- 已重点排查 `Stack`/`Positioned`/`Opacity`/`Visibility`/`Modal`/`Overlay` 等遮罩风险。
- **未发现明确的内容被遮挡 bug**。`_RecipientAutocompleteField` 的 Overlay 定位使用 `CompositedTransformFollower`，在键盘弹出时可能被遮挡（轻微 UX 问题，未列为 BUG）。

---

<a id="5"></a>
## 5. `enough_mail` 能力覆盖率总表

| enough_mail 能力 | 项目是否已用 | 状态 | 备注 |
|------------------|--------------|------|------|
| IMAP4rev1 | ✅ | 已实现 | 核心收发功能完整 |
| SMTP | ✅ | 已实现 | 含重试 + 离线队列 |
| POP3 | ❌ | 未支持 | 完全未用 |
| MIME 解析/生成 | ✅ | 已实现 | 解析 + MessageBuilder |
| IMAP IDLE（推送） | ✅ | **已启用** | V5: startPolling 自动选择 IDLE |
| MOVE | ✅ | 已实现 | 删除/移动使用 |
| UIDPLUS | ⚠️ | 部分利用 | V5: 增量同步用本地 UID 过滤（非服务端 UID SEARCH） |
| CONDSTORE / QRESYNC | ❌ | 未利用 | |
| SORT / THREAD | ❌ | 未调用 | 无会话视图 |
| ESEARCH | ✅ | 已实现 | searchMessages 已用，结果可点击（BUG-31 待修） |
| QUOTA | ❌ | 未实现 | 能力已探测但无展示 UI |
| METADATA / ENABLE / UNSELECT / ESORT | ❌ | 未使用 | 非关键 |
| SMTP 8-bit MIME | ✅ | 库内部支持 | |
| DKIM 部分签名 | ❌ | 未实现 | |
| `mailto:` 解析 | ❌ | 未接入 | |
| 自动发现 Discover | ✅ | 已实现 | |
| `enough_mail_html` | ✅ | 已实现 | HTML 渲染 + CID 内联 + 后台 isolate |
| `enough_mail_icalendar` | ❌ | 未使用 | |
| 文件夹管理（创建/删除） | ⚠️ | data 层已封装 | 无 UI 入口 |
| 文件夹重命名 | ❌ | 未实现 | data 层都未封装 |
| 草稿保存 + 管理 | ✅ | 已实现 | V5: 草稿编辑已接入 |
| 标记已回复/已转发 | ✅ | 已实现 | |
| 举报垃圾邮件 | ⚠️ | data 层已封装 | 无 UI 入口 |
| 批量操作 | ⚠️ | data 层已封装 | 无多选 UI |
| 连接断线重连 | ✅ | 已实现 | 事件驱动 |
| 邮件消失(VANISHED)处理 | ✅ | 已实现 | 自动清理本地副本 |
| 离线发送队列 | ✅ | 已实现 | V5: 完整接入（附件待修） |

> **覆盖率结论**：`enough_mail` 的核心收发/标记/推送能力已落地约 **70%**（较 V4 的 55% 显著提升）。主要剩余缺口在：
> - POP3 / DKIM / mailto / icalendar — 完全未用
> - SORT/THREAD 会话视图 — 未调用
> - 文件夹管理 / 垃圾标记 UI — data 层就绪但无 UI
> - QUOTA 展示 — 能力已探测但无 UI
> - UIDPLUS 服务端 UID SEARCH — 增量同步仍用本地过滤

---

<a id="6"></a>
## 6. 修复优先级建议

### 第一优先级：P0 必修（编译错误 / 核心功能失效）

| BUG | 问题 | 工作量 |
|-----|------|--------|
| BUG-31 | `_persistAndOpenServerResult` 编译错误 | 小（加一行 `messageId` 定义） |
| BUG-34 | `_connectAndSync` fire-and-forget 导致连接失败无提示 | 小（加 `await`） |

### 第二优先级：P1 重要（功能缺失 / 逻辑错误）

| BUG | 问题 | 工作量 |
|-----|------|--------|
| BUG-32 | `_RecipientAutocompleteField` 未移除 controller listener | 小（加一行 `removeListener`） |
| BUG-33 | `searchLocal` LIKE 回退路径未过滤 accountId | 小（加 `.where()`） |
| BUG-35 | `retryPendingEmails` 不保留附件 | 中（需扩展表结构 + 文件存储） |
| BUG-36 | `_saveDraft` 未连接时静默失败 | 小（加 SnackBar 提示） |

### 第三优先级：P2 清理（代码质量 / UX）

| BUG | 问题 | 工作量 |
|-----|------|--------|
| BUG-37 | 回复 To 字段编辑被忽略 | 中（需重新设计回复收件人逻辑） |
| BUG-38 | `_searchSinceUid` 未用 IMAP UID SEARCH | 中 |
| BUG-39 | `EmailListView.accountId` 残留参数 | 小 |
| BUG-40 | `accountId: -1` 哨兵值脆弱 | 小 |

### 功能补齐建议（对照 enough_mail 能力）

按产品价值排序：
1. **待发邮件队列 UI** — `watchPendingCount` 已定义，仅需列表/管理界面
2. **文件夹管理 UI**（移动到…、新建/删除文件夹）— data 层已就绪
3. **垃圾邮件标记** — data 层已就绪
4. **会话视图**（THREAD）— enough_mail 已支持
5. **mailto: 唤起** — url_launcher 已用
6. **QUOTA 展示** — 能力已探测
7. **POP3 支持** — 需较大改造
8. **DKIM 签名** — 安全增强

---

## 附录：V4 → V5 修复进度总结

| 指标 | V4 | V5 |
|------|----|----|
| 已实现功能数 | 28 | 33 |
| 能力覆盖率 | ~55% | ~70% |
| P0 BUG 数 | 3（BUG-01/02/15） | 2（BUG-31/34） |
| P1 BUG 数 | 9 | 4 |
| P2 BUG 数 | 6 | 4 |
| 总 BUG 数 | 18 | 10 |
| IDLE 推送 | ❌ 未启用 | ✅ 已启用 |
| 离线发送队列 | ❌ 未接入 | ✅ 已接入 |
| 草稿管理 | ❌ 仅保存 | ✅ 保存+编辑 |
| 联系人补全 | ❌ 未接入 | ✅ 已接入 |
| 分页加载 | ❌ 无 | ✅ 宽屏+窄屏 |
| 签名管理 UI | ❌ 无入口 | ✅ 设置页入口 |

> **本轮审阅结论**：V4 报告中的 18 个 BUG 已修复 16 个（其中 BUG-15 因编译错误需修复，BUG-30 修复无效需重新处理）。本轮新增 10 个 BUG（2 个 P0、4 个 P1、4 个 P2），主要集中在 V4 修复引入的回归问题和新增功能（联系人补全、服务端搜索点击）的边界缺陷。
