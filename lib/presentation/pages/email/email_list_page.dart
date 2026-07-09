import 'dart:developer' as dev;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/database/app_database.dart';
import '../../../features/email/providers/email_providers.dart';
import '../../../features/email/data/email_sync_service.dart';
import '../../../features/email/domain/email_account_entity.dart';
import '../../../features/email/presentation/pages/email_accounts_page.dart';
import '../../../features/email/presentation/pages/email_account_form_page.dart';
import '../../../features/email/presentation/pages/email_detail_page.dart';
import '../../../features/email/presentation/pages/compose_page.dart';
import '../../../features/email/presentation/widgets/email_detail_view.dart';
import '../../../features/email/data/mime_message_mapper.dart';
import '../../../features/email/data/mailbox_merger.dart';
import '../../../features/email/presentation/widgets/email_list_view.dart';
import '../../../features/email/presentation/widgets/email_toolbar.dart';
import '../../../features/email/presentation/widgets/email_search_bar.dart';
import '../../../features/contacts/presentation/pages/contacts_page.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/utils/date_util.dart';

class EmailListPage extends ConsumerStatefulWidget {
  const EmailListPage({super.key});

  @override
  ConsumerState<EmailListPage> createState() => _EmailListPageState();
}

class _EmailListPageState extends ConsumerState<EmailListPage> {
  // Search state shared between wide (left column) and narrow (app bar) layouts.
  String _searchQuery = '';
  bool _isSearching = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoSelectFirstEmail());
  }

  Future<void> _autoSelectFirstEmail() async {
    try {
      // BUG-26: Use unified inbox instead of only the first account's INBOX.
      final selectedFolder = ref.read(selectedFolderProvider);
      final emails = await ref.read(unifiedEmailListProvider(selectedFolder).future);
      if (emails.isNotEmpty && mounted) {
        ref.read(selectedEmailIdProvider.notifier).state = emails.first.id;
      }
    } catch (e) {
      // BUG-30: Log the error instead of silently swallowing it.
      dev.log('自动选择第一封邮件失败: $e', name: 'EmailListPage');
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = EasyWorkLocalizations.of(context)!;
    final isWide = MediaQuery.of(context).size.width > 600;
    final accountsAsync = ref.watch(emailAccountListProvider);

    if (isWide) {
      return _buildWideLayout(accountsAsync);
    } else {
      return _buildNarrowLayout(accountsAsync);
    }
  }

  Widget _buildWideLayout(AsyncValue<List<EmailAccountEntity>> accountsAsync) {
    final loc = EasyWorkLocalizations.of(context)!;
    return Scaffold(
      body: accountsAsync.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return _buildEmptyState(context);
          }
          return Row(
            children: [
              Expanded(
                flex: 1,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: EmailSearchBar(
                        hintText: loc.common_search,
                        onSearch: (q) => setState(() => _searchQuery = q),
                      ),
                    ),
                    Expanded(
                      child: _searchQuery.trim().isEmpty
                          ? const EmailListView()
                          : _EmailSearchView(
                              accountIds: accounts.map((a) => a.id!).toList(),
                              query: _searchQuery,
                              onResultTap: (email) {
                                ref.read(selectedEmailIdProvider.notifier).state = email.id;
                              },
                            ),
                    ),
                  ],
                ),
              ),
              VerticalDivider(width: 1),
              Expanded(
                flex: 3,
                child: EmailDetailView(),
              ),
              VerticalDivider(width: 1),
              SizedBox(
                width: 56,
                child: EmailToolbar(),
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
    final loc = EasyWorkLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        leading: _isSearching
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() {
                  _isSearching = false;
                  _searchQuery = '';
                }),
              )
            : null,
        title: _isSearching
            ? EmailSearchBar(
                hintText: loc.common_search,
                onSearch: (q) => setState(() => _searchQuery = q),
              )
            : const Text('邮件'),
        actions: [
          if (!_isSearching)
            IconButton(
              icon: const Icon(Icons.search),
              tooltip: loc.common_search,
              onPressed: () => setState(() => _isSearching = true),
            ),
          if (!_isSearching)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (value) => _handleNarrowMenuAction(context, value),
              itemBuilder: (context) => [
                PopupMenuItem(value: 'inbox', child: ListTile(leading: Icon(Icons.inbox), title: Text(loc.email_inbox), dense: true)),
                const PopupMenuItem(value: 'refresh', child: ListTile(leading: Icon(Icons.refresh), title: Text('刷新'), dense: true)),
                PopupMenuItem(value: 'compose', child: ListTile(leading: Icon(Icons.edit), title: Text(loc.email_compose), dense: true)),
                const PopupMenuItem(value: 'settings', child: ListTile(leading: Icon(Icons.settings), title: Text('账户设置'), dense: true)),
                PopupMenuItem(value: 'contacts', child: ListTile(leading: Icon(Icons.contacts), title: Text(loc.contact_list), dense: true)),
              ],
            ),
        ],
      ),
      floatingActionButton: _isSearching
          ? null
          : FloatingActionButton(
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
          if (_isSearching && _searchQuery.trim().isNotEmpty) {
            return _EmailSearchView(
              accountIds: accounts.map((a) => a.id!).toList(),
              query: _searchQuery,
              onResultTap: (email) {
                Navigator.push<Widget>(
                  context,
                  MaterialPageRoute<Widget>(
                    builder: (_) => EmailDetailPage(
                      localEmailId: email.id,
                      accountId: email.accountId,
                    ),
                  ),
                );
              },
            );
          }
          return Column(
            children: [
              // BUG-13: narrow screens had no folder switcher. This chip row
              // lets the user switch the active unified folder (inbox, sent,
              // starred, etc.) on small screens.
              _NarrowFolderSelector(),
              Expanded(child: _EmailTabs(accounts: accounts)),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('加载失败: $e')),
      ),
    );
  }

  Future<void> _handleNarrowMenuAction(BuildContext context, String value) async {
    switch (value) {
      case 'compose':
        Navigator.push<void>(context, MaterialPageRoute<void>(builder: (_) => const ComposePage()));
      case 'settings':
        Navigator.push<void>(context, MaterialPageRoute<void>(builder: (_) => const EmailAccountsPage()));
      case 'refresh':
        final accounts = ref.read(emailAccountListProvider).valueOrNull;
        final syncService = ref.read(emailSyncServiceProvider);
        if (accounts != null && syncService != null) {
          for (final account in accounts) {
            await syncService.incrementalSync(account.id!);
          }
          ref.invalidate(accountFolderEmailListProvider((accountId: accounts.first.id!, folderKey: ref.read(selectedFolderProvider))));
          ref.invalidate(unifiedMailboxListProvider);
          ref.invalidate(unifiedEmailListProvider(ref.read(selectedFolderProvider)));
        }
      case 'inbox':
        ref.read(selectedFolderProvider.notifier).state = 'inbox';
      case 'contacts':
        // BUG-08: the contacts button/narrow menu item was a no-op. Navigate.
        Navigator.push<void>(
          context,
          MaterialPageRoute<void>(builder: (_) => const ContactsPage()),
        );
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
            onPressed: () => Navigator.push<Widget>(context, MaterialPageRoute<Widget>(builder: (_) => const EmailAccountFormPage())).then((_) => ref.invalidate(emailAccountListProvider)),
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
                return _EmailFolderList(accountId: account.id!);
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _NarrowFolderSelector extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedFolder = ref.watch(selectedFolderProvider);
    final unifiedAsync = ref.watch(unifiedMailboxListProvider);
    return unifiedAsync.when(
      data: (folders) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          children: folders.map((f) {
            final isSelected = f.key == selectedFolder;
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: ChoiceChip(
                label: Text(f.displayName),
                selected: isSelected,
                onSelected: (_) => ref.read(selectedFolderProvider.notifier).state = f.key,
              ),
            );
          }).toList(),
        ),
      ),
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

