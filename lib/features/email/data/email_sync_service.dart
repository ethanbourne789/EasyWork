import 'dart:async';
import 'dart:developer' as dev;
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
import 'email_sync_logger.dart';

export 'email_sync_logger.dart' show EmailSyncLogger;

class EmailSyncService {
  final EmailsDao _emailsDao;
  final EventBus _eventBus;
  final MailDataSourcesNotifier _dataSources;
  final EmailSyncLogger? _logger;
  /// Optional callback invoked after a successful connection to retry
  /// any pending (offline-queued) emails.
  final Future<int> Function()? _retryPendingCallback;
  final Map<int, StreamSubscription<MailLoadEvent>> _messageSubscriptions = {};
  final Map<int, StreamSubscription<MailUpdateEvent>> _updateSubscriptions = {};
  final Map<int, StreamSubscription<MailVanishedEvent>> _vanishedSubscriptions = {};
  final Map<int, int> _lastSyncedUids = {};
  final Map<int, int> _cachedUidValidity = {};
  final Map<int, PagedMessageSequence> _pagedSequences = {};
  final Set<int> _syncingAccounts = {};
  final Set<int> _pollingAccounts = {};
  final Map<String, DateTime> _lastSyncTimes = {};

  EmailSyncService({
    required EmailsDao emailsDao,
    required EventBus eventBus,
    required MailDataSourcesNotifier dataSources,
    EmailSyncLogger? logger,
    Future<int> Function()? retryPendingCallback,
  })  : _emailsDao = emailsDao,
        _eventBus = eventBus,
        _dataSources = dataSources,
        _logger = logger,
        _retryPendingCallback = retryPendingCallback;

