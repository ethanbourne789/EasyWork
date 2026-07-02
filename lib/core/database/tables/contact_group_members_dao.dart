import 'package:drift/drift.dart';
import '../app_database.dart';
import 'contact_group_members_table.dart';

part 'contact_group_members_dao.g.dart';

@DriftAccessor(tables: [ContactGroupMembers])
class ContactGroupMembersDao extends DatabaseAccessor<AppDatabase>
    with _$ContactGroupMembersDaoMixin {
  ContactGroupMembersDao(AppDatabase db) : super(db);

  Future<List<ContactGroupMember>> getMembersByGroup(int groupId) =>
      (select(contactGroupMembers)
            ..where((t) => t.groupId.equals(groupId)))
          .get();
  Future<int> addMember(ContactGroupMembersCompanion member) =>
      into(contactGroupMembers).insert(member);
  Future<int> removeMember(int groupId, int contactId) =>
      (delete(contactGroupMembers)
            ..where((t) =>
                t.groupId.equals(groupId) & t.contactId.equals(contactId)))
          .go();
}
