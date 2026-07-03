# EasyWork 邮箱功能模块全量排查报告 (V2)

**排查时间**: 2026年7月3日  
**排查范围**: 邮箱功能全量代码 + enough_mail 2.1.7 API 对标  
**分析方法**: 逐文件逻辑审查 + RFC规范对照 + enough_mail API文档比对

---

## 一、模块架构概览

### 文件清单 (28个源文件)

| 层级 | 文件 | 职责 |
|------|------|------|
| **Data** | `mail_data_source.dart` | enough_mail MailClient 封装 (794行) |
| | `mail_data_sources_notifier.dart` | 多账户 DataSource 管理 |
| | `email_repository.dart` | 抽象接口 (71行) |
| | `email_repository_impl.dart` | 接口实现 (474行) |
| | `email_sync_service.dart` | 同步引擎 (512行) |
| | `mime_message_mapper.dart` | MimeMessage ↔ DB 映射 |
| | `email_html_processor.dart` | HTML渲染处理 |
| | `email_search_service.dart` | 搜索服务 |
| | `email_to_task_service.dart` | 邮件转任务 |
| | `email_providers_config.dart` | 邮箱服务商配置 |
| | `attachment_service.dart` | 附件管理 |
| | `mailbox_merger.dart` | 多账户文件夹合并 |
| **DB** | `emails_table.dart` / `emails_dao.dart` | 邮件表 + DAO |
| | `email_accounts_table.dart` / `email_accounts_dao.dart` | 账户表 + DAO |
| | `email_attachments_table.dart` / `email_attachments_dao.dart` | 附件表 + DAO |
| | `email_signatures_table.dart` | 签名表 |
| | `pending_emails_table.dart` / `pending_emails_dao.dart` | 待发送邮件表 |
| | `mailbox_folders_table.dart` / `mailbox_folders_dao.dart` | 文件夹表 |
| **Presentation** | `email_list_page.dart` | 邮件列表主页 |
| | `email_detail_page.dart` / `email_detail_view.dart` | 邮件详情 |
| | `compose_page.dart` | 写邮件/回复/转发 |
| | `email_accounts_page.dart` / `email_account_form_page.dart` | 账户管理 |
| | `email_list_view.dart` | 邮件列表组件 |
| | `email_toolbar.dart` | 工具栏 |
| | `email_search_bar.dart` | 搜索栏 |
| | `email_to_task_dialog.dart` | 转任务对话框 |
| | `attachment_list_widget.dart` | 附件列表 |

---

## 二、发现的问题清单

### 🔴 严重问题 (P0)

---

#### BUG-01: 邮件去重存在并发竞态条件 — 确认存在

**文件**: `emails_dao.dart:74-95`

```dart
Future<int> upsertEmail(EmailsCompanion email) async {
  // Step 1: 查询是否存在
  final existing = await (select(emails)
        ..where((t) =>
            t.messageId.equals(email.messageId.value) &
            t.accountId.equals(accountId)))
      .get();
  // ⚠️ 时间窗口：另一个线程可能在此处插入相同 messageId
  if (existing.isNotEmpty) {
    // 更新
  } else {
    // 插入
  }
}
```

**竞态场景**:
- `_handleNewMessage` 和 `incrementalSync` 可能同时处理同一封邮件
- `firstSync` 中的循环和 polling 回调可能交叉执行
- 结果: 同一 messageId 出现多条记录

**影响**: 用户看到重复邮件

---

#### BUG-02: 数据库缺少复合唯一约束 — 确认存在

**文件**: `emails_table.dart`

```dart
class Emails extends Table {
  // ❌ messageId 无 unique 约束
  // ❌ 无 (messageId + accountId) 复合唯一约束
  TextColumn get messageId => text()();  // 无保护
}
```

**后果**: 即使应用层逻辑正确，数据库层面也无法阻止重复数据。BUG-01 的竞态条件在没有数据库约束的情况下无法被兜底。

---

#### BUG-03: 邮件正文拉取失败后静默丢失 — 确认存在

**文件**: `email_sync_service.dart:98-103`

```dart
// firstSync 中
MimeMessage fullMessage = message;
if (!message.isDownloaded) {
  try {
    fullMessage = await ds.fetchFullMessage(message);
  } catch (_) {}  // ❌ 静默吞掉异常，不重试
}
// 保存可能没有正文的 message
final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
await _emailsDao.upsertEmail(companion);  // ❌ 保存空 bodyHtml
```

