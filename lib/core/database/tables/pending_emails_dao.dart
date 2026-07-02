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
}
