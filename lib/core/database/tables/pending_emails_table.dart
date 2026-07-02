import 'package:drift/drift.dart';
import 'email_accounts_table.dart';

class PendingEmails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get toAddresses => text()();
  TextColumn get ccAddresses => text().nullable()();
  TextColumn get bccAddresses => text().nullable()();
  TextColumn get subject => text()();
  TextColumn get bodyText => text().nullable()();
  TextColumn get bodyHtml => text().nullable()();
  TextColumn get attachmentPaths => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get status => text().withDefault(const Constant('pending'))();
  TextColumn get errorMessage => text().nullable()();
}
