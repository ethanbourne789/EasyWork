import 'package:drift/drift.dart';
import '../app_database.dart';
import 'tasks_table.dart';

part 'tasks_dao.g.dart';

@DriftAccessor(tables: [Tasks])
class TasksDao extends DatabaseAccessor<AppDatabase> with _$TasksDaoMixin {
  TasksDao(AppDatabase db) : super(db);

  Future<List<Task>> getAllTasks() => select(tasks).get();
  Future<List<Task>> getTasksByStatus(String status) =>
      (select(tasks)..where((t) => t.status.equals(status))).get();
  Future<Task?> getTaskById(int id) =>
      (select(tasks)..where((t) => t.id.equals(id))).getSingleOrNull();
  Future<int> insertTask(TasksCompanion task) => into(tasks).insert(task);
  Future<bool> updateTask(TasksCompanion task) =>
      update(tasks).replace(task);
  Future<int> deleteTask(int id) =>
      (delete(tasks)..where((t) => t.id.equals(id))).go();
  Stream<List<Task>> watchAllTasks() => select(tasks).watch();
  Stream<List<Task>> watchTasksByStatus(String status) =>
      (select(tasks)..where((t) => t.status.equals(status))).watch();
}
