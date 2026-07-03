import 'package:flutter/material.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../core/database/tables/mailbox_folders_dao.dart';
import '../../../core/database/tables/mailbox_folders_table.dart';

enum UnifiedFolderType {
  inbox,
  flagged,
  sent,
  drafts,
  junk,
  trash,
  archive,
  all,
  custom,
}

class AccountFolderInfo {
  final int accountId;
  final String mailboxPath;
  final int unseen;
  const AccountFolderInfo({
    required this.accountId,
    required this.mailboxPath,
    this.unseen = 0,
  });
}

class UnifiedFolder {
  final String key;
  final UnifiedFolderType type;
  final String displayName;
  final IconData icon;
  final List<AccountFolderInfo> accounts;
  final int totalUnseen;

  const UnifiedFolder({
    required this.key,
    required this.type,
    required this.displayName,
    required this.icon,
    required this.accounts,
    this.totalUnseen = 0,
  });
}

class MailboxMerger {
  static const List<UnifiedFolderType> _typeOrder = [
    UnifiedFolderType.inbox,
    UnifiedFolderType.flagged,
    UnifiedFolderType.sent,
    UnifiedFolderType.drafts,
    UnifiedFolderType.junk,
    UnifiedFolderType.trash,
    UnifiedFolderType.archive,
    UnifiedFolderType.all,
    UnifiedFolderType.custom,
  ];

  static const Map<UnifiedFolderType, String> _displayNames = {
    UnifiedFolderType.inbox: '收件箱',
    UnifiedFolderType.flagged: '星标邮件',
    UnifiedFolderType.sent: '已发送',
    UnifiedFolderType.drafts: '草稿',
    UnifiedFolderType.junk: '垃圾邮件',
    UnifiedFolderType.trash: '已删除',
    UnifiedFolderType.archive: '归档',
    UnifiedFolderType.all: '全部邮件',
  };

  static const Map<UnifiedFolderType, IconData> _icons = {
    UnifiedFolderType.inbox: Icons.inbox,
    UnifiedFolderType.flagged: Icons.star,
    UnifiedFolderType.sent: Icons.send,
    UnifiedFolderType.drafts: Icons.drafts,
    UnifiedFolderType.junk: Icons.report_problem,
    UnifiedFolderType.trash: Icons.delete,
    UnifiedFolderType.archive: Icons.archive,
    UnifiedFolderType.all: Icons.all_inbox,
  };

  static const Map<String, UnifiedFolderType> _pathMapping = {
    'INBOX': UnifiedFolderType.inbox,
    'Inbox': UnifiedFolderType.inbox,
    '收件箱': UnifiedFolderType.inbox,
    'Starred': UnifiedFolderType.flagged,
    '星标邮件': UnifiedFolderType.flagged,
    '星标': UnifiedFolderType.flagged,
    'Sent': UnifiedFolderType.sent,
    'Sent Messages': UnifiedFolderType.sent,
    'Sent Items': UnifiedFolderType.sent,
    '已发送': UnifiedFolderType.sent,
    '发件箱': UnifiedFolderType.sent,
    'Outbox': UnifiedFolderType.sent,
    'Drafts': UnifiedFolderType.drafts,
    '草稿': UnifiedFolderType.drafts,
    'Junk': UnifiedFolderType.junk,
    'Junk Email': UnifiedFolderType.junk,
    'Spam': UnifiedFolderType.junk,
    '垃圾邮件': UnifiedFolderType.junk,
    '广告邮件': UnifiedFolderType.junk,
    'Trash': UnifiedFolderType.trash,
    'Deleted Messages': UnifiedFolderType.trash,
    '已删除': UnifiedFolderType.trash,
    'Archive': UnifiedFolderType.archive,
    '归档': UnifiedFolderType.archive,
    'All Mail': UnifiedFolderType.all,
    '全部邮件': UnifiedFolderType.all,
  };

  static UnifiedFolderType _identifyType(MailboxFolder folder) {
    final flags = MailboxFoldersDao.parseFlags(folder.flagsJson);

    if (flags.contains(MailboxFlag.inbox)) return UnifiedFolderType.inbox;
    if (flags.contains(MailboxFlag.flagged)) return UnifiedFolderType.flagged;
    if (flags.contains(MailboxFlag.sent)) return UnifiedFolderType.sent;
    if (flags.contains(MailboxFlag.drafts)) return UnifiedFolderType.drafts;
    if (flags.contains(MailboxFlag.junk)) return UnifiedFolderType.junk;
    if (flags.contains(MailboxFlag.trash)) return UnifiedFolderType.trash;
    if (flags.contains(MailboxFlag.archive)) return UnifiedFolderType.archive;
    if (flags.contains(MailboxFlag.all)) return UnifiedFolderType.all;

    final type = _pathMapping[folder.path] ?? _pathMapping[folder.name];
    if (type != null) return type;

    final lowerPath = folder.path.toLowerCase();
    final lowerName = folder.name.toLowerCase();
    if (lowerPath.contains('sent') || lowerName.contains('sent')) return UnifiedFolderType.sent;
    if (lowerPath.contains('draft') || lowerName.contains('draft')) return UnifiedFolderType.drafts;
    if (lowerPath.contains('junk') || lowerName.contains('junk') ||
        lowerPath.contains('spam') || lowerName.contains('spam')) return UnifiedFolderType.junk;
    if (lowerPath.contains('trash') || lowerName.contains('trash') ||
        lowerPath.contains('deleted') || lowerName.contains('deleted')) return UnifiedFolderType.trash;
    if (lowerPath.contains('star') || lowerName.contains('star')) return UnifiedFolderType.flagged;
    if (lowerPath.contains('archive') || lowerName.contains('archive')) return UnifiedFolderType.archive;
    if (lowerPath.contains('all mail') || lowerName.contains('all mail')) return UnifiedFolderType.all;

    return UnifiedFolderType.custom;
  }

  static String _mergeKey(MailboxFolder folder, UnifiedFolderType type) {
    if (type != UnifiedFolderType.custom) return type.name;
    return folder.name;
  }

  static List<UnifiedFolder> merge(List<MailboxFolder> folders) {
    final grouped = <String, List<MailboxFolder>>{};
    final typeByKey = <String, UnifiedFolderType>{};

    for (final f in folders) {
      final type = _identifyType(f);
      final key = _mergeKey(f, type);
      grouped.putIfAbsent(key, () => []).add(f);
      typeByKey[key] = type;
    }

    final result = <UnifiedFolder>[];
    for (final entry in grouped.entries) {
      final key = entry.key;
      final type = typeByKey[key]!;
      final groupFolders = entry.value;

      result.add(UnifiedFolder(
        key: key,
        type: type,
        displayName: _displayNames[type] ?? key,
        icon: _icons[type] ?? Icons.folder,
        accounts: groupFolders.map((f) => AccountFolderInfo(
          accountId: f.accountId,
          mailboxPath: f.path,
          unseen: f.messagesUnseen,
        )).toList(),
        totalUnseen: groupFolders.fold(0, (sum, f) => sum + f.messagesUnseen),
      ));
    }

    result.sort((a, b) {
      final aIdx = _typeOrder.indexOf(a.type);
      final bIdx = _typeOrder.indexOf(b.type);
      if (aIdx != bIdx) return aIdx.compareTo(bIdx);
      return a.key.compareTo(b.key);
    });

    return result;
  }
}
