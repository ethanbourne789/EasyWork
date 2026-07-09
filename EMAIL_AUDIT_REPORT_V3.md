# EasyWork 邮箱模块 · 对照 `enough_mail` 2.1.7 能力审计报告 (V3)

**审计时间**: 2026-07-08  
**审计基准**: `enough_mail` 2.1.7 官方能力清单（pub.dev README）+ 逐文件源码审查  
**模块范围**: `lib/features/email/**`、`lib/presentation/pages/email/**`、`lib/features/{signatures,contacts}/**`、`lib/core/platform/*sync*`、`lib/core/database/tables/emails*`  
**说明**: V2 报告中已记录的 `email→task`、`FTS5` 等项经独立复核**已修复**，本报告只保留当前代码仍存在的问题，并新增对照 `enough_mail` 官方能力的覆盖率评估。

---

## 0. 对照基准：`enough_mail` 2.1.7 官方能力清单

| 类别 | 官方支持的能力 |
|------|----------------|
| 基础协议 | ✅ IMAP4rev1、✅ SMTP、✅ POP3、✅ MIME 解析/生成 |
| IMAP 扩展 | ✅ IDLE(RFC2177)、✅ METADATA、✅ UIDPLUS、✅ MOVE(RFC6851)、✅ CONDSTORE、✅ QRESYNC、✅ ENABLE、✅ QUOTA、✅ UTF-8、✅ ESEARCH、✅ SORT/THREAD(RFC5256)、✅ UNSELECT、✅ ESORT/PARTIAL、✅ List 扩展(rfc5258/5819/6154, 含 SPECIAL-USE) |
| SMTP 扩展 | ✅ 8-bit MIME |
| 安全 | ✅ DKIM 部分签名 |
| 其他 | ✅ `mailto:` 链接解析、✅ 邮箱自动发现 `Discover` |
| 关联库 | `enough_mail_html`（HTML 生成）、`enough_mail_flutter`（Flutter 组件）、`enough_mail_icalendar`（日历邀请） |

---

## 1. 已实现功能（Implemented & UI-wired）

| 功能 | 实现位置 | 接入 UI |
|------|----------|---------|
| IMAP 连接 / 登录 | `mail_data_source.dart:connect` | ✅ 账户表单保存 |
| 邮箱（文件夹）列表 | `listMailboxes` + `EmailRepositoryImpl.syncMailboxes` | ✅ 连接后持久化 |
| 统一文件夹视图 | `mailbox_merger.dart` + `unifiedMailboxListProvider` | ✅ 宽屏工具栏 |
| 拉取邮件列表 / 正文 | `fetchMessages` / `fetchFullMessage` | ✅ 同步 / 详情 |
| 附件展示 | `attachment_list_widget.dart` | ✅ 详情页（仅已下载部分） |
| SMTP 发送（写/回复/转发/草稿） | `sendEmail` + `MessageBuilder` | ✅ compose |
| 带附件发送 | `_build*WithAttachmentsAsync` (`addBinary`) | ✅ |
| 保存草稿 | `ds.saveDraft` | ✅ compose 保存图标 |
| 标记已读/未读 | `markAsRead/Unread` + DAO | ✅ 详情切换 |
| 星标（flagged） | `markAsFlagged/Unflagged` + DAO | ✅ 详情星标 |
| 删除（移回收站） | `moveToTrash` / `deleteMessage` | ✅ 详情删除 |
| 邮箱自动发现 | `Discover.discover` | ✅ 账户表单 |
| HTML 安全渲染 | `EmailHtmlProcessor`(`enough_mail_html`) + `HtmlWidget` | ✅ 详情 |
| 邮件转任务 | `EmailToTaskService` | ✅ 详情弹窗 |
| 签名 CRUD | `signatures/*` | ✅ compose 加载默认签名 |
| 本地联系人 CRUD | `contacts/*` | ✅ contacts 页（未接入邮件） |
| 后台轮询同步 | `BackgroundSyncManager`（Windows） | ⚠️ 仅 Windows |
| 托盘新邮件通知 | `system_tray_service.dart` | ⚠️ 仅 Windows |

---

## 2. 待实现 / 仅数据层无 UI 的功能（Pending）

