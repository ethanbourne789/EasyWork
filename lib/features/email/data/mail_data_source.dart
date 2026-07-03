import 'dart:async';

import 'package:enough_mail/enough_mail.dart';
import '../../../core/event/event_bus.dart';
import '../../../shared/events/email_events.dart';

class MailDataSource {
  final int accountId;
  final MailAccount _account;
  final EventBus _appEventBus;
  MailClient? _client;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  bool _connected = false;
  Mailbox? _selectedMailbox;

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
          incomingSocketType: imapUseSsl ? SocketType.ssl : SocketType.plain,
          outgoingHost: smtpHost,
          outgoingPort: smtpPort,
          outgoingSocketType: smtpUseSsl ? SocketType.ssl : SocketType.plain,
          password: password,
        ),
        _appEventBus = appEventBus;

  MailClient get client => _client ?? throw StateError('Not connected. Call connect() first.');
  bool get isConnected => _client != null && _connected;
  Mailbox? get selectedMailbox => _selectedMailbox;

  Future<void> connect() async {
    _client = MailClient(_account, isLogEnabled: false);
    await _client.connect(timeout: const Duration(seconds: 15));
    _connected = true;

    _subscriptions.addAll([
      _client.eventBus.on<MailLoadEvent>().listen((event) {
        _appEventBus.publish(NewEmailReceivedEvent(
          messageId: event.message.decodeHeaderValue('message-id') ?? '',
          localEmailId: 0,
          fromAddress: event.message.from?.first.toString() ?? '',
          subject: event.message.decodeSubject() ?? '',
        ));
      }),
      _client.eventBus.on<MailConnectionLostEvent>().listen((_) {
        _connected = false;
        _appEventBus.publish(EmailConnectionLostEvent(accountId: accountId));
      }),
      _client.eventBus.on<MailConnectionReEstablishedEvent>().listen((_) {
        _connected = true;
        _appEventBus.publish(EmailConnectionReestablishedEvent(accountId: accountId));
      }),
    ]);
  }

  // --- Mailbox operations ---

  Future<Tree<Mailbox?>> listMailboxesAsTree() => _client.listMailboxesAsTree();

  Future<List<Mailbox>> listMailboxes() => _client.listMailboxes();

  Future<Mailbox> selectInbox() async {
    final mailbox = await _client.selectInbox();
    _selectedMailbox = mailbox;
    return mailbox;
  }

  Future<Mailbox> selectMailbox(Mailbox mailbox) async {
    final selected = await _client.selectMailbox(mailbox);
    _selectedMailbox = selected;
    return selected;
  }

  Future<Mailbox> selectMailboxByFlag(MailboxFlag flag) async {
    final selected = await _client.selectMailboxByFlag(flag);
    _selectedMailbox = selected;
    return selected;
  }

  Future<Mailbox> selectMailboxByPath(String path) async {
    final selected = await _client.selectMailboxByPath(path);
    _selectedMailbox = selected;
    return selected;
  }

  Mailbox? getMailboxByFlag(MailboxFlag flag) => _client.getMailbox(flag);

  // --- Message fetching ---

  Future<List<MimeMessage>> fetchMessages({
    Mailbox? mailbox,
    int count = 30,
    FetchPreference fetchPreference = FetchPreference.envelope,
  }) async {
    final targetMailbox = mailbox ?? _selectedMailbox;
    if (targetMailbox == null) {
      await selectInbox();
    }
    return _client.fetchMessages(
      mailbox: targetMailbox ?? _selectedMailbox,
      count: count,
      fetchPreference: fetchPreference,
    );
  }

  Future<List<MimeMessage>> fetchMessagesFull({int count = 30}) =>
      fetchMessages(count: count, fetchPreference: FetchPreference.fullWhenWithinSize);

  Future<MimeMessage> fetchFullMessage(MimeMessage message) =>
      _client.fetchMessageContents(message);

  Future<MimePart> fetchMessagePart(MimeMessage message, String fetchId) =>
      _client.fetchMessagePart(message, fetchId);

  Future<List<MimeMessage>> fetchNextPage(PagedMessageResult pagedResult) =>
      _client.fetchNextPage(pagedResult);

  Future<List<MimeMessage>> fetchMessagesNextPage(
    PagedMessageSequence pagedSequence, {
    Mailbox? mailbox,
    FetchPreference fetchPreference = FetchPreference.fullWhenWithinSize,
    bool markAsSeen = false,
  }) =>
      _client.fetchMessagesNextPage(
        pagedSequence,
        mailbox: mailbox,
        fetchPreference: fetchPreference,
        markAsSeen: markAsSeen,
      );

  Future<MimeMessage?> buildMimeMessageWithRecommendedTextEncoding(
    MessageBuilder messageBuilder,
  ) =>
      _client.buildMimeMessageWithRecommendedTextEncoding(messageBuilder);

  // --- Sending ---

  Future<void> sendMessage(MimeMessage message, {bool appendToSent = true}) =>
      _client.sendMessage(message, appendToSent: appendToSent);

  Future<void> sendMessageBuilder(
    MessageBuilder messageBuilder, {
    MailAddress? from,
    bool appendToSent = true,
    Mailbox? sentMailbox,
    List<MailAddress>? recipients,
  }) =>
      _client.sendMessageBuilder(
        messageBuilder,
        from: from,
        appendToSent: appendToSent,
        sentMailbox: sentMailbox,
        recipients: recipients,
      );

  Future<void> saveDraft(MimeMessage message) =>
      _client.saveDraftMessage(message);

  // --- Flag operations ---

  Future<void> markAsRead(MimeMessage message) =>
      _client.markSeen(MessageSequence.fromMessage(message));

  Future<void> markAsUnread(MimeMessage message) =>
      _client.markUnseen(MessageSequence.fromMessage(message));

  Future<void> markAsFlagged(MimeMessage message) =>
      _client.markFlagged(MessageSequence.fromMessage(message));

  Future<void> markAsUnflagged(MimeMessage message) =>
      _client.markUnflagged(MessageSequence.fromMessage(message));

  Future<void> markAsAnswered(MimeMessage message) =>
      _client.markAnswered(MessageSequence.fromMessage(message));

  Future<void> markAsForwarded(MimeMessage message) =>
      _client.markForwarded(MessageSequence.fromMessage(message));

  // --- Move / Delete ---

  Future<MoveResult> moveToTrash(MimeMessage message) =>
      _client.moveMessageToFlag(message, MailboxFlag.trash);

  Future<MoveResult> moveToJunk(MimeMessage message) =>
      _client.junkMessage(message);

  Future<MoveResult> moveToFolder(MimeMessage message, Mailbox target) =>
      _client.moveMessage(message, target);

  Future<MoveResult> moveToInbox(MimeMessage message) =>
      _client.moveMessageToInbox(message);

  Future<DeleteResult> deleteMessage(MimeMessage message, {bool expunge = false}) =>
      _client.deleteMessage(message, expunge: expunge);

  Future<DeleteResult> undoDelete(DeleteResult result) =>
      _client.undoDeleteMessages(result);

  Future<MoveResult> undoMove(MoveResult result) =>
      _client.undoMoveMessages(result);

  // --- Search ---

  Future<MailSearchResult> searchMessages(MailSearch search) =>
      _client.searchMessages(search);

  Future<List<MimeMessage>> searchMessagesNextPage(MailSearchResult result) =>
      _client.searchMessagesNextPage(result);

  // --- Polling / IDLE ---

  Stream<MailLoadEvent> get onNewMessage => _client.eventBus.on<MailLoadEvent>();
  Stream<MailUpdateEvent> get onMessageUpdated => _client.eventBus.on<MailUpdateEvent>();
  Stream<MailVanishedEvent> get onMessagesVanished => _client.eventBus.on<MailVanishedEvent>();

  Future<void> startPolling({Duration interval = const Duration(minutes: 2)}) =>
      _client.startPolling(interval);

  void stopPolling() => _client.stopPolling();

  // --- Threading ---

  Future<ThreadDataResult> fetchThreadData({
    required DateTime since,
    Mailbox? mailbox,
    bool setThreadSequences = false,
  }) =>
      _client.fetchThreadData(
        since: since,
        mailbox: mailbox ?? _selectedMailbox,
        setThreadSequences: setThreadSequences,
      );

  Future<ThreadResult> fetchThreads({
    required DateTime since,
    Mailbox? mailbox,
    ThreadPreference threadPreference = ThreadPreference.latest,
    FetchPreference fetchPreference = FetchPreference.envelope,
    int pageSize = 30,
  }) =>
      _client.fetchThreads(
        since: since,
        mailbox: mailbox ?? _selectedMailbox,
        threadPreference: threadPreference,
        fetchPreference: fetchPreference,
        pageSize: pageSize,
      );

  Future<List<MimeMessage>> fetchThreadsNextPage(ThreadResult threadResult) =>
      _client.fetchThreadsNextPage(threadResult);

  // --- Batch operations ---

  Future<MoveResult> moveMessages(MessageSequence sequence, Mailbox target) =>
      _client.moveMessages(sequence, target);

  Future<DeleteResult> deleteMessages(MessageSequence sequence, {bool expunge = false}) =>
      _client.deleteMessages(sequence, expunge: expunge);

  // --- Connection recovery ---

  /// Reconnect using the original account config
  Future<void> reconnect() async {
    await _client.reconnect();
    _connected = true;
  }

  Future<void> resume({bool startPollingWhenError = true}) =>
      _client.resume(startPollingWhenError: startPollingWhenError);

  bool isPolling() => _client.isPolling();

  Future<void> stopPollingIfNeeded() => _client.stopPollingIfNeeded();

  // --- Event filters ---

  void addCustomEventFilter(MailEventFilter filter) =>
      _client.addEventFilter(filter);

  void removeCustomEventFilter(MailEventFilter filter) =>
      _client.removeEventFilter(filter);

  // --- Mailbox management ---

  Future<Mailbox> createMailbox(String mailboxName, {Mailbox? parentMailbox}) =>
      _client.createMailbox(mailboxName, parentMailbox: parentMailbox);

  Future<void> deleteMailbox(Mailbox mailbox) =>
      _client.deleteMailbox(mailbox);

  // --- Advanced flag operations ---

  Future<void> markAsDeleted(MimeMessage message) =>
      _client.markDeleted(MessageSequence.fromMessage(message));

  Future<void> markAsUndeleted(MimeMessage message) =>
      _client.markUndeleted(MessageSequence.fromMessage(message));

  Future<void> markAsUnanswered(MimeMessage message) =>
      _client.markUnanswered(MessageSequence.fromMessage(message));

  Future<void> markAsUnforwarded(MimeMessage message) =>
      _client.markUnforwarded(MessageSequence.fromMessage(message));

  Future<void> flagMessageCustom(
    MimeMessage message, {
    bool? isSeen,
    bool? isFlagged,
    bool? isAnswered,
    bool? isForwarded,
    bool? isDeleted,
  }) =>
      _client.flagMessage(
        message,
        isSeen: isSeen,
        isFlagged: isFlagged,
        isAnswered: isAnswered,
        isForwarded: isForwarded,
        isDeleted: isDeleted,
      );

  Future<void> storeFlags(
    MessageSequence sequence,
    List<String> flags, {
    StoreAction action = StoreAction.add,
  }) =>
      _client.store(sequence, flags, action: action);

  bool supportsFlagging() => _client.supportsFlagging();

  Future<bool> supports8BitEncoding() => _client.supports8BitEncoding();

  /// Check if server supports mailboxes
  bool get supportsMailboxes => _client.supportsMailboxes;

  /// Check if server supports threading
  bool get supportsThreading => _client.supportsThreading;

  /// Direct access to cached mailbox list
  List<Mailbox>? get mailboxes => _client.mailboxes;

  /// Sort mailboxes by specified flag order
  List<Mailbox> sortMailboxes(
    List<MailboxFlag> order,
    List<Mailbox> boxes, {
    bool keepRemaining = true,
    bool sortRemainingAlphabetically = true,
  }) =>
      _client.sortMailboxes(
        order,
        boxes,
        keepRemaining: keepRemaining,
        sortRemainingAlphabetically: sortRemainingAlphabetically,
      );

  // --- Advanced batch operations ---

  Future<MoveResult> moveMessagesToInbox(MessageSequence sequence) =>
      _client.moveMessagesToInbox(sequence);

  Future<MoveResult> moveMessagesToFlagBySequence(
    MessageSequence sequence,
    MailboxFlag flag,
  ) =>
      _client.moveMessagesToFlag(sequence, flag);

  Future<MoveResult> junkMessages(MessageSequence sequence) =>
      _client.junkMessages(sequence);

  Future<UidResponseCode?> appendMessage(
    MimeMessage message,
    Mailbox targetMailbox, {
    List<String>? flags,
  }) =>
      _client.appendMessage(message, targetMailbox, flags: flags);

  Future<UidResponseCode?> appendMessageToFlag(
    MimeMessage message,
    MailboxFlag targetMailboxFlag, {
    List<String>? flags,
  }) =>
      _client.appendMessageToFlag(message, targetMailboxFlag, flags: flags);

  Future<DeleteResult> deleteAllMessages(
    Mailbox mailbox, {
    bool expunge = false,
  }) =>
      _client.deleteAllMessages(mailbox, expunge: expunge);

  // --- Sequence fetching ---

  Future<List<MimeMessage>> fetchMessageSequence(
    MessageSequence sequence, {
    Mailbox? mailbox,
    FetchPreference fetchPreference = FetchPreference.fullWhenWithinSize,
    bool markAsSeen = false,
  }) =>
      _client.fetchMessageSequence(
        sequence,
        mailbox: mailbox ?? _selectedMailbox,
        fetchPreference: fetchPreference,
        markAsSeen: markAsSeen,
      );

  // --- Connection ---

  Future<void> disconnect() async {
    await _client.disconnect();
    _connected = false;
  }

  Future<void> close() async {
    for (final sub in _subscriptions) {
      await sub.cancel();
    }
    stopPolling();
    await disconnect();
  }

  @Deprecated('Use close() instead')
  void dispose() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    stopPolling();
    close();
  }
}

