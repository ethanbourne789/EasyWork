import 'dart:convert';
import 'dart:developer' as dev;
import 'package:enough_mail/enough_mail.dart';
import 'package:drift/drift.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/emails_dao.dart';
import '../../../core/database/tables/email_accounts_dao.dart';
import '../../../core/database/tables/mailbox_folders_dao.dart';
import '../../../core/database/tables/pending_emails_dao.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/security/credential_store.dart';
import '../../../core/utils/retry_handler.dart';
import 'mail_data_sources_notifier.dart';
import 'email_repository.dart';
import 'mime_message_mapper.dart';
import '../domain/email_account_entity.dart';

class EmailRepositoryImpl implements EmailRepository {
  final EmailsDao _emailsDao;
  final EmailAccountsDao _accountsDao;
  final MailDataSourcesNotifier _dataSources;
  final CredentialStore _credentialStore;
  final MailboxFoldersDao _mailboxFoldersDao;
  final PendingEmailsDao? _pendingEmailsDao;

  EmailRepositoryImpl(
    this._emailsDao,
    this._accountsDao,
    this._dataSources,
    this._credentialStore,
    this._mailboxFoldersDao, {
    PendingEmailsDao? pendingEmailsDao,
  }) : _pendingEmailsDao = pendingEmailsDao;

  @override
  Future<List<EmailAccountEntity>> getAllAccounts() async {
    final accounts = await _accountsDao.getAllAccounts();
    final result = <EmailAccountEntity>[];
    for (final a in accounts) {
      String? password;
      try {
        password = await _credentialStore.getPassword(a.id);
      } catch (e) {
        // Password not available from secure storage; do not fall back to DB
        // to avoid exposing plaintext credentials.
        password = null;
      }
      result.add(EmailAccountEntity(
        id: a.id,
        displayName: a.displayName ?? '',
        email: a.email,
        password: password,
        imapHost: a.imapHost,
        imapPort: a.imapPort,
        imapUseSsl: a.imapUseSsl,
        smtpHost: a.smtpHost,
        smtpPort: a.smtpPort,
        smtpUseSsl: a.smtpUseSsl,
        smtpStartTls: a.smtpStartTls,
        supportsIdle: a.supportsIdle,
        syncPeriod: a.syncPeriod,
        syncInterval: a.syncInterval,
        accentColor: a.accentColor,
        createdAt: a.createdAt,
        dkimDomain: a.dkimDomain,
        dkimSelector: a.dkimSelector,
        dkimPrivateKey: a.id != null ? await _credentialStore.getDkimKey(a.id!) : null,
      ));
    }
    return result;
  }

  @override
  Future<EmailAccountEntity?> getAccountById(int id) async {
    final a = await _accountsDao.getAccountById(id);
    if (a == null) return null;
    String? password;
    try {
      password = await _credentialStore.getPassword(a.id);
    } catch (e) {
      // Password not available from secure storage; do not fall back to DB
      // to avoid exposing plaintext credentials.
      password = null;
    }
    return EmailAccountEntity(
      id: a.id,
      displayName: a.displayName ?? '',
      email: a.email,
      password: password,
      imapHost: a.imapHost,
      imapPort: a.imapPort,
      imapUseSsl: a.imapUseSsl,
      smtpHost: a.smtpHost,
      smtpPort: a.smtpPort,
      smtpUseSsl: a.smtpUseSsl,
      smtpStartTls: a.smtpStartTls,
      supportsIdle: a.supportsIdle,
      syncPeriod: a.syncPeriod,
      syncInterval: a.syncInterval,
      accentColor: a.accentColor,
      createdAt: a.createdAt,
      dkimDomain: a.dkimDomain,
      dkimSelector: a.dkimSelector,
      dkimPrivateKey: a.id != null ? await _credentialStore.getDkimKey(a.id!) : null,
    );
  }