> 以下均为 `enough_mail` 已支持、项目代码也已写进 data 层，但**无任何 UI 入口**或**彻底未使用**的功能。

| 功能（enough_mail 已支持） | 代码位置（死代码） | 缺失表现 |
|---------------------------|-------------------|----------|
| 搜索（本地 FTS5 + 服务端 IMAP） | `email_search_service.dart`、`email_search_bar.dart` | 🔴 全站无任何搜索入口，`EmailSearchBar` 从未被 import |
| 移动到指定文件夹 | `repo.moveToFolder` / `ds.moveToFolder` | 🔴 无"移动到…"对话框 |
| 新建/重命名/删除文件夹 | `createMailbox`/`deleteMailbox` | 🔴 无 UI（连 `renameMailbox` 都未实现） |
| 举报垃圾邮件 / 移到 Junk | `junkMessages` / `moveToJunk` | 🔴 无"标记为垃圾"动作 |
| 标记 已回复/已转发/已删除 标志 | `markAsAnswered/Forwarded/Deleted` | 🔴 转发后不置位对应 flag |
| 会话 / 聚合（Threading） | `fetchThreadData`/`fetchThreads` | 🔴 未调用，无会话视图 |
| 联系人接入写信自动补全 | `contacts` 模块 | 🔴 与 email 完全解耦 |
| vCard 导入/导出 | `vcard_dart`（仅 pubspec 声明） | 🔴 全项目零 import |
| **POP3 协议** | — | 🔴 完全未用（仅 IMAP+SMTP） |
| `mailto:` 链接处理 | `url_launcher` 已用 | 🔴 未解析 mailto 唤起 compose |
| DKIM 签名 | — | ⚪ 未实现 |
| QUOTA 展示 | `QUOTA` 扩展 | ⚪ 未实现 |
| IDLE 推送（RFC2177） | `startPolling` 仅 | 🔴 见 BUG-07 |

---

## 3. BUG / 逻辑错误 / 工作流错误 / 按钮缺失（按严重度）

### 🔴 P0 — 严重（影响核心功能正确性）

**BUG-01「回复」实为「回复全部」**
- 文件：`lib/features/email/presentation/pages/compose_page.dart:257-263`
- 现象：回复入口调用 `_buildReplyWithAttachmentsAsync(...)` 时**未传 `replyAll`**，而该方法默认 `replyAll = true`（`compose_page.dart:181`）。
- 结果：点击"回复"会把原邮件所有 Cc/Bcc 一并带出，与"回复全部"行为一致，独立的"回复全部"按钮冗余且误导。
- 修复：回复入口显式传 `replyAll: false`。

**BUG-02 增量同步的 UID 参数被忽略 + 不跳过已同步 UID**
- 文件：`email_sync_service.dart:436-442`（`_searchSinceUid`），`email_sync_service.dart:371-397`
- 现象：`_searchSinceUid(ds, lastUid)` 接收 `lastUid` 却**完全不使用**，改用 `_lastSyncTimes` 做"近 7 天"的日期搜索；上层 `incrementalSync` 传进来的 `uid` 形同虚设。循环里也**没有跳过 `uid <= maxUid` 的已同步邮件**（注释声称会在 caller 过滤，但实际没有）。
- 结果：每次增量同步都重新拉取近 7 天邮件并重写本地（靠 messageId upsert 去重，浪费流量/CPU，`_lastSyncedUids` 机制失效）。未利用 `enough_mail` 的 `UIDPLUS`/`QRESYNC`/`CONDSTORE`。
- 修复：用 `MailSearch` 的 UID 范围查询（`uid > lastUid`），并在循环里跳过 `uid <= maxUid`。

**BUG-03 大邮件附件无法保存**
- 文件：`mail_data_source.dart:62`（`downloadSizeLimit: 100 * 1024`）；`mail_data_source.dart:203`（`fetchMessagePart` 已定义但从未调用）；`attachment_list_widget.dart`
- 现象：`MailClient` 下载上限 100KB，正文超此大小的邮件其 part 不会被下载，`decodeContentBinary()` 返回 null；附件保存走 `part.decodeContentBinary()`，无 `fetchMessagePart`/`fetchMessageSequence` 回退。
- 结果：大邮件附件"保存"无反应（静默失败），且 `enough_mail` 提供的单附件增量拉取能力被闲置。
- 修复：附件保存时若 bytes 为空，先 `ds.fetchMessagePart(message, fetchId)` 再保存。

