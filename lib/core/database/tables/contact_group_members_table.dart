import 'package:drift/drift.dart';
import 'contacts_table.dart';
import 'contact_groups_table.dart';

class ContactGroupMembers extends Table {
  IntColumn get contactId => integer().references(Contacts, #id)();
  IntColumn get groupId => integer().references(ContactGroups, #id)();

  @override
  Set<Column> get primaryKey => {contactId, groupId};
}
