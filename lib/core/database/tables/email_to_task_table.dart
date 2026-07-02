import 'package:drift/drift.dart';
import 'emails_table.dart';
import 'tasks_table.dart';

class EmailToTask extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get emailId => integer().references(Emails, #id)();
  IntColumn get taskId => integer().references(Tasks, #id)();
  TextColumn get attachmentPaths => text().nullable()();
  DateTimeColumn get linkedAt => dateTime()();
}
