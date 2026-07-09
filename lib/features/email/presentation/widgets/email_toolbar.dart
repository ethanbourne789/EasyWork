import 'dart:developer' as dev;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/email_sync_service.dart';
import '../../providers/email_providers.dart';
import '../pages/compose_page.dart';
import '../pages/email_accounts_page.dart';
import '../../../contacts/presentation/pages/contacts_page.dart';

class EmailToolbar extends ConsumerWidget {
  // BUG-40: Changed from `int accountId` (required, with -1 sentinel) to
  // `int? accountId` (optional). This parameter was never actually used
  // in the build method, but keeping it optional for future use.
  final int? accountId;

  const EmailToolbar({super.key, this.accountId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = EasyWorkLocalizations.of(context)!;
    final unifiedAsync = ref.watch(unifiedMailboxListProvider);
    final selectedFolder = ref.watch(selectedFolderProvider);
    final accountsAsync = ref.watch(emailAccountListProvider);

    return Container(
      width: 56,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(left: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: unifiedAsync.when(
        data: (folders) {
          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              ...folders.map((folder) {
                final isSelected = folder.key == selectedFolder;
                return _ToolbarIcon(
                  icon: folder.icon,
                  label: folder.displayName,
                  isSelected: isSelected,
                  badge: folder.totalUnseen > 0 ? folder.totalUnseen.toString() : null,
                  onTap: () async {
                    if (folder.key != selectedFolder) {
                      ref.read(selectedFolderProvider.notifier).state = folder.key;
                      final syncService = ref.read(emailSyncServiceProvider);
                      if (syncService != null) {
                        for (final info in folder.accounts) {
                          final ds = ref.read(mailDataSourcesProvider)[info.accountId];
                          if (ds != null) {
                            try {
                              await ds.selectMailboxByPath(info.mailboxPath);
                              await syncService.syncFolder(info.accountId, ds.selectedMailbox!, count: 20);
                            } catch (e) {
    dev.log('选择邮箱文件夹失败: $e', name: 'EmailToolbar');
  }
                          }
                        }
                      }
                      ref.invalidate(unifiedEmailListProvider(folder.key));
                    }
                  },
                );
              }),
              if (folders.isNotEmpty) const Divider(height: 16),
              _ToolbarIcon(
                icon: Icons.refresh,
                label: '刷新',
                onTap: () async {
                  final accounts = ref.read(emailAccountListProvider).valueOrNull;
                  final syncService = ref.read(emailSyncServiceProvider);
                  if (accounts != null && syncService != null) {
                    for (final account in accounts) {
                      await syncService.incrementalSync(account.id!);
                    }
                  }
                  ref.invalidate(unifiedMailboxListProvider);
                  ref.invalidate(unifiedEmailListProvider(ref.read(selectedFolderProvider)));
                },
              ),
              _ToolbarIcon(
                icon: Icons.edit,
                label: loc.email_compose,
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
                label: loc.contact_list,
                onTap: () {
                  // BUG-08: the contacts button was an empty no-op. Navigate.
                  Navigator.push<void>(
                    context,
                    MaterialPageRoute<void>(builder: (_) => const ContactsPage()),
                  );
                },
              ),
              if (accountsAsync.valueOrNull != null &&
                  accountsAsync.valueOrNull!.isNotEmpty)
                const Divider(height: 16),
              ...accountsAsync.when(
                data: (accounts) => accounts.map((a) => _AccountIndicator(
                  color: Color(a.accentColor),
                  label: a.displayName.isNotEmpty
                      ? a.displayName.characters.first
                      : a.email.characters.first.toUpperCase(),
                  tooltip: a.email,
                )),
                loading: () => [const SizedBox.shrink()],
                error: (_, __) => [const SizedBox.shrink()],
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
  final String? badge;
  final VoidCallback onTap;

  const _ToolbarIcon({
    required this.icon,
    required this.label,
    this.isSelected = false,
    this.badge,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      preferBelow: false,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
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
          if (badge != null)
            Positioned(
              top: 2,
              right: 2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.error,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badge!,
                  style: TextStyle(
                    fontSize: 9,
                    color: Theme.of(context).colorScheme.onError,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AccountIndicator extends StatelessWidget {
  final Color color;
  final String label;
  final String tooltip;

  const _AccountIndicator({
    required this.color,
    required this.label,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      preferBelow: false,
      child: Container(
        height: 32,
        alignment: Alignment.center,
        child: Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }
}
