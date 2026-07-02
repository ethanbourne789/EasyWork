import 'package:drift/drift.dart';
import 'accounting_categories_table.dart';

class AccountingRecords extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get type => text()();
  IntColumn get categoryId => integer().references(AccountingCategories, #id)();
  RealColumn get amount => real()();
  DateTimeColumn get recordDate => dateTime()();
  TextColumn get note => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}