/// Auto-discover email server configuration
Future<ClientConfig?> discoverConfig(String email) =>
    Discover.discover(email, isLogEnabled: false);

/// Parse ClientConfig to extract IMAP/SMTP settings
DiscoverResult? parseDiscoverConfig(ClientConfig config, String email) {
  try {
    final imapServer = config.preferredIncomingImapServer;
    if (imapServer == null) return null;

    final imapHost = imapServer.hostname;
    final imapPort = imapServer.port;
    final imapSsl = imapServer.socketType == SocketType.ssl;

    final smtpServer = config.preferredOutgoingSmtpServer;
    final smtpHost = smtpServer?.hostname ?? '';
    final smtpPort = smtpServer?.port ?? 465;
    final smtpSsl = smtpServer?.socketType == SocketType.ssl;

    return DiscoverResult(
      imapHost: imapHost,
      imapPort: imapPort,
      imapUseSsl: imapSsl,
      smtpHost: smtpHost,
      smtpPort: smtpPort,
      smtpUseSsl: smtpSsl,
    );
  } catch (e) {
    return null;
  }
}

class DiscoverResult {
  final String imapHost;
  final int imapPort;
  final bool imapUseSsl;
  final String smtpHost;
  final int smtpPort;
  final bool smtpUseSsl;

