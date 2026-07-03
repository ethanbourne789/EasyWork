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

  Future<Email?> findByMessageId(String messageId) =>
      (select(emails)..where((t) => t.messageId.equals(messageId)))
          .getSingleOrNull();

  Future<int> insertEmail(EmailsCompanion email) => into(emails).insert(email);

  Future<bool> updateEmail(EmailsCompanion email) =>
      update(emails).replace(email);

  Future<int> deleteEmail(int id) =>
      (delete(emails)..where((t) => t.id.equals(id))).go();

  Stream<List<Email>> watchEmailsByAccount(int accountId) =>
      (select(emails)..where((t) => t.accountId.equals(accountId))).watch();

  // Search methods
  Future<List<Email>> searchEmails(String query) => searchEmailsLike(query);

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
          t.accountId.equals(c.accountId) & t.folder.equals(c.folder));
    } else {
      query.where((t) {
        final expr = conditions
            .map((c) => t.accountId.equals(c.accountId) & t.folder.equals(c.folder))
            .reduce((a, b) => a | b);
        return expr;
      });
    }
    query.orderBy([(t) => OrderingTerm.desc(t.receivedAt)]);
    return query.get();
  }
}
