import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/providers/event_providers.dart';
import '../../../core/database/app_database.dart';
import '../data/mail_data_source.dart';
import '../data/mail_data_sources_notifier.dart';
import '../data/email_repository.dart';
import '../data/email_repository_impl.dart';
import '../domain/email_account_entity.dart';
import '../data/mime_message_mapper.dart';
import '../data/mailbox_merger.dart';

final mailDataSourcesProvider =
    StateNotifierProvider<MailDataSourcesNotifier, Map<int, MailDataSource>>(
  (ref) => MailDataSourcesNotifier(ref),
);

final emailRepositoryProvider = Provider<EmailRepository?>((ref) {
  final emailsDao = ref.watch(emailsDaoProvider).valueOrNull;
  final accountsDao = ref.watch(emailAccountsDaoProvider).valueOrNull;
  final mailboxDao = ref.watch(mailboxFoldersDaoProvider).valueOrNull;
  if (emailsDao == null || accountsDao == null || mailboxDao == null) return null;

  return EmailRepositoryImpl(
    emailsDao,
    accountsDao,
    ref.watch(mailDataSourcesProvider.notifier),
    ref.watch(credentialStoreProvider),
    mailboxDao,
  );
});

final emailAccountListProvider = FutureProvider<List<EmailAccountEntity>>((ref) async {
  final repo = ref.watch(emailRepositoryProvider);
  if (repo == null) return [];
  return repo.getAllAccounts();
});

final emailListProvider =
    FutureProvider.family<List<MimeMessage>, int>((ref, accountId) async {
  final repo = ref.watch(emailRepositoryProvider);
  if (repo == null) return [];
  return repo.fetchEmails(accountId);
});

final localEmailListProvider =
    StreamProvider.family<List<Email>, int>((ref, accountId) {
  final emailsDao = ref.watch(emailsDaoProvider).requireValue;
  return emailsDao.watchEmailsByAccount(accountId);
});

final localEmailDetailProvider =
    FutureProvider.family<MimeMessage?, int>((ref, localEmailId) async {
  final emailsDao = ref.watch(emailsDaoProvider).requireValue;
  final email = await emailsDao.getEmailById(localEmailId);
  if (email == null) return null;
  return MimeMessageMapper.fromOriginalMessageJson(email.originalMessageJson);
});

/// Unified mailbox list merged across all accounts, read from DB cache.
final unifiedMailboxListProvider = FutureProvider<List<UnifiedFolder>>((ref) async {
  final dao = await ref.watch(mailboxFoldersDaoProvider.future);
  final allMailboxes = await dao.getAll();
  return MailboxMerger.merge(allMailboxes);
});

/// Selected unified folder key (e.g. "inbox", "项目A").
final selectedFolderProvider = StateProvider<String>((ref) => 'inbox');

/// Emails for the selected unified folder, from all relevant accounts, sorted by time desc.
final unifiedEmailListProvider = FutureProvider.family<List<Email>, String>((ref, folderKey) async {
  final mailboxDao = await ref.watch(mailboxFoldersDaoProvider.future);
  final emailsDao = await ref.watch(emailsDaoProvider.future);

  final allMailboxes = await mailboxDao.getAll();
  final merged = MailboxMerger.merge(allMailboxes);
  final folder = merged.where((f) => f.key == folderKey).firstOrNull;
  if (folder == null) return [];

  final conditions = folder.accounts
      .map((a) => (accountId: a.accountId, folder: a.mailboxPath))
      .toList();

  return emailsDao.getEmailsByAccountIdsAndFolders(conditions);
});

final unreadCountProvider = FutureProvider.family<int, int>((ref, accountId) async {
  final repo = ref.watch(emailRepositoryProvider);
  if (repo == null) return 0;
  return repo.getUnreadCount(accountId);
});

final totalUnreadProvider = FutureProvider<int>((ref) async {
  final accountsAsync = ref.watch(emailAccountListProvider);
  final accounts = accountsAsync.valueOrNull ?? [];
  int total = 0;
  for (final account in accounts) {
    if (account.id != null) {
      final count = await ref.watch(unreadCountProvider(account.id!).future);
      total += count;
    }
  }
  return total;
});

final selectedEmailIdProvider = StateProvider<int?>((ref) => null);
