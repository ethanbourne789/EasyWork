import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/signature_repository.dart';
import '../../data/signature_repository_impl.dart';
import '../../domain/signature_entity.dart';
import '../../../../core/providers/database_providers.dart';

final signatureRepositoryProvider = Provider<SignatureRepository>((ref) {
  return SignatureRepositoryImpl(ref.watch(emailSignaturesDaoProvider).requireValue);
});

final signatureListProvider = FutureProvider<List<SignatureEntity>>((ref) async {
  final repo = ref.watch(signatureRepositoryProvider);
  return repo.getAllSignatures();
});

class SignaturesPage extends ConsumerWidget {
  const SignaturesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sigsAsync = ref.watch(signatureListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('邮件签名'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddDialog(context, ref),
          ),
        ],
      ),
      body: sigsAsync.when(
        data: (sigs) {
          if (sigs.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.edit_note, size: 64, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  Text('暂无签名', style: TextStyle(color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  Text('创建签名以便在写邮件时自动插入', style: TextStyle(color: Colors.grey[500])),
                ],
              ),
            );
          }
          return ListView.builder(
            itemCount: sigs.length,
            itemBuilder: (context, index) {
              final sig = sigs[index];
              return ListTile(
                title: Text(sig.name),
                subtitle: Text(sig.content, maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: sig.isDefault ? const Chip(label: Text('默认')) : null,
                onTap: () => _showEditDialog(context, ref, sig),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('加载失败: $e')),
      ),
    );
  }

  void _showAddDialog(BuildContext context, WidgetRef ref) {
    final nameController = TextEditingController();
    final contentController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('添加签名'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: '签名名称')),
            TextField(controller: contentController, decoration: const InputDecoration(labelText: '签名内容'), maxLines: 3),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
          TextButton(
            onPressed: () async {
              if (nameController.text.isNotEmpty && contentController.text.isNotEmpty) {
                final repo = ref.read(signatureRepositoryProvider);
                await repo.createSignature(SignatureEntity(
                  name: nameController.text,
                  content: contentController.text,
                ));
                ref.invalidate(signatureListProvider);
                if (context.mounted) Navigator.pop(context);
              }
            },
            child: const Text('保存'),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(BuildContext context, WidgetRef ref, SignatureEntity sig) {
    final nameController = TextEditingController(text: sig.name);
    final contentController = TextEditingController(text: sig.content);

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('编辑签名'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: '签名名称')),
            TextField(controller: contentController, decoration: const InputDecoration(labelText: '签名内容'), maxLines: 3),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              final repo = ref.read(signatureRepositoryProvider);
              await repo.deleteSignature(sig.id!);
              ref.invalidate(signatureListProvider);
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
          TextButton(
            onPressed: () async {
              final repo = ref.read(signatureRepositoryProvider);
              await repo.updateSignature(SignatureEntity(
                id: sig.id,
                name: nameController.text,
                content: contentController.text,
                isDefault: sig.isDefault,
                createdAt: sig.createdAt,
              ));
              ref.invalidate(signatureListProvider);
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('保存'),
          ),
        ],
      ),
    );
  }
}
