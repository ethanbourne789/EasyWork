import 'package:drift/drift.dart';
import '../app_database.dart';
import 'exercise_records_table.dart';

part 'exercise_records_dao.g.dart';

@DriftAccessor(tables: [ExerciseRecords])
class ExerciseRecordsDao extends DatabaseAccessor<AppDatabase>
    with _$ExerciseRecordsDaoMixin {
  ExerciseRecordsDao(AppDatabase db) : super(db);

  Future<List<ExerciseRecord>> getAllRecords() =>
      select(exerciseRecords).get();
  Future<List<ExerciseRecord>> getRecordsByDateRange(
          DateTime start, DateTime end) =>
      (select(exerciseRecords)
            ..where((t) =>
                t.recordDate.isBiggerOrEqualValue(start) &
                t.recordDate.isSmallerOrEqualValue(end)))
          .get();
  Future<ExerciseRecord?> getRecordById(int id) =>
      (select(exerciseRecords)..where((t) => t.id.equals(id)))
          .getSingleOrNull();
  Future<int> insertRecord(ExerciseRecordsCompanion record) =>
      into(exerciseRecords).insert(record);
  Future<bool> updateRecord(ExerciseRecordsCompanion record) =>
      update(exerciseRecords).replace(record);
  Future<int> deleteRecord(int id) =>
      (delete(exerciseRecords)..where((t) => t.id.equals(id))).go();
  Stream<List<ExerciseRecord>> watchAllRecords() =>
      select(exerciseRecords).watch();
}