**同样问题出现在**:
- `incrementalSync()` 第196-199行
- `syncFolder()` 第253-256行
- `_handleNewMessage()` 第294-297行
- `fetchOlderMessages()` 第426-429行

**影响**: 用户看到邮件但无正文内容，无法恢复

---

#### BUG-04: UID 状态仅存内存，重启后全量重同步 — 确认存在

**文件**: `email_sync_service.dart:22-23`

```dart
final Map<int, int> _lastSyncedUids = {};  // ❌ 仅内存
final Map<int, PagedMessageSequence> _pagedSequences = {};  // ❌ 仅内存
```

**重启场景**:
1. 用户已同步1000封邮件
2. 应用重启 → `_lastSyncedUids = {}`
3. `incrementalSync()` 中 `lastSyncedUid = null`
4. 所有邮件被当作"新邮件"重新处理
5. 虽然 `upsertEmail` 会更新，但浪费大量网络/电量

**缺失**: RFC 7162 要求的 `uidValidity` 和 `modseq` 持久化

---

#### BUG-05: IDLE 未被使用，固定轮询 — 确认存在

**文件**: `mail_data_source.dart:222-223`

```dart
Future<void> startPolling({Duration interval = const Duration(minutes: 2)}) =>
    _client.startPolling(interval);
```

**问题**:
- enough_mail 支持 IDLE (RFC 2177)，但项目始终使用轮询
- `testConnection()` 中检测了 `supportsIdle` 但结果仅存储在 DB，未用于选择同步策略
- 浪费电池和网络资源
- 新邮件延迟最多2分钟

**enough_mail API 对标**: `MailClient.startPolling()` 内部其实会自动使用 IDLE（如果服务器支持），但项目在 `connectAndSync` 中也调用了 polling，可能导致重复订阅。

---

#### BUG-06: MailDataSourcesNotifier.dispose() 异步操作未等待 — 确认存在

**文件**: `mail_data_sources_notifier.dart:50-56`

```dart
@override
void dispose() {
  for (final ds in state.values) {
    ds.close();  // ❌ close() 是 async，但 dispose() 不等待
  }
  state = {};
  super.dispose();  // ❌ 在 close 完成前就调用了 super.dispose()
}
```

**影响**: IMAP/SMTP 连接未正确关闭，可能导致资源泄漏

---

### 🟡 中等问题 (P1)

---

#### BUG-07: MimeMessageMapper.toCompanion 丢失关键字段 — 确认存在

**文件**: `mime_message_mapper.dart:6-33`

```dart
static EmailsCompanion toCompanion(MimeMessage message, int accountId, {String? folder}) {
  return EmailsCompanion.insert(
    // ❌ 缺失字段:
    // - inReplyTo (线程恢复必需)
    // - references (线程恢复必需)
    // - replyTo (回复地址)
    // - priority (优先级标记)
    // - threadId (虽有表字段但未赋值)
    threadId: Value(null),  // ❌ 永远为 null
  );
}
```

**影响**: 邮件线程无法正确关联，群组回复链断裂

---

#### BUG-08: email_html_processor CID 图片替换可能破坏 HTML — 确认存在

**文件**: `email_html_processor.dart:37-44`

```dart
var result = _cidAttrRe.replaceAllMapped(html, (match) {
  final prefix = match.group(1)!;
  final cid = match.group(2)!;
  final dataUri = cidMap[cid];
  if (dataUri != null) {
    return '$prefix$dataUri"';  // ❌ 末尾的引号可能不匹配
  }
  return match.group(0)!;
});
```

**问题**: 
- 正则 `(<img[^>]+src\s*=\s*["'])cid:([^"']+)["']` 匹配后，替换字符串末尾添加了 `"` 但原始字符串可能已经是 `"` 结尾，导致 HTML 属性引号不匹配
- 例如: `src="cid:xxx"` 被替换为 `src="data:image/png;base64,xxx""` (多了一个引号)

---

#### BUG-09: _handleMessagesVanished 转换 UID 为 String 类型不匹配 — 确认存在

**文件**: `email_sync_service.dart:350-368`

