import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../database/app_database.dart';
import '../database/tables/email_accounts_dao.dart';
import '../database/tables/emails_dao.dart';
import '../database/tables/email_attachments_dao.dart';
import '../database/tables/pending_emails_dao.dart';
import '../database/tables/contacts_dao.dart';
import '../database/tables/contact_groups_dao.dart';
import '../database/tables/contact_group_members_dao.dart';
import '../database/tables/email_signatures_dao.dart';
import '../database/tables/tasks_dao.dart';
import '../database/tables/task_comments_dao.dart';
import '../database/tables/notes_dao.dart';
import '../database/tables/note_tags_dao.dart';
import '../database/tables/note_tag_members_dao.dart';
import '../database/tables/accounting_records_dao.dart';
import '../database/tables/accounting_categories_dao.dart';
import '../database/tables/accounting_budgets_dao.dart';
import '../database/tables/exercise_records_dao.dart';
import '../database/tables/stocks_dao.dart';
import '../database/tables/calendar_events_dao.dart';
import '../database/tables/settings_dao.dart';
import '../database/tables/logs_dao.dart';
import '../database/tables/timeline_events_dao.dart';

final appDatabaseProvider = FutureProvider<AppDatabase>((ref) async {
  final db = AppDatabase();
  ref.onDispose(() => db.close());
  return db;
});

final emailAccountsDaoProvider = FutureProvider<EmailAccountsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailAccountsDao(db);
});

final emailsDaoProvider = FutureProvider<EmailsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailsDao(db);
});

final emailAttachmentsDaoProvider = FutureProvider<EmailAttachmentsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailAttachmentsDao(db);
});

final pendingEmailsDaoProvider = FutureProvider<PendingEmailsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return PendingEmailsDao(db);
});

final contactsDaoProvider = FutureProvider<ContactsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ContactsDao(db);
});

final contactGroupsDaoProvider = FutureProvider<ContactGroupsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ContactGroupsDao(db);
});

final contactGroupMembersDaoProvider = FutureProvider<ContactGroupMembersDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ContactGroupMembersDao(db);
});

final emailSignaturesDaoProvider = FutureProvider<EmailSignaturesDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return EmailSignaturesDao(db);
});

final tasksDaoProvider = FutureProvider<TasksDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return TasksDao(db);
});

final taskCommentsDaoProvider = FutureProvider<TaskCommentsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return TaskCommentsDao(db);
});

final notesDaoProvider = FutureProvider<NotesDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return NotesDao(db);
});

final noteTagsDaoProvider = FutureProvider<NoteTagsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return NoteTagsDao(db);
});

final noteTagMembersDaoProvider = FutureProvider<NoteTagMembersDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return NoteTagMembersDao(db);
});

final accountingRecordsDaoProvider = FutureProvider<AccountingRecordsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return AccountingRecordsDao(db);
});

final accountingCategoriesDaoProvider = FutureProvider<AccountingCategoriesDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return AccountingCategoriesDao(db);
});

final accountingBudgetsDaoProvider = FutureProvider<AccountingBudgetsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return AccountingBudgetsDao(db);
});

final exerciseRecordsDaoProvider = FutureProvider<ExerciseRecordsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return ExerciseRecordsDao(db);
});

final stocksDaoProvider = FutureProvider<StocksDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return StocksDao(db);
});

final calendarEventsDaoProvider = FutureProvider<CalendarEventsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return CalendarEventsDao(db);
});

final settingsDaoProvider = FutureProvider<SettingsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return SettingsDao(db);
});

final logsDaoProvider = FutureProvider<LogsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return LogsDao(db);
});

final timelineEventsDaoProvider = FutureProvider<TimelineEventsDao>((ref) async {
  final db = await ref.watch(appDatabaseProvider.future);
  return TimelineEventsDao(db);
});
