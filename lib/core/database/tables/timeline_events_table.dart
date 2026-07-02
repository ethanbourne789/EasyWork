import 'package:drift/drift.dart';
import 'logs_table.dart';

class TimelineEvents extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get logId => integer().references(Logs, #id)();
  TextColumn get eventType => text()();
  TextColumn get module => text()();
  IntColumn get refId => integer()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}
