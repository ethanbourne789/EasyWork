import 'package:drift/drift.dart';
import '../app_database.dart';
import 'emails_table.dart';

part 'emails_dao.g.dart';

@DriftAccessor(tables: [Emails])
class EmailsDao extends DatabaseAccessor<AppDatabase> with _$EmailsDaoMixin {
  EmailsDao(super.db);

  Future<List<Email>> getAllEmails() => select(emails).get();

  Future<List<Email>> getEmailsByAccount(int accountId) =>
      (select(emails)..where((t) => t.accountId.equals(accountId))).get();

  Future<Email?> getEmailById(int id) =>
      (select(emails)..where((t) => t.id.equals(id))).getSingleOrNull();

  Future<Email?> findByMessageId(String messageId, {int? accountId}) async {
    final query = select(emails)..where((t) => t.messageId.equals(messageId));
    if (accountId != null) {
      query.where((t) => t.accountId.equals(accountId));
    }
    final results = await query.get();
    if (results.isEmpty) return null;
    if (results.length == 1) return results.first;
    // Multiple duplicates: keep the one with bodyHtml, or the first
    final withBody = results.where((e) => e.bodyHtml != null && e.bodyHtml!.isNotEmpty);
    return withBody.isNotEmpty ? withBody.first : results.first;
  }