```dart
Future<void> _handleMessagesVanished(int accountId, MailVanishedEvent event) async {
  final sequence = event.sequence;
  if (sequence == null) return;

  _eventBus.publish(EmailVanishedEvent(
    accountId: accountId,
    messageIds: sequence.toList().map((id) => id.toString()).toList(),
    // ⚠️ uid 是 int，转成 String 后与其他地方的比较不匹配
  ));

  // 下面的代码用 int UID 比较，是正确的
  final ids = sequence.toList();  // List<int>
  final allEmails = await _emailsDao.getEmailsByAccount(accountId);
  for (final id in ids) {
    final match = allEmails.where((e) => e.uid != null && e.uid == id);
    // ✅ 这里比较正确
  }
}
```

**问题**: `EmailVanishedEvent.messageIds` 是 `List<String>`，但 UID 实际是 int。消费此事件的地方可能需要 String→int 转换，容易出错。

---

#### BUG-10: incrementalSync 未校验 messageId 为空的情况 — 确认存在

**文件**: `email_sync_service.dart:170-227`

```dart
Future<SyncResult> incrementalSync(int accountId) async {
  // ...
  for (final message in messages) {
    final uid = message.uid;
    if (uid != null && lastSyncedUid != null && uid <= lastSyncedUid) {
      skipped++;
      continue;
    }

    final messageId = message.decodeHeaderValue('message-id');
    // ❌ 没有检查 messageId 是否为 null 或 empty
    // 与 firstSync 不同，incrementalSync 不过滤空 messageId

    MimeMessage fullMessage = message;
    // ...
    final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
    await _emailsDao.upsertEmail(companion);
    // ❌ 如果 messageId 为空，upsertEmail 会用空字符串作为 key
    // 导致所有无 Message-ID 的邮件互相覆盖
  }
}
```

**影响**: 无 Message-ID 的邮件（如某些自动回复）可能互相覆盖或产生异常

---

#### BUG-11: sendEmail 后同步已发送邮件可能覆盖当前选中文件夹 — 确认存在

**文件**: `email_repository_impl.dart:214-241`

```dart
@override
Future<void> sendEmail(int accountId, MimeMessage message) async {
  final ds = _dataSources.get(accountId);
  if (ds == null) throw Exception('Account not connected');
  final prevMailbox = ds.selectedMailbox;
  await ds.sendMessage(message);
  try {
    final sentMailbox = ds.getMailboxByFlag(MailboxFlag.sent);
    if (sentMailbox != null) {
      await ds.selectMailbox(sentMailbox);  // ⚠️ 切换到 Sent 文件夹
      final messages = await ds.fetchMessages(mailbox: sentMailbox, count: 10, ...);
      for (final msg in messages) {
        // upsert 所有最近10封已发送邮件
      }
    }
  } catch (_) {}
  if (prevMailbox != null) {
    try {
      await ds.selectMailbox(prevMailbox);  // ⚠️ 切换回来
    } catch (_) {}
  }
}
```

**问题**:
1. 在发送邮件过程中切换了当前选中的 mailbox，可能影响其他并发操作
2. 如果 `selectMailbox(prevMailbox)` 失败（catch `_`），后续操作会在 Sent 文件夹上执行
3. 每次发送都拉取10封已发送邮件进行 upsert，性能浪费

---

#### BUG-12: email_to_task_service 的 emailId 硬编码为 0 — 确认存在

**文件**: `email_to_task_service.dart:51-55`

```dart
_eventBus.publish(EmailConvertedToTaskEvent(
  emailId: 0,  // ❌ 硬编码，未传入实际 emailId
  taskId: taskId,
  subject: subject,
));
```

**影响**: 任务转换事件无法追溯到原始邮件

---

#### BUG-13: email_to_task_dialog 未实际调用 EmailToTaskService — 确认存在

**文件**: `email_to_task_dialog.dart:100-110`

```dart
onPressed: () {
  if (_formKey.currentState!.validate()) {
    Navigator.pop(context, true);
    // TODO: Actually create task via EmailToTaskService
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('任务已创建')),  // ❌ 显示成功但实际未创建
    );
  }
},
```

**影响**: 用户以为任务已创建，但实际未生效

---

### 🟠 工作流偏差 (P2)

---

#### BUG-14: firstSync 与 incrementalSync 使用相同的 FetchPreference 但逻辑不同步 — 确认存在

**文件**: `email_sync_service.dart`