  const DiscoverResult({
    required this.imapHost,
    required this.imapPort,
    required this.imapUseSsl,
    required this.smtpHost,
    required this.smtpPort,
    required this.smtpUseSsl,
  });
}

/// Test connection with a temporary MailClient
Future<ConnectionTestResult> testConnection({
  required String email,
  required String password,
  required String imapHost,
  int imapPort = 993,
  bool imapUseSsl = true,
  required String smtpHost,
  int smtpPort = 465,
  bool smtpUseSsl = true,
}) async {
  final account = MailAccount.fromManualSettings(
    name: 'Test',
    email: email,
    incomingHost: imapHost,
    incomingPort: imapPort,
    incomingSocketType: imapUseSsl ? SocketType.ssl : SocketType.plain,
    outgoingHost: smtpHost,
    outgoingPort: smtpPort,
    outgoingSocketType: smtpUseSsl ? SocketType.ssl : SocketType.plain,
    password: password,
  );

  final client = MailClient(account, isLogEnabled: false);
  try {
    await client.connect(timeout: const Duration(seconds: 15));

    final tree = await client.listMailboxesAsTree();
    final folderCount = tree.root.children?.length ?? 0;

    return ConnectionTestResult(
      success: true,
      imapFolders: folderCount,
      supportsIdle: false,
    );
  } on MailException catch (e) {
    return ConnectionTestResult(
      success: false,
      errorMessage: _mapMailException(e),
    );
  } catch (e) {
    return ConnectionTestResult(
      success: false,
      errorMessage: '连接失败: ${e.toString()}',
    );
  } finally {
    try {
      await client.disconnect();
    } catch (_) {}
  }
}

