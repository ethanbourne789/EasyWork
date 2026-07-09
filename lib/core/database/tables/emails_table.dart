import 'package:drift/drift.dart';
import 'email_accounts_table.dart';

class Emails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get messageId => text()();
  IntColumn get uid => integer().nullable()();
  TextColumn get subject => text().nullable()();
  TextColumn get fromName => text().nullable()();
  TextColumn get fromAddress => text()();
  TextColumn get toList => text().nullable()();
  TextColumn get ccList => text().nullable()();
  TextColumn get bccList => text().nullable()();
  TextColumn get bodyText => text().nullable()();
  TextColumn get bodyHtml => text().nullable()();
  BoolColumn get hasAttachments => boolean().withDefault(const Constant(false))();
  DateTimeColumn get receivedAt => dateTime()();
  BoolColumn get isRead => boolean().withDefault(const Constant(false))();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  BoolColumn get isAnswered => boolean().withDefault(const Constant(false))();
  BoolColumn get isForwarded => boolean().withDefault(const Constant(false))();
  TextColumn get folder => text().withDefault(const Constant('inbox'))();
  TextColumn get threadId => text().nullable()();
  TextColumn get inReplyTo => text().nullable()();
  TextColumn get references => text().nullable()();
  TextColumn get replyTo => text().nullable()();
  TextColumn get originalMessageJson => text().nullable()();
}
