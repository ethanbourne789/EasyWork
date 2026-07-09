import 'package:enough_mail/enough_mail.dart';
import '../domain/email_account_entity.dart';

abstract class EmailRepository {
  // --- Account management ---
  Future<List<EmailAccountEntity>> getAllAccounts();
  Future<EmailAccountEntity?> getAccountById(int id);
  Future<int> createAccount(EmailAccountEntity account);
  Future<void> updateAccount(EmailAccountEntity account);
  Future<void> deleteAccount(int id);

  // --- Email operations ---
  Future<List<MimeMessage>> fetchEmails(int accountId, {int count = 30});
  Future<MimeMessage?> fetchFullEmail(int accountId, MimeMessage envelope);
  Future<void> sendEmail(int accountId, MimeMessage message);
  Future<void> sendEmailBuilder(int accountId, MessageBuilder messageBuilder);
  Future<int> getUnreadCount(int accountId);

  // --- Pending emails (offline sending queue) ---
  /// Retry sending all pending emails. Returns the number successfully sent.
  Future<int> retryPendingEmails();

  // --- Pagination ---
  Future<List<MimeMessage>> fetchNextPage(int accountId, PagedMessageResult pagedResult);
  Future<List<MimeMessage>> fetchMessagesNextPage(int accountId, PagedMessageSequence pagedSequence);

  // --- Flag operations ---
  Future<void> markAsRead(int accountId, MimeMessage message);
  Future<void> markAsUnread(int accountId, MimeMessage message);
  Future<void> markAsFlagged(int accountId, MimeMessage message);
  Future<void> markAsUnflagged(int accountId, MimeMessage message);
  Future<void> markAsAnswered(int accountId, MimeMessage message);
  Future<void> markAsForwarded(int accountId, MimeMessage message);
  Future<void> markAsDeleted(int accountId, MimeMessage message);
  Future<void> markAsUndeleted(int accountId, MimeMessage message);
  Future<void> markAsUnanswered(int accountId, MimeMessage message);
  Future<void> markAsUnforwarded(int accountId, MimeMessage message);

  // --- Move / Delete ---
  Future<void> deleteEmail(int accountId, MimeMessage message, {bool expunge});
  Future<void> moveToTrash(int accountId, MimeMessage message);
  Future<void> moveToFolder(int accountId, MimeMessage message, Mailbox target);
  Future<void> moveToInbox(int accountId, MimeMessage message);

  // --- Mailbox management ---
  Future<List<Mailbox>> listMailboxes(int accountId);
  Future<void> syncMailboxes(int accountId);
  Future<void> selectMailbox(int accountId, Mailbox mailbox);
  Future<void> createMailbox(int accountId, String mailboxPath);
  Future<void> deleteMailbox(int accountId, String mailboxPath);
  Future<bool> supportsMailboxes(int accountId);
  Future<bool> supportsThreading(int accountId);
  Future<List<Mailbox>?> getMailboxesCache(int accountId);

  // --- Connection recovery ---
  Future<void> reconnect(int accountId, {String? password});
  Future<bool> isPolling(int accountId);

  // --- Advanced batch operations ---
  Future<void> moveMessagesToInbox(int accountId, MessageSequence sequence, String targetMailboxPath);
  Future<void> moveMessagesToFlag(int accountId, MessageSequence sequence, String flag);
  Future<void> junkMessages(int accountId, MessageSequence sequence);
  Future<void> appendMessage(int accountId, MimeMessage message, String mailboxPath);
  Future<void> deleteAllMessages(int accountId, String mailboxPath, {bool expunge});

  // --- MimeMessage helpers ---
  String? getPlainContent(MimeMessage message);
  String? getHtmlContent(MimeMessage message);
  List<MimePart> getAllPartsFlat(MimeMessage message);
  String? decodeSubject(MimeMessage message);
  bool hasAttachments(MimeMessage message);
  bool hasFlag(MimeMessage message, String flag);
  List<ContentInfo> findContentInfo(MimeMessage message, {ContentDisposition disposition});
  List<MailAddress> decodeSender(MimeMessage message, {bool combine});
}
