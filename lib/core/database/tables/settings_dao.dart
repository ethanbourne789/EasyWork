import 'package:drift/drift.dart';
import '../app_database.dart';
import 'settings_table.dart';

part 'settings_dao.g.dart';

@DriftAccessor(tables: [Settings])
class SettingsDao extends DatabaseAccessor<AppDatabase>
    with _$SettingsDaoMixin {
  SettingsDao(AppDatabase db) : super(db);

  Future<Setting?> getSetting(String key) =>
      (select(settings)..where((t) => t.key.equals(key)))
          .getSingleOrNull();
  Future<Map<String, String>> getAllSettings() async {
    final rows = await select(settings).get();
    return {for (final row in rows) row.key: row.value};
  }
  Future<int> setSetting(String key, String value) =>
      into(settings).insertOnConflictUpdate(SettingsCompanion(
        key: Value(key),
        value: Value(value),
      ));
  Future<int> deleteSetting(String key) =>
      (delete(settings)..where((t) => t.key.equals(key))).go();
  Stream<Map<String, String>> watchAllSettings() {
    return select(settings).watch().map((rows) {
      return {for (final row in rows) row.key: row.value};
    });
  }
}