  Future<List<Email>> getEmailsByAccountWithEmptyBody(int accountId, {int limit = 50}) async {
    return (select(emails)
          ..where((t) =>
              t.accountId.equals(accountId) &
              (t.bodyHtml.isNull() | t.bodyHtml.equals('')))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)])
          ..limit(limit))
        .get();
  }

  Future<int> deleteEmailsByAccount(int accountId) =>
      (delete(emails)..where((t) => t.accountId.equals(accountId))).go();

  Future<int> deleteDuplicateEmails(int accountId) async {
    // BUG-25: Return the number of deleted duplicates, not the remaining count.
    final beforeCount = await (select(emails)..where((t) => t.accountId.equals(accountId)))
        .map((e) => 1).get().then((l) => l.length);
    await customStatement('''
      DELETE FROM emails WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM emails
        WHERE account_id = ? AND message_id IS NOT NULL AND message_id != ''
        GROUP BY message_id, account_id
      ) AND account_id = ? AND message_id IS NOT NULL AND message_id != ''
    ''', [accountId, accountId]);
    final afterCount = await (select(emails)..where((t) => t.accountId.equals(accountId)))
        .map((e) => 1).get().then((l) => l.length);
    return beforeCount - afterCount;
  }

  Future<int> insertEmail(EmailsCompanion email) => into(emails).insert(email);

  Future<int> upsertEmail(EmailsCompanion email) async {
    return transaction(() async {
      try {
        return await into(emails).insert(email);
      } catch (e) {
        final isUniqueViolation = e.toString().contains('UNIQUE constraint');
        if (!isUniqueViolation) rethrow;
      }

      final existing = await (select(emails)
            ..where((t) =>
                t.messageId.equals(email.messageId.value) &
                t.accountId.equals(email.accountId.value)))
          .get();

      if (existing.isEmpty) {
        return await into(emails).insert(email);
      }

      final target = existing.firstWhere(
        (e) => e.bodyHtml != null && e.bodyHtml!.isNotEmpty,
        orElse: () => existing.first,
      );
      await (update(emails)..where((t) => t.id.equals(target.id))).write(email);
      for (final e in existing) {
        if (e.id != target.id) {
          await deleteEmail(e.id);
        }
      }
      return target.id;
    });
  }

  Future<bool> updateEmail(EmailsCompanion email) =>
      update(emails).replace(email);

  Future<int> deleteEmail(int id) =>
      (delete(emails)..where((t) => t.id.equals(id))).go();

  Stream<List<Email>> watchEmailsByAccount(int accountId) =>
      (select(emails)..where((t) => t.accountId.equals(accountId))).watch();

  Stream<List<Email>> watchEmailsByAccountAndFolder(
    int accountId,
    String folder,
  ) =>
      (select(emails)
            ..where((t) =>
                t.accountId.equals(accountId) &
                t.folder.lower().equals(folder.toLowerCase()))
            ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
          .watch();

  Stream<List<Email>> watchEmailsByAccountAndFolders(
    int accountId,
    List<String> folders,
  ) {
    if (folders.isEmpty) return Stream.value([]);
    return (select(emails)
          ..where((t) =>
              t.accountId.equals(accountId) &
              folders
                  .map((f) => t.folder.lower().equals(f.toLowerCase()))
                  .reduce((a, b) => a | b))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
        .watch();
  }

  Stream<List<Email>> watchAllEmails() => select(emails).watch();

  /// Watch emails for a specific account, filtered by unified folder key,
  /// with the filtering done at the SQL level (LIKE patterns) instead of
  /// loading all emails into memory and filtering in Dart.
  ///
  /// The [folderKey] corresponds to the keys used by [MailboxMerger]:
  /// 'inbox', 'flagged', 'sent', 'drafts', 'junk', 'trash', 'archive', 'all',
  /// or a custom folder name.
  Stream<List<Email>> watchEmailsByAccountAndFolderType(
    int accountId,
    String folderKey,
  ) {
    final query = select(emails)
      ..where((t) => t.accountId.equals(accountId));

    switch (folderKey) {
      case 'inbox':
        query.where(
            (t) => t.folder.lower().isIn(['inbox', '收件箱']));
      case 'flagged':
        query.where((t) => t.isStarred.equals(true));
      case 'sent':
        query.where((t) =>
            t.folder.lower().like('%sent%') |
            t.folder.lower().like('%outbox%') |
            t.folder.lower().like('%发件箱%'));
      case 'drafts':
        query.where((t) => t.folder.lower().like('%draft%'));
      case 'junk':
        query.where((t) =>
            t.folder.lower().like('%junk%') |
            t.folder.lower().like('%spam%'));
      case 'trash':
        query.where((t) =>
            t.folder.lower().like('%trash%') |
            t.folder.lower().like('%deleted%'));
      case 'archive':
        query.where((t) => t.folder.lower().like('%archive%'));
      case 'all':
        // No additional folder filter — show everything for this account.
        break;
      default:
        // Custom folder: exact match (case insensitive).
        query.where((t) => t.folder.lower().equals(folderKey.toLowerCase()));
    }

    query.orderBy([(t) => OrderingTerm.desc(t.receivedAt)]);
    return query.watch();
  }

  // Search methods
  Future<List<Email>> searchEmails(String query) async {
    // Use FTS5 for full-text search, falling back to LIKE on failure.
    try {
      final ftsResults = await customSelect(
        'SELECT rowid FROM emails_fts WHERE emails_fts MATCH ? ORDER BY rank LIMIT 50',
        variables: [Variable.withString(query)],
        readsFrom: {emails},
      ).get();
      if (ftsResults.isEmpty) return [];
      final ids = ftsResults.map((r) => r.data['rowid'] as int).toList();
      return (select(emails)
            ..where((t) => t.id.isIn(ids))
            ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
          .get();
    } catch (_) {
      return searchEmailsLike(query);
    }
  }

  Future<List<Email>> searchEmailsLike(String query) async {
    final q = '%$query%';
    return (select(emails)
          ..where((t) =>
              t.subject.like(q) |
              t.fromName.like(q) |
              t.fromAddress.like(q) |
              t.bodyText.like(q))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)])
          ..limit(50))
        .get();
  }

  Future<List<Email>> searchEmailsByFrom(String sender) async {
    final q = '%$sender%';
    return (select(emails)
          ..where((t) => t.fromName.like(q) | t.fromAddress.like(q))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)])
          ..limit(50))
        .get();
  }

  Future<List<Email>> searchEmailsBySubject(String subject) async {
    final q = '%$subject%';
    return (select(emails)
          ..where((t) => t.subject.like(q))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)])
          ..limit(50))
        .get();
  }

  Future<int> getUnreadCountByAccount(int accountId) async {
    final result = await customSelect(
      'SELECT COUNT(*) as count FROM emails WHERE account_id = ? AND is_read = 0',
      variables: [Variable.withInt(accountId)],
      readsFrom: {emails},
    ).getSingle();
    return result.data['count'] as int? ?? 0;
  }

  Future<int> getCountByAccount(int accountId) async {
    final result = await customSelect(
      'SELECT COUNT(*) as count FROM emails WHERE account_id = ?',
      variables: [Variable.withInt(accountId)],
      readsFrom: {emails},
    ).getSingle();
    return result.data['count'] as int? ?? 0;
  }

  Future<Set<String>> getExistingMessageIds(int accountId) async {
    final result = await customSelect(
      'SELECT message_id FROM emails WHERE account_id = ? AND message_id IS NOT NULL AND message_id != \'\'',
      variables: [Variable.withInt(accountId)],
      readsFrom: {emails},
    ).get();
    return result.map((r) => r.read<String>('message_id')).toSet();
  }

  Future<int> deleteByUids(int accountId, List<int> uids) async {
    if (uids.isEmpty) return 0;
    final placeholders = uids.map((_) => '?').join(',');
    return customStatement(
      'DELETE FROM emails WHERE account_id = ? AND uid IN ($placeholders)',
      [accountId, ...uids],
    ).then((_) => uids.length);
  }

  Future<int?> getMaxUidByAccount(int accountId) async {
    final result = await customSelect(
      'SELECT MAX(uid) as max_uid FROM emails WHERE account_id = ? AND uid IS NOT NULL',
      variables: [Variable.withInt(accountId)],
      readsFrom: {emails},
    ).getSingle();
    return result.data['max_uid'] as int?;
  }

  Future<int> getTotalUnreadCount() async {
    final result = await customSelect(
      'SELECT COUNT(*) as count FROM emails WHERE is_read = 0',
      readsFrom: {emails},
    ).getSingle();
    return result.data['count'] as int? ?? 0;
  }

  Future<void> toggleStar(int emailId) async {
    final email = await getEmailById(emailId);
    if (email == null) return;
    await (update(emails)..where((t) => t.id.equals(emailId))).write(
      EmailsCompanion(isStarred: Value(!email.isStarred)),
    );
  }

  Future<void> toggleRead(int emailId) async {
    final email = await getEmailById(emailId);
    if (email == null) return;
    await (update(emails)..where((t) => t.id.equals(emailId))).write(
      EmailsCompanion(isRead: Value(!email.isRead)),
    );
  }

  Future<void> markAsRead(int emailId) async {
    await (update(emails)..where((t) => t.id.equals(emailId))).write(
      const EmailsCompanion(isRead: Value(true)),
    );
  }

  Future<void> markAsUnread(int emailId) async {
    await (update(emails)..where((t) => t.id.equals(emailId))).write(
      const EmailsCompanion(isRead: Value(false)),
    );
  }

  /// Mark the local copy as answered (replied). Keeps the local flag in sync
  /// with the server \Answered flag set by [MailDataSource.markAnsweredByUid].
  Future<void> markAnswered(int emailId) async {
    await (update(emails)..where((t) => t.id.equals(emailId))).write(
      const EmailsCompanion(isAnswered: Value(true)),
    );
  }

  /// Mark the local copy as forwarded. Keeps the local flag in sync with the
  /// server \Forwarded flag set by [MailDataSource.markForwardedByUid].
  Future<void> markForwarded(int emailId) async {
    await (update(emails)..where((t) => t.id.equals(emailId))).write(
      const EmailsCompanion(isForwarded: Value(true)),
    );
  }

  Future<List<Email>> getStarredEmails() async {
    return (select(emails)
          ..where((t) => t.isStarred.equals(true))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
        .get();
  }

  Stream<List<Email>> watchStarredEmails() {
    return (select(emails)
          ..where((t) => t.isStarred.equals(true))
          ..orderBy([(t) => OrderingTerm.desc(t.receivedAt)]))
        .watch();
  }

  Future<List<Email>> getEmailsByAccountIdsAndFolders(
      List<({int accountId, String folder})> conditions) async {
    if (conditions.isEmpty) return [];
    final query = select(emails);
    if (conditions.length == 1) {
      final c = conditions.first;
      query.where((t) =>
          t.accountId.equals(c.accountId) & t.folder.lower().equals(c.folder.toLowerCase()));
    } else {
      query.where((t) {
        final expr = conditions
            .map((c) => t.accountId.equals(c.accountId) & t.folder.lower().equals(c.folder.toLowerCase()))
            .reduce((a, b) => a | b);
        return expr;
      });
    }
    query.orderBy([(t) => OrderingTerm.desc(t.receivedAt)]);
    return query.get();
  }
}
