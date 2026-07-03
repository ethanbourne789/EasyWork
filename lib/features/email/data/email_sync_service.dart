import 'dart:async';
import 'package:enough_mail/enough_mail.dart';
import 'package:drift/drift.dart' hide Column;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/emails_dao.dart';
import '../../../core/event/event_bus.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/providers/event_providers.dart';
import '../../../shared/events/email_events.dart';
import '../providers/email_providers.dart';
import 'mail_data_sources_notifier.dart';
import 'mail_data_source.dart';
import 'mime_message_mapper.dart';

class EmailSyncService {
  final EmailsDao _emailsDao;
  final EventBus _eventBus;
  final MailDataSourcesNotifier _dataSources;
  final Map<int, StreamSubscription<MailLoadEvent>> _messageSubscriptions = {};
  final Map<int, StreamSubscription<MailUpdateEvent>> _updateSubscriptions = {};
  final Map<int, StreamSubscription<MailVanishedEvent>> _vanishedSubscriptions = {};
  final Map<int, int> _lastSyncedUids = {};
  final Map<int, PagedMessageSequence> _pagedSequences = {};
  final Set<int> _syncingAccounts = {};
  final Set<int> _pollingAccounts = {};

  EmailSyncService({
    required EmailsDao emailsDao,
    required EventBus eventBus,
    required MailDataSourcesNotifier dataSources,
  })  : _emailsDao = emailsDao,
        _eventBus = eventBus,
        _dataSources = dataSources;

  /// Connect and start syncing for an account
  Future<void> connectAndSync(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return;

    if (!_lastSyncedUids.containsKey(accountId)) {
      await _ensureLastSyncedUid(accountId);
    }

    _messageSubscriptions[accountId]?.cancel();
    _messageSubscriptions[accountId] = ds.onNewMessage.listen((event) {
      _handleNewMessage(accountId, event.message);
    });

    _updateSubscriptions[accountId]?.cancel();
    _updateSubscriptions[accountId] = ds.onMessageUpdated.listen((event) {
      _handleMessageUpdated(accountId, event.message);
    });

    _vanishedSubscriptions[accountId]?.cancel();
    _vanishedSubscriptions[accountId] = ds.onMessagesVanished.listen((event) {
      _handleMessagesVanished(accountId, event);
    });

    if (!_pollingAccounts.contains(accountId)) {
      _pollingAccounts.add(accountId);
    }
    // Always restart polling to ensure clean state (stopPolling is sync).
    ds.stopPolling();
    await ds.startPolling(interval: const Duration(minutes: 2));
  }

  /// Ensure lastSyncedUid is loaded from DB for the given account.
  /// Returns the UID, or null if none found.
  Future<int?> _ensureLastSyncedUid(int accountId) async {
    if (_lastSyncedUids.containsKey(accountId)) {
      return _lastSyncedUids[accountId];
    }
    final maxUid = await _emailsDao.getMaxUidByAccount(accountId);
    if (maxUid != null && maxUid > 0) {
      _lastSyncedUids[accountId] = maxUid;
      return maxUid;
    }
    return null;
  }

