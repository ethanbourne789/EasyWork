import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../l10n/app_localizations.dart';
import '../../providers/email_providers.dart';
import '../../data/email_sync_service.dart';
import '../../data/mailbox_merger.dart';
import '../../presentation/pages/compose_page.dart';
import '../../../../core/database/app_database.dart';
import '../../../../core/utils/date_util.dart';

class EmailListView extends ConsumerStatefulWidget {
  // BUG-39: accountId was a leftover parameter that was never used in
  // build() or any method. Removed to keep the API clean.
  const EmailListView({super.key});

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
    final loc = EasyWorkLocalizations.of(context)!;

    return emailsAsync.when(
      data: (emails) {
        if (emails.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.inbox, size: 64, color: Colors.grey[400]),
                const SizedBox(height: 16),
                Text(loc.email_empty, style: TextStyle(color: Colors.grey[600])),
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
              return _EmailListTile(
                email: email,
                selectedFolder: selectedFolder,
              );
            },
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('${loc.common_error}: $e')),
    );
  }
}

/// Individual email list item as a separate ConsumerWidget.
/// This ensures that only the old and new selected items rebuild when
/// [selectedEmailIdProvider] changes, instead of every visible item.
class _EmailListTile extends ConsumerWidget {
  final Email email;
  final String selectedFolder;

  const _EmailListTile({required this.email, required this.selectedFolder});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subject = email.subject ?? '(无主题)';
    final from = email.fromName ?? email.fromAddress;
    final date = email.receivedAt;
    final isRead = email.isRead;
    final isSelected = ref.watch(selectedEmailIdProvider) == email.id;

    return RepaintBoundary(
      child: ListTile(
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
          // BUG-24: If the email is a draft, open compose page for editing.
          final isDraft = MailboxMerger.classifyFolderPath(email.folder) ==
              UnifiedFolderType.drafts;
          if (isDraft) {
            Navigator.push<Widget>(
              context,
              MaterialPageRoute<Widget>(
                builder: (_) => ComposePage(draftEmail: email),
              ),
            ).then((_) => ref.invalidate(unifiedEmailListProvider(selectedFolder)));
            return;
          }
          ref.read(selectedEmailIdProvider.notifier).state = email.id;
        },
      ),
    );
  }
}
