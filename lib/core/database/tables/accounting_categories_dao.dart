import 'package:drift/drift.dart';
import '../app_database.dart';
import 'accounting_categories_table.dart';

part 'accounting_categories_dao.g.dart';

@DriftAccessor(tables: [AccountingCategories])
class AccountingCategoriesDao extends DatabaseAccessor<AppDatabase>
    with _$AccountingCategoriesDaoMixin {
  AccountingCategoriesDao(AppDatabase db) : super(db);

  Future<List<AccountingCategory>> getAllCategories() =>
      select(accountingCategories).get();
  Future<List<AccountingCategory>> getCategoriesByType(String type) =>
      (select(accountingCategories)..where((t) => t.type.equals(type))).get();
  Future<int> insertCategory(AccountingCategoriesCompanion category) =>
      into(accountingCategories).insert(category);
  Future<bool> updateCategory(AccountingCategoriesCompanion category) =>
      update(accountingCategories).replace(category);
  Future<int> deleteCategory(int id) =>
      (delete(accountingCategories)..where((t) => t.id.equals(id))).go();
}
