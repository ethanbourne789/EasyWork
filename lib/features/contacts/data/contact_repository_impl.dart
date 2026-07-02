import 'package:drift/drift.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/contacts_dao.dart';
import 'contact_repository.dart';
import '../domain/contact_entity.dart';

class ContactRepositoryImpl implements ContactRepository {
  final ContactsDao _contactsDao;

  ContactRepositoryImpl(this._contactsDao);

  @override
  Future<List<ContactEntity>> getAllContacts() async {
    final contacts = await _contactsDao.getAllContacts();
    return contacts.map((c) => ContactEntity(
      id: c.id,
      displayName: c.displayName,
      emailAddresses: c.emailAddresses ?? '',
      phoneNumbers: c.phoneNumbers ?? '',
      organization: c.organization,
      jobTitle: c.jobTitle,
      notes: c.notes,
      createdAt: c.createdAt,
    )).toList();
  }

  @override
  Future<ContactEntity?> getContactById(int id) async {
    final c = await _contactsDao.getContactById(id);
    if (c == null) return null;
    return ContactEntity(
      id: c.id,
      displayName: c.displayName,
      emailAddresses: c.emailAddresses ?? '',
      phoneNumbers: c.phoneNumbers ?? '',
      organization: c.organization,
      jobTitle: c.jobTitle,
      notes: c.notes,
      createdAt: c.createdAt,
    );
  }

  @override
  Future<int> createContact(ContactEntity contact) async {
    return _contactsDao.insertContact(ContactsCompanion(
      displayName: Value(contact.displayName),
      emailAddresses: Value(contact.emailAddresses),
      phoneNumbers: Value(contact.phoneNumbers),
      organization: Value(contact.organization),
      jobTitle: Value(contact.jobTitle),
      notes: Value(contact.notes),
    ));
  }

  @override
  Future<void> updateContact(ContactEntity contact) async {
    await _contactsDao.updateContact(ContactsCompanion(
      id: Value(contact.id!),
      displayName: Value(contact.displayName),
      emailAddresses: Value(contact.emailAddresses),
      phoneNumbers: Value(contact.phoneNumbers),
      organization: Value(contact.organization),
      jobTitle: Value(contact.jobTitle),
      notes: Value(contact.notes),
    ));
  }

  @override
  Future<void> deleteContact(int id) async {
    await _contactsDao.deleteContact(id);
  }

  @override
  Future<List<ContactEntity>> searchContacts(String query) async {
    final all = await getAllContacts();
    final q = query.toLowerCase();
    return all.where((c) =>
      c.displayName.toLowerCase().contains(q) ||
      c.emailAddresses.toLowerCase().contains(q)
    ).toList();
  }
}