| 方法 | count | FetchPreference | UID过滤 |
|------|-------|----------------|---------|
| `firstSync` | 50 | `fullWhenWithinSize` | 无 |
| `incrementalSync` | 100 | `fullWhenWithinSize` | `uid <= lastSyncedUid` |
| `syncFolder` | 30 | `fullWhenWithinSize` | 无 |
| `fetchOlderMessages` | 30 | `fullWhenWithinSize` | 按 messageId 去重 |

**偏差**:
- `firstSync` count=50 但 `incrementalSync` count=100，可能导致增量同步获取了比首次更多的邮件
- `incrementalSync` 不按 messageId 去重（只按 UID 过滤），而 `fetchOlderMessages` 按 messageId 去重
- 三种同步方法的错误处理不一致

---

#### BUG-15: connectAndSync 中 polling 可能重复启动 — 确认存在

**文件**: `email_sync_service.dart:62-65`

```dart
if (!_pollingAccounts.contains(accountId)) {
  _pollingAccounts.add(accountId);
  await ds.startPolling(interval: const Duration(minutes: 2));
}
```

**问题**: 如果 `connectAndSync` 被调用多次（如账户重新连接），虽然有去重检查，但 `_pollingAccounts` 在 `disconnect` 后被清除，重新连接时会重新启动 polling。如果之前的 polling 未完全停止，可能产生多个轮询任务。

---

#### BUG-16: 缺少网络重试和指数退避机制 — 确认存在

**全局问题**: 所有网络操作（fetchMessages, fetchFullMessage, sendMessage 等）失败后直接返回错误或静默忽略，没有:
- 指数退避重试
- 离线队列
- 网络状态检测
- 连接自动恢复后的重试

---

#### BUG-17: email_list_page 多账户只显示第一个账户的邮件 — 确认存在

**文件**: `email_list_page.dart:65-66`

```dart
// 宽屏布局
final accountId = accounts.first.id!;  // ❌ 只取第一个账户
return Row(
  children: [
    Expanded(flex: 1, child: EmailListView(accountId: accountId)),
    Expanded(flex: 3, child: EmailDetailView(accountId: accountId)),
  ],
);
```

**影响**: 多账户用户只能看到第一个账户的邮件，其他账户被忽略

---

### 🔵 隐性问题 (P3)

---

#### BUG-18: email_providers_config 缺少多个中国邮箱服务商 — 确认存在

**文件**: `email_providers_config.dart`

**缺失**:
- `139.com` (中国移动邮箱)
- `189.cn` (中国电信邮箱)
- `wo.cn` (中国联通邮箱)
- `aliyun.com` (阿里云邮箱)
- `sohu.com` / `sogou.com`
- `tom.com`
- `21cn.com`
- `企业邮箱` (腾讯企业邮、网易企业邮等)

---

#### BUG-19: compose_page 转发时未保留原始附件列表信息 — 确认存在

**文件**: `compose_page.dart:59-68`

```dart
if (widget.forwardMessage != null) {
  final msg = widget.forwardMessage!;
  if (_subjectController.text.isEmpty) {
    final subject = msg.decodeSubject() ?? '';
    _subjectController.text = subject.startsWith('Fwd:') ? subject : 'Fwd: $subject';
  }
  if (widget.body == null) {
    final originalBody = msg.decodeTextPlainPart() ?? '';
    _bodyController.text = '\n\n---------- 转发的邮件 ----------\n$originalBody';
    // ❌ 未将原始邮件的附件作为待发送附件添加
    // ❌ 未显示原始邮件有多少附件
  }
}
```

**影响**: 转发邮件时原始附件丢失（虽然 `buildForwardMessage` 中 `forwardAttachments: true` 会通过 MIME 保留，但 UI 上没有提示）

---

#### BUG-20: attachment_list_widget 未处理附件下载进度 — 确认存在

**文件**: `attachment_list_widget.dart:65-91`

```dart
Future<void> _saveAttachment(_AttachmentInfo info) async {
  // ❌ 无下载进度条
  // ❌ 大附件可能阻塞 UI
  // ❌ 无取消下载功能
  // ❌ 未检查存储空间
}
```

---

#### BUG-21: searchEmails 在 EmailSearchService 中调用的是同一个方法 — 确认存在

**文件**: `email_search_service.dart:11-24`

```dart
Future<List<Email>> searchEmails(String query, {int accountId = 0}) async {
  try {
    final results = await _emailsDao.searchEmails(query);  // 这就是 searchEmailsLike
    if (accountId > 0) {
      return results.where((e) => e.accountId == accountId).toList();
    }
    return results;
  } catch (e) {
    // Fallback to LIKE search if FTS5 fails
    return _emailsDao.searchEmailsLike(query);  // ❌ 与上面调用的是同一方法
  }
}
```

