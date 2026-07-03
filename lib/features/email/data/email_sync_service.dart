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
import 'mime_message_mapper.dart';

class EmailSyncService {
  final EmailsDao _emailsDao;
  final EventBus _eventBus;
  final MailDataSourcesNotifier _dataSources;
  final Map<int, StreamSubscription<MailLoadEvent>> _messageSubscriptions = {};
  final Map<int, StreamSubscription<MailUpdateEvent>> _updateSubscriptions = {};
  final Map<int, StreamSubscription<MailVanishedEvent>> _vanishedSubscriptions = {};
  final Map<int, int> _lastSyncedUids = {};

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

    await ds.startPolling(interval: const Duration(minutes: 2));
  }

  /// First sync: fetch recent emails with full content and store locally
  Future<SyncResult> firstSync(int accountId, {int count = 50}) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return SyncResult.error('Account not connected');

    try {
      final messages = await ds.fetchMessages(
        count: count,
        fetchPreference: FetchPreference.envelope,
      );
      int imported = 0;
      int skipped = 0;

      for (final message in messages) {
        final messageId = message.decodeHeaderValue('message-id');
        if (messageId == null || messageId.isEmpty) {
          skipped++;
          continue;
        }

        final existing = await _emailsDao.findByMessageId(messageId, accountId: accountId);
        if (existing != null) {
          skipped++;
          continue;
        }

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          try {
            fullMessage = await ds.fetchFullMessage(message);
          } catch (_) {}
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId);
        await _emailsDao.insertEmail(companion);
        imported++;
      }

      await connectAndSync(accountId);

      return SyncResult.success(
        imported: imported,
        skipped: skipped,
        total: messages.length,
      );
    } catch (e) {
      return SyncResult.error('Sync failed: $e');
    }
  }

  /// Incremental sync: fetch only new messages since last sync
  Future<SyncResult> incrementalSync(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return SyncResult.error('Account not connected');

    try {
      final lastSyncedUid = _lastSyncedUids[accountId];
      final messages = await ds.fetchMessages(
        count: 30,
        fetchPreference: FetchPreference.fullWhenWithinSize,
      );
      
      int imported = 0;
      int skipped = 0;
      int maxUid = lastSyncedUid ?? 0;

      for (final message in messages) {
        final uid = message.uid;
        if (uid != null && uid <= (lastSyncedUid ?? 0)) {
          skipped++;
          continue;
        }

        final messageId = message.decodeHeaderValue('message-id');
        if (messageId == null || messageId.isEmpty) {
          skipped++;
          continue;
        }

        final existing = await _emailsDao.findByMessageId(messageId, accountId: accountId);
        if (existing != null) {
          skipped++;
          continue;
        }

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          try {
            fullMessage = await ds.fetchFullMessage(message);
          } catch (_) {}
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId);
        await _emailsDao.insertEmail(companion);
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

        final existing = await _emailsDao.findByMessageId(messageId, accountId: accountId);
        if (existing != null) {
          skipped++;
          continue;
        }

        MimeMessage fullMessage = message;
        if (!message.isDownloaded) {
          try {
            fullMessage = await ds.fetchFullMessage(message);
          } catch (_) {}
        }

        final companion = MimeMessageMapper.toCompanion(fullMessage, accountId);
        await _emailsDao.insertEmail(companion);
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
    if (messageId == null || messageId.isEmpty) return;

    final existing = await _emailsDao.findByMessageId(messageId);
    if (existing != null) return;

    final ds = _dataSources.get(accountId);
    if (ds == null) return;

    try {
      MimeMessage fullMessage = message;
      if (!message.isDownloaded) {
        fullMessage = await ds.fetchFullMessage(message);
      }
      final companion = MimeMessageMapper.toCompanion(fullMessage, accountId);
      final localId = await _emailsDao.insertEmail(companion);

      _eventBus.publish(NewEmailReceivedEvent(
        messageId: messageId,
        localEmailId: localId,
        fromAddress: fullMessage.from?.first.toString() ?? '',
        subject: fullMessage.decodeSubject() ?? '',
      ));
    } catch (e) {
      final companion = MimeMessageMapper.toCompanion(message, accountId);
      await _emailsDao.insertEmail(companion);
    }
  }

  /// Handle flag changes from server (MailUpdateEvent)
  Future<void> _handleMessageUpdated(int accountId, MimeMessage message) async {
    final messageId = message.decodeHeaderValue('message-id');
    if (messageId == null || messageId.isEmpty) return;

    final existing = await _emailsDao.findByMessageId(messageId);
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
      messageIds: sequence.toList().map((id) => id.toString()).toList(),
    ));
  }

  /// Disconnect and stop sync for an account
  Future<void> disconnect(int accountId) async {
    _messageSubscriptions[accountId]?.cancel();
    _messageSubscriptions.remove(accountId);
    _updateSubscriptions[accountId]?.cancel();
    _updateSubscriptions.remove(accountId);
    _vanishedSubscriptions[accountId]?.cancel();
    _vanishedSubscriptions.remove(accountId);

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
