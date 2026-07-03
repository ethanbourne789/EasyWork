import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/email_providers.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/utils/date_util.dart';

class EmailListView extends ConsumerWidget {
  final int accountId;

  const EmailListView({super.key, required this.accountId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedFolder = ref.watch(selectedFolderProvider);
    final emailsAsync = ref.watch(unifiedEmailListProvider(selectedFolder));

    return emailsAsync.when(
      data: (emails) {
        if (emails.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.inbox, size: 64, color: Colors.grey[400]),
                const SizedBox(height: 16),
                Text('暂无邮件', style: TextStyle(color: Colors.grey[600])),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(unifiedEmailListProvider(selectedFolder));
          },
          child: ListView.builder(
            itemCount: emails.length,
            itemBuilder: (context, index) {
              final email = emails[index];
              final subject = email.subject ?? '(无主题)';
              final from = email.fromName ?? email.fromAddress;
              final date = email.receivedAt;
              final isRead = email.isRead;
              final isSelected = ref.watch(selectedEmailIdProvider) == email.id;

              return ListTile(
                selected: isSelected,
                selectedTileColor: Theme.of(context).colorScheme.primaryContainer.withOpacity(0.3),
                leading: CircleAvatar(
                  child: Text(from.isNotEmpty ? from[0].toUpperCase() : '?'),
                ),
                title: Text(
                  subject,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: isRead ? FontWeight.normal : FontWeight.bold,
                  ),
                ),
                subtitle: Text(
                  '$from${date != null ? ' · ${DateUtil.formatRelativeDate(date)}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: !isRead
                    ? Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Color(0xFF1A73E8),
                          shape: BoxShape.circle,
                        ),
                      )
                    : null,
                onTap: () {
                  ref.read(selectedEmailIdProvider.notifier).state = email.id;
                },
              );
            },
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('加载失败: $e')),
    );
  }
}