**问题**: `searchEmails` 和 `searchEmailsLike` 实现完全相同，FTS5 fallback 无意义。代码注释说 "Use FTS5" 但实际没有 FTS5 实现。

---

#### BUG-22: email_detail_view 和 email_detail_page 存在重复实现 — 确认存在

**文件**: `email_detail_view.dart` vs `email_detail_page.dart`

两个组件实现了几乎相同的邮件详情显示逻辑:
- `email_detail_page.dart` — 完整页面，有 AppBar
- `email_detail_view.dart` — 嵌入式组件，无 AppBar

**问题**: 
- HTML 处理逻辑重复（`_stripTableBorders` 仅在 detail_view 中）
- 标记已读逻辑重复
- 回复/转发逻辑重复
- 维护成本翻倍

---

#### BUG-23: emails_dao.searchEmails 无 FTS5 实际实现 — 确认存在

**文件**: `emails_dao.dart:107-120`

```dart
Future<List<Email>> searchEmails(String query) => searchEmailsLike(query);
// ❌ 直接调用 LIKE 搜索，注释声称使用 FTS5 但实际未实现
```

**影响**: 大量邮件时搜索性能差（LIKE '%query%' 无法使用索引）

---

#### BUG-24: DropdownButtonFormField 使用了不存在的 initialValue 参数 — 确认存在

**文件**: `email_account_form_page.dart:407`

```dart
DropdownButtonFormField<String>(
  initialValue: _syncPeriod,  // ❌ DropdownButtonFormField 没有 initialValue 参数
  // 应该使用 value 参数
```

**影响**: 编译时错误或运行时未正确设置初始值

---

#### BUG-25: buildMessage 构建函数中 MailAddress 的 personalName 为 null — 确认存在

**文件**: `mail_data_source.dart:569-571`

```dart
final builder = MessageBuilder()
  ..from = [MailAddress(null, from)]  // ❌ personalName 为 null
  ..to = to.map((addr) => MailAddress(null, addr)).toList()  // ❌ personalName 为 null
```

**影响**: 发出的邮件缺少发件人显示名，收件人看到的是裸邮箱地址

---

## 三、与 enough_mail API 对标分析

### enough_mail 2.1.7 功能支持矩阵

| enough_mail 功能 | 项目使用情况 | 状态 |
|------------------|-------------|------|
| **IMAP 连接/认证** | ✅ 使用 `MailClient.connect()` | 正常 |
| **IMAP IDLE** | ⚠️ `startPolling()` 自动使用，但未显式优化 | 不完整 |
| **CONDSTORE/QRESYNC** | ❌ 未使用 `enableCondStore`/`qresync` 参数 | 缺失 |
| **消息获取 (FETCH)** | ✅ 使用 `fetchMessages()` + `fetchMessageContents()` | 正常 |
| **分页获取** | ✅ 使用 `fetchMessagesNextPage()` | 正常 |
| **消息标记** | ✅ 全部标记方法已封装 | 正常 |
| **消息移动** | ✅ `moveMessage`, `moveMessageToTrash` 等 | 正常 |
| **消息删除** | ✅ `deleteMessage` | 正常 |
| **批量操作** | ✅ `moveMessages`, `deleteMessages` | 正常 |
| **搜索** | ⚠️ 仅本地 LIKE 搜索，未使用 IMAP SEARCH | 不完整 |
| **邮件线程** | ⚠️ `fetchThreads` 已封装但未使用 | 未启用 |
| **邮件发现** | ✅ `Discover.discover()` | 正常 |
| **消息构建** | ✅ `MessageBuilder` 全面使用 | 正常 |
| **回复/转发** | ✅ `prepareReplyToMessage` / `prepareForwardMessage` | 正常 |
| **草稿保存** | ⚠️ `saveDraftMessage` 已封装但未在 UI 中使用 | 未集成 |
| **追加消息** | ✅ `appendMessage` | 正常 |
| **邮件箱管理** | ✅ `createMailbox`, `deleteMailbox` | 正常 |
| **Undo 操作** | ⚠️ `undoDeleteMessages` / `undoMoveMessages` 已封装但未使用 | 未启用 |
| **DKIM 签名** | ❌ 未使用 | 缺失 |
| **8-bit 编码** | ⚠️ `supports8BitEncoding` 已封装但未使用 | 未启用 |
| **事件过滤器** | ⚠️ `addEventFilter` 已封装但未使用 | 未启用 |
| **连接恢复** | ⚠️ `reconnect` 已封装但未集成自动重连 | 不完整 |
| **MODSEQ 追踪** | ❌ 未使用 CONDSTORE 的 modseq | 缺失 |