  /// Fetch full message content with retry.
  /// Returns null if all retries fail.
  Future<MimeMessage?> _fetchFullMessageWithRetry(
    MailDataSource ds,
    MimeMessage message, {
    int maxRetries = 3,
  }) async {
    for (var attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await ds.fetchFullMessage(message);
      } catch (_) {
        if (attempt < maxRetries - 1) {
          await Future<void>.delayed(Duration(milliseconds: 500 * (attempt + 1)));
        }
      }
    }
    return null;
  }

  /// First sync: fetch recent emails with full content and store locally
  Future<SyncResult> firstSync(int accountId, {int count = 50}) async {
    if (_syncingAccounts.contains(accountId)) {
      return SyncResult.error('Sync already in progress');
    }
    _syncingAccounts.add(accountId);
    final ds = _dataSources.get(accountId);
    if (ds == null) {
      _syncingAccounts.remove(accountId);
      return SyncResult.error('Account not connected');
    }

    try {
      await _emailsDao.deleteDuplicateEmails(accountId);
      final folderPath = ds.selectedMailbox?.path ?? 'INBOX';
      final messages = await ds.fetchMessages(
        count: count,
        fetchPreference: FetchPreference.fullWhenWithinSize,
      );
      int imported = 0;
      int skipped = 0;
      int maxUid = 0;

      for (final message in messages) {
        final uid = message.uid;
        if (uid == null) {
          skipped++;
          continue;
        }

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          final fetched = await _fetchFullMessageWithRetry(ds, message);
          if (fetched != null) fullMessage = fetched;
        }

        final messageId = fullMessage.decodeHeaderValue('message-id');
        if (messageId == null || messageId.isEmpty) {
          skipped++;
          continue;
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
        await _emailsDao.upsertEmail(companion);
        imported++;

        if (uid > maxUid) {
          maxUid = uid;
        }
      }

      _lastSyncedUids[accountId] = maxUid;

      final mailbox = ds.selectedMailbox;
      if (mailbox != null && mailbox.messagesExists != null) {
        final seq = MessageSequence.fromPage(1, count, mailbox.messagesExists!);
        _pagedSequences[accountId] = PagedMessageSequence(seq, pageSize: count);
      }

      return SyncResult.success(
        imported: imported,
        skipped: skipped,
        total: messages.length,
      );
    } catch (e) {
      return SyncResult.error('Sync failed: $e');
    } finally {
      _syncingAccounts.remove(accountId);
    }
  }

  /// Re-fetch full body for messages that have no bodyHtml (e.g. from old envelope-only syncs)
  Future<int> refetchEmptyBodyMessages(int accountId, {int limit = 50}) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return 0;

    final emptyBody = await _emailsDao.getEmailsByAccountWithEmptyBody(accountId, limit: limit);
    if (emptyBody.isEmpty) return 0;

    int refetched = 0;
    for (final email in emptyBody) {
      final msg = MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
      if (msg == null) continue;
      try {
        final full = await _fetchFullMessageWithRetry(ds, msg);
        if (full == null) continue;
        final companion = MimeMessageMapper.toCompanion(full, accountId, folder: email.folder);
        await _emailsDao.upsertEmail(companion);
        refetched++;
        final uid = full.uid;
        if (uid != null) {
          final currentMax = _lastSyncedUids[accountId] ?? 0;
          if (uid > currentMax) {
            _lastSyncedUids[accountId] = uid;
          }
        }
      } catch (_) {}
    }
    return refetched;
  }

  /// Incremental sync: fetch only new messages since last sync
  Future<SyncResult> incrementalSync(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return SyncResult.error('Account not connected');

    try {
      // Ensure UID is loaded from DB (handles case where incrementalSync
      // is called before connectAndSync, e.g. from toolbar refresh).
      final lastSyncedUid = await _ensureLastSyncedUid(accountId);
      final folderPath = ds.selectedMailbox?.path ?? 'INBOX';
      final messages = await ds.fetchMessages(
        count: 100,
        fetchPreference: FetchPreference.fullWhenWithinSize,
      );
      
      int imported = 0;
      int skipped = 0;
      int maxUid = lastSyncedUid ?? 0;

      for (final message in messages) {
        final uid = message.uid;
        if (uid != null && lastSyncedUid != null && uid <= lastSyncedUid) {
          skipped++;
          continue;
        }

        final messageId = message.decodeHeaderValue('message-id');
        if (messageId == null || messageId.isEmpty) {
          skipped++;
          continue;
        }

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          final fetched = await _fetchFullMessageWithRetry(ds, message);
          if (fetched != null) fullMessage = fetched;
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
        await _emailsDao.upsertEmail(companion);
        imported++;

        if (uid != null && uid > maxUid) {
          maxUid = uid;
        }
      }

      if (maxUid > 0) {
        _lastSyncedUids[accountId] = maxUid;
      }

      if (imported > 0) {
        _eventBus.publish(UnreadCountChangedEvent(totalUnread: imported));
      }

      return SyncResult.success(
        imported: imported,
        skipped: skipped,
        total: messages.length,
      );
    } catch (e) {
      return SyncResult.error('Incremental sync failed: $e');
    }
  }

  /// Sync a specific folder
  Future<SyncResult> syncFolder(int accountId, Mailbox mailbox, {int count = 30}) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return SyncResult.error('Account not connected');

    try {
      await ds.selectMailbox(mailbox);
      final folderPath = mailbox.path;
      final messages = await ds.fetchMessages(
        mailbox: mailbox,
        count: count,
        fetchPreference: FetchPreference.fullWhenWithinSize,
      );
      int imported = 0;
      int skipped = 0;

      for (final message in messages) {
        final messageId = message.decodeHeaderValue('message-id');
        if (messageId == null || messageId.isEmpty) {
          skipped++;
          continue;
        }

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          final fetched = await _fetchFullMessageWithRetry(ds, message);
          if (fetched != null) fullMessage = fetched;
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
        await _emailsDao.upsertEmail(companion);
        imported++;
      }

      return SyncResult.success(
        imported: imported,
        skipped: skipped,
        total: messages.length,
      );
    } catch (e) {
      return SyncResult.error('Folder sync failed: $e');
    }
  }

  /// Handle a new message received via polling
  Future<void> _handleNewMessage(int accountId, MimeMessage message) async {
    final messageId = message.decodeHeaderValue('message-id');
    if (messageId == null || messageId.isEmpty) {
      final uid = message.uid;
      if (uid == null) return;
    }

    final ds = _dataSources.get(accountId);
    if (ds == null) return;

    String folderPath = ds.selectedMailbox?.path ?? 'INBOX';
    if (messageId != null && messageId.isNotEmpty) {
      final existing = await _emailsDao.findByMessageId(messageId, accountId: accountId);
      if (existing != null) {
        folderPath = existing.folder;
      }
    }

    try {
      MimeMessage fullMessage = message;
      if (!message.isDownloaded) {
        final fetched = await _fetchFullMessageWithRetry(ds, message);
        if (fetched != null) fullMessage = fetched;
      }
      final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
      final localId = await _emailsDao.upsertEmail(companion);

      final uid = fullMessage.uid;
      if (uid != null) {
        final currentMax = _lastSyncedUids[accountId] ?? 0;
        if (uid > currentMax) {
          _lastSyncedUids[accountId] = uid;
        }
      }

      if (messageId != null && messageId.isNotEmpty) {
        _eventBus.publish(NewEmailReceivedEvent(
          messageId: messageId,
          localEmailId: localId,
          fromAddress: fullMessage.from?.first.toString() ?? '',
          subject: fullMessage.decodeSubject() ?? '',
        ));
      }
    } catch (e) {
      final companion = MimeMessageMapper.toCompanion(message, accountId, folder: folderPath);
      await _emailsDao.upsertEmail(companion);
    }
  }

  /// Handle flag changes from server (MailUpdateEvent)
  Future<void> _handleMessageUpdated(int accountId, MimeMessage message) async {
    final messageId = message.decodeHeaderValue('message-id');
    if (messageId == null || messageId.isEmpty) return;

    final existing = await _emailsDao.findByMessageId(messageId, accountId: accountId);
    if (existing == null) return;

    try {
      await _emailsDao.updateEmail(EmailsCompanion(
        id: Value(existing.id),
        isRead: Value(message.isSeen),
        isStarred: Value(message.isFlagged),
      ));
    } catch (_) {}

    _eventBus.publish(EmailFlagsChangedEvent(
      accountId: accountId,
      messageId: messageId,
      isSeen: message.isSeen,
      isFlagged: message.isFlagged,
      isAnswered: message.isAnswered,
      isForwarded: message.isForwarded,
    ));
  }

  /// Handle messages vanished from server (MailVanishedEvent)
  Future<void> _handleMessagesVanished(int accountId, MailVanishedEvent event) async {
    final sequence = event.sequence;
    if (sequence == null) return;

    _eventBus.publish(EmailVanishedEvent(
      accountId: accountId,
      uids: sequence.toList(),
    ));

    try {
      final ids = sequence.toList();
      final allEmails = await _emailsDao.getEmailsByAccount(accountId);
      for (final id in ids) {
        final match = allEmails.where((e) => e.uid != null && e.uid == id);
        for (final email in match) {
          await _emailsDao.deleteEmail(email.id);
        }
      }
    } catch (_) {}
  }

  /// Disconnect and stop sync for an account
  Future<void> disconnect(int accountId) async {
    _messageSubscriptions[accountId]?.cancel();
    _messageSubscriptions.remove(accountId);
    _updateSubscriptions[accountId]?.cancel();
    _updateSubscriptions.remove(accountId);
    _vanishedSubscriptions[accountId]?.cancel();
    _vanishedSubscriptions.remove(accountId);
    _pollingAccounts.remove(accountId);
    _syncingAccounts.remove(accountId);
    _pagedSequences.remove(accountId);

    final ds = _dataSources.get(accountId);
    if (ds != null) {
      ds.stopPolling();
    }
  }

  /// Disconnect all accounts
  Future<void> disconnectAll() async {
    for (final accountId in _messageSubscriptions.keys.toList()) {
      await disconnect(accountId);
    }
  }

  /// Fetch older messages for pagination — fetches next page and upserts to DB
  Future<int> fetchOlderMessages(int accountId, {int count = 30}) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return 0;

    try {
      await _ensureLastSyncedUid(accountId);
      final folderPath = ds.selectedMailbox?.path ?? 'INBOX';
      List<MimeMessage> messages;

      final existingSeq = _pagedSequences[accountId];
      if (existingSeq != null && existingSeq.hasNext) {
        messages = await ds.fetchMessagesNextPage(existingSeq);
        _pagedSequences[accountId] = existingSeq;
      } else {
        messages = await ds.fetchMessages(
          count: count,
          fetchPreference: FetchPreference.fullWhenWithinSize,
        );
      }

      int newCount = 0;
      final existingEmails = await _emailsDao.getEmailsByAccount(accountId);
      final existingIds = existingEmails.map((e) => e.messageId).toSet();

      for (final message in messages) {
        final messageId = message.decodeHeaderValue('message-id');
        if (messageId == null || messageId.isEmpty) continue;
        if (existingIds.contains(messageId)) continue;

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          final fetched = await _fetchFullMessageWithRetry(ds, message);
          if (fetched != null) fullMessage = fetched;
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
        await _emailsDao.upsertEmail(companion);
        newCount++;

        final uid = fullMessage.uid;
        if (uid != null) {
          final currentMax = _lastSyncedUids[accountId] ?? 0;
          if (uid > currentMax) {
            _lastSyncedUids[accountId] = uid;
          }
        }
      }

      return newCount;
    } catch (e) {
      return 0;
    }
  }

  void dispose() {
    for (final sub in _messageSubscriptions.values) {
      sub.cancel();
    }
    for (final sub in _updateSubscriptions.values) {
      sub.cancel();
    }
    for (final sub in _vanishedSubscriptions.values) {
      sub.cancel();
    }
    _messageSubscriptions.clear();
    _updateSubscriptions.clear();
    _vanishedSubscriptions.clear();
  }
}

class SyncResult {
  final bool success;
  final int imported;
  final int skipped;
  final int total;
  final String? errorMessage;

  const SyncResult({
    required this.success,
    this.imported = 0,
    this.skipped = 0,
    this.total = 0,
    this.errorMessage,
  });

  factory SyncResult.success({required int imported, required int skipped, required int total}) {
    return SyncResult(
      success: true,
      imported: imported,
      skipped: skipped,
      total: total,
    );
  }

  factory SyncResult.error(String message) {
    return SyncResult(success: false, errorMessage: message);
  }
}

final emailSyncServiceProvider = Provider<EmailSyncService?>((ref) {
  final emailsDaoAsync = ref.watch(emailsDaoProvider);
  final eventBus = ref.watch(eventBusProvider);
  final dataSources = ref.watch(mailDataSourcesProvider.notifier);

  final emailsDao = emailsDaoAsync.valueOrNull;
  if (emailsDao == null) return null;

  final service = EmailSyncService(
    emailsDao: emailsDao,
    eventBus: eventBus,
    dataSources: dataSources,
  );

  ref.onDispose(service.dispose);
  return service;
});
