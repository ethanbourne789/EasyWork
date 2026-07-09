import 'dart:developer' as dev;
import 'package:enough_mail/enough_mail.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/emails_dao.dart';
import 'mail_data_sources_notifier.dart';

/// Service for searching emails — supports both local FTS5 and server-side IMAP SEARCH.
class EmailSearchService {
  final EmailsDao _emailsDao;
  final MailDataSourcesNotifier _dataSources;

  EmailSearchService(this._emailsDao, this._dataSources);

  /// Search emails locally using FTS5 (fast, offline-capable).
  /// [accountId] is required — caller must specify which account to search.
  Future<List<Email>> searchLocal(String query, {required int accountId}) async {
    if (query.trim().isEmpty) return [];

    try {
      final results = await _emailsDao.searchEmails(query);
      return results.where((e) => e.accountId == accountId).toList();
    } catch (e) {
      dev.log('FTS5 search failed, falling back to LIKE: $e', name: 'EmailSearchService');
      // BUG-33: The LIKE fallback must also filter by accountId — otherwise
      // results from other accounts leak into the search.
      final likeResults = await _emailsDao.searchEmailsLike(query);
      return likeResults.where((e) => e.accountId == accountId).toList();
    }
  }

  /// Search emails on the IMAP server (requires active connection).
  /// Returns found MimeMessages; caller can persist them locally.
  Future<List<MimeMessage>> searchServer(int accountId, String query) async {
    if (query.trim().isEmpty) return [];
    final ds = _dataSources.get(accountId);
    if (ds == null) return [];

    try {
      final search = MailSearch(query, SearchQueryType.allTextHeaders);
      final result = await ds.searchMessages(search);
      return result.messages;
    } catch (e) {
      dev.log('IMAP search failed for account $accountId: $e', name: 'EmailSearchService');
      return [];
    }
  }

  /// Search emails by sender (local).
  Future<List<Email>> searchBySender(String sender) async {
    if (sender.trim().isEmpty) return [];
    return _emailsDao.searchEmailsByFrom(sender);
  }

  /// Search emails by subject (local).
  Future<List<Email>> searchBySubject(String subject) async {
    if (subject.trim().isEmpty) return [];
    return _emailsDao.searchEmailsBySubject(subject);
  }
}
