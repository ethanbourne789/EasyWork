import 'package:drift/drift.dart';

class ExerciseRecords extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get type => text()();
  IntColumn get durationMinutes => integer()();
  RealColumn get distanceKm => real().nullable()();
  RealColumn get calories => real().nullable()();
  DateTimeColumn get recordDate => dateTime()();
  TextColumn get note => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}
