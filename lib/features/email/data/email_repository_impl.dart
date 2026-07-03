import 'package:enough_mail/enough_mail.dart';
import 'package:drift/drift.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/emails_dao.dart';
import '../../../core/database/tables/email_accounts_dao.dart';
import '../../../core/database/tables/mailbox_folders_dao.dart';
import '../../../core/security/credential_store.dart';
import 'mail_data_sources_notifier.dart';
import 'email_repository.dart';
import '../domain/email_account_entity.dart';

class EmailRepositoryImpl implements EmailRepository {
  final EmailsDao _emailsDao;
  final EmailAccountsDao _accountsDao;
  final MailDataSourcesNotifier _dataSources;
  final CredentialStore _credentialStore;
  final MailboxFoldersDao _mailboxFoldersDao;

  EmailRepositoryImpl(
    this._emailsDao,
    this._accountsDao,
    this._dataSources,
    this._credentialStore,
    this._mailboxFoldersDao,
  );

  @override
  Future<List<EmailAccountEntity>> getAllAccounts() async {
    final accounts = await _accountsDao.getAllAccounts();
    final result = <EmailAccountEntity>[];
    for (final a in accounts) {
      String? password;
      try {
        password = await _credentialStore.getPassword(a.id);
      } catch (e) {
        password = a.password;
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
        supportsIdle: a.supportsIdle,
        syncPeriod: a.syncPeriod,
        syncInterval: a.syncInterval,
        accentColor: a.accentColor,
        createdAt: a.createdAt,
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
      password = a.password;
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
      supportsIdle: a.supportsIdle,
      syncPeriod: a.syncPeriod,
      syncInterval: a.syncInterval,
      accentColor: a.accentColor,
      createdAt: a.createdAt,
    );
  }

  @override
  Future<int> createAccount(EmailAccountEntity account) async {
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
      supportsIdle: Value(account.supportsIdle),
      mailAccountJson: const Value(''),
      syncPeriod: Value(account.syncPeriod),
      syncInterval: Value(account.syncInterval),
      createdAt: Value(DateTime.now()),
      updatedAt: Value(DateTime.now()),
    ));
    if (account.password != null && account.password!.isNotEmpty) {
      await _credentialStore.savePassword(accountId, account.password!);
    }
    return accountId;
  }

  @override
  Future<void> updateAccount(EmailAccountEntity account) async {
    if (account.id == null) {
      throw ArgumentError('Account id cannot be null for update');
    }
    final existing = await _accountsDao.getAccountById(account.id!);
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
      supportsIdle: Value(account.supportsIdle),
      syncPeriod: Value(account.syncPeriod),
      syncInterval: Value(account.syncInterval),
      mailAccountJson: Value(existing?.mailAccountJson ?? ''),
      createdAt: Value(existing?.createdAt ?? DateTime.now()),
      updatedAt: Value(DateTime.now()),
    ));
    if (account.password != null && account.password!.isNotEmpty) {
      await _credentialStore.savePassword(account.id!, account.password!);
    }
  }

  @override
  Future<void> deleteAccount(int id) async {
    await _dataSources.removeAccount(id);
    await _accountsDao.deleteAccount(id);
    await _credentialStore.deletePassword(id);
  }

  @override
  Future<List<MimeMessage>> fetchEmails(int accountId, {String folder = 'INBOX', int count = 30}) async {
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
    await ds.sendMessage(message);
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
    } catch (_) {
      // Logged upstream; sync failures should not crash
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
    final ds = _dataSources.get(accountId);
    if (ds != null) await ds.reconnect();
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
    await ds.sendMessageBuilder(messageBuilder);
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
    if (ds != null) await ds.moveMessagesToInbox(sequence);
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
      final matchingFlag = target.flags.isNotEmpty ? target.flags.first : MailboxFlag.marked;
      await ds.moveMessagesToFlagBySequence(sequence, matchingFlag);
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
}
