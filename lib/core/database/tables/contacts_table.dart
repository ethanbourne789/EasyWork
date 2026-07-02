import 'package:drift/drift.dart';
import 'email_accounts_table.dart';

class Contacts extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id).nullable()();
  TextColumn get firstName => text().nullable()();
  TextColumn get lastName => text().nullable()();
  TextColumn get displayName => text()();
  TextColumn get emailAddresses => text().nullable()();
  TextColumn get phoneNumbers => text().nullable()();
  TextColumn get organization => text().nullable()();
  TextColumn get department => text().nullable()();
  TextColumn get jobTitle => text().nullable()();
  TextColumn get notes => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}