String _mapMailException(MailException e) {
  final message = e.message ?? e.toString();
  if (message.contains('auth') || message.contains(' LOGIN ')) {
    return '邮箱地址或密码错误，请检查后重试';
  }
  if (message.contains('SSL') || message.contains('certificate')) {
    return 'SSL 证书验证失败，尝试关闭 SSL 后重试';
  }
  if (message.contains('timeout') || message.contains('Timeout')) {
    return '连接超时，请检查网络和服务器地址';
  }
  return '连接失败: $message';
}

class ConnectionTestResult {
  final bool success;
  final int imapFolders;
  final bool supportsIdle;
  final String? errorMessage;

  const ConnectionTestResult({
    required this.success,
    this.imapFolders = 0,
    this.supportsIdle = false,
    this.errorMessage,
  });
}

/// Build a simple email MimeMessage for sending
MimeMessage buildMessage({
  required String from,
  required List<String> to,
  required String subject,
  required String textBody,
  String? htmlBody,
  String? inReplyTo,
  List<String>? attachments,
}) {
  final builder = MessageBuilder()
    ..from = [MailAddress(null, from)]
    ..to = to.map((addr) => MailAddress(null, addr)).toList()
    ..subject = subject;

  if (inReplyTo != null) {
    builder.setHeader('In-Reply-To', inReplyTo);
    builder.setHeader('References', inReplyTo);
  }

  if (htmlBody != null) {
    builder.addTextPlain(textBody);
    builder.addTextHtml(htmlBody);
  } else {
    builder.addTextPlain(textBody);
  }

  return builder.buildMimeMessage();
}