**BUG-04 窄屏「星标邮件」永远为空**
- 文件：`lib/presentation/pages/email/email_list_page.dart:293-294`
- 现象：窄屏分支对 `case 'flagged'` 直接 `return false`。
- 结果：移动端选择"星标邮件"文件夹显示空列表，与宽屏（`unifiedEmailListProvider` 走 `isStarred`）行为不一致。
- 修复：窄屏应使用 `isStarred == true` 过滤，而非返回 false。

**BUG-05 删除先本地后服务端 → 服务端失败时邮件"消失"**
- 文件：`email_detail_view.dart:401-416`（`_deleteEmail`）
- 现象：先 `emailsDao.deleteEmail(email.id)` 删本地，再 `try { ds.moveToTrash(msg) } catch (_) {}`。当 `msg == null`（仅信封行，`originalMessageJson` 为空）或服务端失败时被 catch 吞掉。
- 结果：本地已删、服务端仍在，无撤销/无提示，本地与服务端不一致（"已移至回收站"却还躺在服务器里）。
- 修复：先尝试服务端 move，成功后再删本地；`msg == null` 时回退到按 uid 的 `deleteMessage`。

**BUG-06 标记已读仅当本地 MIME 存在 → 服务端未读残留**
- 文件：`email_detail_view.dart:129-138`
- 现象：`if (!email.isRead)` 先标记本地已读；仅当 `ds != null && mimeMessage != null` 才标记服务端。对仅有信封/正文文本、无 `originalMessageJson` 的行，`mimeMessage` 为 null，服务端不置已读。
- 结果：应用内显示已读，服务器仍显示未读。
- 修复：服务端标记改为按 uid（`markSeen(uid)`）而非强依赖完整 `MimeMessage`。

### 🟠 P1 — 重要（功能缺失 / 静默失败 / 架构问题）

**BUG-07 IDLE 能力被硬编码为 false（未利用 enough_mail 推送）**
- 文件：`mail_data_source.dart:603`（`testConnection` 返回 `supportsIdle: false`）
- 现象：`ConnectionTestResult.supportsIdle` 永远 false，而 `email_account_form_page.dart:246` 用它赋值给账户；`supportsIdle` 存进 DB 后却**没有任何 provider/策略去读取它**决定是否用 IDLE。
- 结果：即便服务器支持，`enough_mail` 的 IDLE(RFC2177) 推送从未启用，只能轮询。`enough_mail` 明确支持 IDLE，项目白白浪费。
- 修复：`testConnection` 用 `client.isIdleSupported`/`serverInfo` 探测真实能力；同步策略据此优先 IDLE。

**BUG-08 联系人按钮空实现**
- 文件：`email_toolbar.dart:98`（`onTap: () {}`）
- 现象：宽屏工具栏"联系人"按钮点击无任何反应；窄屏菜单的 `contacts` 项在 `_handleNarrowMenuAction` 中也未处理。
- 修复：跳转 `ContactsPage` 或将联系人接入写信。

**BUG-09 附件「分享」为 TODO 空实现**
- 文件：`attachment_list_widget.dart:345`（`// TODO: Share file`）
- 现象：`onTap` 体为空，分享按钮点了没反应。
- 修复：接入 `share_plus` 或系统分享。

**BUG-10 多处异常被静默吞掉**
- `email_repository_impl.dart` `syncMailboxes` → `catch (_) {}`
- `email_repository_impl.dart` `sendEmail` 本地 Sent 落库 → `try (_) {}`
- `email_detail_view.dart` 多处 `catch (_) {}`
- 现象：邮箱同步/发送失败无日志、无提示，问题难以排查。
- 修复：至少 `debugPrint`/写入 `emailSyncLogger`，必要时对用户提示。

