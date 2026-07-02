import 'package:drift/drift.dart';
import '../app_database.dart';
import 'note_tags_table.dart';

part 'note_tags_dao.g.dart';

@DriftAccessor(tables: [NoteTags])
class NoteTagsDao extends DatabaseAccessor<AppDatabase>
    with _$NoteTagsDaoMixin {
  NoteTagsDao(AppDatabase db) : super(db);

  Future<List<NoteTag>> getAllTags() => select(noteTags).get();
  Future<int> insertTag(NoteTagsCompanion tag) => into(noteTags).insert(tag);
  Future<bool> updateTag(NoteTagsCompanion tag) =>
      update(noteTags).replace(tag);
  Future<int> deleteTag(int id) =>
      (delete(noteTags)..where((t) => t.id.equals(id))).go();
}
