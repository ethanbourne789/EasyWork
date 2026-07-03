import 'package:drift/drift.dart';
import 'email_accounts_table.dart';

class MailboxFolders extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get encodedName => text()();
  TextColumn get encodedPath => text()();
  TextColumn get path => text()();
  TextColumn get name => text()();
  TextColumn get pathSeparator => text()();
  TextColumn get flagsJson => text()();
  BoolColumn get isReadWrite => boolean().withDefault(const Constant(true))();
  IntColumn get messagesUnseen => integer().withDefault(const Constant(0))();
  IntColumn get uidValidity => integer().nullable()();
  IntColumn get uidNext => integer().nullable()();
  DateTimeColumn get syncedAt => dateTime()();
}