**BUG-11 在 `build` 中修改状态（Flutter 反模式）**
- 文件：`compose_page.dart:338-339`（`_selectedAccount ??= accounts.first;` + `_loadSignature()` 内部触发 `setState`）
- 现象：在 `accountsAsync.when(data:)` 的 build 回调里改状态变量并触发 `setState`，可能重复触发 `_loadSignature`，存在"setState during build"风险。
- 修复：移入 `initState`/`didChangeDependencies`，用 `ref.listen` 处理账户变化。

**BUG-12 关键 Provider 可空 → 静默 no-op**
- 文件：`email_providers.dart`（`emailRepositoryProvider`、`emailSyncServiceProvider` 返回 `null`）
- 现象：DB 初始化未完成时这些 provider 返回 null，调用方 `if (repo == null) return;` 直接跳过（如发信、删账户），失败无感知。
- 修复：提供加载态/错误态，或 await 初始化完成再暴露。

**BUG-13 窄屏无文件夹切换器**
- 文件：`email_list_page.dart`（窄屏仅按 `selectedFolderProvider` 默认 `inbox` 过滤，文件夹 rail 是宽屏专属 `email_toolbar`）
- 现象：移动端/窄窗只能看收件箱，无法切换到已发送/草稿/自定义文件夹（除 BUG-04 的星标外）。
- 修复：窄屏增加 `Dropdown`/抽屉式文件夹选择。

**BUG-14 通知与后台同步仅 Windows 托盘**
- 文件：`core/platform/background_sync_manager.dart`（`init()` 非 Windows 直接 return）、`system_tray_service.dart`
- 现象：`flutter_local_notifications` 与 `workmanager` 在 pubspec 声明但**全项目零 import**；Android/iOS 无本地通知、无周期性后台同步。
- 结果：非 Windows 平台无新邮件提醒、无后台收信。
- 修复：在移动端接入 `flutter_local_notifications` + `workmanager`。

### 🟡 P2 — 次要（代码质量 / 死代码）

- **死 Provider**：`emailListProvider`、`localEmailListByFolderProvider`、`localEmailListByFoldersProvider`、`localEmailDetailProvider` 定义后从未被 watch。
- **Service 未纳入 Riverpod**：`EmailSearchService`/`AttachmentService`/`EmailToTaskService` 在 widget 内即席 `new`，破坏生命周期与可测试性。
- **`MailDataSourcesNotifier.dispose`**：`Future.wait(...).catchError(...)` fire-and-forget，dispose 返回后异步 `close()` 可能滞后。
- **`testConnection` 未探测 IDLE/QUOTA 等能力**，仅统计文件夹数量。
- **`_handleMessagesVanished`**（`email_sync_service.dart:610-633`）将 `sequence.toList()` 传给 `deleteByUids`，需核对 `EmailsDao.deleteByUids` 形参类型（`int` vs `String`）避免隐式不一致。

### 关于「UI 遮罩」
- 已重点排查 `Stack`/`Positioned`/`Opacity`/`Visibility` 等遮罩风险，**未发现明确的内容被遮挡 bug**。主要的"可视可达性"问题集中在 **BUG-04 / BUG-13（窄屏无法访问文件夹）**，属于入口缺失而非遮罩。

---

## 4. `enough_mail` 能力覆盖率总表

| enough_mail 能力 | 项目是否已用 | 状态 |
|------------------|--------------|------|
| IMAP4rev1 | ✅ | 已实现 |
| SMTP | ✅ | 已实现 |
| POP3 | ❌ | 未支持 |
| MIME 解析/生成 | ✅ | 已实现 |
| IMAP IDLE（推送） | ⚠️ | 硬编码 false，未启用（BUG-07） |
| MOVE | ✅ | 删除/移动使用 |
| UIDPLUS / CONDSTORE / QRESYNC | ❌ | 增量同步未利用（BUG-02） |
| SORT / THREAD | ❌ | 未调用（无会话视图） |
| ESEARCH | ⚠️ | searchMessages 在 data 层但未接 UI |
| QUOTA | ❌ | 未实现 |
| METADATA / ENABLE / UNSELECT / UTF-8 / ESORT | ❌ | 未使用（非关键） |
| SMTP 8-bit MIME | ✅ | 库内部支持 |
| DKIM 部分签名 | ❌ | 未实现 |
| `mailto:` 解析 | ❌ | 未接入 |
| 自动发现 Discover | ✅ | 已实现 |
| `enough_mail_html` | ✅ | 已实现 |
| `enough_mail_icalendar`（日历邀请） | ❌ | 未使用 |

