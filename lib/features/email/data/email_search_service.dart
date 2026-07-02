import '../../../core/database/app_database.dart';
import '../../../core/database/tables/emails_dao.dart';

/// Service for searching emails using FTS5
class EmailSearchService {
  final EmailsDao _emailsDao;

  EmailSearchService(this._emailsDao);

  /// Search emails by keyword using FTS5
  Future<List<Email>> searchEmails(String query, {int accountId = 0}) async {
    if (query.trim().isEmpty) return [];

    try {
      // Use FTS5 for full-text search
      final results = await _emailsDao.searchEmails(query);
      if (accountId > 0) {
        return results.where((e) => e.accountId == accountId).toList();
      }
      return results;
    } catch (e) {
      // Fallback to LIKE search if FTS5 fails
      return _emailsDao.searchEmailsLike(query);
    }
  }

  /// Search emails by sender
  Future<List<Email>> searchBySender(String sender) async {
    if (sender.trim().isEmpty) return [];
    return _emailsDao.searchEmailsByFrom(sender);
  }

  /// Search emails by subject
  Future<List<Email>> searchBySubject(String subject) async {
    if (subject.trim().isEmpty) return [];
    return _emailsDao.searchEmailsBySubject(subject);
  }
}
