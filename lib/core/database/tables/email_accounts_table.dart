import 'package:drift/drift.dart';

class EmailAccounts extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get email => text()();
  TextColumn get displayName => text().nullable()();
  TextColumn get password => text().nullable()();
  TextColumn get mailAccountJson => text()();
  TextColumn get imapHost => text()();
  IntColumn get imapPort => integer()();
  BoolColumn get imapUseSsl => boolean().withDefault(const Constant(true))();
  TextColumn get smtpHost => text()();
  IntColumn get smtpPort => integer()();
  BoolColumn get smtpUseSsl => boolean().withDefault(const Constant(true))();
  BoolColumn get supportsIdle => boolean().withDefault(const Constant(false))();
  TextColumn get discoveredConfigJson => text().nullable()();
  TextColumn get loginType => text().withDefault(const Constant('normal'))();
  TextColumn get syncPeriod => text().withDefault(const Constant('1m'))();
  IntColumn get syncInterval => integer().withDefault(const Constant(5))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}