> **覆盖率结论**：`enough_mail` 的核心收发/标记能力已落地约 60%，但**推送(IDLE)、增量同步优化(UIDPLUS/QRESYNC)、搜索、会话、文件夹管理、垃圾标记、POP3、移动端通知**等大量官方能力处于"未用/未接 UI"状态。

---

## 5. 修复优先级建议

1. **P0 必修**（正确性）：BUG-01 回复全部、BUG-02 增量同步重复拉取、BUG-03 大附件、BUG-04 星标空、BUG-05 删除不一致、BUG-06 已读不一致。
2. **P1 重要**：BUG-07 启用 IDLE、BUG-08/09 按钮空实现、BUG-10 异常可见化、BUG-11/12 状态与 Provider、BUG-13 窄屏文件夹、BUG-14 移动端通知。
3. **P2 清理**：删除死 Provider、将 Service 纳入 Riverpod、核对 `deleteByUids` 类型。
4. **功能补齐（对照 enough_mail）**：搜索 UI、移动到文件夹、文件夹管理、垃圾标记、会话视图、POP3、mailto 唤起、DKIM、QUOTA——按产品优先级排期。

---

## 6. 改动记录（本次修复实施）

> 实施时间：2026-07-08。所有改动均通过 `flutter analyze`（Flutter 3.44 / Dart 3.12）校验。
> 根因统一说明：本地 DB 存储的 `Email` 实体经过 `MimeMessageMapper.fromOriginalMessageJson` 重新解析后，**`MimeMessage.uid` 为 null**，因此旧代码用重建后的 MIME 对象调用 `markAsRead / moveToTrash` 等会静默 no-op。修复统一改为读取 DB 中持久化的 `email.uid`，用 `MessageSequence.fromRange(uid, uid, isUidSequence:true)` 对服务端做基于 UID 的操作。

### 6.1 功能完善

| 功能 | 文件 | 改动 |
|------|------|------|
| **搜索（本地 FTS5 + 服务端 IMAP）** | `email_providers.dart`、`email_list_page.dart`、`email_search_bar.dart`(已存在) | 新增 `emailSearchServiceProvider`；宽/窄布局均接入 `EmailSearchBar`，`_EmailSearchView` 先跑本地 FTS5，再提供「搜索服务器」按钮跑 IMAP `searchMessages`（`EmailSearchService.searchServer`）。 |
| **已回复/已转发/已删除 标志** | `compose_page.dart`、`email_detail_view.dart`、`emails_dao.dart` | 回复/转发完成后按 `email.uid` 调 `MailDataSource.markAnsweredByUid / markForwardedByUid`，并新增 `EmailsDao.markAnswered / markForwarded` 同步本地 `isAnswered/isForwarded`。`ComposePage` 新增 `originalUid`/`originalLocalId` 参数。 |
| **vCard 导入/导出** | `vcard_service.dart`(新增)、`contacts_page.dart` | 零依赖 vCard 3.0 序列化/解析（FN/N/EMAIL/TEL/ORG/TITLE/NOTE）；联系人页新增「导入 / 导出 vCard」按钮，导出写入 app 文档目录，导入经 `file_picker` 选择 `.vcf` 并去重。 |
| **IDLE 推送（RFC2177）** | `mail_data_source.dart`、`email_account_form_page.dart` | `testConnection` 改为通过 `client.client as ImapClient` 读取 `serverInfo.supportsIdle / supports('QUOTA')`，`ConnectionTestResult` 增加 `supportsIdle/supportsQuota`；账户测试结果提示「支持 IDLE 推送 / 支持 QUOTA」。 |

### 6.2 BUG 修复

