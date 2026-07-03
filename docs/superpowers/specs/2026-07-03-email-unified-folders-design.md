# Email Unified Folders Design

**Date**: 2026-07-03
**Status**: Approved

## Overview

Unify mailbox folders across multiple email accounts so users see a single merged folder list regardless of how many accounts are configured. Folders are persisted to SQLite so the list is available offline.

## 1. Database: New `mailboxes` Table

```dart
class Mailboxes extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get encodedName => text()();
  TextColumn get encodedPath => text()();
  TextColumn get path => text()();
  TextColumn get name => text()();
  TextColumn get pathSeparator => text()();
  TextColumn get flagsJson => text()();
  BoolColumn get isReadWrite => boolean()();
  IntColumn get messagesUnseen => integer().withDefault(const Constant(0))();
  IntColumn get uidValidity => integer().nullable()();
  IntColumn get uidNext => integer().nullable()();
  DateTimeColumn get syncedAt => dateTime()();
}
```

- `flagsJson`: JSON array of `MailboxFlag` names, e.g. `["inbox","hasNoChildren"]`
- Unique constraint on `(accountId, encodedPath)`
- Serialization/deserialization of `MailboxFlag` in DAO layer

## 2. Database: `accent_color` Column on `email_accounts`

```dart
IntColumn get accentColor => integer().withDefault(const Constant(0xFF2196F3))();
```

- Auto-assigned from a preset palette on account creation
- User-configurable in account settings
- Used for the narrow right-side color band in email list rows and toolbar account indicators

## 3. Data Flow & Sync

### First Sync (on account add)
1. After `MailDataSource.connect()` succeeds, call `repo.listMailboxes()`
2. Write mailboxes to DB (delete old entries for this account, insert fresh)
3. `mailboxListProvider` recalculates due to `mailDataSourcesProvider` state change

### Background Refresh
- Reuse `BackgroundSyncManager` to periodically call `repo.syncMailboxes(accountId)`
- Full IMAP `LIST` → replace local data for that account
- `unifiedMailboxListProvider` watches DB and auto-updates

### Unseen Count Update
- During sync cycle, after selecting inbox/other folders, read `mailbox.messagesUnseen`
- Update `messagesUnseen` column in DB (no need for full LIST each time)

### Offline
- UI always reads from DB; works without IMAP connection
- Background sync failure does not block UI

## 4. Unified Folder Merge Logic

### Folder Normalization

Priority order for identifying folder type:

1. **Check `MailboxFlag` values** (most reliable, IMAP standard SPECIAL-USE)
2. **Fallback: path/name lookup** for servers without SPECIAL-USE annotations

### Standard Folder Mapping Table

| Type    | IMAP Flag       | Path/Name Variants                                                 |
|---------|-----------------|--------------------------------------------------------------------|
| inbox   | `MailboxFlag.inbox`   | INBOX, Inbox, 收件箱                                           |
| sent    | `MailboxFlag.sent`    | Sent, Sent Messages, Sent Items, 已发送, 发件箱               |
| flagged | `MailboxFlag.flagged` | Starred, 星标邮件, 星标                                       |
| junk    | `MailboxFlag.junk`    | Junk, Junk Email, Spam, 垃圾邮件, 广告邮件                    |
| drafts  | `MailboxFlag.drafts`  | Drafts, 草稿                                                    |
| trash   | `MailboxFlag.trash`   | Trash, Deleted Messages, 已删除                                |
| archive | `MailboxFlag.archive` | Archive, 归档                                                   |
| all     | `MailboxFlag.all`     | All Mail, 全部邮件                                              |

Unmatched entries are treated as `custom` and merged by `mailbox.name`.

### Merge Model

```dart
class UnifiedFolder {
  final String key;           // merge key: flag type name or mailbox.name
  final UnifiedFolderType type;
  final String displayName;
  final IconData icon;
  final List<AccountFolder> accounts;
  final int totalUnseen;
}

class AccountFolder {
  final int accountId;
  final String mailboxPath;
  final int unseen;
}
```

### Unified Folder Key Rules

- For standard folders: key = `UnifiedFolderType.name` (e.g. `"inbox"`, `"sent"`, `"flagged"`)
- For custom folders: key = `mailbox.name`
- If a custom folder's name collides with a standard type name (e.g. a folder literally named "inbox"), `MailboxFlag` takes priority — it is treated as standard
- This ensures the mapping is deterministic and query logic is unambiguous

### Provider: MailboxesDao and EmailsDao

