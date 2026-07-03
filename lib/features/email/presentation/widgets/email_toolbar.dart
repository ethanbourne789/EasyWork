import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/email_providers.dart';
import '../pages/compose_page.dart';
import '../pages/email_accounts_page.dart';

class EmailToolbar extends ConsumerWidget {
  final int accountId;

  const EmailToolbar({super.key, required this.accountId});

  static const Map<String, IconData> _folderIcons = {
    'INBOX': Icons.inbox,
    'Inbox': Icons.inbox,
    'Sent': Icons.send,
    'Sent Messages': Icons.send,
    'Sent Items': Icons.send,
    'Drafts': Icons.drafts,
    'Junk': Icons.report_problem,
    'Junk Email': Icons.report_problem,
    'Spam': Icons.report_problem,
    'Trash': Icons.delete,
    'Deleted Messages': Icons.delete,
    'Deleted Items': Icons.delete,
    'Archive': Icons.archive,
    'All Mail': Icons.all_inbox,
    'Starred': Icons.star,
    'Important': Icons.label_important,
    'Outbox': Icons.outbox,
    '[Gmail]/All Mail': Icons.all_inbox,
    '[Gmail]/Drafts': Icons.drafts,
    '[Gmail]/Important': Icons.label_important,
    '[Gmail]/Junk Mail': Icons.report_problem,
    '[Gmail]/Sent Mail': Icons.send,
    '[Gmail]/Spam': Icons.report_problem,
    '[Gmail]/Starred': Icons.star,
    '[Gmail]/Trash': Icons.delete,
  };

  static const Map<String, String> _folderLabels = {
    'INBOX': '收件箱',
    'Inbox': '收件箱',
    'Sent': '已发送',
    'Sent Messages': '已发送',
    'Sent Items': '已发送',
    'Drafts': '草稿',
    'Junk': '垃圾邮件',
    'Junk Email': '垃圾邮件',
    'Spam': '垃圾邮件',
    'Trash': '已删除',
    'Deleted Messages': '已删除',
    'Deleted Items': '已删除',
    'Archive': '归档',
    'All Mail': '全部邮件',
    'Starred': '星标邮件',
    'Important': '重要邮件',
    'Outbox': '发件箱',
    '[Gmail]/All Mail': '全部邮件',
    '[Gmail]/Drafts': '草稿',
    '[Gmail]/Important': '重要邮件',
    '[Gmail]/Junk Mail': '垃圾邮件',
    '[Gmail]/Sent Mail': '已发送',
    '[Gmail]/Spam': '垃圾邮件',
    '[Gmail]/Starred': '星标',
    '[Gmail]/Trash': '已删除',
  };

  static const _priorityFolders = [
    'INBOX', 'Inbox',
    'Sent', 'Sent Messages', 'Sent Items', 'Outbox',
    'Junk', 'Junk Email', 'Spam',
    '[Gmail]/Junk Mail', '[Gmail]/Spam',
    'Starred', '[Gmail]/Starred',
  ];

  String _translateFolder(String path) {
    return _folderLabels[path] ?? path;
  }

  IconData _folderIcon(String path) {
    return _folderIcons[path] ?? Icons.folder;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mailboxesAsync = ref.watch(mailboxListProvider(accountId));
    final selectedFolder = ref.watch(selectedFolderProvider);

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(left: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: mailboxesAsync.when(
        data: (mailboxes) {
          final priorityItems = <MapEntry<String, IconData>>[];
          final otherItems = <MapEntry<String, IconData>>[];

          for (final mailbox in mailboxes) {
            final entry = MapEntry(mailbox.path, _folderIcon(mailbox.path));
            if (_priorityFolders.contains(mailbox.path) ||
                _priorityFolders.contains(mailbox.name)) {
              priorityItems.add(entry);
            } else {
              otherItems.add(entry);
            }
          }

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  children: [
                    ...priorityItems.map((entry) => _FolderTile(
                      icon: entry.value,
                      label: _translateFolder(entry.key),
                      isSelected: entry.key == selectedFolder,
                      onTap: () {
                        ref.read(selectedFolderProvider.notifier).state = entry.key;
                      },
                    )),
                    if (otherItems.isNotEmpty) ...[
                      const Padding(
                        padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
                        child: Text('其他文件夹', style: TextStyle(fontSize: 11, color: Colors.grey)),
                      ),
                      ...otherItems.map((entry) => _FolderTile(
                        icon: entry.value,
                        label: _translateFolder(entry.key),
                        isSelected: entry.key == selectedFolder,
                        onTap: () {
                          ref.read(selectedFolderProvider.notifier).state = entry.key;
                        },
                      )),
                    ],
                  ],
                ),
              ),
              const Divider(height: 1),
              SafeArea(
                child: Column(
                  children: [
                    _ActionTile(
                      icon: Icons.refresh,
                      label: '刷新',
                      onTap: () {
                        ref.invalidate(localEmailListProvider(accountId));
                      },
                    ),
                    _ActionTile(
                      icon: Icons.edit,
                      label: '写邮件',
                      onTap: () {
                        Navigator.push<void>(
                          context,
                          MaterialPageRoute<void>(builder: (_) => const ComposePage()),
                        );
                      },
                    ),
                    _ActionTile(
                      icon: Icons.settings,
                      label: '账户设置',
                      onTap: () {
                        Navigator.push<void>(
                          context,
                          MaterialPageRoute<void>(builder: (_) => const EmailAccountsPage()),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }
}

class _FolderTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _FolderTile({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: isSelected ? theme.colorScheme.primaryContainer : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 18, color: isSelected ? theme.colorScheme.primary : null),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                    color: isSelected ? theme.colorScheme.primary : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 18),
              const SizedBox(width: 12),
              Text(label, style: const TextStyle(fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }
}
