import 'package:drift/drift.dart';
import 'emails_table.dart';

class EmailAttachments extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get emailId => integer().references(Emails, #id)();
  TextColumn get filename => text()();
  TextColumn get mimeType => text().nullable()();
  IntColumn get size => integer().nullable()();
  TextColumn get localPath => text().nullable()();
  TextColumn get cid => text().nullable()();
}
