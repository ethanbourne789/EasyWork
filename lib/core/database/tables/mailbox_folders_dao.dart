import 'dart:convert';
import 'package:drift/drift.dart';
import 'package:enough_mail/enough_mail.dart';
import '../app_database.dart';
import 'mailbox_folders_table.dart';

part 'mailbox_folders_dao.g.dart';

@DriftAccessor(tables: [MailboxFolders])
class MailboxFoldersDao extends DatabaseAccessor<AppDatabase>
    with _$MailboxFoldersDaoMixin {
  MailboxFoldersDao(super.db);

  /// Convert a list of enough_mail [Mailbox] objects to DB companions and upsert.
  Future<void> upsertMailboxes(int accountId, List<Mailbox> mailboxes) async {
    final now = DateTime.now();
    await batch((batch) {
      // Remove old entries for this account
      batch.deleteWhere(mailboxFolders, (t) => t.accountId.equals(accountId));
      // Insert fresh ones
      for (final mb in mailboxes) {
        batch.insert(mailboxFolders, MailboxFoldersCompanion(
          accountId: Value(accountId),
          encodedName: Value(mb.encodedName),
          encodedPath: Value(mb.encodedPath),
          path: Value(mb.path),
          name: Value(mb.name),
          pathSeparator: Value(mb.pathSeparator),
          flagsJson: Value(jsonEncode(mb.flags.map((f) => f.name).toList())),
          isReadWrite: Value(mb.isReadWrite),
          messagesUnseen: Value(mb.messagesUnseen),
          uidValidity: Value(mb.uidValidity),
          uidNext: Value(mb.uidNext),
          syncedAt: Value(now),
        ));
      }
    });
  }

  /// Update unseen count for a specific mailbox (called during IDLE/polling).
  Future<void> updateUnseenCount(
      int accountId, String encodedPath, int unseen) async {
    await (update(mailboxFolders)
          ..where((t) =>
              t.accountId.equals(accountId) &
              t.encodedPath.equals(encodedPath)))
        .write(MailboxFoldersCompanion(
      messagesUnseen: Value(unseen),
    ));
  }

  /// Get all mailboxes for one account.
  Future<List<MailboxFolder>> getByAccount(int accountId) =>
      (select(mailboxFolders)
            ..where((t) => t.accountId.equals(accountId))
            ..orderBy([(t) => OrderingTerm.asc(t.path)]))
          .get();

  /// Get all mailboxes across all accounts.
  Future<List<MailboxFolder>> getAll() => select(mailboxFolders).get();

  /// Delete all mailboxes for an account (used on account removal).
  Future<void> deleteByAccount(int accountId) =>
      (delete(mailboxFolders)
            ..where((t) => t.accountId.equals(accountId)))
          .go();

  /// Parse flagsJson back to a List<MailboxFlag>.
  static List<MailboxFlag> parseFlags(String? json) {
    if (json == null || json.isEmpty) return [];
    final list = jsonDecode(json) as List;
    return list
        .map((e) => MailboxFlag.values.firstWhere(
            (f) => f.name == e,
            orElse: () => MailboxFlag.virtual))
        .toList();
  }
}