### 关键缺失

1. **CONDSTORE/QRESYNC**: enough_mail 支持但项目未启用，导致无法高效增量同步
2. **IMAP SEARCH**: 项目仅用本地 LIKE 搜索，未利用服务器端搜索
3. **Undo 操作**: enough_mail 提供了撤销删除/移动的能力，项目未利用
4. **草稿同步**: `saveDraftMessage` 已封装但 UI 中未集成
5. **线程支持**: `fetchThreads` 已封装但整个项目未使用

---

## 四、修复计划

### Phase 0: 紧急修复 (1-2周)

| # | 问题 | 修复方案 | 工作量 |
|---|------|---------|--------|
| BUG-02 | 数据库唯一约束 | 在 `emails_table.dart` 添加 `uniqueKeys => [{messageId, accountId}]`，数据库迁移 v2 | 0.5天 |
| BUG-01 | upsertEmail 竞态 | 使用 `drift` 事务 + 唯一约束冲突捕获重试 | 1天 |
| BUG-04 | UID 状态持久化 | 新增 `sync_state` 表存储 `(accountId, lastUid, uidValidity, lastModSeq)` | 2天 |
| BUG-10 | incrementalSync 无 messageId 校验 | 添加 null/empty 检查，与 firstSync 一致 | 0.5天 |
| BUG-24 | DropdownButtonFormField 参数错误 | `initialValue` → `value` | 0.5天 |

### Phase 1: 核心功能修复 (2-3周)

| # | 问题 | 修复方案 | 工作量 |
|---|------|---------|--------|
| BUG-03 | 正文拉取失败重试 | 添加重试队列(最多3次)，`refetchEmptyBodyMessages` 在每次同步后自动调用，添加 `refetch_attempts` 字段 | 3天 |
| BUG-05 | IDLE 支持优化 | 检测 `supportsIdle`，IDLE 模式下不额外轮询；非 IDLE 时使用动态间隔 | 2天 |
| BUG-06 | dispose 异步处理 | 使用 `Future.wait` 等待所有 close 完成，或在 StateNotifier 中改为同步清理 | 1天 |
| BUG-07 | MimeMessageMapper 字段补全 | 添加 `inReplyTo`, `references`, `replyTo` 字段到 emails_table，数据库迁移 | 2天 |
| BUG-08 | HTML CID 图片替换修复 | 修正正则替换逻辑，确保引号匹配正确 | 1天 |
| BUG-11 | sendEmail 文件夹切换问题 | 使用 `fetchMessageSequence` 代替切换文件夹方式同步已发送邮件 | 2天 |
| BUG-16 | 网络重试机制 | 实现指数退避重试包装器，应用于所有网络调用 | 3天 |

### Phase 2: 功能增强 (3-4周)

| # | 问题 | 修复方案 | 工作量 |
|---|------|---------|--------|
| BUG-14 | 同步工作流统一 | 统一三种同步方法的逻辑，提取公共同步管道 | 3天 |
| BUG-17 | 多账户邮件列表 | 改为显示所有账户的合并邮件列表 | 2天 |
| BUG-18 | 邮箱服务商配置补全 | 添加 139/189/aliyun/sohu 等中国邮箱配置 | 1天 |
| BUG-19 | 转发附件保留 | 转发时自动添加原始附件到待发送列表 | 1天 |
| BUG-21 | 搜索实现 | 实现 FTS5 全文搜索，或使用 IMAP SEARCH | 3天 |
| BUG-22 | 详情页统一 | 合并 `email_detail_page` 和 `email_detail_view` 为单一组件 | 2天 |
| BUG-23 | FTS5 实现 | 创建 FTS5 虚拟表，添加数据同步触发器 | 2天 |
| BUG-25 | 发件人显示名 | 在 `buildMessage` 中传递 `MailAddress(displayName, email)` | 0.5天 |

### Phase 3: 质量改进 (4-5周)

