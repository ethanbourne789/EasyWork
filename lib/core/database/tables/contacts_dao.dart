import 'package:drift/drift.dart';
import '../app_database.dart';
import 'contacts_table.dart';

part 'contacts_dao.g.dart';

@DriftAccessor(tables: [Contacts])
class ContactsDao extends DatabaseAccessor<AppDatabase>
    with _$ContactsDaoMixin {
  ContactsDao(AppDatabase db) : super(db);

  Future<List<Contact>> getAllContacts() => select(contacts).get();
  Future<Contact?> getContactById(int id) =>
      (select(contacts)..where((t) => t.id.equals(id))).getSingleOrNull();
  Future<int> insertContact(ContactsCompanion contact) =>
      into(contacts).insert(contact);
  Future<bool> updateContact(ContactsCompanion contact) =>
      update(contacts).replace(contact);
  Future<int> deleteContact(int id) =>
      (delete(contacts)..where((t) => t.id.equals(id))).go();
  Stream<List<Contact>> watchAllContacts() => select(contacts).watch();
}
