import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../features/email/providers/email_providers.dart';
import '../../../features/email/domain/email_account_entity.dart';
import '../../../features/email/presentation/pages/email_accounts_page.dart';
import '../../../features/email/presentation/pages/email_detail_page.dart';
import '../../../features/email/presentation/pages/compose_page.dart';
import '../../../features/email/presentation/widgets/email_list_view.dart';
import '../../../features/email/presentation/widgets/email_detail_view.dart';
import '../../../features/email/presentation/widgets/email_toolbar.dart';
import '../../../features/email/data/mime_message_mapper.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/utils/date_util.dart';

class EmailListPage extends ConsumerStatefulWidget {
  const EmailListPage({super.key});

  @override
  ConsumerState<EmailListPage> createState() => _EmailListPageState();
}

class _EmailListPageState extends ConsumerState<EmailListPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoSelectFirstEmail());
  }

  Future<void> _autoSelectFirstEmail() async {
    try {
      final accounts = await ref.read(emailAccountListProvider.future);
      if (accounts.isEmpty) return;
      final accountId = accounts.first.id!;
      final emailsDao = await ref.read(emailsDaoProvider.future);
      final emails = await emailsDao.getEmailsByAccount(accountId);
      if (emails.isNotEmpty && mounted) {
        ref.read(selectedEmailIdProvider.notifier).state = emails.first.id;
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width > 600;
    final accountsAsync = ref.watch(emailAccountListProvider);

    if (isWide) {
      return _buildWideLayout(accountsAsync);
    } else {
      return _buildNarrowLayout(accountsAsync);
    }
  }

  Widget _buildWideLayout(AsyncValue<List<EmailAccountEntity>> accountsAsync) {
    return Scaffold(
      body: accountsAsync.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return _buildEmptyState(context);
          }
          final accountId = accounts.first.id!;
          return Row(
            children: [
              Expanded(
                flex: 1,
                child: EmailListView(accountId: accountId),
              ),
              VerticalDivider(width: 1),
              Expanded(
                flex: 3,
                child: EmailDetailView(accountId: accountId),
              ),
              VerticalDivider(width: 1),
              SizedBox(
                width: 200,
                child: EmailToolbar(accountId: accountId),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('加载失败: $e')),
      ),
    );
  }

  Widget _buildNarrowLayout(AsyncValue<List<EmailAccountEntity>> accountsAsync) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('邮件'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) => _handleNarrowMenuAction(context, value),
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'inbox', child: ListTile(leading: Icon(Icons.inbox), title: Text('收件箱'), dense: true)),
              const PopupMenuItem(value: 'refresh', child: ListTile(leading: Icon(Icons.refresh), title: Text('刷新'), dense: true)),
              const PopupMenuItem(value: 'compose', child: ListTile(leading: Icon(Icons.edit), title: Text('写邮件'), dense: true)),
              const PopupMenuItem(value: 'settings', child: ListTile(leading: Icon(Icons.settings), title: Text('账户设置'), dense: true)),
              const PopupMenuItem(value: 'contacts', child: ListTile(leading: Icon(Icons.contacts), title: Text('通讯录'), dense: true)),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push<void>(
          context,
          MaterialPageRoute<void>(builder: (_) => const ComposePage()),
        ),
        child: const Icon(Icons.edit),
      ),
      body: accountsAsync.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return _buildEmptyState(context);
          }
          return _EmailTabs(accounts: accounts);
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('加载失败: $e')),
      ),
    );
  }

  void _handleNarrowMenuAction(BuildContext context, String value) {
    switch (value) {
      case 'compose':
        Navigator.push<void>(context, MaterialPageRoute<void>(builder: (_) => const ComposePage()));
      case 'settings':
        Navigator.push<void>(context, MaterialPageRoute<void>(builder: (_) => const EmailAccountsPage()));
      case 'refresh':
        final accounts = ref.read(emailAccountListProvider).valueOrNull;
        if (accounts != null && accounts.isNotEmpty) {
          ref.invalidate(localEmailListProvider(accounts.first.id!));
        }
      case 'inbox':
        ref.read(selectedFolderProvider.notifier).state = 'INBOX';
    }
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.mail_outline, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text('未配置邮箱账户', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.grey[600])),
          const SizedBox(height: 8),
          Text('请先在设置中添加邮箱账户', style: TextStyle(color: Colors.grey[500])),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => Navigator.push<Widget>(context, MaterialPageRoute<Widget>(builder: (_) => const EmailAccountsPage())),
            icon: const Icon(Icons.add),
            label: const Text('添加账户'),
          ),
        ],
      ),
    );
  }
}