Both already exist in the codebase as drift DAOs. `mailboxesDaoProvider` needs to be added in `database_providers.dart` following the same pattern as existing DAO providers. `emailsDaoProvider` already exists.

### Provider: Migration from Old `mailboxListProvider`

The old `mailboxListProvider` (single-account, IMAP-live) is replaced by `unifiedMailboxListProvider` (all-accounts, from DB). The old `mailboxListProvider` definition is removed; the new one reads from the `mailboxes` table. `EmailToolbar` switches to watching `unifiedMailboxListProvider`.

### Query Mapping: folderKey → (accountId, mailboxPath)

```dart
class MailboxesDao {
  /// Returns (accountId, mailboxPath) pairs for all mailboxes matching a folder key.
  /// For standard keys (e.g. "inbox"), matches via flagsJson.
  /// For custom keys, matches by name column.
  Future<List<(int, String)>> getMailboxPathsByFolderKey(String folderKey);
}
```

Example:
- folderKey = `"inbox"` → `[(1, "INBOX"), (2, "INBOX")]`  (all inboxes)
- folderKey = `"项目A"` → `[(1, "INBOX/项目A"), (2, "项目A")]` (same-name custom folders)

5. Sort order: inbox → flagged → sent → drafts → junk → trash → archive → all → custom alphabetically

## 5. Provider Architecture

```dart
// Unified mailbox list from DB
final unifiedMailboxListProvider = FutureProvider<List<UnifiedFolder>>((ref) async {
  final dao = ref.watch(mailboxesDaoProvider);
  final allMailboxes = await dao.getAllMailboxes();
  return MailboxMerger.merge(allMailboxes);
});

// Selected folder key (e.g. "inbox", "项目A")
final selectedFolderProvider = StateProvider<String>((ref) => 'inbox');

// Unified email list for selected folder, time-descending
final unifiedEmailListProvider = FutureProvider.family<List<Email>, String>((ref, folderKey) async {
  final dao = ref.watch(emailsDaoProvider);
  final mailboxDao = ref.watch(mailboxesDaoProvider);
  final paths = await mailboxDao.getMailboxPathsByFolderKey(folderKey);
  return dao.getEmailsByMailboxPaths(paths);
});
```

## 6. UI: Narrow EmailToolbar (56px)

```
┌──────┐
│ 📥   │  ← Unified inbox (all accounts, total unseen)
│ ⭐   │  ← Unified flagged
│ 📤   │  ← Unified sent
│ 🗑️  │  ← Unified junk
│ 📝   │  ← Unified drafts
│ 📁   │  ← Unified custom folders
│ ───  │
│ 🔄   │  ← Refresh
│ ✏️   │  ← Compose
│ ⚙️   │  ← Settings
│ 👤   │  ← Contacts
│ ───  │
│ 🟦 E │  ← Account indicators: color block + first char
│ 🟩 W │     color = accentColor, tooltip = full email
└──────┘
```

- Each account gets a row at the bottom: `Container(color: accentColor, width: 8, height: 8)` + first character
- Tooltip shows full email address
- Clicking a folder icon sets `selectedFolderProvider` → email list updates

## 7. UI: Email List Right-Side Color Band

Each email list row has a 4px-wide rounded vertical color strip on the right edge, matching the account's `accentColor`:

```
┌──────────────────────────────────────────┬──┐
│ John  项目会议            2026-07-03     │🟦│
├──────────────────────────────────────────┼──┤
│ Alice Q2 报表             2026-07-03     │🟩│
└──────────────────────────────────────────┴──┘
```

Color strip: `Container(width: 4, decoration: BoxDecoration(color: accentColor, borderRadius: BorderRadius.circular(2)))`

## 8. Unified Email Query

Email list uses the existing `Emails` table with `accountId` and `folder` columns:

```sql
SELECT * FROM emails
WHERE (accountId = ? AND folder = ?) OR ...
ORDER BY receivedAt DESC
```

Drift DAO:
```dart
Future<List<Email>> getEmailsByAccountIdsAndFolders(
    List<(int accountId, String folder)> conditions);
```

- `folder` column stores IMAP raw path (e.g. "INBOX", "INBOX/项目A")
- `mailbox_paths` in `mailboxes` table maps folder keys to raw paths per account

## 9. Schema Version

Bump `AppDatabase.schemaVersion` from 4 → 5.
Migration: create `mailboxes` table, add `accent_color` column to `email_accounts`.

## 10. Future Considerations (out of scope)

- Per-account mailbox expand/collapse in toolbar
- Drag-and-drop folder organization
- Server-side folder subscription management