| # | 问题 | 修复方案 | 工作量 |
|---|------|---------|--------|
| BUG-09 | VanishedEvent 类型修正 | `messageIds` 改为 `List<int>` 或在消费端统一转换 | 1天 |
| BUG-12 | emailId 修正 | `EmailToTaskService` 接收并传递实际 emailId | 0.5天 |
| BUG-13 | 任务创建集成 | 连接 `EmailToTaskService` 与任务模块 | 3天 |
| BUG-15 | polling 重复启动防护 | 添加 `Timer` 管理，确保旧 polling 完全停止后再启动 | 1天 |
| BUG-20 | 附件下载优化 | 添加进度条、取消功能、存储空间检查 | 2天 |

### Phase 4: 高级功能 (5-6周)

| 功能 | 说明 | 工作量 |
|------|------|--------|
| CONDSTORE/QRESYNC | 启用 enableCondStore，持久化 modseq | 5天 |
| IMAP SEARCH | 实现服务端搜索，支持高级搜索语法 | 3天 |
| Undo 操作 | 实现删除/移动后的撤销功能 | 2天 |
| 草稿同步 | 集成 `saveDraftMessage` 到编辑器 | 3天 |
| 离线队列 | 实现离线操作队列，网络恢复后重放 | 5天 |
| 线程视图 | 使用 `fetchThreads` 实现邮件会话视图 | 5天 |

---

## 五、数据库迁移计划

### Migration v2 (Phase 0)

```dart
// 1. 添加邮件表唯一约束
// 注意: SQLite 不支持 ALTER TABLE ADD CONSTRAINT
// 需要创建新表 → 迁移数据 → 重命名

// 2. 添加 sync_state 表
class SyncState extends Table {
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  IntColumn get lastUid => integer().withDefault(const Constant(0))();
  IntColumn get uidValidity => integer().nullable()();
  IntColumn get lastModSeq => integer().nullable()();
  DateTimeColumn get lastSyncAt => dateTime()();
}

// 3. 添加 emails 新字段
// in_reply_to, references, reply_to (TextColumn nullable)
// refetch_attempts (IntColumn default 0)
```

### Migration v3 (Phase 1)

```dart
// 1. 创建 FTS5 虚拟表
// CREATE VIRTUAL TABLE emails_fts USING fts5(subject, from_name, from_address, body_text);
```

---

## 六、测试覆盖建议

| 区域 | 当前覆盖 | 需要补充 |
|------|---------|---------|
| SyncResult 数据类 | ✅ 完整 | - |
| 基本连接/断开 | ✅ 有测试 | 并发测试 |
| 同步周期解析 | ✅ 有测试 | - |
| upsertEmail 去重 | ❌ 无 | 竞态条件测试、唯一约束测试 |
| 正文拉取重试 | ❌ 无 | 网络异常模拟测试 |
| UID 持久化 | ❌ 无 | 重启恢复测试 |
| MimeMessageMapper | ❌ 无 | 字段映射完整性测试 |
| HTML 处理 | ❌ 无 | CID替换、表格宽度测试 |
| 搜索 | ❌ 无 | FTS5 和 LIKE 测试 |
| 多账户合并 | ❌ 无 | 文件夹合并逻辑测试 |

---

## 七、总结

### 问题统计
- **🔴 严重 (P0)**: 6个 — 影响核心功能（重复、丢失数据）
- **🟡 中等 (P1)**: 7个 — 影响用户体验和数据完整性
- **🟠 工作流 (P2)**: 4个 — 架构和设计偏差
- **🔵 隐性 (P3)**: 8个 — 功能缺失和代码质量问题
- **总计**: 25个问题

### 与上一版报告对比
- 新发现: BUG-10, BUG-17, BUG-19, BUG-21, BUG-22, BUG-23, BUG-24, BUG-25 (8个新问题)
- 确认: 之前报告的所有问题均通过代码审查确认存在
- 细化: 对 enough_mail API 对标分析更加详细，列出了17项功能对照

### 优先修复建议
1. **立即**: BUG-02 (数据库约束) + BUG-01 (竞态修复) — 1.5天
2. **本周**: BUG-04 (UID持久化) + BUG-10 (messageId校验) — 2.5天
3. **下周**: BUG-03 (正文重试) + BUG-16 (网络重试) — 6天
4. **本月**: BUG-05 (IDLE) + BUG-07 (字段补全) + BUG-11 (发送同步) — 7天
