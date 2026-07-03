# EasyWork 邮箱模块 — enough_mail 集成设计规范

## 概述

本文档基于 enough_mail 生态（enough_mail, enough_mail_flutter, enough_mail_html, enough_convert）的实际 API 研究，细化 EasyWork 邮箱模块的技术设计。覆盖 6 个核心领域：HTML 渲染管线、MailClient 连接管理、邮件构建与发送、IMAP 搜索、账户配置与发现、MimeMessage 数据映射。

## 依赖关系

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

---

## 1. HTML 渲染管线

### 1.1 渲染流程

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

### 1.2 TransformConfiguration 默认配置

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

### 1.3 MimeMessageDownloader 集成

```dart
MimeMessageDownloader(
  mimeMessage: mimeMessage,                    // 仅有 envelope
  mailClient: mailClient,                      // MailClient 实例
  onDownloaded: (msg) {
    emailDao.upsertFullMessage(msg);           // 持久化到本地
  },
  blockExternalImages: blockExternalImages,    // 从 Settings 读取
  markAsSeen: true,                            // 自动标记已读
  mailtoDelegate: handleMailto,                // mailto: 链接处理
  fetchMessageContents: mailClient.fetchMessageContents,  // 关键：内容下载委托
);
```

**注意**：`fetchMessageContents` 是 enough_mail_flutter 要求的委托参数，类型为 `Future<MimeMessage> Function(MimeMessage)`。`MailClient.fetchMessageContents` 方法签名完全匹配，直接传入即可。Widget 内部在需要时调用此委托下载完整 MIME，完成后通过 `onDownloaded` 回调通知。

### 1.4 MimeMessageViewer 集成（已下载内容）

```dart
MimeMessageViewer(
  mimeMessage: mimeMessage,
  blockExternalImages: blockExternalImages,
  mailtoDelegate: handleMailto,
  preferPlainText: false,
  enableDarkMode: isDarkMode,
);
```

### 1.5 内联图片处理

`enough_mail_html` 将内联附件（Content-ID）转换为 `cid://` 链接。`MimeMessageViewer` 内部通过 `flutter_inappwebview` 的自定义 URL scheme 处理，从 `MimePart` 提取二进制数据渲染。

### 1.6 暗色模式适配

`enough_mail_html` 的 `enableDarkMode` 在生成 HTML 中注入暗色背景和文字颜色适配样式。EasyWork 主题切换 Provider 需将当前模式传递给 `MimeMessageViewer`。

---

## 2. MailClient 连接管理

### 2.1 连接生命周期

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

### 2.2 EasyWork EventBus 桥接

```dart
class MailDataSource {
  late final MailClient _client;
  final EventBus _appEventBus;
  final List<StreamSubscription> _subscriptions = [];

  Future<void> connect() async {
    _client = MailClient(_account, isLogEnabled: false);
    await _client.connect();

    _subscriptions.addAll([
      _client.eventBus.on<MailLoadEvent>().listen((event) {
        _appEventBus.publish(NewEmailReceivedEvent(
          messageId: event.message.decodeMessageId() ?? '',
          fromAddress: event.message.from?.toString() ?? '',
          subject: event.message.decodeSubject() ?? '',
        ));
      }),
      _client.eventBus.on<MailConnectionLostEvent>().listen((_) {
        _appEventBus.publish(EmailConnectionLostEvent(accountId: _accountId));
      }),
      _client.eventBus.on<MailConnectionReEstablishedEvent>().listen((_) {
        _appEventBus.publish(EmailConnectionReestablishedEvent(accountId: _accountId));
      }),
    ]);
  }

  void dispose() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    _client.disconnect();
  }
}
```

### 2.3 IDLE 实现

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

### 2.4 自动重连

`MailClient` 内置自动重连（指数退避），通过 `MailConnectionLostEvent` 和 `MailConnectionReEstablishedEvent` 通知应用层。EasyWork 不需要自行实现重连逻辑。

### 2.5 多账户并行连接

```dart
final mailDataSourcesProvider = Provider<Map<int, MailDataSource>>((ref) => {});

Future<void> connectAllAccounts(List<EmailAccount> accounts) async {
  await Future.wait(
    accounts.map((account) async {
      final dataSource = ref.read(mailDataSourceProvider(account.id));
      await dataSource.connect();
    }),
  );
}
```

---

## 3. 邮件构建与发送

### 3.1 新建邮件

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

### 3.2 回复邮件

```dart
final builder = MessageBuilder.prepareReplyMessage(
  originalMessage,
  fromAddress: MailAddress('我的名字', 'my@email.com'),
);
// 自动处理: to = original.from, subject = "Re: ...", In-Reply-To/References 头

builder.text = '回复内容\n\n${builder.text ?? ''}';
await mailClient.sendMessage(builder.buildMimeMessage());
```

### 3.3 转发邮件

```dart
final builder = MessageBuilder.prepareForwardMessage(
  originalMessage,
  fromAddress: MailAddress('我的名字', 'my@email.com'),
);
// 自动处理: subject = "Fwd: ...", 附加原邮件所有附件

builder.to = [MailAddress('转发目标', 'forward@domain.com')];
await mailClient.sendMessage(builder.buildMimeMessage());
```

### 3.4 签名插入

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

### 3.5 草稿保存

```dart
Future<void> saveDraft(MimeMessage draft, MailClient client) async {
  await client.appendMessage(
    draft,
    targetMailboxPath: 'Drafts',
    flags: [MessageFlags.draft],
  );
}

// 自动保存（每 30 秒检测变更）
Timer.periodic(Duration(seconds: 30), (_) {
  if (hasUnsavedChanges) {
    saveDraft(currentDraft, mailClient);
  }
});
```

### 3.6 发送失败处理

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

---

