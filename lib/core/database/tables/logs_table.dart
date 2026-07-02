import 'package:drift/drift.dart';

class Logs extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get level => text()();
  TextColumn get module => text()();
  TextColumn get action => text()();
  IntColumn get refId => integer().nullable()();
  TextColumn get message => text()();
  TextColumn get userMessage => text().nullable()();
  TextColumn get stackTrace => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}
