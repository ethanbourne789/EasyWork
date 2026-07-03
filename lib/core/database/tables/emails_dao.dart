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
    final allEmails = await getEmailsByAccount(accountId);
    final seen = <String, int>{};
    final idsToDelete = <int>{};
    for (final email in allEmails) {
      final existingId = seen[email.messageId];
      if (existingId == null) {
        seen[email.messageId] = email.id!;
      } else {
        final existingBody = allEmails.firstWhere((e) => e.id == existingId).bodyHtml;
        if (email.bodyHtml != null && existingBody == null) {
          idsToDelete.add(existingId);
          seen[email.messageId] = email.id!;
        } else {
          idsToDelete.add(email.id!);
        }
      }
    }
    if (idsToDelete.isEmpty) return 0;
    int deleted = 0;
    for (final id in idsToDelete) {
      await deleteEmail(id);
      deleted++;
    }
    return deleted;
  }

  Future<int> insertEmail(EmailsCompanion email) => into(emails).insert(email);

  Future<int> upsertEmail(EmailsCompanion email) async {
    // Try insert first — if the unique constraint (messageId, accountId) fires,
    // fall through to the update path. This eliminates the race window between
    // select and insert that caused duplicate rows.
    try {
      return await into(emails).insert(email);
    } catch (_) {
      // Unique constraint (messageId, accountId) likely violated — update instead.
    }

    final existing = await (select(emails)
          ..where((t) =>
              t.messageId.equals(email.messageId.value) &
              t.accountId.equals(email.accountId.value)))
        .get();
    if (existing.isEmpty) return 0;

    final target = existing.firstWhere(
      (e) => e.bodyHtml != null && e.bodyHtml!.isNotEmpty,
      orElse: () => existing.first,
    );
    await (update(emails)..where((t) => t.id.equals(target.id))).write(email);
    // Delete other duplicates
    for (final e in existing) {
      if (e.id != target.id) {
        await deleteEmail(e.id);
      }
    }
    return target.id;
  }

  Future<bool> updateEmail(EmailsCompanion email) =>
      update(emails).replace(email);

  Future<int> deleteEmail(int id) =>
      (delete(emails)..where((t) => t.id.equals(id))).go();

  Stream<List<Email>> watchEmailsByAccount(int accountId) =>
      (select(emails)..where((t) => t.accountId.equals(accountId))).watch();

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
