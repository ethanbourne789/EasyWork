import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/email_account_entity.dart';
import '../../providers/email_providers.dart';
import 'email_account_form_page.dart';

class EmailAccountsPage extends ConsumerWidget {
  const EmailAccountsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = EasyWorkLocalizations.of(context)!;
    final accountsAsync = ref.watch(emailAccountListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(loc.email_accounts),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<Widget>(builder: (_) => const EmailAccountFormPage()),
            ),
          ),
        ],
      ),
      body: accountsAsync.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.mail_outline, size: 64, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  Text('未配置邮箱账户', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  Text('添加邮箱账户以开始使用邮件功能', style: TextStyle(color: Colors.grey[500])),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute<Widget>(builder: (_) => const EmailAccountFormPage()),
                    ),
                    icon: const Icon(Icons.add),
                    label: const Text('添加账户'),
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            itemCount: accounts.length,
            itemBuilder: (context, index) {
              final account = accounts[index];
              return ListTile(
                leading: CircleAvatar(
                  child: Text(account.displayName.isNotEmpty ? account.displayName[0] : '?'),
                ),
                title: Text(account.displayName),
                subtitle: Text(account.email),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit, size: 20),
                      tooltip: loc.common_edit,
                      onPressed: () => Navigator.push<Widget>(
                        context,
                        MaterialPageRoute<Widget>(
                          builder: (_) => EmailAccountFormPage(account: account),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete, size: 20),
                      tooltip: loc.common_delete,
                      onPressed: () => _confirmDelete(context, ref, account),
                    ),
                  ],
                ),
                onTap: () => Navigator.push<Widget>(
                  context,
                  MaterialPageRoute<Widget>(
                    builder: (_) => EmailAccountFormPage(account: account),
                  ),
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

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, EmailAccountEntity account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除邮箱账户「${account.displayName}」吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed == true && account.id != null) {
      try {
        final repo = ref.read(emailRepositoryProvider);
        if (repo == null) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('删除失败: 账户仓库未初始化'), backgroundColor: Colors.red),
            );
          }
          return;
        }
        await repo.deleteAccount(account.id!);
        ref.invalidate(emailAccountListProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('账户已删除')),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('删除失败: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }
}