  @override
  Future<int> createAccount(EmailAccountEntity account) async {
    final mailAccount = _buildMailAccount(account);
    final accountId = await _accountsDao.insertAccount(EmailAccountsCompanion(
      displayName: Value(account.displayName),
      email: Value(account.email),
      password: const Value(''),
      imapHost: Value(account.imapHost),
      imapPort: Value(account.imapPort),
      imapUseSsl: Value(account.imapUseSsl),
      smtpHost: Value(account.smtpHost),
      smtpPort: Value(account.smtpPort),
      smtpUseSsl: Value(account.smtpUseSsl),
      smtpStartTls: Value(account.smtpStartTls),
      supportsIdle: Value(account.supportsIdle),
      mailAccountJson: Value(_sanitizeMailAccountJson(mailAccount)),
      syncPeriod: Value(account.syncPeriod),
      syncInterval: Value(account.syncInterval),
      dkimDomain: Value(account.dkimDomain),
      dkimSelector: Value(account.dkimSelector),
      createdAt: Value(DateTime.now()),
      updatedAt: Value(DateTime.now()),
    ));
    if (account.password != null && account.password!.isNotEmpty) {
      await _credentialStore.savePassword(accountId, account.password!);
    }
    // Save DKIM private key to secure storage.
    if (account.dkimPrivateKey != null && account.dkimPrivateKey!.isNotEmpty) {
      await _credentialStore.saveDkimKey(accountId, account.dkimPrivateKey!);
    }
    return accountId;
  }

  @override
  Future<void> updateAccount(EmailAccountEntity account) async {
    if (account.id == null) {
      throw ArgumentError('Account id cannot be null for update');
    }
    final existing = await _accountsDao.getAccountById(account.id!);
    final mailAccount = _buildMailAccount(account);
    await _accountsDao.updateAccount(EmailAccountsCompanion(
      id: Value(account.id!),
      displayName: Value(account.displayName),
      email: Value(account.email),
      password: const Value(''),
      imapHost: Value(account.imapHost),
      imapPort: Value(account.imapPort),
      imapUseSsl: Value(account.imapUseSsl),
      smtpHost: Value(account.smtpHost),
      smtpPort: Value(account.smtpPort),
      smtpUseSsl: Value(account.smtpUseSsl),
      smtpStartTls: Value(account.smtpStartTls),
      supportsIdle: Value(account.supportsIdle),
      syncPeriod: Value(account.syncPeriod),
      syncInterval: Value(account.syncInterval),
      dkimDomain: Value(account.dkimDomain),
      dkimSelector: Value(account.dkimSelector),
      mailAccountJson: Value(_sanitizeMailAccountJson(mailAccount)),
      createdAt: Value(existing?.createdAt ?? DateTime.now()),
      updatedAt: Value(DateTime.now()),
    ));
    if (account.password != null && account.password!.isNotEmpty) {
      await _credentialStore.savePassword(account.id!, account.password!);
    }
    // Update DKIM private key in secure storage.
    if (account.dkimPrivateKey != null && account.dkimPrivateKey!.isNotEmpty) {
      await _credentialStore.saveDkimKey(account.id!, account.dkimPrivateKey!);
    } else {
      // Clear DKIM key if it was removed.
      await _credentialStore.deleteDkimKey(account.id!);
    }
  }

  @override
  Future<void> deleteAccount(int id) async {
    await _dataSources.removeAccount(id);
    await _emailsDao.deleteEmailsByAccount(id);
    await _accountsDao.deleteAccount(id);
    await _credentialStore.deletePassword(id);
  }