/// Local FTS5 + server-side IMAP search results view (wired into both layouts).
class _EmailSearchView extends ConsumerStatefulWidget {
  final List<int> accountIds;
  final String query;
  final void Function(Email email) onResultTap;

  const _EmailSearchView({
    required this.accountIds,
    required this.query,
    required this.onResultTap,
  });

  @override
  ConsumerState<_EmailSearchView> createState() => _EmailSearchViewState();
}
class _EmailSearchViewState extends ConsumerState<_EmailSearchView> {
  /// Server results paired with their originating account ID.
  List<({int accountId, MimeMessage message})> _serverResults = const [];
  bool _searchingServer = false;

  /// Cached local search Future — avoids re-running the search on every build.
  Future<List<Email>>? _localSearchFuture;
  String? _cachedQuery;

  Future<List<Email>> _localSearch() async {
    final service = ref.read(emailSearchServiceProvider);
    final out = <Email>[];
    for (final id in widget.accountIds) {
      out.addAll(await service.searchLocal(widget.query, accountId: id));
    }
    return out;
  }

  /// Returns a cached Future for the local search, only re-creating it when
  /// the query actually changes.
  Future<List<Email>> _getLocalSearchFuture() {
    if (_cachedQuery == widget.query && _localSearchFuture != null) {
      return _localSearchFuture!;
    }
    _cachedQuery = widget.query;
    _localSearchFuture = _localSearch();
    return _localSearchFuture!;
  }

