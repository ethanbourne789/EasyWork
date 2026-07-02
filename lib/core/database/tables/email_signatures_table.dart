import 'package:drift/drift.dart';
import 'email_accounts_table.dart';

class EmailSignatures extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get name => text()();
  TextColumn get contentType => text().withDefault(const Constant('text'))();
  TextColumn get content => text()();
  BoolColumn get isDefault => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}