class _EmailTabs extends ConsumerWidget {
  final List<EmailAccountEntity> accounts;

  const _EmailTabs({required this.accounts});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: accounts.length,
      child: Column(
        children: [
          if (accounts.length > 1)
            TabBar(
              tabs: accounts.map((a) => Tab(text: a.displayName)).toList(),
              isScrollable: true,
            ),
          Expanded(
            child: TabBarView(
              children: accounts.map((account) {
                return _NarrowEmailFolderList(accountId: account.id!);
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _NarrowEmailFolderList extends ConsumerStatefulWidget {
  final int accountId;

  const _NarrowEmailFolderList({required this.accountId});

  @override
  ConsumerState<_NarrowEmailFolderList> createState() => _NarrowEmailFolderListState();
}

class _NarrowEmailFolderListState extends ConsumerState<_NarrowEmailFolderList> {
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
    'Scheduled': '定时发送',
    'Outbox': '发件箱',
    'Notes': '邮件笔记',
    'Personal': '个人',
    'Receipts': '收据',
    'Travel': '旅行',
    '[Gmail]/All Mail': '全部邮件',
    '[Gmail]/Drafts': '草稿',
    '[Gmail]/Important': '重要邮件',
    '[Gmail]/Junk Mail': '垃圾邮件',
    '[Gmail]/Sent Mail': '已发送',
    '[Gmail]/Spam': '垃圾邮件',
    '[Gmail]/Starred': '星标',
    '[Gmail]/Trash': '已删除',
  };

  String _translateFolderName(String name, String path) {
    return _folderLabels[path] ?? _folderLabels[name] ?? name;
  }

  @override
  Widget build(BuildContext context) {
    final selectedFolder = ref.watch(selectedFolderProvider);
    final mailboxesAsync = ref.watch(mailboxListProvider(widget.accountId));
    final emailsAsync = ref.watch(localEmailListProvider(widget.accountId));

    return Column(
      children: [
        mailboxesAsync.when(
          data: (mailboxes) {
            if (mailboxes.isEmpty) return const SizedBox.shrink();
            return SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                children: mailboxes.map((mailbox) {
                  final isSelected = mailbox.path == selectedFolder;
                  final label = _translateFolderName(mailbox.name, mailbox.path);
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: FilterChip(
                      label: Text(label, style: const TextStyle(fontSize: 12)),
                      selected: isSelected,
                      onSelected: (_) {
                        ref.read(selectedFolderProvider.notifier).state = mailbox.path;
                      },
                      selectedColor: Theme.of(context).colorScheme.primaryContainer,
                      visualDensity: VisualDensity.compact,
                    ),
                  );
                }).toList(),
              ),
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
        Expanded(
          child: emailsAsync.when(
            data: (emails) {
              final filtered = emails.where((e) => e.folder == selectedFolder).toList();
              if (filtered.isEmpty) {
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
                  ref.invalidate(localEmailListProvider(widget.accountId));
                },
                child: ListView.builder(
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final email = filtered[index];
                    final subject = email.subject ?? '(无主题)';
                    final from = email.fromName ?? email.fromAddress;
                    final date = email.receivedAt;
                    final isRead = email.isRead;

                    return ListTile(
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
                      onTap: () async {
                        final mimeMessage = MimeMessageMapper.fromOriginalMessageJson(
                          email.originalMessageJson,
                        );
                        if (mounted) {
                          Navigator.push<Widget>(
                            context,
                            MaterialPageRoute<Widget>(
                              builder: (_) => EmailDetailPage(
                                message: mimeMessage,
                                localEmailId: email.id,
                                accountId: widget.accountId,
                              ),
                            ),
                          );
                        }
                      },
                    );
                  },
                ),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, st) => Center(child: Text('加载失败: $e')),
          ),
        ),
      ],
    );
  }
}
