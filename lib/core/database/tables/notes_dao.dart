import 'package:drift/drift.dart';
import '../app_database.dart';
import 'notes_table.dart';

part 'notes_dao.g.dart';

@DriftAccessor(tables: [Notes])
class NotesDao extends DatabaseAccessor<AppDatabase> with _$NotesDaoMixin {
  NotesDao(AppDatabase db) : super(db);

  Future<List<Note>> getAllNotes() => select(notes).get();
  Future<Note?> getNoteById(int id) =>
      (select(notes)..where((t) => t.id.equals(id))).getSingleOrNull();
  Future<int> insertNote(NotesCompanion note) => into(notes).insert(note);
  Future<bool> updateNote(NotesCompanion note) =>
      update(notes).replace(note);
  Future<int> deleteNote(int id) =>
      (delete(notes)..where((t) => t.id.equals(id))).go();
  Stream<List<Note>> watchAllNotes() => select(notes).watch();
}
