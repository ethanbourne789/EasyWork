import 'package:drift/drift.dart';
import 'tasks_table.dart';

class CalendarEvents extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  DateTimeColumn get start => dateTime()();
  DateTimeColumn get end => dateTime().nullable()();
  BoolColumn get isAllDay => boolean().withDefault(const Constant(false))();
  TextColumn get color => text().nullable()();
  TextColumn get recurrenceRule => text().nullable()();
  TextColumn get location => text().nullable()();
  IntColumn get taskId => integer().nullable().references(Tasks, #id)();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}
