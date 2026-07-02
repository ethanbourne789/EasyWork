import 'package:drift/drift.dart';
import 'accounting_categories_table.dart';

class AccountingBudgets extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get categoryId => integer().references(AccountingCategories, #id)();
  TextColumn get month => text()();
  RealColumn get budgetAmount => real()();
}
