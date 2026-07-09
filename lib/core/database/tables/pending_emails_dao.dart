import 'package:drift/drift.dart';
import '../app_database.dart';
import 'pending_emails_table.dart';

part 'pending_emails_dao.g.dart';

@DriftAccessor(tables: [PendingEmails])
class PendingEmailsDao extends DatabaseAccessor<AppDatabase>
    with _$PendingEmailsDaoMixin {
  PendingEmailsDao(AppDatabase db) : super(db);

  Future<List<PendingEmail>> getPendingEmails() => select(pendingEmails).get();
  Future<PendingEmail?> getPendingById(int id) =>
      (select(pendingEmails)..where((t) => t.id.equals(id))).getSingleOrNull();
  Future<int> insertPendingEmail(PendingEmailsCompanion email) =>
      into(pendingEmails).insert(email);
  Future<bool> updatePendingEmail(PendingEmailsCompanion email) =>
      update(pendingEmails).replace(email);
  Future<int> deletePendingEmail(int id) =>
      (delete(pendingEmails)..where((t) => t.id.equals(id))).go();

  /// Get all pending emails with status 'pending' or 'retry', ordered by creation time.
  Future<List<PendingEmail>> getPendingEmailsByStatus(String status) =>
      (select(pendingEmails)
            ..where((t) => t.status.equals(status))
            ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
          .get();

  /// Get all emails that need to be retried (status 'pending' or 'retry').
  Future<List<PendingEmail>> getEmailablePending() =>
      (select(pendingEmails)
            ..where((t) => t.status.isIn(['pending', 'retry']))
            ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
          .get();

  /// Update the status of a pending email.
  Future<void> updateStatus(int id, String status, {String? errorMessage, int? retryCount}) =>
      (update(pendingEmails)..where((t) => t.id.equals(id))).write(
        PendingEmailsCompanion(
          status: Value(status),
          errorMessage: Value(errorMessage),
          retryCount: retryCount != null ? Value(retryCount) : const Value.absent(),
          lastRetryAt: Value(DateTime.now()),
        ),
      );

  /// Watch pending emails count for UI display.
  Stream<int> watchPendingCount() {
    final count = pendingEmails.id.count();
    final query = selectOnly(pendingEmails)
      ..addColumns([count])
      ..where(pendingEmails.status.isIn(['pending', 'retry']));
    return query.map((row) => row.read(count) ?? 0).watchSingle();
  }
}