## 4. IMAP 搜索能力

### 4.1 enough_mail Search API

```dart
// 按主题搜索
final query = SearchQuery(term: SearchTermSubject('项目进度'));
final result = await mailClient.search(query);

// 组合搜索：发件人 + 日期范围
final query = SearchQuery(
  term: SearchTermAnd(
    SearchTermFrom('zhangsan@'),
    SearchTermSentSince(DateTime.now().subtract(Duration(days: 30))),
  ),
);

// 文本搜索
final query = SearchQuery(term: SearchTermText('重要通知'));
```

### 4.2 SearchTerm 速查

| SearchTerm | 用途 |
|---|---|
| `SearchTermSubject(text)` | 按主题 |
| `SearchTermFrom(text)` | 按发件人 |
| `SearchTermTo(text)` | 按收件人 |
| `SearchTermBody(text)` | 按正文（慢） |
| `SearchTermText(text)` | 搜索所有文本头 |
| `SearchTermSince(date)` | 存储日期之后 |
| `SearchTermSentSince(date)` | 发送日期之后 |
| `SearchTermUnseen` | 未读 |
| `SearchTermSeen` | 已读 |
| `SearchTermFlagged` | 标记 |
| `SearchTermLarger(size)` | 大于指定大小 |
| `SearchTermAnd(a, b)` | AND 组合 |
| `SearchTermOr(a, b)` | OR 组合 |
| `SearchTermNot(term)` | 取反 |

### 4.3 EasyWork 搜索策略：本地 FTS5 优先

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
      → 开启时：SearchQuery + mailClient.search()
      → 结果写入本地 drift → 再从 FTS5 查询
      → 关闭时：仅搜索本地已同步邮件
```

### 4.4 IMAP 搜索结果持久化

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

---

## 5. 账户配置与发现

### 5.1 Discover API

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

### 5.2 MailAccount 创建

```dart
// 从自动发现结果创建
final account = MailAccount.fromDiscoveredSettings(
  name: '我的邮箱',
  email: 'zhangsan@163.com',
  password: password,
  config: config,
);

// 手动配置
final account = MailAccount.fromManualSettings(
  name: '我的邮箱',
  email: 'zhangsan@163.com',
  password: password,
  imapHost: 'imap.163.com',
  imapPort: 993,
  imapUseSsl: true,
  smtpHost: 'smtp.163.com',
  smtpPort: 465,
  smtpUseSsl: true,
);

// 手动配置 + 认证方式
final account = MailAccount.fromManualSettingsWithAuth(
  name: '我的邮箱',
  email: 'zhangsan@163.com',
  userName: 'zhangsan',
  password: password,
  imapHost: 'imap.163.com',
  imapPort: 993,
  imapUseSsl: true,
  smtpHost: 'smtp.163.com',
  smtpPort: 465,
  smtpUseSsl: true,
  loginType: LoginType.normal,
);
```

### 5.3 连接测试与诊断

```dart
Future<ConnectionTestResult> testConnection(MailAccount account) async {
  final client = MailClient(account, isLogEnabled: false);
  try {
    await client.connect();
    await client.selectInbox();
    await client.fetchMessages(count: 1, fetchPreference: FetchPreference.envelope);
    await client.disconnect();
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

### 5.4 凭据安全存储

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

### 5.5 EmailAccounts 表扩展

```dart
class EmailAccounts extends Table {
  // ... 现有字段 ...
  TextColumn get discoveredConfigJson => text().nullable()();
  TextColumn get loginType => text().withDefault(const Constant('normal'))();
}
```

---

## 6. MimeMessage 数据映射

### 6.1 MimeMessage → Emails 表映射

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
      hasAttachments: Value(message.hasAttachments()),
      receivedAt: Value(message.decodeDate() ?? DateTime.now()),
      isRead: Value(message.flags?.contains(MessageFlags.seen) ?? false),
      isStarred: Value(message.flags?.contains(MessageFlags.flagged) ?? false),
      folder: Value('inbox'),
      threadId: Value(message.threadId),
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

  static String? _encodeAddresses(List<MailAddress>? addresses) {
    if (addresses == null || addresses.isEmpty) return null;
    return jsonEncode(addresses.map((a) => {
      'name': a.displayName,
      'email': a.email,
    }).toList());
  }
}
```

### 6.2 附件元数据提取

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

### 6.3 编码处理

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

### 6.4 MimeMessage 持久化

```dart
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

---

## 邮箱模块页面结构

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
```

---

## 关键工作流

### 邮件同步流程

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

### 邮件详情展示流程

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

### 写邮件流程

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

## 邮箱模块 Provider 依赖图

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

---

## 错误处理

### 邮箱异常类型

```dart
class EmailException extends AppException {
  final EmailErrorType type;
  final BaseMailException? originalException;
}

enum EmailErrorType {
  authFailed,           // ImapException.authFailed → "邮箱地址或密码错误"
  connectionFailed,     // SocketException → "无法连接到邮件服务器"
  timeout,              // TimeoutException → "连接超时"
  sslError,             // HandshakeException → "SSL 证书验证失败"
  smtpAuthFailed,       // SmtpException → "发送失败：邮箱认证错误"
  sendFailed,           // SmtpException 其他 → "发送失败"
}
```

### 用户消息映射

| 错误类型 | 用户消息 |
|---|---|
| `authFailed` | 邮箱地址或密码错误，请检查后重试 |
| `connectionFailed` | 无法连接到邮件服务器，请检查网络和服务器地址 |
| `timeout` | 连接超时，请检查网络状态 |
| `sslError` | SSL 证书验证失败，可能需要使用非标准端口 |
| `smtpAuthFailed` | 发送失败：邮箱认证错误 |
| `sendFailed` | 发送失败：无法连接邮件服务器 |
