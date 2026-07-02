import 'package:drift/drift.dart';
import '../app_database.dart';
import 'logs_table.dart';

part 'logs_dao.g.dart';

@DriftAccessor(tables: [Logs])
class LogsDao extends DatabaseAccessor<AppDatabase> with _$LogsDaoMixin {
  LogsDao(AppDatabase db) : super(db);

  Future<List<Log>> getAllLogs() => select(logs).get();
  Future<List<Log>> getLogsByDateRange(DateTime start, DateTime end) =>
      (select(logs)
            ..where((t) =>
                t.createdAt.isBiggerOrEqualValue(start) &
                t.createdAt.isSmallerOrEqualValue(end)))
          .get();
  Future<int> insertLog(LogsCompanion log) => into(logs).insert(log);
  Future<int> deleteOlderThan(DateTime date) =>
      (delete(logs)..where((t) => t.createdAt.isSmallerOrEqualValue(date)))
          .go();
}
