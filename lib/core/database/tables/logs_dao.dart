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

  /// Filtered, sorted, and limited log query — all done at the SQL level
  /// to avoid loading the entire logs table into memory.
  /// Pass `module: 'ALL'` or `level: 'ALL'` to skip that filter.
  Future<List<Log>> getFilteredLogs({
    String module = 'ALL',
    String level = 'ALL',
    DateTime? startDate,
    DateTime? endDate,
    int limit = 500,
  }) {
    final query = select(logs);
    if (module != 'ALL') {
      query.where((t) => t.module.equals(module));
    }
    if (level != 'ALL') {
      query.where((t) => t.level.equals(level));
    }
    if (startDate != null && endDate != null) {
      query.where((t) =>
          t.createdAt.isBiggerOrEqualValue(startDate) &
          t.createdAt.isSmallerOrEqualValue(endDate));
    }
    query
      ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
      ..limit(limit);
    return query.get();
  }
  Future<int> insertLog(LogsCompanion log) => into(logs).insert(log);
  Future<int> deleteOlderThan(DateTime date) =>
      (delete(logs)..where((t) => t.createdAt.isSmallerOrEqualValue(date)))
          .go();
}
