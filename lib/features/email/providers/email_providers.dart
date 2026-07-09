import 'dart:developer' as dev;
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
import '../data/email_sync_logger.dart';
import '../data/email_search_service.dart';
import '../data/attachment_service.dart';
import '../data/email_to_task_service.dart';

final mailDataSourcesProvider =
    StateNotifierProvider<MailDataSourcesNotifier, Map<int, MailDataSource>>(
  (ref) => MailDataSourcesNotifier(ref),
);

final emailRepositoryProvider = Provider<EmailRepository?>((ref) {
final emailsDao = ref.watch(emailsDaoProvider).valueOrNull;
final accountsDao = ref.watch(emailAccountsDaoProvider).valueOrNull;
final mailboxDao = ref.watch(mailboxFoldersDaoProvider).valueOrNull;
final pendingDao = ref.watch(pendingEmailsDaoProvider).valueOrNull;
if (emailsDao == null || accountsDao == null || mailboxDao == null) {
// BUG-12: previously this silently returned null, so every consumer that
// did `if (repo == null) return;` failed with no clue why. Log it.
dev.log(
'emailRepositoryProvider 不可用: emailsDao=${emailsDao == null}, '
'accountsDao=${accountsDao == null}, mailboxDao=${mailboxDao == null}',
name: 'EmailProviders',
);
return null;
}

return EmailRepositoryImpl(
emailsDao,
accountsDao,
ref.watch(mailDataSourcesProvider.notifier),
ref.watch(credentialStoreProvider),
mailboxDao,
pendingEmailsDao: pendingDao,
);
});

final emailAccountListProvider = FutureProvider<List<EmailAccountEntity>>((ref) async {
  final repo = ref.watch(emailRepositoryProvider);
  if (repo == null) return [];
  return repo.getAllAccounts();
});

final localEmailListProvider =
    StreamProvider.family<List<Email>, int>((ref, accountId) {
  final emailsDao = ref.watch(emailsDaoProvider).requireValue;
  return emailsDao.watchEmailsByAccount(accountId);
});

/// Emails for a specific account, filtered by unified folder key at the SQL
/// level. This avoids loading all emails into memory and filtering in Dart.
/// Used by the narrow-layout per-account email list.
final accountFolderEmailListProvider = StreamProvider.family<
    List<Email>, ({int accountId, String folderKey})>((ref, params) {
  final emailsDao = ref.watch(emailsDaoProvider).requireValue;
  return emailsDao.watchEmailsByAccountAndFolderType(
      params.accountId, params.folderKey);
});

/// Unified mailbox list merged across all accounts.
/// Watches the mailbox_folders table — only rebuilds when folders actually change
/// (e.g. during syncMailboxes), not on every individual email write.
final unifiedMailboxListProvider = StreamProvider<List<UnifiedFolder>>((ref) async* {
  final mailboxDao = ref.watch(mailboxFoldersDaoProvider).requireValue;
  yield* mailboxDao.watchAll().asyncMap((allMailboxes) async {
    return MailboxMerger.merge(allMailboxes);
  });
});

/// Selected unified folder key (e.g. "inbox", "项目A").
final selectedFolderProvider = StateProvider<String>((ref) => 'inbox');

/// Emails for the selected unified folder, from all relevant accounts, sorted by time desc.
/// Watches only the relevant folder's emails via a filtered query, NOT watchAllEmails().
final unifiedEmailListProvider = StreamProvider.family<List<Email>, String>((ref, folderKey) async* {
  final emailsDao = ref.watch(emailsDaoProvider).requireValue;
  final mailboxDao = ref.watch(mailboxFoldersDaoProvider).requireValue;

  // Watch mailbox folder changes to know which DB folders map to this unified key.
  yield* mailboxDao.watchAll().asyncMap((allMailboxes) async {
    final merged = MailboxMerger.merge(allMailboxes);
    final folder = merged.where((f) => f.key == folderKey).firstOrNull;
    if (folder == null) return <Email>[];

    final conditions = folder.accounts
        .map((a) => (accountId: a.accountId, folder: a.mailboxPath))
        .toList();

    return emailsDao.getEmailsByAccountIdsAndFolders(conditions);
  });
});

final unreadCountProvider = FutureProvider.family<int, int>((ref, accountId) async {
  final repo = ref.watch(emailRepositoryProvider);
  if (repo == null) return 0;
  return repo.getUnreadCount(accountId);
});

final totalUnreadProvider = FutureProvider<int>((ref) async {
  final accountsAsync = ref.watch(emailAccountListProvider);
  final accounts = accountsAsync.valueOrNull ?? [];
  if (accounts.isEmpty) return 0;

  // Parallelize unread count queries across all accounts instead of
  // awaiting them serially one-by-one.
  final futures = accounts
      .where((a) => a.id != null)
      .map((a) => ref.watch(unreadCountProvider(a.id!).future))
      .toList();
  final counts = await Future.wait(futures);
  return counts.fold<int>(0, (sum, count) => sum + count);
});

final selectedEmailIdProvider = StateProvider<int?>((ref) => null);

final emailSyncLoggerProvider = FutureProvider<EmailSyncLogger>((ref) async {
  final logsDao = await ref.watch(logsDaoProvider.future);
  return EmailSyncLogger(logsDao);
});

// ---------------------------------------------------------------------------
// Service providers — previously instantiated ad-hoc inside widgets
// (`new EmailSearchService(...)` etc.), which broke lifecycle/testability.
// They are now owned by the Riverpod graph so a single instance is shared and
// disposed correctly.
// ---------------------------------------------------------------------------

/// Local FTS5 + server-side IMAP email search.
final emailSearchServiceProvider = Provider<EmailSearchService>((ref) {
  final emailsDao = ref.watch(emailsDaoProvider).requireValue;
  final dataSources = ref.watch(mailDataSourcesProvider.notifier);
  return EmailSearchService(emailsDao, dataSources);
});

/// Attachment download / save / cleanup. Stateless, so no async deps.
final attachmentServiceProvider = Provider<AttachmentService>((ref) => AttachmentService());

/// Convert an email into a task.
final emailToTaskServiceProvider = Provider<EmailToTaskService>((ref) {
  final eventBus = ref.watch(eventBusProvider);
  final tasksDao = ref.watch(tasksDaoProvider).requireValue;
  return EmailToTaskService(eventBus: eventBus, tasksDao: tasksDao);
});
