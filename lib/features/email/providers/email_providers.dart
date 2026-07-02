import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/database/app_database.dart';
import '../data/mail_data_source.dart';
import '../data/mail_data_sources_notifier.dart';
import '../data/email_repository.dart';
import '../data/email_repository_impl.dart';
import '../domain/email_account_entity.dart';
import '../data/mime_message_mapper.dart';

final mailDataSourcesProvider =
    StateNotifierProvider<MailDataSourcesNotifier, Map<int, MailDataSource>>(
  (ref) => MailDataSourcesNotifier(ref),
);

final emailRepositoryProvider = Provider<EmailRepository>((ref) {
  return EmailRepositoryImpl(
    ref.watch(emailsDaoProvider).requireValue,
    ref.watch(emailAccountsDaoProvider).requireValue,
    ref.watch(mailDataSourcesProvider.notifier),
  );
});

final emailAccountListProvider = FutureProvider<List<EmailAccountEntity>>((ref) async {
  final repo = ref.watch(emailRepositoryProvider);
  return repo.getAllAccounts();
});

final emailListProvider =
    FutureProvider.family<List<MimeMessage>, int>((ref, accountId) async {
  final repo = ref.watch(emailRepositoryProvider);
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

final mailboxListProvider =
    FutureProvider.family<List<Mailbox>, int>((ref, accountId) async {
  final repo = ref.watch(emailRepositoryProvider);
  return repo.listMailboxes(accountId);
});

final unreadCountProvider = FutureProvider.family<int, int>((ref, accountId) async {
  final repo = ref.watch(emailRepositoryProvider);
  return repo.getUnreadCount(accountId);
});

final totalUnreadProvider = Provider<AsyncValue<int>>((ref) {
  final accountsAsync = ref.watch(emailAccountListProvider);
  return accountsAsync.when(
    data: (accounts) {
      int total = 0;
      for (final account in accounts) {
        final count = ref.watch(unreadCountProvider(account.id!));
        count.whenData((c) => total += c);
      }
      return AsyncData(total);
    },
    loading: () => const AsyncLoading(),
    error: (e, st) => AsyncError(e, st),
  );
});

final selectedEmailIdProvider = StateProvider<int?>((ref) => null);

final selectedFolderProvider = StateProvider<String>((ref) => 'INBOX');
