import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'tables/email_accounts_table.dart';
import 'tables/emails_table.dart';
import 'tables/email_attachments_table.dart';
import 'tables/pending_emails_table.dart';
import 'tables/contacts_table.dart';
import 'tables/contact_groups_table.dart';
import 'tables/contact_group_members_table.dart';
import 'tables/email_signatures_table.dart';
import 'tables/mailbox_folders_table.dart';
import 'tables/email_to_task_table.dart';
import 'tables/tasks_table.dart';
import 'tables/task_comments_table.dart';
import 'tables/notes_table.dart';
import 'tables/note_tags_table.dart';
import 'tables/note_tag_members_table.dart';
import 'tables/accounting_records_table.dart';
import 'tables/accounting_categories_table.dart';
import 'tables/accounting_budgets_table.dart';
import 'tables/exercise_records_table.dart';
import 'tables/stocks_table.dart';
import 'tables/calendar_events_table.dart';
import 'tables/settings_table.dart';
import 'tables/logs_table.dart';
import 'tables/timeline_events_table.dart';

part 'app_database.g.dart';

@DriftDatabase(
  tables: [
    EmailAccounts,
    Emails,
    EmailAttachments,
    PendingEmails,
    Contacts,
    ContactGroups,
    ContactGroupMembers,
    EmailSignatures,
    MailboxFolders,
    EmailToTask,
    Tasks,
    TaskComments,
    Notes,
    NoteTags,
    NoteTagMembers,
    AccountingRecords,
    AccountingCategories,
    AccountingBudgets,
    ExerciseRecords,
    Stocks,
    CalendarEvents,
    Settings,
    Logs,
    TimelineEvents,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 13;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await _createFtsTables();
          await _createFtsTriggers();
          await _insertDefaultData();
        },
        onUpgrade: (m, from, to) async {
          for (var version = from; version < to; version++) {
            await _migrateToVersion(m, version + 1);
          }
        },
        beforeOpen: (details) async {
          if (details.hadUpgrade) {
            await _createFtsTables();
            await _createFtsTriggers();
          }
        },
      );

  Future<void> _migrateToVersion(Migrator m, int version) async {
    switch (version) {
      case 2:
        break;
      case 3:
        await m.createTable(calendarEvents);
        break;
      case 4:
        await _safeAddColumn(m, emailAccounts, emailAccounts.password);
        await _safeAddColumn(m, emailAccounts, emailAccounts.syncPeriod);
        await _safeAddColumn(m, emailAccounts, emailAccounts.syncInterval);
        break;
      case 5:
        await m.createTable(mailboxFolders);
        await _safeAddColumn(m, emailAccounts, emailAccounts.accentColor);
        break;
      case 6:
        await customStatement('''
          DELETE FROM emails WHERE rowid NOT IN (
            SELECT MIN(rowid) FROM emails
            WHERE message_id IS NOT NULL AND message_id != ''
            GROUP BY message_id, account_id
          ) AND message_id IS NOT NULL AND message_id != ''
        ''');
        await customStatement('''
          CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_message_account
          ON emails(message_id, account_id)
        ''');
        break;
      case 7:
        await _safeAddColumn(m, emails, emails.uid);
        break;
      case 8:
        await _safeAddColumn(m, emails, emails.inReplyTo);
        await _safeAddColumn(m, emails, emails.references);
        await _safeAddColumn(m, emails, emails.replyTo);
        break;
      case 9:
        await _safeAddColumn(m, emails, emails.isAnswered);
        await _safeAddColumn(m, emails, emails.isForwarded);
        break;
      case 10:
        await _safeAddColumn(m, emailAccounts, emailAccounts.smtpStartTls);
        break;
      case 11:
        // Security migration: clear plaintext passwords from DB.
        // Passwords are now stored exclusively in flutter_secure_storage.
        await customStatement(
          "UPDATE email_accounts SET password = '' WHERE password IS NOT NULL AND password != ''",
        );
        // Strip passwords from mailAccountJson to prevent credential leakage.
        await _sanitizeMailAccountJsonColumn();
        break;
      case 12:
        // Add retry tracking fields to pending_emails.
        await customStatement(
          "ALTER TABLE pending_emails ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
        );
        await customStatement(
          "ALTER TABLE pending_emails ADD COLUMN last_retry_at INTEGER",
        );
        break;
      case 13:
        // DKIM signing: add domain and selector columns. The private key is
        // stored in flutter_secure_storage, not in the database.
        await _safeAddColumn(m, emailAccounts, emailAccounts.dkimDomain);
        await _safeAddColumn(m, emailAccounts, emailAccounts.dkimSelector);
        break;
    }
  }

  Future<void> _safeAddColumn(
    Migrator m,
    TableInfo<Table, dynamic> table,
    GeneratedColumn<Object> column,
  ) async {
    try {
      await m.addColumn(table, column);
    } catch (_) {
      // Column may already exist from a previous partial migration
    }
  }

  /// Strip password fields from all mailAccountJson rows in email_accounts.
  Future<void> _sanitizeMailAccountJsonColumn() async {
    final rows = await customSelect(
      'SELECT id, mail_account_json FROM email_accounts WHERE mail_account_json IS NOT NULL AND mail_account_json != \'\'',
    ).get();
    for (final row in rows) {
      final id = row.read<int>('id');
      final jsonStr = row.read<String>('mail_account_json');
      if (jsonStr.isEmpty) continue;
      try {
        final Map<String, dynamic> json = jsonDecode(jsonStr) as Map<String, dynamic>;
        if (json.containsKey('password')) {
          json.remove('password');
          await customStatement(
            'UPDATE email_accounts SET mail_account_json = ? WHERE id = ?',
            [jsonEncode(json), id],
          );
        }
      } catch (_) {
        // Malformed JSON; clear it to avoid storing garbage.
        await customStatement(
          'UPDATE email_accounts SET mail_account_json = \'\' WHERE id = ?',
          [id],
        );
      }
    }
  }

  Future<void> _createFtsTables() async {
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
        title, description, content='tasks', content_rowid='id'
      );
    ''');
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
        subject, from_name, from_address, body_text,
        content='emails', content_rowid='id'
      );
    ''');
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
        display_name, first_name, last_name, email_addresses,
        content='contacts', content_rowid='id'
      );
    ''');
    await customStatement('''
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title, content, content='notes', content_rowid='id'
      );
    ''');
  }

  Future<void> _createFtsTriggers() async {
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts(rowid, title, description)
        VALUES (new.id, new.title, new.description);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
        DELETE FROM tasks_fts WHERE rowid = old.id;
        INSERT INTO tasks_fts(rowid, title, description)
        VALUES (new.id, new.title, new.description);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
        DELETE FROM tasks_fts WHERE rowid = old.id;
      END
    ''');

    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
        INSERT INTO emails_fts(rowid, subject, from_name, from_address, body_text)
        VALUES (new.id, new.subject, new.from_name, new.from_address, new.body_text);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN
        DELETE FROM emails_fts WHERE rowid = old.id;
        INSERT INTO emails_fts(rowid, subject, from_name, from_address, body_text)
        VALUES (new.id, new.subject, new.from_name, new.from_address, new.body_text);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN
        DELETE FROM emails_fts WHERE rowid = old.id;
      END
    ''');

    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS contacts_ai AFTER INSERT ON contacts BEGIN
        INSERT INTO contacts_fts(rowid, display_name, first_name, last_name, email_addresses)
        VALUES (new.id, new.display_name, new.first_name, new.last_name, new.email_addresses);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS contacts_au AFTER UPDATE ON contacts BEGIN
        DELETE FROM contacts_fts WHERE rowid = old.id;
        INSERT INTO contacts_fts(rowid, display_name, first_name, last_name, email_addresses)
        VALUES (new.id, new.display_name, new.first_name, new.last_name, new.email_addresses);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS contacts_ad AFTER DELETE ON contacts BEGIN
        DELETE FROM contacts_fts WHERE rowid = old.id;
      END
    ''');

    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        DELETE FROM notes_fts WHERE rowid = old.id;
        INSERT INTO notes_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        DELETE FROM notes_fts WHERE rowid = old.id;
      END
    ''');
  }

  Future<void> _insertDefaultData() async {
    final defaultCategories = [
      AccountingCategoriesCompanion.insert(
        name: '餐饮', type: 'expense', sortOrder: const Value(0),
      ),
      AccountingCategoriesCompanion.insert(
        name: '交通', type: 'expense', sortOrder: const Value(1),
      ),
      AccountingCategoriesCompanion.insert(
        name: '购物', type: 'expense', sortOrder: const Value(2),
      ),
      AccountingCategoriesCompanion.insert(
        name: '住房', type: 'expense', sortOrder: const Value(3),
      ),
      AccountingCategoriesCompanion.insert(
        name: '娱乐', type: 'expense', sortOrder: const Value(4),
      ),
      AccountingCategoriesCompanion.insert(
        name: '医疗', type: 'expense', sortOrder: const Value(5),
      ),
      AccountingCategoriesCompanion.insert(
        name: '教育', type: 'expense', sortOrder: const Value(6),
      ),
      AccountingCategoriesCompanion.insert(
        name: '通讯', type: 'expense', sortOrder: const Value(7),
      ),
      AccountingCategoriesCompanion.insert(
        name: '服饰', type: 'expense', sortOrder: const Value(8),
      ),
      AccountingCategoriesCompanion.insert(
        name: '其他支出', type: 'expense', sortOrder: const Value(9),
      ),
      AccountingCategoriesCompanion.insert(
        name: '工资', type: 'income', sortOrder: const Value(10),
      ),
      AccountingCategoriesCompanion.insert(
        name: '奖金', type: 'income', sortOrder: const Value(11),
      ),
      AccountingCategoriesCompanion.insert(
        name: '投资收益', type: 'income', sortOrder: const Value(12),
      ),
      AccountingCategoriesCompanion.insert(
        name: '兼职', type: 'income', sortOrder: const Value(13),
      ),
      AccountingCategoriesCompanion.insert(
        name: '其他收入', type: 'income', sortOrder: const Value(14),
      ),
    ];

    await batch((batch) {
      batch.insertAll(accountingCategories, defaultCategories);
    });

    final defaultSettings = [
      SettingsCompanion.insert(key: 'language', value: 'zh'),
      SettingsCompanion.insert(key: 'theme_mode', value: 'system'),
      SettingsCompanion.insert(
          key: 'email_poll_interval', value: '5'),
      SettingsCompanion.insert(
          key: 'new_email_notification', value: 'true'),
      SettingsCompanion.insert(
          key: 'task_due_notification', value: 'true'),
      SettingsCompanion.insert(
          key: 'exercise_notification', value: 'false'),
      SettingsCompanion.insert(key: 'auto_start', value: 'false'),
      SettingsCompanion.insert(key: 'auto_backup', value: 'true'),
      SettingsCompanion.insert(key: 'email_sync_days', value: '30'),
      SettingsCompanion.insert(key: 'email_sync_limit', value: '200'),
      SettingsCompanion.insert(
          key: 'email_block_external_images', value: 'false'),
      SettingsCompanion.insert(key: 'closeToTray', value: 'true'),
      SettingsCompanion.insert(key: 'emailSyncMode', value: 'idle'),
    ];

    await batch((batch) {
      batch.insertAll(settings, defaultSettings);
    });
  }
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'easywork.db'));
    return NativeDatabase(file);
  });
}
