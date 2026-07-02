import 'package:drift/drift.dart';
import '../app_database.dart';
import 'accounting_budgets_table.dart';

part 'accounting_budgets_dao.g.dart';

@DriftAccessor(tables: [AccountingBudgets])
class AccountingBudgetsDao extends DatabaseAccessor<AppDatabase>
    with _$AccountingBudgetsDaoMixin {
  AccountingBudgetsDao(AppDatabase db) : super(db);

  Future<List<AccountingBudget>> getAllBudgets() =>
      select(accountingBudgets).get();
  Future<AccountingBudget?> getActiveBudget() =>
      (select(accountingBudgets)..limit(1)).getSingleOrNull();
  Future<int> insertBudget(AccountingBudgetsCompanion budget) =>
      into(accountingBudgets).insert(budget);
  Future<bool> updateBudget(AccountingBudgetsCompanion budget) =>
      update(accountingBudgets).replace(budget);
  Future<int> deleteBudget(int id) =>
      (delete(accountingBudgets)..where((t) => t.id.equals(id))).go();
}
