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
    '[Gmail]/All Mail': '全部邮件',
    '[Gmail]/Drafts': '草稿',
    '[Gmail]/Important': '重要邮件',
    '[Gmail]/Junk Mail': '垃圾邮件',
    '[Gmail]/Sent Mail': '已发送',
    '[Gmail]/Spam': '垃圾邮件',
    '[Gmail]/Starred': '星标',
    '[Gmail]/Trash': '已删除',
  };

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
      width: 56,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(left: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: mailboxesAsync.when(
        data: (mailboxes) {
          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              // Folder items
              ...mailboxes.map((mailbox) {
                final isSelected = mailbox.path == selectedFolder;
                final label = _translateFolder(mailbox.path);
                return _ToolbarIcon(
                  icon: _folderIcon(mailbox.path),
                  label: label,
                  isSelected: isSelected,
                  onTap: () {
                    ref.read(selectedFolderProvider.notifier).state = mailbox.path;
                  },
                );
              }),
              if (mailboxes.isNotEmpty) const Divider(height: 16),
              // Action items
              _ToolbarIcon(
                icon: Icons.refresh,
                label: '刷新',
                onTap: () {
                  ref.invalidate(localEmailListProvider(accountId));
                },
              ),
              _ToolbarIcon(
                icon: Icons.edit,
                label: '写邮件',
                onTap: () {
                  Navigator.push<void>(
                    context,
                    MaterialPageRoute<void>(builder: (_) => const ComposePage()),
                  );
                },
              ),
              _ToolbarIcon(
                icon: Icons.settings,
                label: '账户设置',
                onTap: () {
                  Navigator.push<void>(
                    context,
                    MaterialPageRoute<void>(builder: (_) => const EmailAccountsPage()),
                  );
                },
              ),
              _ToolbarIcon(
                icon: Icons.contacts,
                label: '通讯录',
                onTap: () {},
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

class _ToolbarIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _ToolbarIcon({
    required this.icon,
    required this.label,
    this.isSelected = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      preferBelow: false,
      child: Container(
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? Theme.of(context).colorScheme.primaryContainer : null,
          borderRadius: BorderRadius.circular(8),
        ),
        child: IconButton(
          icon: Icon(icon, size: 20),
          color: isSelected ? Theme.of(context).colorScheme.primary : null,
          onPressed: onTap,
          tooltip: label,
        ),
      ),
    );
  }
}