  /// Connect and start syncing for an account.
  /// [syncIntervalMinutes] overrides the default 2-minute polling interval.
  Future<void> connectAndSync(int accountId, {int syncIntervalMinutes = 2}) async {
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
  ds.stopPolling();
  // BUG-22: enough_mail's startPolling() automatically uses IDLE when the
  // server supports it (detected via MailClient.isIdleSupported) and falls
  // back to periodic polling otherwise. The interval is used as both the
  // polling interval (when IDLE is not supported) and the re-connect interval
  // (when IDLE drops the connection). A 2-minute interval provides a good
  // balance for both scenarios.
  final interval = Duration(minutes: syncIntervalMinutes);
  await ds.startPolling(interval: interval);

  // Log polling/IDLE status
  await _logger?.logPollingStatus(
    accountId: accountId,
    email: ds.client.account.email,
    isPolling: true,
    intervalMinutes: interval.inMinutes,
  );
  dev.log(
    '账户 ${ds.client.account.email} 同步已启动 (间隔 ${interval.inMinutes} 分钟, '
    'IDLE: ${ds.supportsIdle ? "已启用" : "不支持, 使用轮询"})',
    name: 'EmailSyncService',
  );

  // BUG-23: Retry sending any pending (offline-queued) emails after
  // a successful connection.
  if (_retryPendingCallback != null) {
    try {
      final sent = await _retryPendingCallback!();
      if (sent > 0) {
        dev.log('重试发送了 $sent 封待发邮件', name: 'EmailSyncService');
      }
    } catch (e) {
      dev.log('重试待发邮件失败: $e', name: 'EmailSyncService');
    }
  }
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
    final rng = DateTime.now().microsecondsSinceEpoch;
    for (var attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await ds.fetchFullMessage(message);
      } catch (e) {
        dev.log('获取完整邮件失败(尝试 $attempt): $e', name: 'EmailSyncService');
        if (attempt < maxRetries - 1) {
          final baseDelay = 500 * (attempt + 1);
          final jitter = (baseDelay * 0.5 * ((rng + attempt) % 100) / 100).round();
          await Future<void>.delayed(Duration(milliseconds: baseDelay + jitter));
        }
      }
    }
    return null;
  }

  /// First sync: fetch recent emails with full content and store locally
  Future<SyncResult> firstSync(int accountId, {int count = 200}) async {
    if (_syncingAccounts.contains(accountId)) {
      return SyncResult.error('Sync already in progress');
    }
    _syncingAccounts.add(accountId);
    final ds = _dataSources.get(accountId);
    if (ds == null) {
      _syncingAccounts.remove(accountId);
      return SyncResult.error('Account not connected');
    }

    final email = ds.client.account.email;
    final stopwatch = Stopwatch()..start();

    try {
      // Log first sync start
      await _logger?.logFirstSyncStart(
        accountId: accountId,
        email: email,
        count: count,
      );

      // Clean duplicates before sync — use COUNT instead of loading all emails.
      final beforeCount = await _emailsDao.getCountByAccount(accountId);
      await _emailsDao.deleteDuplicateEmails(accountId);
      final afterCount = await _emailsDao.getCountByAccount(accountId);
      final deletedDuplicates = beforeCount - afterCount;

      if (deletedDuplicates > 0) {
        await _logger?.logDuplicateCleanup(
          accountId: accountId,
          email: email,
          beforeCount: beforeCount,
          afterCount: afterCount,
          deletedCount: deletedDuplicates,
        );
      }

      final folderPath = ds.selectedMailbox?.path ?? 'INBOX';
      final messages = await ds.fetchMessages(
        count: count,
        fetchPreference: FetchPreference.fullWhenWithinSize,
      );

      int imported = 0;
      int skipped = 0;
      int duplicates = 0;
      int maxUid = 0;

      // Process messages with bounded concurrency (5 at a time) to avoid
      // overwhelming the server while still parallelizing network IO.
      const batchSize = 5;
      for (var i = 0; i < messages.length; i += batchSize) {
        final batch = messages.sublist(
          i,
          i + batchSize > messages.length ? messages.length : i + batchSize,
        );
        final results = await Future.wait(
          batch.map((message) async {
            final uid = message.uid;
            if (uid == null) return _MessageResult(skip: true);

            MimeMessage fullMessage = message;
            if (!message.isDownloaded) {
              final fetched = await _fetchFullMessageWithRetry(ds, message);
              if (fetched != null) fullMessage = fetched;
            }

            final messageId = fullMessage.decodeHeaderValue('message-id');
            if (messageId == null || messageId.isEmpty) {
              return _MessageResult(skip: true);
            }

            final companion = MimeMessageMapper.toCompanion(fullMessage, accountId, folder: folderPath);
            return _MessageResult(
              companion: companion,
              uid: uid,
              messageId: messageId,
            );
          }),
        );

        for (final result in results) {
          if (result.skip) {
            skipped++;
            continue;
          }
          // Check for duplicates after fetch to avoid extra DB queries during fetch.
          final existing = await _emailsDao.findByMessageId(result.messageId!, accountId: accountId);
          if (existing != null) {
            duplicates++;
          }
          await _emailsDao.upsertEmail(result.companion!);
          imported++;
          if (result.uid! > maxUid) {
            maxUid = result.uid!;
          }
        }
      }

      _lastSyncedUids[accountId] = maxUid;
      _lastSyncTimes[ds.client.account.email] = DateTime.now();

      final mailbox = ds.selectedMailbox;
      if (mailbox != null && mailbox.messagesExists > 0) {
        final seq = MessageSequence.fromPage(1, count, mailbox.messagesExists);
        _pagedSequences[accountId] = PagedMessageSequence(seq, pageSize: count);
      }

      stopwatch.stop();

      // Log first sync progress
      await _logger?.logFirstSyncProgress(
        accountId: accountId,
        email: email,
        fetched: messages.length,
        imported: imported,
        skipped: skipped,
        duplicates: duplicates,
      );

      // Log first sync complete
      await _logger?.logFirstSyncComplete(
        accountId: accountId,
        email: email,
        totalFetched: messages.length,
        totalImported: imported,
        totalSkipped: skipped,
        totalDuplicates: duplicates,
        maxUid: maxUid,
        duration: stopwatch.elapsed,
      );

      // Log sync summary — use COUNT query instead of loading all emails.
      final totalEmails = await _emailsDao.getCountByAccount(accountId);
      final unreadCount = await _emailsDao.getUnreadCountByAccount(accountId);
      await _logger?.logSyncSummary(
        accountId: accountId,
        email: email,
        totalEmailsInDb: totalEmails,
        unreadCount: unreadCount,
        maxUid: maxUid,
        mailboxMessageCount: mailbox?.messagesExists,
      );

      return SyncResult.success(
        imported: imported,
        skipped: skipped,
        total: messages.length,
      );
    } catch (e, stackTrace) {
      await _logger?.logError(
        accountId: accountId,
        email: email,
        action: 'FIRST_SYNC',
        errorMessage: e.toString(),
        stackTrace: stackTrace.toString(),
      );
      return SyncResult.error('Sync failed: $e');
    } finally {
      _syncingAccounts.remove(accountId);
    }
  }

  /// Re-fetch full body for messages that have no bodyHtml (e.g. from old envelope-only syncs)
  Future<int> refetchEmptyBodyMessages(int accountId, {int limit = 200}) async {
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
        } catch (e) {
          await _logger?.logError(
            accountId: accountId,
            email: ds.client.account.email,
            action: 'REFETCH_EMPTY_BODY',
            errorMessage: e.toString(),
          );
        }
      }
      return refetched;
  }

  /// Incremental sync: use IMAP SEARCH to find messages since last known UID,
  /// then fetch only those — avoids re-scanning the full recent mailbox.
  Future<SyncResult> incrementalSync(int accountId) async {
    final ds = _dataSources.get(accountId);
    if (ds == null) return SyncResult.error('Account not connected');

    final email = ds.client.account.email;
    final lastSyncedUid = _lastSyncedUids[accountId];
    final lastSyncTime = _lastSyncTimes[email];

    try {
      // Log incremental sync start
      await _logger?.logIncrementalSyncStart(
        accountId: accountId,
        email: email,
        lastSyncedUid: lastSyncedUid,
        lastSyncTime: lastSyncTime,
      );

      final uid = await _ensureLastSyncedUid(accountId);
      final folderPath = ds.selectedMailbox?.path ?? 'INBOX';

      final currentUidValidity = ds.selectedMailbox?.uidValidity;
      final cachedValidity = _cachedUidValidity[accountId];
      if (currentUidValidity != null && cachedValidity != null &&
          currentUidValidity != cachedValidity) {
        _lastSyncedUids.remove(accountId);
        _cachedUidValidity[accountId] = currentUidValidity;
        return SyncResult.error('UID validity changed — full resync required');
      }
      if (currentUidValidity != null) {
        _cachedUidValidity[accountId] = currentUidValidity;
      }

      // Try IMAP UID SEARCH for messages with UID > lastSyncedUid first.
      // Fall back to date-based search, then to plain fetch + UID filter.
      List<MimeMessage> newMessages;
      if (uid != null && uid > 0) {
        newMessages = await _searchSinceUid(ds, uid);
      } else {
        // First incremental: search messages from the last 30 days
        final since = DateTime.now().subtract(const Duration(days: 30));
        newMessages = await _searchSinceDate(ds, since);
      }

      int imported = 0;
      int skipped = 0;
      int maxUid = uid ?? 0;

      for (final message in newMessages) {
        final messageUid = message.uid;
        if (messageUid == null) {
          skipped++;
          continue;
        }

        // Skip messages that have already been synced (UID <= maxUid).
        if (messageUid <= maxUid) {
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

        if (messageUid > maxUid) {
          maxUid = messageUid;
        }
      }

      if (maxUid > 0) {
        _lastSyncedUids[accountId] = maxUid;
      }

      // Log incremental sync result
      await _logger?.logIncrementalSyncResult(
        accountId: accountId,
        email: email,
        fetched: newMessages.length,
        imported: imported,
        skipped: skipped,
        newMaxUid: maxUid,
      );

      if (imported > 0) {
        final totalUnread = await _emailsDao.getTotalUnreadCount();
        _eventBus.publish(UnreadCountChangedEvent(totalUnread: totalUnread));
      }

      return SyncResult.success(
        imported: imported,
        skipped: skipped,
        total: newMessages.length,
      );
    } catch (e, stackTrace) {
      await _logger?.logError(
        accountId: accountId,
        email: email,
        action: 'INCREMENTAL_SYNC',
        errorMessage: e.toString(),
        stackTrace: stackTrace.toString(),
      );
      return SyncResult.error('Incremental sync failed: $e');
    }
  }

  /// Search IMAP for messages with UID greater than [lastUid].
  /// BUG-38: Uses server-side UID FETCH (UID lastUid+1:*) instead of
  /// fetching 100 messages and filtering locally. Falls back to date-based
  /// search if the server doesn't support UID range fetch.
  Future<List<MimeMessage>> _searchSinceUid(MailDataSource ds, int lastUid) async {
    try {
      // Use server-side UID range fetch: creates a UID sequence
      // representing "lastUid+1:*" in IMAP, which retrieves only
      // messages with UID > lastUid from the server.
      final sequence = MessageSequence.fromRangeToLast(
        lastUid + 1,
        isUidSequence: true,
      );
      final messages = await ds.fetchMessageSequence(
        sequence,
        fetchPreference: FetchPreference.envelope,
      );
      // Safety filter: the IMAP spec says * always matches the last message,
      // even if its UID <= lastUid+1, so we may get one extra message.
      return messages.where((m) {
        final uid = m.uid;
        return uid != null && uid > lastUid;
      }).toList();
    } catch (e) {
      dev.log('UID 范围获取失败，回退到本地过滤: $e', name: 'EmailSyncService');
      // Fall back to fetch + local filter if UID range fetch fails
      try {
        final messages = await ds.fetchMessages(
          count: 200,
          fetchPreference: FetchPreference.envelope,
        );
        return messages.where((m) {
          final uid = m.uid;
          return uid != null && uid > lastUid;
        }).toList();
      } catch (e2) {
        dev.log('本地过滤也失败，回退到按日期获取: $e2', name: 'EmailSyncService');
        final lastSyncTime = _lastSyncTimes[ds.client.account.email] ??
            DateTime.now().subtract(const Duration(days: 7));
        return _searchSinceDate(ds, lastSyncTime);
      }
    }
  }

  /// Search IMAP for messages sent after [since] date.
  Future<List<MimeMessage>> _searchSinceDate(MailDataSource ds, DateTime since) async {
    try {
      final search = MailSearch(
        '',
        SearchQueryType.allTextHeaders,
        sentSince: since,
        fetchPreference: FetchPreference.envelope,
      );
      final result = await ds.searchMessages(search);
      return result.messages;
    } catch (e) {
      dev.log('SEARCH 失败，回退到按日期获取: $e', name: 'EmailSyncService');
      // SEARCH not supported or failed — fall back to fetching recent
      final messages = await ds.fetchMessages(
        count: 50,
        fetchPreference: FetchPreference.envelope,
      );
      return messages.where((m) {
        final date = m.decodeDate();
        return date != null && date.isAfter(since);
      }).toList();
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
    var messageId = message.decodeHeaderValue('message-id');
    if (messageId == null || messageId.isEmpty) {
      final uid = message.uid;
      if (uid == null) return;
      // Use UID as fallback identifier for messages without Message-ID
      messageId = '<uid:$uid>';
    }

    final ds = _dataSources.get(accountId);
    if (ds == null) return;

    String folderPath = ds.selectedMailbox?.path ?? 'INBOX';
    final existing = await _emailsDao.findByMessageId(messageId, accountId: accountId);
    if (existing != null) {
      folderPath = existing.folder;
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

      // Log new message received
      await _logger?.logNewMessageReceived(
        accountId: accountId,
        email: ds.client.account.email,
        messageId: messageId,
        subject: fullMessage.decodeSubject(),
        from: fullMessage.from?.isNotEmpty == true ? fullMessage.from!.first.toString() : null,
      );

      _eventBus.publish(NewEmailReceivedEvent(
        messageId: messageId,
        localEmailId: localId,
        fromAddress: fullMessage.from?.first.toString() ?? '',
        subject: fullMessage.decodeSubject() ?? '',
      ));
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
        isAnswered: Value(message.isAnswered),
        isForwarded: Value(message.isForwarded),
      ));

      // Log message update
      final ds = _dataSources.get(accountId);
      if (ds != null) {
        await _logger?.logMessageUpdate(
          accountId: accountId,
          email: ds.client.account.email,
          messageId: messageId,
          isRead: message.isSeen,
          isStarred: message.isFlagged,
        );
      }
    } catch (e) {
      dev.log('处理邮件标志变更失败: $e', name: 'EmailSyncService');
    }

    _eventBus.publish(EmailFlagsChangedEvent(
      accountId: accountId,
      messageId: messageId,
      isSeen: message.isSeen,
      isFlagged: message.isFlagged,
      isAnswered: message.isAnswered,
      isForwarded: message.isForwarded,
    ));
  }
  Future<void> _handleMessagesVanished(int accountId, MailVanishedEvent event) async {
    final sequence = event.sequence;
    if (sequence == null) return;

    final ds = _dataSources.get(accountId);
    final email = ds?.client.account.email ?? 'unknown';

    // Log message vanished
    await _logger?.logMessageVanished(
      accountId: accountId,
      email: email,
      vanishedCount: sequence.toList().length,
    );

    _eventBus.publish(EmailVanishedEvent(
      accountId: accountId,
      uids: sequence.toList(),
    ));

    try {
      final ids = sequence.toList();
      // Batch delete by UIDs directly in SQL instead of loading all emails.
      // `MessageSequence.toList()` yields List<int>, matching
      // [EmailsDao.deleteByUids] which expects List<int> — no implicit
      // int/String mismatch (verified during the audit).
      await _emailsDao.deleteByUids(accountId, ids);
    } catch (e) {
      dev.log('批量删除本地邮件(uids)失败: $e', name: 'EmailSyncService');
    }
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

    final email = ds.client.account.email;

    try {
      await _ensureLastSyncedUid(accountId);
      final folderPath = ds.selectedMailbox?.path ?? 'INBOX';
      List<MimeMessage> messages;

      final existingSeq = _pagedSequences[accountId];
      if (existingSeq != null && existingSeq.hasNext) {
        messages = await ds.fetchMessagesNextPage(existingSeq);
      } else if (existingSeq != null) {
        // No more pages available
        await _logger?.logPaginationStatus(
          accountId: accountId,
          email: email,
          hasNextPage: false,
          currentPage: 0,
          totalMessages: ds.selectedMailbox?.messagesExists,
        );
        return 0;
      } else {
        messages = await ds.fetchMessages(
          count: count,
          fetchPreference: FetchPreference.fullWhenWithinSize,
        );
      }

      int newCount = 0;
      // Use efficient SET lookup instead of loading all email objects.
      final existingIds = await _emailsDao.getExistingMessageIds(accountId);

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

      // Log fetch older messages result
      await _logger?.logFetchOlderMessages(
        accountId: accountId,
        email: email,
        requestedCount: count,
        actualFetched: messages.length,
        newImported: newCount,
        hasMorePages: existingSeq?.hasNext ?? false,
      );

      // Log pagination status
      await _logger?.logPaginationStatus(
        accountId: accountId,
        email: email,
        hasNextPage: existingSeq?.hasNext ?? false,
        currentPage: existingSeq?.currentPageIndex ?? 0,
        totalMessages: ds.selectedMailbox?.messagesExists,
      );

      return newCount;
    } catch (e, stackTrace) {
      await _logger?.logError(
        accountId: accountId,
        email: email,
        action: 'FETCH_OLDER_MESSAGES',
        errorMessage: e.toString(),
        stackTrace: stackTrace.toString(),
      );
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

class _MessageResult {
  final bool skip;
  final EmailsCompanion? companion;
  final int? uid;
  final String? messageId;

  const _MessageResult({this.skip = false, this.companion, this.uid, this.messageId});
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
  final loggerAsync = ref.watch(emailSyncLoggerProvider);
  final emailsDao = emailsDaoAsync.valueOrNull;
  if (emailsDao == null) return null;

  final logger = loggerAsync.valueOrNull;
  final repo = ref.watch(emailRepositoryProvider);
  final service = EmailSyncService(
    emailsDao: emailsDao,
    eventBus: eventBus,
    dataSources: dataSources,
    logger: logger,
    retryPendingCallback: repo?.retryPendingEmails,
  );

  ref.onDispose(service.dispose);
  return service;
});
