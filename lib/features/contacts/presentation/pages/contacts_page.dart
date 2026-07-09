import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/contact_repository.dart';
import '../../data/contact_repository_impl.dart';
import '../../data/vcard_service.dart';
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
        actions: [
          IconButton(
            icon: const Icon(Icons.upload),
            tooltip: '导入 vCard',
            onPressed: () => _importVCard(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.download),
            tooltip: '导出 vCard',
            onPressed: () => _exportVCard(context, ref),
          ),
        ],
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
              return RepaintBoundary(
                child: ListTile(
                  leading: CircleAvatar(
                    child: Text(contact.displayName.isNotEmpty ? contact.displayName[0] : '?'),
                  ),
                  title: Text(contact.displayName),
                  subtitle: Text(contact.emailAddresses.isNotEmpty ? contact.emailAddresses : '(无邮箱)'),
                  onTap: () => _showEditContactDialog(context, ref, contact),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('加载失败: $e')),
      ),
    );
  }

  Future<void> _exportVCard(BuildContext context, WidgetRef ref) async {
    try {
      final contacts = await ref.read(contactListProvider.future);
      if (contacts.isEmpty) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('没有可导出的联系人')),
          );
        }
        return;
      }
      final vcard = VCardService().exportContacts(contacts);
      final dir = await getApplicationDocumentsDirectory();
      final fileName = 'contacts_${DateTime.now().millisecondsSinceEpoch}.vcf';
      final file = File('${dir.path}/$fileName');
      await file.writeAsString(vcard);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已导出 ${contacts.length} 个联系人到:\n${file.path}')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('导出失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _importVCard(BuildContext context, WidgetRef ref) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['vcf', 'vcard'],
      );
      if (result == null || result.files.single.path == null) return;
      final file = File(result.files.single.path!);
      final content = await file.readAsString();
      final parsed = VCardService().parseVCard(content);
      if (parsed.isEmpty) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('未找到有效的 vCard 联系人')),
          );
        }
        return;
      }

      final repo = ref.read(contactRepositoryProvider);
      final existing = await repo.getAllContacts();
      int imported = 0;
      for (final c in parsed) {
        final duplicate = existing.any(
          (e) => e.displayName == c.displayName && e.emailAddresses == c.emailAddresses,
        );
        if (!duplicate) {
          await repo.createContact(c);
          imported++;
        }
      }
      ref.invalidate(contactListProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已导入 $imported 个联系人')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('导入失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
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
