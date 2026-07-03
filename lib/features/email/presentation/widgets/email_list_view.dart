import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/email_providers.dart';
import '../../data/email_sync_service.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/utils/date_util.dart';

class EmailListView extends ConsumerStatefulWidget {
  final int accountId;

  const EmailListView({super.key, required this.accountId});

  @override
  ConsumerState<EmailListView> createState() => _EmailListViewState();
}

class _EmailListViewState extends ConsumerState<EmailListView> {
  final _scrollController = ScrollController();
  bool _isLoadingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200 &&
        !_isLoadingMore) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    setState(() => _isLoadingMore = true);
    final syncService = ref.read(emailSyncServiceProvider);
    if (syncService != null) {
      final accounts = ref.read(emailAccountListProvider).valueOrNull ?? [];
      for (final account in accounts) {
        if (account.id != null) {
          await syncService.fetchOlderMessages(account.id!);
        }
      }
      final selectedFolder = ref.read(selectedFolderProvider);
      ref.invalidate(unifiedEmailListProvider(selectedFolder));
    }
    if (mounted) setState(() => _isLoadingMore = false);
  }

  @override
  Widget build(BuildContext context) {
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
            final syncService = ref.read(emailSyncServiceProvider);
            if (syncService != null) {
              final accounts = ref.read(emailAccountListProvider).valueOrNull ?? [];
              for (final account in accounts) {
                if (account.id != null) {
                  await syncService.incrementalSync(account.id!);
                }
              }
            }
            ref.invalidate(unifiedEmailListProvider(selectedFolder));
          },
          child: ListView.builder(
            controller: _scrollController,
            itemCount: emails.length + (_isLoadingMore ? 1 : 0),
            itemBuilder: (context, index) {
              if (index == emails.length) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
                );
              }
              final email = emails[index];
              final subject = email.subject ?? '(无主题)';
              final from = email.fromName ?? email.fromAddress;
              final date = email.receivedAt;
              final isRead = email.isRead;
              final isSelected = ref.watch(selectedEmailIdProvider) == email.id;

              return ListTile(
                selected: isSelected,
                selectedTileColor: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.3),
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
