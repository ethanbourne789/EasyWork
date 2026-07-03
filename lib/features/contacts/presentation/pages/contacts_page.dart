import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/contact_repository.dart';
import '../../data/contact_repository_impl.dart';
import '../../domain/contact_entity.dart';
import '../../../../core/providers/database_providers.dart';

final contactRepositoryProvider = Provider<ContactRepository>((ref) {
  return ContactRepositoryImpl(ref.watch(contactsDaoProvider).requireValue);
});

final contactListProvider = FutureProvider<List<ContactEntity>>((ref) async {
  final repo = ref.watch(contactRepositoryProvider);
  return repo.getAllContacts();
});

class ContactsPage extends ConsumerWidget {
  const ContactsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = EasyWorkLocalizations.of(context)!;
    final contactsAsync = ref.watch(contactListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(loc.contact_list),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddContactDialog(context, ref),
        child: const Icon(Icons.person_add),
      ),
      body: contactsAsync.when(
        data: (contacts) {
          if (contacts.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.people_outlined, size: 64, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  Text('暂无联系人', style: TextStyle(color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  Text('点击右下角按钮添加第一个联系人', style: TextStyle(color: Colors.grey[500])),
                ],
              ),
            );
          }
          return ListView.builder(
            itemCount: contacts.length,
            itemBuilder: (context, index) {
              final contact = contacts[index];
              return ListTile(
                leading: CircleAvatar(
                  child: Text(contact.displayName.isNotEmpty ? contact.displayName[0] : '?'),
                ),
                title: Text(contact.displayName),
                subtitle: Text(contact.emailAddresses.isNotEmpty ? contact.emailAddresses : '(无邮箱)'),
                onTap: () => _showEditContactDialog(context, ref, contact),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('加载失败: $e')),
      ),
    );
  }

  void _showAddContactDialog(BuildContext context, WidgetRef ref) {
    final loc = EasyWorkLocalizations.of(context)!;
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    final phoneController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('添加联系人'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: '姓名')),
            TextField(controller: emailController, decoration: const InputDecoration(labelText: '邮箱')),
            TextField(controller: phoneController, decoration: const InputDecoration(labelText: '电话')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(loc.common_cancel)),
          TextButton(
            onPressed: () async {
              if (nameController.text.isNotEmpty) {
                final repo = ref.read(contactRepositoryProvider);
                await repo.createContact(ContactEntity(
                  displayName: nameController.text,
                  emailAddresses: emailController.text,
                  phoneNumbers: phoneController.text,
                ));
                ref.invalidate(contactListProvider);
                if (context.mounted) Navigator.pop(context);
              }
            },
            child: Text(loc.common_save),
          ),
        ],
      ),
    );
  }

  void _showEditContactDialog(BuildContext context, WidgetRef ref, ContactEntity contact) {
    final loc = EasyWorkLocalizations.of(context)!;
    final nameController = TextEditingController(text: contact.displayName);
    final emailController = TextEditingController(text: contact.emailAddresses);
    final phoneController = TextEditingController(text: contact.phoneNumbers);

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('编辑联系人'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: '姓名')),
            TextField(controller: emailController, decoration: const InputDecoration(labelText: '邮箱')),
            TextField(controller: phoneController, decoration: const InputDecoration(labelText: '电话')),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              final repo = ref.read(contactRepositoryProvider);
              await repo.deleteContact(contact.id!);
              ref.invalidate(contactListProvider);
              if (context.mounted) Navigator.pop(context);
            },
            child: Text(loc.common_delete, style: const TextStyle(color: Colors.red)),
          ),
          TextButton(onPressed: () => Navigator.pop(context), child: Text(loc.common_cancel)),
          TextButton(
            onPressed: () async {
              final repo = ref.read(contactRepositoryProvider);
              await repo.updateContact(ContactEntity(
                id: contact.id,
                displayName: nameController.text,
                emailAddresses: emailController.text,
                phoneNumbers: phoneController.text,
                createdAt: contact.createdAt,
              ));
              ref.invalidate(contactListProvider);
              if (context.mounted) Navigator.pop(context);
            },
            child: Text(loc.common_save),
          ),
        ],
      ),
    );
  }
}