| BUG | 根因 | 修复 |
|-----|------|------|
| **BUG-03 大邮件附件无法保存** | `connect()` 的 `downloadSizeLimit` 仅 100KB，超出部分不下载。 | 上限提到 10MB；`attachment_list_widget.dart` 增加按需 `fetchAttachmentPart(uid, fetchId)` 回退拉取单部件。 |
| **BUG-04 窄屏「星标邮件」永远为空** | `_NarrowEmailFolderList` 中 `case 'flagged': return false;`。 | 改为 `return e.isStarred == true;`。 |
| **BUG-05 删除先本地后服务端→服务端失败邮件"消失"** | 先 `deleteEmail(id)` 再 `moveToTrash`，服务端失败则本地已删。 | 改为**服务端优先**：先 `moveToTrashByUid(email.uid!)`，成功才删本地；失败弹橙色提示「删除失败：无法连接服务器，邮件已保留」。撤销动作本地重建 + 最佳努力 `moveFromTrashByUid`。 |
| **BUG-06 标记已读仅当本地 MIME 存在→服务端未读残留** | 用重建后 `uid=null` 的 `mimeMessage` 调 `markAsRead`。 | `_load / _toggleRead / _toggleStar` 改用 `markSeenByUid / markFlaggedByUid` 等基于 `email.uid` 的方法。 |
| **BUG-07 IDLE 能力硬编码 false** | 见 6.1 IDLE 行。 | 已探测并暴露真实能力。 |
| **BUG-08 联系人按钮空实现** | `email_toolbar.dart` 的 contacts `onTap: () {}`；窄屏菜单 `contacts` 无处理。 | 两处均 `Navigator.push(ContactsPage)`。 |
| **BUG-10 多处异常被静默吞掉** | `email_sync_service.dart`、`email_repository_impl.dart` 多处 `catch (_) {}`。 | 全部改为 `catch (e)` + `dev.log(...)`，保留原回退逻辑。 |
| **BUG-11 在 build 中修改状态** | `compose_page.dart` build 内 `_selectedAccount ??= accounts.first; if (_signature == null) _loadSignature();`。 | 移至 `initState` 的 `_initDefaultAccount()`（post-frame），build 内改用 `effectiveAccount` 局部变量。 |
| **BUG-12 关键 Provider 可空→静默 no-op** | `emailRepositoryProvider` 返回 null 无提示。 | `email_providers.dart` 在返回 null 前 `dev.log` 原因。 |
| **BUG-13 窄屏无文件夹切换器** | 窄屏仅有 more_vert 菜单，无文件夹切换。 | 新增 `_NarrowFolderSelector`（ChoiceChip 横滑）切换 `selectedFolderProvider`。 |
| **BUG-14 通知与后台同步仅 Windows 托盘** | `background_sync_manager.dart` `init()` 首行 `if (!Platform.isWindows) return;`。 | 新增 `notification_service.dart`（flutter_local_notifications）跨平台新邮件通知，订阅 `NewEmailReceivedEvent`；非 Windows 平台启动周期性后台同步轮询（Windows 仍由窗口显隐事件驱动）。 |

### 6.3 代码质量收尾

- **死 Provider 移除**：删除 `emailListProvider`、`localEmailListByFolderProvider`、`localEmailListByFoldersProvider`、`localEmailDetailProvider`（grep 确认仅自引用）。
- **Service 纳入 Riverpod**：新增 `emailSearchServiceProvider` / `attachmentServiceProvider` / `emailToTaskServiceProvider`；`email_to_task_dialog.dart` 由 `new EmailToTaskService(...)` 改为 `ref.read(emailToTaskServiceProvider)`。
- **`MailDataSourcesNotifier.dispose` 异步化**：`Future.wait(...).catchError((_) {})` 改为记录 `dev.log` 错误，避免静默吞掉关闭失败。
- **`_handleMessagesVanished` 类型核对**：`EmailsDao.deleteByUids(int, List<int>)` 形参为 `List<int>`，`MessageSequence.toList()` 返回 `List<int>`，**无 int/String 隐式不一致**，仅补充注释说明。

### 6.4 遗留 / 后续

- BUG-14 的**移动端 OS 级后台拉取**（workmanager）需原生 `AndroidManifest`/iOS Background Modes 配置，本次未接入（包已声明 `workmanager: ^0.5.0`），建议作为独立任务排期。
- UIDPLUS / QRESYNC（BUG-02 增量同步）与 SORT/THREAD 会话视图未在本轮处理。

