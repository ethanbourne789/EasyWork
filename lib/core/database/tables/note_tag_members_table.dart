import 'package:drift/drift.dart';
import 'notes_table.dart';
import 'note_tags_table.dart';

class NoteTagMembers extends Table {
  IntColumn get noteId => integer().references(Notes, #id)();
  IntColumn get tagId => integer().references(NoteTags, #id)();

  @override
  Set<Column> get primaryKey => {noteId, tagId};
}
