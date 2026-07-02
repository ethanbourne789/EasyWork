import 'package:drift/drift.dart';
import '../app_database.dart';
import 'email_accounts_table.dart';

part 'email_accounts_dao.g.dart';

@DriftAccessor(tables: [EmailAccounts])
class EmailAccountsDao extends DatabaseAccessor<AppDatabase>
    with _$EmailAccountsDaoMixin {
  EmailAccountsDao(AppDatabase db) : super(db);

  Future<List<EmailAccount>> getAllAccounts() => select(emailAccounts).get();
  Future<EmailAccount?> getAccountById(int id) =>
      (select(emailAccounts)..where((t) => t.id.equals(id))).getSingleOrNull();
  Future<int> insertAccount(EmailAccountsCompanion account) =>
      into(emailAccounts).insert(account);
  Future<bool> updateAccount(EmailAccountsCompanion account) =>
      update(emailAccounts).replace(account);
  Future<int> deleteAccount(int id) =>
      (delete(emailAccounts)..where((t) => t.id.equals(id))).go();
}