/// Build reply message
MimeMessage buildReplyMessage({
  required String from,
  required MimeMessage originalMessage,
  required String replyBody,
  bool replyAll = true,
}) {
  final builder = MessageBuilder.prepareReplyToMessage(
    originalMessage,
    MailAddress(null, from),
    replyAll: replyAll,
  );
  builder.addTextPlain(replyBody);
  return builder.buildMimeMessage();
}

/// Build forward message
MimeMessage buildForwardMessage({
  required String from,
  required MimeMessage originalMessage,
  required String forwardBody,
}) {
  final builder = MessageBuilder.prepareForwardMessage(
    originalMessage,
    from: MailAddress(null, from),
  );
  builder.addTextPlain(forwardBody);
  return builder.buildMimeMessage();
}

/// Build from draft - returns MessageBuilder for further customization
MessageBuilder prepareFromDraft(MimeMessage draftMessage) {
  return MessageBuilder.prepareFromDraft(draftMessage);
}

/// Build read receipt
MimeMessage buildReadReceipt({
  required MimeMessage originalMessage,
  required MailAddress finalRecipient,
  String reportingUa = 'enough_mail',
  bool isAutomaticReport = false,
}) {
  return MessageBuilder.buildReadReceipt(
    originalMessage,
    finalRecipient,
    reportingUa: reportingUa,
    isAutomaticReport: isAutomaticReport,
  );
}

/// Create RFC message ID
String createMessageId(String domain) =>
    MessageBuilder.createMessageId(domain);

/// Create random ID
String createRandomId() => MessageBuilder.createRandomId();

/// Encode header value for non-ASCII
String encodeHeaderValue(String value) =>
    MessageBuilder.encodeHeaderValue(value);

/// Fill template with values
String fillTemplate(
  String template,
  MimeMessage message, {
  Map<String, String>? parameters,
}) =>
    MessageBuilder.fillTemplate(template, message, parameters: parameters);

