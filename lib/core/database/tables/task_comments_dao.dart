import 'package:drift/drift.dart';
import '../app_database.dart';
import 'task_comments_table.dart';

part 'task_comments_dao.g.dart';

@DriftAccessor(tables: [TaskComments])
class TaskCommentsDao extends DatabaseAccessor<AppDatabase>
    with _$TaskCommentsDaoMixin {
  TaskCommentsDao(AppDatabase db) : super(db);

  Future<List<TaskComment>> getCommentsByTask(int taskId) =>
      (select(taskComments)..where((t) => t.taskId.equals(taskId))).get();
  Future<int> insertComment(TaskCommentsCompanion comment) =>
      into(taskComments).insert(comment);
  Future<int> deleteCommentsByTask(int taskId) =>
      (delete(taskComments)..where((t) => t.taskId.equals(taskId))).go();
}
