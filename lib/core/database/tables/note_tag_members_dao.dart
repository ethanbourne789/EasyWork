import 'package:drift/drift.dart';
import '../app_database.dart';
import 'note_tag_members_table.dart';

part 'note_tag_members_dao.g.dart';

@DriftAccessor(tables: [NoteTagMembers])
class NoteTagMembersDao extends DatabaseAccessor<AppDatabase>
    with _$NoteTagMembersDaoMixin {
  NoteTagMembersDao(AppDatabase db) : super(db);

  Future<List<NoteTagMember>> getMembersByTag(int tagId) =>
      (select(noteTagMembers)..where((t) => t.tagId.equals(tagId))).get();
  Future<List<NoteTagMember>> getMembersByNote(int noteId) =>
      (select(noteTagMembers)..where((t) => t.noteId.equals(noteId))).get();
  Future<int> addMember(NoteTagMembersCompanion member) =>
      into(noteTagMembers).insert(member);
  Future<int> removeMember(int tagId, int noteId) =>
      (delete(noteTagMembers)
            ..where(
                (t) => t.tagId.equals(tagId) & t.noteId.equals(noteId)))
          .go();
}
