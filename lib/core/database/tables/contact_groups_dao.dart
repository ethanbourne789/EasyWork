import 'package:drift/drift.dart';
import '../app_database.dart';
import 'contact_groups_table.dart';

part 'contact_groups_dao.g.dart';

@DriftAccessor(tables: [ContactGroups])
class ContactGroupsDao extends DatabaseAccessor<AppDatabase>
    with _$ContactGroupsDaoMixin {
  ContactGroupsDao(AppDatabase db) : super(db);

  Future<List<ContactGroup>> getAllGroups() => select(contactGroups).get();
  Future<int> insertGroup(ContactGroupsCompanion group) =>
      into(contactGroups).insert(group);
  Future<bool> updateGroup(ContactGroupsCompanion group) =>
      update(contactGroups).replace(group);
  Future<int> deleteGroup(int id) =>
      (delete(contactGroups)..where((t) => t.id.equals(id))).go();
}
