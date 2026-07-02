import 'package:drift/drift.dart';

class AccountingCategories extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
  TextColumn get icon => text().nullable()();
  TextColumn get type => text()();
  RealColumn get monthlyBudget => real().nullable()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
}
