import 'package:drift/drift.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/logs_dao.dart';

/// Email sync operation logger
/// Records detailed logs for IMAP connection, mailbox listing, email sync, and database operations
class EmailSyncLogger {
  final LogsDao _logsDao;

  EmailSyncLogger(this._logsDao);

  /// Log IMAP connection attempt
  Future<void> logConnectionAttempt({
    required int accountId,
    required String email,
    required String imapHost,
    required int imapPort,
    required bool imapUseSsl,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'CONNECTION_ATTEMPT',
      refId: Value(accountId),
      message: 'IMAP连接尝试 | 邮箱: $email | 服务器: $imapHost:$imapPort | SSL: $imapUseSsl',
      createdAt: DateTime.now(),
    ));
  }

  /// Log IMAP connection result
  Future<void> logConnectionResult({
    required int accountId,
    required String email,
    required bool success,
    String? errorMessage,
    int? folderCount,
  }) async {
    final status = success ? '成功' : '失败';
    final details = success
        ? '连接成功 | 文件夹数量: ${folderCount ?? "未知"}'
        : '连接失败 | 错误: $errorMessage';

    await _logsDao.insertLog(LogsCompanion.insert(
      level: success ? 'INFO' : 'ERROR',
      module: 'EMAIL_SYNC',
      action: 'CONNECTION_RESULT',
      refId: Value(accountId),
      message: 'IMAP连接结果 | 邮箱: $email | 状态: $status | $details',
      createdAt: DateTime.now(),
    ));
  }

  /// Log mailbox listing
  Future<void> logMailboxListing({
    required int accountId,
    required String email,
    required List<String> folderNames,
    required int totalFolders,
  }) async {
    final folderList = folderNames.take(20).join(', ');
    final suffix = totalFolders > 20 ? '...' : '';

    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'MAILBOX_LISTING',
      refId: Value(accountId),
      message: '文件夹列表 | 邮箱: $email | 数量: $totalFolders | 文件夹: [$folderList$suffix]',
      createdAt: DateTime.now(),
    ));
  }

  /// Log selected mailbox info
  Future<void> logSelectedMailbox({
    required int accountId,
    required String email,
    required String mailboxPath,
    required int? messageCount,
    required int? unreadCount,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'SELECTED_MAILBOX',
      refId: Value(accountId),
      message: '选中文件夹 | 邮箱: $email | 路径: $mailboxPath | 邮件总数: ${messageCount ?? "未知"} | 未读: ${unreadCount ?? "未知"}',
      createdAt: DateTime.now(),
    ));
  }

  /// Log first sync start
  Future<void> logFirstSyncStart({
    required int accountId,
    required String email,
    required int count,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'FIRST_SYNC_START',
      refId: Value(accountId),
      message: '首次同步开始 | 邮箱: $email | 请求数量: $count',
      createdAt: DateTime.now(),
    ));
  }

  /// Log first sync progress
  Future<void> logFirstSyncProgress({
    required int accountId,
    required String email,
    required int fetched,
    required int imported,
    required int skipped,
    required int duplicates,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'FIRST_SYNC_PROGRESS',
      refId: Value(accountId),
      message: '首次同步进度 | 邮箱: $email | 获取: $fetched | 导入: $imported | 跳过: $skipped | 重复: $duplicates',
      createdAt: DateTime.now(),
    ));
  }

  /// Log first sync completion
  Future<void> logFirstSyncComplete({
    required int accountId,
    required String email,
    required int totalFetched,
    required int totalImported,
    required int totalSkipped,
    required int totalDuplicates,
    required int maxUid,
    required Duration duration,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'FIRST_SYNC_COMPLETE',
      refId: Value(accountId),
      message: '首次同步完成 | 邮箱: $email | 获取: $totalFetched | 导入: $totalImported | 跳过: $totalSkipped | 重复: $totalDuplicates | 最大UID: $maxUid | 耗时: ${duration.inMilliseconds}ms',
      createdAt: DateTime.now(),
    ));
  }

  /// Log incremental sync start
  Future<void> logIncrementalSyncStart({
    required int accountId,
    required String email,
    required int? lastSyncedUid,
    required DateTime? lastSyncTime,
  }) async {
    final uidInfo = lastSyncedUid != null ? '最后UID: $lastSyncedUid' : '首次增量同步';
    final timeInfo = lastSyncTime != null ? '最后同步时间: ${lastSyncTime.toIso8601String()}' : '';

    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'INCREMENTAL_SYNC_START',
      refId: Value(accountId),
      message: '增量同步开始 | 邮箱: $email | $uidInfo | $timeInfo',
      createdAt: DateTime.now(),
    ));
  }

  /// Log incremental sync result
  Future<void> logIncrementalSyncResult({
    required int accountId,
    required String email,
    required int fetched,
    required int imported,
    required int skipped,
    required int newMaxUid,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'INCREMENTAL_SYNC_RESULT',
      refId: Value(accountId),
      message: '增量同步结果 | 邮箱: $email | 获取: $fetched | 导入: $imported | 跳过: $skipped | 新最大UID: $newMaxUid',
      createdAt: DateTime.now(),
    ));
  }

  /// Log pagination status
  Future<void> logPaginationStatus({
    required int accountId,
    required String email,
    required bool hasNextPage,
    required int currentPage,
    required int? totalMessages,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'PAGINATION_STATUS',
      refId: Value(accountId),
      message: '分页状态 | 邮箱: $email | 当前页: $currentPage | 有下一页: $hasNextPage | 总数: ${totalMessages ?? "未知"}',
      createdAt: DateTime.now(),
    ));
  }

  /// Log fetch older messages
  Future<void> logFetchOlderMessages({
    required int accountId,
    required String email,
    required int requestedCount,
    required int actualFetched,
    required int newImported,
    required bool hasMorePages,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'FETCH_OLDER_MESSAGES',
      refId: Value(accountId),
      message: '加载更多邮件 | 邮箱: $email | 请求数量: $requestedCount | 实际获取: $actualFetched | 新导入: $newImported | 还有更多: $hasMorePages',
      createdAt: DateTime.now(),
    ));
  }

  /// Log database operation
  Future<void> logDatabaseOperation({
    required int accountId,
    required String email,
    required String operation,
    required int count,
    required bool success,
    String? error,
  }) async {
    final status = success ? '成功' : '失败';
    final errorInfo = error != null ? ' | 错误: $error' : '';

    await _logsDao.insertLog(LogsCompanion.insert(
      level: success ? 'INFO' : 'ERROR',
      module: 'EMAIL_SYNC',
      action: 'DATABASE_OPERATION',
      refId: Value(accountId),
      message: '数据库操作 | 邮箱: $email | 操作: $operation | 数量: $count | 状态: $status$errorInfo',
      createdAt: DateTime.now(),
    ));
  }

  /// Log duplicate cleanup
  Future<void> logDuplicateCleanup({
    required int accountId,
    required String email,
    required int beforeCount,
    required int afterCount,
    required int deletedCount,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'DUPLICATE_CLEANUP',
      refId: Value(accountId),
      message: '重复邮件清理 | 邮箱: $email | 清理前: $beforeCount | 清理后: $afterCount | 删除: $deletedCount',
      createdAt: DateTime.now(),
    ));
  }

  /// Log polling status
  Future<void> logPollingStatus({
    required int accountId,
    required String email,
    required bool isPolling,
    required int intervalMinutes,
  }) async {
    final status = isPolling ? '启动' : '停止';

    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'POLLING_STATUS',
      refId: Value(accountId),
      message: '轮询状态 | 邮箱: $email | 操作: $status | 间隔: $intervalMinutes分钟',
      createdAt: DateTime.now(),
    ));
  }

  /// Log new message received via polling
  Future<void> logNewMessageReceived({
    required int accountId,
    required String email,
    required String? messageId,
    required String? subject,
    required String? from,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'NEW_MESSAGE_RECEIVED',
      refId: Value(accountId),
      message: '新邮件接收 | 邮箱: $email | 主题: ${subject ?? "无"} | 发件人: ${from ?? "未知"} | MessageID: ${messageId ?? "无"}',
      createdAt: DateTime.now(),
    ));
  }

  /// Log message update (flag change)
  Future<void> logMessageUpdate({
    required int accountId,
    required String email,
    required String? messageId,
    required bool isRead,
    required bool isStarred,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'MESSAGE_UPDATE',
      refId: Value(accountId),
      message: '邮件更新 | 邮箱: $email | MessageID: ${messageId ?? "无"} | 已读: $isRead | 星标: $isStarred',
      createdAt: DateTime.now(),
    ));
  }

  /// Log message vanished (deleted on server)
  Future<void> logMessageVanished({
    required int accountId,
    required String email,
    required int vanishedCount,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'MESSAGE_VANISHED',
      refId: Value(accountId),
      message: '邮件删除 | 邮箱: $email | 删除数量: $vanishedCount',
      createdAt: DateTime.now(),
    ));
  }

  /// Log error
  Future<void> logError({
    required int accountId,
    required String email,
    required String action,
    required String errorMessage,
    String? stackTrace,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'ERROR',
      module: 'EMAIL_SYNC',
      action: action,
      refId: Value(accountId),
      message: '错误 | 邮箱: $email | $errorMessage',
      stackTrace: Value(stackTrace),
      createdAt: DateTime.now(),
    ));
  }

  /// Log sync summary for debugging
  Future<void> logSyncSummary({
    required int accountId,
    required String email,
    required int totalEmailsInDb,
    required int unreadCount,
    required int maxUid,
    required int? mailboxMessageCount,
  }) async {
    await _logsDao.insertLog(LogsCompanion.insert(
      level: 'INFO',
      module: 'EMAIL_SYNC',
      action: 'SYNC_SUMMARY',
      refId: Value(accountId),
      message: '同步摘要 | 邮箱: $email | 数据库邮件数: $totalEmailsInDb | 未读: $unreadCount | 最大UID: $maxUid | 服务器邮件数: ${mailboxMessageCount ?? "未知"}',
      createdAt: DateTime.now(),
    ));
  }
}
