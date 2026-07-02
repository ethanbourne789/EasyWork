import 'package:drift/drift.dart';
import '../app_database.dart';
import 'accounting_records_table.dart';

part 'accounting_records_dao.g.dart';

@DriftAccessor(tables: [AccountingRecords])
class AccountingRecordsDao extends DatabaseAccessor<AppDatabase>
    with _$AccountingRecordsDaoMixin {
  AccountingRecordsDao(AppDatabase db) : super(db);

  Future<List<AccountingRecord>> getAllRecords() =>
      select(accountingRecords).get();
  Future<List<AccountingRecord>> getRecordsByDateRange(
          DateTime start, DateTime end) =>
      (select(accountingRecords)
            ..where((t) =>
                t.recordDate.isBiggerOrEqualValue(start) &
                t.recordDate.isSmallerOrEqualValue(end)))
          .get();
  Future<AccountingRecord?> getRecordById(int id) =>
      (select(accountingRecords)..where((t) => t.id.equals(id)))
          .getSingleOrNull();
  Future<int> insertRecord(AccountingRecordsCompanion record) =>
      into(accountingRecords).insert(record);
  Future<bool> updateRecord(AccountingRecordsCompanion record) =>
      update(accountingRecords).replace(record);
  Future<int> deleteRecord(int id) =>
      (delete(accountingRecords)..where((t) => t.id.equals(id))).go();
  Stream<List<AccountingRecord>> watchAllRecords() =>
      select(accountingRecords).watch();
}