/// Build a simple text message
MimeMessage buildSimpleTextMessage({
  required MailAddress from,
  required List<MailAddress> to,
  required String text,
  List<MailAddress>? cc,
  List<MailAddress>? bcc,
  String? subject,
  MimeMessage? replyToMessage,
  bool replyToSimplifyReferences = false,
  String? messageId,
}) =>
    MessageBuilder.buildSimpleTextMessage(
      from,
      to,
      text,
      cc: cc,
      bcc: bcc,
      subject: subject,
      replyToMessage: replyToMessage,
      replyToSimplifyReferences: replyToSimplifyReferences,
      messageId: messageId,
    );

/// Convenience: create multipart/alternative builder
MessageBuilder prepareMultipartAlternativeMessage({
  String? plainText,
  String? htmlText,
}) =>
    MessageBuilder.prepareMultipartAlternativeMessage(
      plainText: plainText,
      htmlText: htmlText,
    );

/// Convenience: create multipart/mixed builder
MessageBuilder prepareMultipartMixedMessage() =>
    MessageBuilder.prepareMultipartMixedMessage();

/// Convenience: create message builder with specific media subtype
MessageBuilder prepareMessageWithMediaType(MediaSubtype subtype) =>
    MessageBuilder.prepareMessageWithMediaType(subtype);

/// Convenience: create message from mailto URI
MessageBuilder prepareMailtoBasedMessage(Uri mailto, MailAddress from) =>
    MessageBuilder.prepareMailtoBasedMessage(mailto, from);

// ==================== MimeMessage Helpers ====================

/// Decode the subject of a mime message
String? decodeMessageSubject(MimeMessage message) =>
    message.decodeSubject();

/// Render message as string
String renderMessage(MimeMessage message, {bool renderHeader = true}) =>
    message.renderMessage(renderHeader: renderHeader);

/// Check if it's a text message
bool isTextMessage(MimeMessage message) =>
    message.isTextMessage();

/// Check if it's a text/plain message
bool isTextPlainMessage(MimeMessage message) =>
    message.isTextPlainMessage();

/// Decode sender with fallback: reply-to -> sender -> from
List<MailAddress> decodeSender(MimeMessage message, {bool combine = false}) =>
    message.decodeSender(combine: combine);

/// Check if from specified sender
bool isFromAddress(
  MimeMessage message,
  MailAddress sender, {
  List<MailAddress>? aliases,
  bool allowPlusAliases = false,
}) =>
    message.isFrom(
      sender,
      aliases: aliases,
      allowPlusAliases: allowPlusAliases,
    );

/// Find matching sender
MailAddress? findSenderInMessage(
  MimeMessage message,
  MailAddress sender, {
  List<MailAddress>? aliases,
  bool allowPlusAliases = false,
}) =>
    message.findSender(
      sender,
      aliases: aliases,
      allowPlusAliases: allowPlusAliases,
    );

/// Find matching recipient
MailAddress? findRecipientInMessage(
  MimeMessage message,
  MailAddress recipient, {
  List<MailAddress>? aliases,
  bool allowPlusAliases = false,
}) =>
    message.findRecipient(
      recipient,
      aliases: aliases,
      allowPlusAliases: allowPlusAliases,
    );

/// Find content info with specified disposition
List<ContentInfo> findContentInfo(
  MimeMessage message, {
  ContentDisposition disposition = ContentDisposition.attachment,
}) =>
    message.findContentInfo(disposition: disposition);

/// Check if message has attachments
bool hasAttachments(MimeMessage message) =>
    message.hasAttachments();

/// Check if message has inline parts
bool hasInlineParts(MimeMessage message) =>
    message.hasInlineParts();

/// Get part by Content-ID
MimePart? getPartWithContentId(MimeMessage message, String cid) =>
    message.getPartWithContentId(cid);

/// Check message flag
bool hasMessageFlag(MimeMessage message, String name) =>
    message.hasFlag(name);

/// Add message flag
void addMessageFlag(MimeMessage message, String name) =>
    message.addFlag(name);

/// Remove message flag
void removeMessageFlag(MimeMessage message, String name) =>
    message.removeFlag(name);