  Future<void> _searchServer() async {
    setState(() => _searchingServer = true);
    try {
      final service = ref.read(emailSearchServiceProvider);
      final out = <({int accountId, MimeMessage message})>[];
      for (final id in widget.accountIds) {
        final results = await service.searchServer(id, widget.query);
        for (final m in results) {
          out.add((accountId: id, message: m));
        }
      }
      if (mounted) setState(() => _serverResults = out);
    } finally {
      if (mounted) setState(() => _searchingServer = false);
    }
  }

  /// Persist a server-side [MimeMessage] to the local DB, then open it.
  Future<void> _persistAndOpenServerResult(
      ({int accountId, MimeMessage message}) item) async {
    try {
      final emailsDao = await ref.read(emailsDaoProvider.future);
      final companion = MimeMessageMapper.toCompanion(
        item.message,
        item.accountId,
      );
      await emailsDao.upsertEmail(companion);
      // P1-8: Use findByMessageId instead of loading all emails for the account.
      final messageId = item.message.decodeHeaderValue('message-id');
      if (messageId != null && messageId.isNotEmpty) {
        final match = await emailsDao.findByMessageId(messageId, accountId: item.accountId);
        if (match != null) {
          if (mounted) widget.onResultTap(match);
        } else {
          // Fallback: if not found by messageId, try the first email.
          final emails = await emailsDao.getEmailsByAccount(item.accountId);
          if (emails.isNotEmpty && mounted) {
            widget.onResultTap(emails.first);
          }
        }
      }
    } catch (e) {
      dev.log('持久化服务器搜索结果失败: $e', name: 'EmailListPage');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('打开邮件失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            children: [
              _searchingServer
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : TextButton.icon(
                      icon: const Icon(Icons.cloud, size: 16),
                      label: const Text('搜索服务器'),
                      onPressed: widget.query.trim().isEmpty ? null : _searchServer,
                    ),
              const Spacer(),
              Text(
                '本地 FTS5',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Email>>(
            future: _getLocalSearchFuture(),
            builder: (context, snapshot) {
              final local = snapshot.data ?? [];
              final server = _serverResults;
              if (local.isEmpty && server.isEmpty && !_searchingServer) {
                return const Center(child: Text('无匹配邮件'));
              }
              // Build a flat list of items for lazy rendering via ListView.builder.
              final itemCount = local.length +
                  (server.isNotEmpty ? 2 + server.length : 0); // +2 for divider + header
              return ListView.builder(
                itemCount: itemCount,
                itemBuilder: (context, index) {
                  if (index < local.length) {
                    final email = local[index];
                    return ListTile(
                      title: Text(email.subject ?? '(无主题)'),
                      subtitle: Text(email.fromName ?? email.fromAddress),
                      onTap: () => widget.onResultTap(email),
                    );
                  }
                  final serverIndex = index - local.length;
                  if (serverIndex == 0) return const Divider();
                  if (serverIndex == 1) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      child: Text(
                        '服务器端 (${server.length})',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    );
                  }
                  final item = server[serverIndex - 2];
                  return ListTile(
                    leading: const Icon(Icons.cloud, size: 16),
                    title: Text(item.message.decodeSubject() ?? '(无主题)'),
                    subtitle: Text(item.message.from?.first.toString() ?? ''),
                    onTap: () => _persistAndOpenServerResult(item),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Per-account email list with folder filtering, pagination, and pull-to-refresh.
/// Used by both wide and narrow layouts (BUG-29: renamed from
/// _NarrowEmailFolderList to _EmailFolderList for accuracy).
class _EmailFolderList extends ConsumerStatefulWidget {
  final int accountId;

  const _EmailFolderList({required this.accountId});

  @override
  ConsumerState<_EmailFolderList> createState() => _EmailFolderListState();
}

class _EmailFolderListState extends ConsumerState<_EmailFolderList> {
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
      await syncService.fetchOlderMessages(widget.accountId);
      ref.invalidate(accountFolderEmailListProvider((accountId: widget.accountId, folderKey: ref.read(selectedFolderProvider))));
    }
    if (mounted) setState(() => _isLoadingMore = false);
  }

  @override
  Widget build(BuildContext context) {
    final selectedFolder = ref.watch(selectedFolderProvider);

    // SQL-level filtered stream — avoids loading all emails into memory.
    final emailsAsync = ref.watch(
        accountFolderEmailListProvider(
            (accountId: widget.accountId, folderKey: selectedFolder)));

    return Column(
      children: [
        Expanded(
          child: emailsAsync.when(
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
                    await syncService.incrementalSync(widget.accountId);
                  }
                  ref.invalidate(accountFolderEmailListProvider(
                      (accountId: widget.accountId, folderKey: selectedFolder)));
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

                    return RepaintBoundary(
                      child: Row(
                      children: [
                        Expanded(
                          child: ListTile(
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
                              // BUG-24: If the email is a draft, open the
                              // compose page for editing instead of the detail view.
                              final isDraft = MailboxMerger.classifyFolderPath(email.folder) ==
                                  UnifiedFolderType.drafts;
                              if (isDraft) {
                                Navigator.push<Widget>(
                                  context,
                                  MaterialPageRoute<Widget>(
                                    builder: (_) => ComposePage(draftEmail: email),
                                  ),
                                ).then((_) => ref.invalidate(accountFolderEmailListProvider((accountId: widget.accountId, folderKey: ref.read(selectedFolderProvider)))));
                                return;
                              }
                              // In wide layout, update the detail view in-place.
                              // In narrow layout, navigate to a full-screen detail page.
                              final isWide = MediaQuery.of(context).size.width > 600;
                              if (isWide) {
                                ref.read(selectedEmailIdProvider.notifier).state = email.id;
                              } else {
                                Navigator.push<Widget>(
                                  context,
                                  MaterialPageRoute<Widget>(
                                    builder: (_) => EmailDetailPage(
                                      localEmailId: email.id,
                                      accountId: widget.accountId,
                                    ),
                                  ),
                                );
                              }
                            },
                          ),
                        ),
                        Consumer(builder: (context, ref, _) {
                          final accounts = ref.watch(emailAccountListProvider).valueOrNull ?? [];
                          final accountColorMap = {for (final a in accounts) a.id!: Color(a.accentColor)};
                          return Container(
                            width: 4,
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            decoration: BoxDecoration(
                              color: accountColorMap[email.accountId] ?? Colors.grey,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          );
                        }),
                      ],
                    ),);
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