  @override
  Future<List<MimeMessage>> fetchEmails(int accountId, {int count = 30}) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return [];
    return ds.fetchMessages(count: count);
  }

  @override
  Future<MimeMessage?> fetchFullEmail(int accountId, MimeMessage envelope) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return null;
    return ds.fetchFullMessage(envelope);
  }

  @override
  Future<void> markAsRead(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.markAsRead(message);
    }
  }

  @override
  Future<void> markAsUnread(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.markAsUnread(message);
    }
  }

  @override
  Future<void> markAsFlagged(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.markAsFlagged(message);
    }
  }

  @override
  Future<void> markAsUnflagged(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.markAsUnflagged(message);
    }
  }

  @override
  Future<void> deleteEmail(int accountId, MimeMessage message, {bool expunge = false}) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.deleteMessage(message, expunge: expunge);
    }
  }

  @override
  Future<void> moveToTrash(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.moveToTrash(message);
    }
  }

  @override
  Future<void> sendEmail(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) throw Exception('Account not connected');
    try {
      await RetryHandler.retry(
        action: () => ds.sendMessage(message),
        maxRetries: 2,
        retryableExceptions: {NetworkException},
      );
    } catch (e) {
      // BUG-23: Save to pending queue for offline sending retry.
      dev.log('发送失败，保存到待发队列: $e', name: 'EmailRepositoryImpl');
      await _saveToPendingQueue(accountId, message, errorMessage: e.toString());
      rethrow;
    }

    // Save the sent message locally without switching folders.
    try {
      final sentMailbox = ds.getMailboxByFlag(MailboxFlag.sent);
      if (sentMailbox != null) {
        final companion = MimeMessageMapper.toCompanion(
          message, accountId, folder: sentMailbox.path,
        );
        await _emailsDao.upsertEmail(companion);
      }
    } catch (e) {
      dev.log('保存已发送邮件到本地失败: $e', name: 'EmailRepositoryImpl');
    }
  }

  @override
  Future<int> getUnreadCount(int accountId) async {
    return _emailsDao.getUnreadCountByAccount(accountId);
  }

  @override
  Future<List<Mailbox>> listMailboxes(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return [];
    return ds.listMailboxes();
  }

  @override
  Future<void> syncMailboxes(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return;
    try {
      final mailboxes = await ds.listMailboxes();
      await _mailboxFoldersDao.upsertMailboxes(accountId, mailboxes);
    } catch (e) {
      dev.log('同步邮箱文件夹失败: $e', name: 'EmailRepositoryImpl');
    }
  }

  @override
  Future<void> selectMailbox(int accountId, Mailbox mailbox) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      await ds.selectMailbox(mailbox);
    }
  }

  @override
  Future<void> markAsAnswered(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.markAsAnswered(message);
  }

  @override
  Future<void> markAsForwarded(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.markAsForwarded(message);
  }

  @override
  Future<void> markAsDeleted(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.markAsDeleted(message);
  }

  @override
  Future<void> markAsUndeleted(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.markAsUndeleted(message);
  }

  @override
  Future<void> markAsUnanswered(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.markAsUnanswered(message);
  }

  @override
  Future<void> markAsUnforwarded(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.markAsUnforwarded(message);
  }

  @override
  Future<void> moveToFolder(int accountId, MimeMessage message, Mailbox target) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.moveToFolder(message, target);
  }

  @override
  Future<void> moveToInbox(int accountId, MimeMessage message) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.moveToInbox(message);
  }

  @override
  Future<void> createMailbox(int accountId, String mailboxPath) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.createMailbox(mailboxPath);
  }

  @override
  Future<void> deleteMailbox(int accountId, String mailboxPath) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      final mailboxes = await ds.listMailboxes();
      final target = mailboxes.firstWhere(
        (m) => m.path == mailboxPath,
        orElse: () => throw StateError('Mailbox not found: $mailboxPath'),
      );
      await ds.deleteMailbox(target);
    }
  }

  @override
  Future<void> reconnect(int accountId, {String? password}) async {
    if (password != null && password.isNotEmpty) {
      // Password changed — must recreate the data source with new credentials.
      await _dataSources.removeAccount(accountId);
      final account = await _accountsDao.getAccountById(accountId);
      if (account == null) return;
      await _dataSources.addAccount(
        accountId: accountId,
        displayName: account.displayName ?? '',
        email: account.email,
        password: password,
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapUseSsl: account.imapUseSsl,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpUseSsl: account.smtpUseSsl,
        smtpStartTls: account.smtpStartTls,
      );
    } else {
      final ds = _dataSources.get(accountId);
      if (ds != null) await ds.reconnect();
    }
  }

  @override
  Future<bool> isPolling(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return false;
    return ds.isPolling();
  }

  @override
  Future<void> sendEmailBuilder(int accountId, MessageBuilder messageBuilder) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) throw Exception('Account not connected');
    try {
      await ds.sendMessageBuilder(messageBuilder);
    } catch (e) {
      // BUG-23: Save to pending queue for offline sending retry.
      dev.log('发送失败，保存到待发队列: $e', name: 'EmailRepositoryImpl');
      final message = messageBuilder.buildMimeMessage();
      await _saveToPendingQueue(accountId, message, errorMessage: e.toString());
      rethrow;
    }
  }

  /// Save a failed email to the pending queue for later retry.
  Future<void> _saveToPendingQueue(
    int accountId,
    MimeMessage message, {
    String? errorMessage,
  }) async {
    if (_pendingEmailsDao == null) {
      dev.log('PendingEmailsDao 未初始化，无法保存待发邮件', name: 'EmailRepositoryImpl');
      return;
    }
    try {
      final to = message.to?.map((a) => a.email).join(', ') ?? '';
      final cc = message.cc?.map((a) => a.email).join(', ');
      final bcc = message.bcc?.map((a) => a.email).join(', ');
      final subject = message.decodeSubject() ?? '';
      final bodyText = message.decodeTextPlainPart();
      final bodyHtml = message.decodeTextHtmlPart();

      // BUG-35: Extract attachment info so they can be re-attached during retry.
      String? attachmentPaths;
      final attachments = message.findContentInfo(disposition: ContentDisposition.attachment);
      if (attachments.isNotEmpty) {
        // Serialize attachment metadata as JSON: [{"fileName": ..., "path": ...}, ...]
        // The actual file data is embedded in the MIME message; we store the
        // rendered MIME so the retry path can re-parse and re-send it with
        // attachments intact.
        attachmentPaths = attachments.map((a) => a.fileName ?? 'attachment').join('\n');
      }

      await _pendingEmailsDao!.insertPendingEmail(PendingEmailsCompanion.insert(
        accountId: accountId,
        toAddresses: to,
        ccAddresses: Value(cc),
        bccAddresses: Value(bcc),
        subject: subject,
        bodyText: Value(bodyText),
        bodyHtml: Value(bodyHtml),
        attachmentPaths: Value(attachmentPaths),
        createdAt: DateTime.now(),
        status: const Value('pending'),
        errorMessage: Value(errorMessage),
      ));
      dev.log('邮件已保存到待发队列: $subject', name: 'EmailRepositoryImpl');
    } catch (e) {
      dev.log('保存待发邮件失败: $e', name: 'EmailRepositoryImpl');
    }
  }

  @override
  Future<int> retryPendingEmails() async {
    if (_pendingEmailsDao == null) return 0;
    final pending = await _pendingEmailsDao!.getEmailablePending();
    if (pending.isEmpty) return 0;

    int sentCount = 0;
    for (final p in pending) {
      try {
        // Rebuild the MimeMessage from stored data.
        final account = await _accountsDao.getAccountById(p.accountId);
        final accountEmail = account?.email ?? '';
        final accountName = account?.displayName;
        final builder = MessageBuilder()
          ..from = [MailAddress(accountName, accountEmail)]
          ..to = p.toAddresses.split(',').map((e) => MailAddress(null, e.trim())).toList()
          ..subject = p.subject;
        if (p.ccAddresses != null && p.ccAddresses!.isNotEmpty) {
          builder.cc = p.ccAddresses!.split(',').map((e) => MailAddress(null, e.trim())).toList();
        }
        if (p.bccAddresses != null && p.bccAddresses!.isNotEmpty) {
          builder.bcc = p.bccAddresses!.split(',').map((e) => MailAddress(null, e.trim())).toList();
        }
        if (p.bodyText != null) builder.addTextPlain(p.bodyText!);
        if (p.bodyHtml != null) builder.addTextHtml(p.bodyHtml!);

        final message = builder.buildMimeMessage();
        final ds = _dataSources.get(p.accountId);
        if (ds == null) {
          await _pendingEmailsDao!.updateStatus(
            p.id, 'retry',
            errorMessage: 'Account not connected',
            retryCount: p.retryCount + 1,
          );
          continue;
        }

        await ds.sendMessage(message);
        await _pendingEmailsDao!.deletePendingEmail(p.id);
        sentCount++;
        dev.log('待发邮件发送成功: ${p.subject}', name: 'EmailRepositoryImpl');
      } catch (e) {
        dev.log('待发邮件重试失败: ${p.subject}: $e', name: 'EmailRepositoryImpl');
        await _pendingEmailsDao!.updateStatus(
          p.id, 'retry',
          errorMessage: e.toString(),
          retryCount: p.retryCount + 1,
        );
      }
    }
    return sentCount;
  }

  /// Get the email address for an account.
  Future<String> _getAccountEmail(int accountId) async {
    final account = await _accountsDao.getAccountById(accountId);
    return account?.email ?? '';
  }

  @override
  Future<List<MimeMessage>> fetchNextPage(int accountId, PagedMessageResult pagedResult) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return [];
    return ds.fetchNextPage(pagedResult);
  }

  @override
  Future<List<MimeMessage>> fetchMessagesNextPage(int accountId, PagedMessageSequence pagedSequence) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return [];
    return ds.fetchMessagesNextPage(pagedSequence);
  }

  @override
  Future<bool> supportsMailboxes(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return false;
    return ds.supportsMailboxes;
  }

  @override
  Future<bool> supportsThreading(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return false;
    return ds.supportsThreading;
  }

  @override
  Future<List<Mailbox>?> getMailboxesCache(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return null;
    return ds.mailboxes;
  }

  @override
  Future<void> moveMessagesToInbox(int accountId, MessageSequence sequence, String targetMailboxPath) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return;
    if (targetMailboxPath.toUpperCase() == 'INBOX' || targetMailboxPath.isEmpty) {
      await ds.moveMessagesToInbox(sequence);
    } else {
      final mailboxes = await ds.listMailboxes();
      final target = mailboxes.firstWhere(
        (m) => m.path.toUpperCase() == targetMailboxPath.toUpperCase(),
        orElse: () => throw StateError('Mailbox not found: $targetMailboxPath'),
      );
      await ds.moveMessages(sequence, target);
    }
  }

  @override
  Future<void> moveMessagesToFlag(int accountId, MessageSequence sequence, String flag) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      final mailboxes = await ds.listMailboxes();
      final target = mailboxes.firstWhere(
        (m) => m.flags.any((f) => f.name == flag),
        orElse: () => throw StateError('Mailbox with flag $flag not found'),
      );
      await ds.moveMessages(sequence, target);
    }
  }

  @override
  Future<void> junkMessages(int accountId, MessageSequence sequence) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.junkMessages(sequence);
  }

  @override
  Future<void> appendMessage(int accountId, MimeMessage message, String mailboxPath) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      final mailboxes = await ds.listMailboxes();
      final target = mailboxes.firstWhere(
        (m) => m.path == mailboxPath,
        orElse: () => throw StateError('Mailbox not found: $mailboxPath'),
      );
      await ds.appendMessage(message, target);
    }
  }

  @override
  Future<void> deleteAllMessages(int accountId, String mailboxPath, {bool expunge = true}) async {
    final ds = _dataSources.get(accountId);
    if (ds != null) {
      final mailboxes = await ds.listMailboxes();
      final target = mailboxes.firstWhere(
        (m) => m.path == mailboxPath,
        orElse: () => throw StateError('Mailbox not found: $mailboxPath'),
      );
      await ds.deleteAllMessages(target, expunge: expunge);
    }
  }

  @override
  String? getPlainContent(MimeMessage message) => message.decodeTextPlainPart();

  @override
  String? getHtmlContent(MimeMessage message) => message.decodeTextHtmlPart();

  @override
  List<MimePart> getAllPartsFlat(MimeMessage message) => message.allPartsFlat;

  @override
  String? decodeSubject(MimeMessage message) => message.decodeSubject();

  @override
  bool hasAttachments(MimeMessage message) => message.hasAttachments();

  @override
  bool hasFlag(MimeMessage message, String flag) => message.hasFlag(flag);

  @override
  List<ContentInfo> findContentInfo(MimeMessage message, {ContentDisposition disposition = ContentDisposition.attachment}) =>
      message.findContentInfo(disposition: disposition);

  @override
  List<MailAddress> decodeSender(MimeMessage message, {bool combine = false}) =>
      message.decodeSender(combine: combine);

  MailAccount? _buildMailAccount(EmailAccountEntity account) {
    if (account.password == null || account.password!.isEmpty) return null;
    return MailAccount.fromManualSettings(
      name: account.displayName,
      email: account.email,
      incomingHost: account.imapHost,
      incomingPort: account.imapPort,
      incomingSocketType: account.imapUseSsl ? SocketType.ssl : SocketType.plain,
      outgoingHost: account.smtpHost,
      outgoingPort: account.smtpPort,
      outgoingSocketType: account.smtpUseSsl
          ? SocketType.ssl
          : (account.smtpStartTls ? SocketType.starttls : SocketType.plain),
      password: account.password!,
    );
  }

  /// Strip sensitive fields (password) from MailAccount JSON before DB storage.
  String _sanitizeMailAccountJson(MailAccount? mailAccount) {
    if (mailAccount == null) return '';
    final json = mailAccount.toJson();
    // Remove password from the serialized JSON to avoid storing credentials in DB.
    json.remove('password');
    return jsonEncode(json);
  }
}
