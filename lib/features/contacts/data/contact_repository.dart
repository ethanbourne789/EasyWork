import '../domain/contact_entity.dart';

abstract class ContactRepository {
  Future<List<ContactEntity>> getAllContacts();
  Future<ContactEntity?> getContactById(int id);
  Future<int> createContact(ContactEntity contact);
  Future<void> updateContact(ContactEntity contact);
  Future<void> deleteContact(int id);
  Future<List<ContactEntity>> searchContacts(String query);
}
