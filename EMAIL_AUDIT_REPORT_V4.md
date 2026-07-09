# EasyWork 邮箱模块 · 对照 `enough_mail` 2.1.7 能力审阅报告 (V4)

**审阅时间**: 2026-07-08  
**审阅基准**: `enough_mail` ^2.1.7 + `enough_mail_html` ^2.0.0 官方能力清单  
**审阅范围**: `lib/features/email/**`、`lib/presentation/pages/email/**`、`lib/core/database/tables/emails*`、`lib/core/platform/*sync*`、`lib/shared/events/email_events.dart`  
**前置说明**: 本报告基于 V3 审计报告之后已实施的修复，对当前代码进行**全量重新审阅**，标注 V3 已修复项的复核结果，并新增本轮发现的问题。

---

## 目录

1. [对照基准：enough_mail 2.1.7 官方能力清单](#1)
2. [已实现功能（含 UI 接入）](#2)
3. [待实现 / 仅数据层无 UI 的功能](#3)
4. [BUG / 逻辑错误 / 工作流错误 / UI 问题](#4)
5. [enough_mail 能力覆盖率总表](#5)
6. [修复优先级建议](#6)

---

<a id="1"></a>
## 1. 对照基准：`enough_mail` 2.1.7 官方能力清单

| 类别 | 官方支持的能力 |
|------|----------------|
| 基础协议 | IMAP4rev1、SMTP、POP3、MIME 解析/生成 |
| IMAP 扩展 | IDLE(RFC2177)、METADATA、UIDPLUS、MOVE(RFC6851)、CONDSTORE、QRESYNC、ENABLE、QUOTA、UTF-8、ESEARCH、SORT/THREAD(RFC5256)、UNSELECT、ESORT/PARTIAL、List 扩展(rfc5258/5819/6154, 含 SPECIAL-USE) |
| SMTP 扩展 | 8-bit MIME |
| 安全 | DKIM 部分签名 |
| 其他 | `mailto:` 链接解析、邮箱自动发现 `Discover` |
| 关联库 | `enough_mail_html`（HTML 生成）、`enough_mail_flutter`（Flutter 组件）、`enough_mail_icalendar`（日历邀请） |

---

<a id="2"></a>
## 2. 已实现功能（含 UI 接入）

| # | 功能 | 实现位置 | UI 接入 | 备注 |
|---|------|----------|---------|------|
| 1 | IMAP 连接 / 登录 | `mail_data_source.dart:connect()` | ✅ 账户表单保存后自动连接 | 含连接日志 |
| 2 | 邮箱（文件夹）列表 | `listMailboxes` + `syncMailboxes` | ✅ 持久化到 DB + 统一文件夹视图 | |
| 3 | 统一文件夹视图 | `mailbox_merger.dart` + `unifiedMailboxListProvider` | ✅ 宽屏工具栏 / 窄屏 ChoiceChip | 多账户文件夹合并 |
| 4 | 拉取邮件列表 | `fetchMessages` | ✅ 首次同步 + 增量同步 | |
| 5 | 拉取邮件正文 | `fetchFullMessage` | ✅ 详情页 | |
| 6 | 附件展示 + 下载 | `attachment_list_widget.dart` | ✅ 详情页 | ✅ V3修复：支持按需拉取大附件 |
| 7 | SMTP 发送（写/回复/转发/草稿） | `sendEmail` + `MessageBuilder` | ✅ compose 页 | |
| 8 | 带附件发送 | `_build*WithAttachmentsAsync` | ✅ compose 页 | |
| 9 | 保存草稿 | `ds.saveDraft` | ✅ compose 保存图标 | ⚠️ 无草稿管理 UI |
| 10 | 标记已读/未读 | `markSeenByUid` / `markUnseenByUid` + DAO | ✅ 详情页切换 | ✅ V3修复：基于 UID |
| 11 | 星标（flagged） | `markFlaggedByUid` / `markUnflaggedByUid` + DAO | ✅ 详情星标 | ✅ V3修复：基于 UID |
| 12 | 删除（移回收站） | `moveToTrashByUid` | ✅ 详情删除 | ✅ V3修复：服务端优先 + 撤销 |
| 13 | 邮箱自动发现 | `Discover.discover` | ✅ 账户表单自动发现按钮 | |
| 14 | HTML 安全渲染 | `EmailHtmlProcessor` + `HtmlWidget` | ✅ 详情页 | |
| 15 | 邮件转任务 | `EmailToTaskService` | ✅ 详情弹窗 | |
| 16 | 签名加载 | `email_signatures_dao` | ✅ compose 加载默认签名 | ⚠️ 无签名管理 UI |
| 17 | 本地 FTS5 搜索 | `EmailSearchService.searchLocal` | ✅ 搜索栏 + 结果列表 | ✅ V3修复：已接入 UI |
| 18 | 服务端 IMAP 搜索 | `EmailSearchService.searchServer` | ✅ "搜索服务器"按钮 | ⚠️ 结果不可点击 |
| 19 | 回复/转发后标记 | `markAnsweredByUid` / `markForwardedByUid` | ✅ compose 发送后 | ✅ V3修复 |
| 20 | 邮箱服务商预设 | `email_providers_config.dart` | ✅ 自动填充 | 28+ 家服务商 |
| 21 | 连接测试 | `testConnection` | ✅ 账户表单测试按钮 | ✅ V3修复：探测 IDLE/QUOTA |
| 22 | 后台轮询同步 | `BackgroundSyncManager` | ✅ Windows 窗口事件 + 非Windows定时器 | ✅ V3修复：跨平台 |
| 23 | 新邮件通知 | `NotificationService` | ✅ 跨平台本地通知 | ✅ V3修复 |
| 24 | 联系人跳转 | `email_toolbar.dart` | ✅ 导航到 ContactsPage | ✅ V3修复 |
| 25 | 同步日志 | `EmailSyncLogger` | ✅ 写入 logs 表 | 详细日志记录 |
| 26 | 密码安全存储 | `CredentialStore` | ✅ flutter_secure_storage | DB 不存明文密码 |
| 27 | 连接断线重连 | `reconnect()` / `resume()` | ✅ 事件监听 + 自动重连 | |
| 28 | 邮件消失处理 | `_handleMessagesVanished` | ✅ 自动删除本地副本 | |

---

<a id="3"></a>
## 3. 待实现 / 仅数据层无 UI 的功能

> 以下均为 `enough_mail` 已支持，项目代码部分已写进 data 层，但**无任何 UI 入口**或**彻底未使用**的功能。

| # | 功能（enough_mail 已支持） | 代码状态 | 缺失表现 |
|---|---------------------------|----------|----------|
| 1 | **POP3 协议** | 完全未用 | 仅支持 IMAP+SMTP，无法收 POP3 邮箱 |
| 2 | **IDLE 推送（RFC2177）** | `supportsIdle` 已探测但未启用 | ✅ V3已探测能力，但实际仍用轮询，未调用 IDLE 命令 |
| 3 | **UIDPLUS / QRESYNC / CONDSTORE** | 未利用 | 增量同步仍用日期搜索，未利用 UID 范围查询（见 BUG-02） |
| 4 | **SORT / THREAD 会话视图** | `fetchThreadData`/`fetchThreads` 已封装 | 🔴 从未调用，无会话/聚合视图 |
| 5 | **移动到指定文件夹** | `repo.moveToFolder` 已实现 | 🔴 无"移动到…"对话框/菜单 |
| 6 | **新建/重命名/删除文件夹** | `createMailbox`/`deleteMailbox` 已封装 | 🔴 无 UI；`renameMailbox` 连 data 层都未实现 |
| 7 | **举报垃圾邮件 / 移到 Junk** | `junkMessages` / `moveToJunk` 已封装 | 🔴 无"标记为垃圾"动作按钮 |
| 8 | **`mailto:` 链接处理** | `url_launcher` 已用 | 🔴 未解析 mailto 唤起 compose |
| 9 | **DKIM 签名** | — | ⚪ 未实现 |
| 10 | **QUOTA 展示** | `supportsQuota` 已探测 | ⚪ 无邮箱容量展示 UI |
| 11 | **草稿管理** | `saveDraft` 已实现 | 🔴 无草稿列表/编辑/发送草稿 UI |
| 12 | **待发邮件队列（离线发送）** | `pending_emails` 表 + DAO 已定义 | 🔴 全项目无任何代码调用 `PendingEmailsDao`，离线发送/重试机制完全未实现 |
| 13 | **联系人接入写信自动补全** | `contacts` 模块独立 | 🔴 写信时无法从联系人选择/自动补全收件人 |
| 14 | **vCard 导入/导出** | `vcard_service.dart` 已实现 | ✅ V3已接入 contacts 页（与 email 模块仍解耦） |
| 15 | **enough_mail_icalendar（日历邀请）** | — | ⚪ 未使用，无法解析/回复会议邀请 |
| 16 | **METADATA / ENABLE / UNSELECT / ESORT** | — | ⚪ 未使用（非关键） |
| 17 | **签名管理 UI** | `email_signatures_dao` + `email_signatures_table` 已定义 | 🔴 无签名 CRUD 界面，compose 仅加载默认签名 |
| 18 | **多账户切换/统一收件箱** | `unifiedEmailListProvider` 已定义 | 🔴 实际 UI 仅用 `localEmailListProvider`（单账户），见 BUG-16 |

---

<a id="4"></a>
## 4. BUG / 逻辑错误 / 工作流错误 / UI 问题

### 🔴 P0 — 严重（影响核心功能正确性）

---

**BUG-01「回复」实为「回复全部」—— V3 标注但未修复**

- **文件**: `compose_page.dart:202-227`（`_buildReplyWithAttachmentsAsync`）、`compose_page.dart:282-288`（`_send` 调用处）
- **现象**: `_buildReplyWithAttachmentsAsync` 默认 `replyAll = true`。`_send()` 中调用时**未传 `replyAll: false`**：
  ```dart
  message = await _buildReplyWithAttachmentsAsync(
    from: _selectedAccount!.email,
    originalMessage: widget.replyToMessage!,
    replyBody: _bodyController.text,
    fromDisplayName: displayName,
    // ← replyAll 未传，默认 true
  );
  ```
  内部 `MessageBuilder.prepareReplyToMessage(originalMessage, ..., replyAll: true)` 会把原邮件所有 To/Cc 收件人加入回复。
- **结果**: 用户点"回复"（单发件人），实际邮件被发给原邮件的全部收件人。"回复"与"回复全部"行为一致，独立按钮冗余且误导。
- **V3 状态**: V3 报告在 §3 列为 P0 BUG，但在 §6.2 修复清单中**未包含此项**。当前代码确认**仍然存在**。
- **修复建议**: `_send()` 中判断 `widget.replyToMessage != null && widget.forwardMessage == null` 时显式传 `replyAll: false`；或在 `ComposePage` 增加 `isReplyAll` 参数，由详情页的"回复"/"回复全部"按钮分别传入。

---

**BUG-02 增量同步的 UID 参数被完全忽略 + 不跳过已同步 UID —— V3 标注但未修复**

- **文件**: `email_sync_service.dart:437-443`（`_searchSinceUid`）、`email_sync_service.dart:372-397`（`incrementalSync` 循环）
- **现象**:
  1. `_searchSinceUid(ds, lastUid)` 接收 `lastUid` 参数却**完全不使用**，直接回退到 `_searchSinceDate(ds, lastSyncTime)`：
     ```dart
     Future<List<MimeMessage>> _searchSinceUid(MailDataSource ds, int lastUid) async {
       final lastSyncTime = _lastSyncTimes[ds.client.account.email] ??
           DateTime.now().subtract(const Duration(days: 7));
       return _searchSinceDate(ds, lastSyncTime); // lastUid 被丢弃
     }
     ```
  2. `incrementalSync` 循环中**没有跳过 `uid <= maxUid` 的已同步邮件**，仅靠 `upsertEmail` 的 messageId 去重。
- **结果**: 每次增量同步都重新拉取近 7 天邮件并逐封 upsert，浪费流量/CPU；`_lastSyncedUids` 机制形同虚设；未利用 enough_mail 的 UIDPLUS/QRESYNC/CONDSTORE 扩展。
- **V3 状态**: V3 报告列为 P0 BUG，但 §6.2 修复清单**未包含此项**。当前代码确认**仍然存在**。
- **修复建议**: 用 `MailSearch` 配合 UID 范围查询（`uid > lastUid`），循环里跳过 `uid <= maxUid`。

---

**BUG-15 服务端搜索结果不可点击（NEW）**

- **文件**: `email_list_page.dart:412-417`（`_EmailSearchView` 的 server results）
- **现象**: 本地搜索结果有 `onTap`，但服务端搜索结果（`_serverResults`）的 `ListTile` **没有 `onTap`**：
  ```dart
  ...server.map(
    (m) => ListTile(
      leading: const Icon(Icons.cloud, size: 16),
      title: Text(m.decodeSubject() ?? '(无主题)'),
      subtitle: Text(m.from?.first.toString() ?? ''),
      // ← 无 onTap，点击无反应
    ),
  ),
  ```
- **结果**: 用户搜索服务器找到邮件后，点击无任何反应，无法查看详情。
- **修复建议**: 为服务端结果添加 `onTap`，先将 `MimeMessage` 持久化到本地 DB，再跳转详情页。

---

### 🟠 P1 — 重要（功能缺失 / 逻辑错误 / 架构问题）

---

**BUG-16 宽屏布局不支持多账户统一收件箱（NEW）**

- **文件**: `email_list_page.dart:89`（`_buildWideLayout`）
- **现象**: 宽屏布局中邮件列表使用 `_NarrowEmailFolderList(accountId: accounts.first.id!)`，**始终只显示第一个账户**的邮件。`unifiedEmailListProvider`（跨账户合并查询）已定义但仅在死代码 `EmailListView` 中被 `watch`。
- **结果**: 多账户用户的宽屏界面只看到第一个账户的收件箱，其余账户邮件不可见。
- **修复建议**: 宽屏布局改用 `unifiedEmailListProvider(selectedFolder)` 获取合并列表；或提供账户切换 Tab。

---

**BUG-17 `EmailListView` 为死代码（NEW）**

- **文件**: `email_list_view.dart`（整个文件）
- **现象**: `EmailListView` 类定义完整（含分页加载、下拉刷新），但**全项目无任何文件 import 或使用它**。它使用的 `unifiedEmailListProvider` 也因此成为事实上的死代码。
- **结果**: 分页加载逻辑（`fetchOlderMessages`）虽然存在但从未被实际调用（活跃代码 `_NarrowEmailFolderList` 无分页加载）。
- **修复建议**: 要么删除死代码，要么用 `EmailListView` 替换 `_NarrowEmailFolderList` 以获得统一收件箱 + 分页加载能力。

---

**BUG-18 窄屏 `_NarrowEmailFolderList` 无分页加载（NEW）**

- **文件**: `email_list_page.dart:430-632`（`_NarrowEmailFolderList`）
- **现象**: 活跃使用的 `_NarrowEmailFolderList` 使用 `localEmailListProvider(accountId)` 的 `Stream` 一次性加载全部本地邮件，**无分页、无"加载更多"机制**。死代码 `EmailListView` 才有 `_loadMore()` → `fetchOlderMessages`。
- **结果**: 邮件数量多时，列表渲染全部邮件，性能下降；用户无法手动触发加载更早的邮件。
- **修复建议**: 在 `_NarrowEmailFolderList` 中增加滚动到底部触发 `fetchOlderMessages` 的逻辑。

---

**BUG-19 `_NarrowEmailFolderList` 文件夹过滤逻辑与 `MailboxMerger` 不一致（NEW）**

- **文件**: `email_list_page.dart:497-529`（`_NarrowEmailFolderList` 的 build 方法）
- **现象**: 窄屏/宽屏列表使用**硬编码的字符串匹配**过滤文件夹（如 `emailFolder.contains('sent')`），而 `MailboxMerger` 使用 IMAP flags + 路径映射表。两套逻辑可能产生不一致：
  - 自定义文件夹名包含 "sent"（如 "Sent_Items_Backup"）会被误归为"已发送"
  - Gmail 的 `[Gmail]/Sent Mail` 路径不会匹配 `contains('sent')` 因为路径含特殊字符
- **修复建议**: 统一使用 `MailboxMerger` 的分类逻辑，通过 `unifiedEmailListProvider` 获取已分类的邮件列表。

---

**BUG-20 静态 MIME 缓存永不清理，存在内存泄漏（NEW）**

- **文件**: `email_detail_view.dart:62-63`
- ```dart
  static final Map<int, MimeMessage> _mimeCache = {};
  static final Map<int, String> _processedHtmlCache = {};
  ```
- **现象**: 这两个 `static` Map 在 `_EmailDetailBodyState` 的生命周期外持续存在，**永不清理**。用户每查看一封新邮件，缓存就增长一项（含完整 MIME 源码 + 处理后的 HTML 字符串）。
- **结果**: 长时间使用后内存占用持续增长，尤其查看大量含大附件/大 HTML 的邮件时。
- **修复建议**: 使用 LRU 缓存（如 `collection` 的 `LinkedHashMap` 限制条目数），或在 `dispose` 时清理超期条目。

---

**BUG-21 HTML 邮件内容横向滚动（UX 问题）（NEW）**

- **文件**: `email_detail_view.dart:236-257`
- ```dart
  SingleChildScrollView(
    scrollDirection: Axis.horizontal,  // ← 横向滚动
    child: HtmlWidget(_processedHtml!, ...),
  )
  ```
- **现象**: HTML 邮件正文被包裹在 `Axis.horizontal` 的 `SingleChildScrollView` 中，宽内容会横向滚动而非自适应换行。
- **结果**: 宽表格邮件需要左右滑动查看，体验不佳；正常邮件可能出现不必要的横向滚动条。
- **修复建议**: 移除外层 `SingleChildScrollView`，让 `HtmlWidget` 自然换行；或改为 `Axis.vertical`。

---

**BUG-22 IDLE 能力已探测但未实际启用推送（V3 部分修复）**

- **文件**: `mail_data_source.dart:67-68`、`email_sync_service.dart:69-73`
- **现象**: V3 修复了 `testConnection` 对 IDLE 能力的探测（BUG-07 已修复），但实际同步策略**仍只用轮询**（`startPolling`），未根据 `supportsIdle` 决定是否使用 IDLE 命令进行实时推送。
- **结果**: 即便服务器支持 IDLE，`enough_mail` 的 IDLE(RFC2177) 推送能力仍未被利用，新邮件通知存在轮询间隔的延迟。
- **修复建议**: 在 `connectAndSync` 中检查 `account.supportsIdle`，若为 true 则调用 `MailClient` 的 IDLE 模式（`enough_mail` 内部在 `startPolling` 时会自动选择 IDLE 或轮询，但需要确认配置）。

---

**BUG-23 待发邮件队列（PendingEmails）完全未接入（NEW）**

- **文件**: `pending_emails_table.dart`、`pending_emails_dao.dart`
- **现象**: 数据库表 `pending_emails` 和 `PendingEmailsDao` 已定义（含 `status`、`retryCount`、`lastRetryAt`、`errorMessage` 字段），但**全项目无任何代码**调用 `PendingEmailsDao` 的方法。
- **结果**: 离线发送、发送失败重试、待发队列管理等功能完全未实现。用户离线时发送邮件会直接失败，无队列暂存。
- **修复建议**: 在 `sendEmail` 失败时插入 `pending_emails` 表；`BackgroundSyncManager` 定期检查并重试待发邮件。

---

**BUG-24 草稿仅能保存，无法管理/编辑/发送（NEW）**

- **文件**: `compose_page.dart:491-547`（`_saveDraft`）
- **现象**: `saveDraft` 调用 `ds.saveDraft(message)` 将草稿保存到服务器的 Drafts 文件夹，但：
  - 无草稿列表 UI（虽然 "Drafts" 文件夹在统一文件夹中可见，但草稿邮件的 `folder` 字段可能不匹配本地过滤逻辑）
  - 无法从草稿继续编辑（`ComposePage` 有 `prepareFromDraft` 方法在 `mail_data_source.dart` 但从未调用）
  - 草稿保存后无"已保存"的本地记录
- **修复建议**: 增加草稿列表视图，支持点击草稿进入编辑（调用 `MessageBuilder.prepareFromDraft`）。

---

### 🟡 P2 — 次要（代码质量 / 死代码 / UX 细节）

---

**BUG-25 `deleteDuplicateEmails` 返回值语义误导（NEW）**

- **文件**: `emails_dao.dart:45-55`
- **现象**: 方法名为 `deleteDuplicateEmails`，但返回的是**剩余邮件数量**（`remaining.length`），而非删除的数量。调用方 `email_sync_service.dart:147` 实际用自己的 `beforeCount - afterCount` 计算删除数，所以不影响功能，但方法签名有误导性。
- **修复建议**: 方法返回删除的数量，或重命名为 `getRemainingCountAfterDedup`。

---

**BUG-26 `_autoSelectFirstEmail` 仅查询 INBOX（NEW）**

- **文件**: `email_list_page.dart:37-51`
- **现象**: 自动选中第一封邮件时，硬编码查询 `'INBOX'` 文件夹：
  ```dart
  final emails = await emailsDao.watchEmailsByAccountAndFolder(
    accountId, 'INBOX',
  ).first;
  ```
  如果用户当前选中的是其他文件夹（如"已发送"），自动选中的邮件仍来自 INBOX，与显示列表不一致。
- **修复建议**: 使用 `ref.read(selectedFolderProvider)` 获取当前文件夹再查询。

---

**BUG-27 宽屏布局固定使用第一个账户（NEW）**

- **文件**: `email_list_page.dart:89`
- ```dart
  _NarrowEmailFolderList(accountId: accounts.first.id!)
  ```
- **现象**: 宽屏布局的邮件列表始终绑定 `accounts.first`，用户无法切换查看其他账户的邮件（虽然有账户指示器，但点击无反应）。
- **修复建议**: 增加账户选择器，或改用统一列表。

---

**BUG-28 `EmailAccountEntity.copyWith` 缺少 `smtpStartTls` 参数（NEW）**

- **文件**: `email_account_entity.dart:40-75`
- **现象**: `copyWith` 方法的参数列表中缺少 `smtpStartTls`，导致通过 `copyWith` 复制账户时该字段会被重置为默认值 `false`。
- **修复建议**: 在 `copyWith` 中增加 `bool? smtpStartTls` 参数。

---

**BUG-29 `_NarrowEmailFolderList` 命名误导（代码质量）**

- **文件**: `email_list_page.dart:430`
- **现象**: 类名为 `_NarrowEmailFolderList`，但实际上在**宽屏和窄屏布局中都被使用**。命名中的 "Narrow" 误导开发者认为它仅用于窄屏。
- **修复建议**: 重命名为 `_EmailFolderList` 或 `_AccountEmailList`。

---

**BUG-30 `MailDataSourcesNotifier.addAccount` 返回类型为 `Future<void>` 但声明为 `async`（代码质量）**

- **文件**: `mail_data_sources_notifier.dart:11-41`
- **现象**: `addAccount` 方法声明为 `Future<void> addAccount(...) async`，但方法体中直接 `await ds.connect()` 后修改 `state`。如果 `connect()` 失败，异常会抛出但 `state` 不会被更新——这是正确行为，但调用方（如 `email_account_form_page.dart:293`）的 `_connectAndSync` 方法中 `catch (e) { debugPrint(...) }` 会吞掉连接失败异常，用户只看到"保存成功"但实际未连接。
- **修复建议**: `_connectAndSync` 失败时应向用户提示连接失败。

---

### 关于「UI 遮罩」

- 已重点排查 `Stack`/`Positioned`/`Opacity`/`Visibility`/`Modal` 等遮罩风险。
- **未发现明确的内容被遮挡 bug**。主要的"可视可达性"问题集中在：
  - BUG-16/27：宽屏只显示第一个账户（入口缺失）
  - BUG-18：无分页加载（历史邮件不可达）
  - BUG-15：服务端搜索结果不可点击（功能缺失）
  - BUG-19：文件夹过滤不一致（部分邮件可能出现在错误文件夹）

---

<a id="5"></a>
## 5. `enough_mail` 能力覆盖率总表

| enough_mail 能力 | 项目是否已用 | 状态 | 备注 |
|------------------|--------------|------|------|
| IMAP4rev1 | ✅ | 已实现 | 核心收发功能完整 |
| SMTP | ✅ | 已实现 | 含重试机制 |
| POP3 | ❌ | 未支持 | 完全未用 |
| MIME 解析/生成 | ✅ | 已实现 | 解析 + MessageBuilder |
| IMAP IDLE（推送） | ⚠️ | 探测但未启用 | BUG-22，仍用轮询 |
| MOVE | ✅ | 已实现 | 删除/移动使用 |
| UIDPLUS | ❌ | 未利用 | BUG-02，增量同步未用 UID 范围 |
| CONDSTORE / QRESYNC | ❌ | 未利用 | 增量同步优化未用 |
| SORT / THREAD | ❌ | 未调用 | 无会话视图 |
| ESEARCH | ⚠️ | 部分使用 | searchMessages 已用但结果不可点击(BUG-15) |
| QUOTA | ❌ | 未实现 | 能力已探测但无展示 UI |
| METADATA / ENABLE / UNSELECT / ESORT | ❌ | 未使用 | 非关键 |
| SMTP 8-bit MIME | ✅ | 库内部支持 | |
| DKIM 部分签名 | ❌ | 未实现 | |
| `mailto:` 解析 | ❌ | 未接入 | |
| 自动发现 Discover | ✅ | 已实现 | |
| `enough_mail_html` | ✅ | 已实现 | HTML 渲染 + CID 内联 |
| `enough_mail_icalendar`（日历邀请） | ❌ | 未使用 | |
| 文件夹管理（创建/删除） | ⚠️ | data 层已封装 | 无 UI 入口 |
| 文件夹重命名 | ❌ | 未实现 | data 层都未封装 |
| 草稿保存 | ✅ | 已实现 | 无草稿管理 UI |
| 标记已回复/已转发 | ✅ | 已实现 | V3 修复 |
| 举报垃圾邮件 | ⚠️ | data 层已封装 | 无 UI 入口 |
| 批量操作 | ⚠️ | data 层已封装 | 无多选 UI |
| 连接断线重连 | ✅ | 已实现 | 事件驱动 |
| 邮件消失(VANISHED)处理 | ✅ | 已实现 | 自动清理本地副本 |

> **覆盖率结论**：`enough_mail` 的核心收发/标记能力已落地约 **55%**。主要缺口在：
> - **推送（IDLE）**：探测了但未启用
> - **增量同步优化（UIDPLUS/QRESYNC）**：BUG-02 未修复
> - **搜索**：已接入但有缺陷（BUG-15）
> - **会话/线程**：完全未用
> - **文件夹管理**：data 层有但无 UI
> - **草稿管理**：仅保存
> - **离线发送队列**：表已建但完全未接入
> - **POP3 / DKIM / mailto / icalendar**：完全未用

---

<a id="6"></a>
## 6. 修复优先级建议

### 第一优先级：P0 必修（影响核心功能正确性）

| BUG | 问题 | 工作量 |
|-----|------|--------|
| BUG-01 | "回复"实为"回复全部" | 小（加 `replyAll: false`） |
| BUG-02 | 增量同步 UID 参数被忽略 | 中（改用 UID 范围搜索） |
| BUG-15 | 服务端搜索结果不可点击 | 小（加 onTap + 持久化） |

### 第二优先级：P1 重要（功能缺失 / 架构问题）

| BUG | 问题 | 工作量 |
|-----|------|--------|
| BUG-16 | 宽屏不支持多账户统一收件箱 | 中（改用 unifiedEmailListProvider） |
| BUG-17 | EmailListView 死代码 | 小（删除或启用） |
| BUG-18 | 无分页加载 | 中（接入 fetchOlderMessages） |
| BUG-19 | 文件夹过滤逻辑不一致 | 中（统一用 MailboxMerger） |
| BUG-20 | 静态缓存内存泄漏 | 小（加 LRU 限制） |
| BUG-21 | HTML 邮件横向滚动 | 小（改 scrollDirection） |
| BUG-22 | IDLE 推送未启用 | 中（配置 IDLE 模式） |
| BUG-23 | 待发邮件队列未接入 | 大（需完整离线发送流程） |
| BUG-24 | 草稿无法管理/编辑 | 中（需草稿列表 + 编辑 UI） |

### 第三优先级：P2 清理（代码质量）

| BUG | 问题 | 工作量 |
|-----|------|--------|
| BUG-25 | deleteDuplicateEmails 返回值误导 | 小 |
| BUG-26 | _autoSelectFirstEmail 仅查 INBOX | 小 |
| BUG-27 | 宽屏固定第一个账户 | 小（与 BUG-16 一并修复） |
| BUG-28 | copyWith 缺 smtpStartTls | 小 |
| BUG-29 | _NarrowEmailFolderList 命名误导 | 小 |
| BUG-30 | 连接失败被吞掉 | 小 |

### 功能补齐建议（对照 enough_mail 能力）

按产品价值排序：
1. **文件夹管理 UI**（移动到…、新建/删除文件夹）—— data 层已就绪
2. **草稿管理**（列表/编辑/发送）—— saveDraft 已就绪
3. **会话视图**（THREAD）—— enough_mail 已支持
4. **垃圾邮件标记**—— data 层已就绪
5. **离线发送队列**—— 表已建，需完整流程
6. **IDLE 推送启用**—— 能力已探测
7. **mailto: 唤起**—— url_launcher 已用
8. **POP3 支持**—— 需较大改造
9. **DKIM 签名**—— 安全增强
10. **QUOTA 展示**—— 能力已探测

---

## 附录：V3 修复复核结果

| V3 BUG | 修复状态 | 复核结论 |
|--------|----------|----------|
| BUG-03 大邮件附件 | ✅ 已修复 | `downloadSizeLimit` 提升至 10MB + 按需 `fetchAttachmentPart` 回退 |
| BUG-04 窄屏星标空 | ✅ 已修复 | 改为 `return e.isStarred == true` |
| BUG-05 删除先本地后服务端 | ✅ 已修复 | 改为服务端优先 + 撤销 |
| BUG-06 已读服务端残留 | ✅ 已修复 | 改用 `markSeenByUid` |
| BUG-07 IDLE 硬编码 false | ✅ 已修复 | 探测真实能力（但未启用 IDLE 推送，见 BUG-22） |
| BUG-08 联系人按钮空实现 | ✅ 已修复 | 两处均导航到 ContactsPage |
| BUG-09 附件分享 TODO | ✅ 已修复 | 替换为"保存/打开/复制路径"菜单 |
| BUG-10 异常静默吞掉 | ✅ 已修复 | 改为 `dev.log` |
| BUG-11 在 build 中修改状态 | ✅ 已修复 | 移至 `addPostFrameCallback` |
| BUG-12 Provider 可空静默 | ✅ 已修复 | 增加 `dev.log` |
| BUG-13 窄屏无文件夹切换器 | ✅ 已修复 | 新增 `_NarrowFolderSelector` |
| BUG-14 通知仅 Windows | ✅ 已修复 | 跨平台通知 + 非Windows轮询（workmanager 仍待接入） |
| BUG-01 回复实为回复全部 | ❌ **未修复** | 仍在 P0 清单中 |
| BUG-02 增量同步 UID 忽略 | ❌ **未修复** | 仍在 P0 清单中 |
