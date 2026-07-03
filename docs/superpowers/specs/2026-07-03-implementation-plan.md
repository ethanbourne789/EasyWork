# Implementation Plan — EasyWork Bug Fixes

## Overview

This plan implements the bug fixes described in `docs/superpowers/specs/2026-07-03-bug-fix-batch-design.md`. Work is organized into 3 sequential batches. Each batch is a separate git commit.

---

## Batch 1: P0 Crash Fixes

### Task 1.1: Fix compose_page.dart DropdownButtonFormField

**File:** `lib/features/email/presentation/pages/compose_page.dart`

**Steps:**
1. Line 291: Change `initialValue: _selectedAccount` to `value: _selectedAccount`
2. In `initState()` (after line 43): Initialize `_selectedAccount` from account list if available
3. Add null-safe initialization pattern using `WidgetsBinding.instance.addPostFrameCallback` or `ref.read`

**Verification:** Run `dart analyze` — no errors on this file

### Task 1.2: Remove Stub Repository Providers

**File:** `lib/core/providers/repository_providers.dart`

**Steps:**
1. Move the real Provider definitions (lines 5-52) to `lib/core/providers/database_providers.dart` or keep in feature-level files
2. Delete `lib/core/providers/repository_providers.dart` entirely
3. Update all imports that reference this file to use the new location
4. Remove the conflicting `emailRepositoryProvider` from `lib/features/email/providers/email_providers.dart` if it duplicates the moved definition

**Files to check for imports:**
- `lib/main.dart`
- `lib/features/email/**/*.dart`
- `lib/presentation/**/*.dart`

**Verification:** Run `dart analyze` — no undefined name errors

### Task 1.3: Fix Mailbox Deletion Logic

**File:** `lib/features/email/data/email_repository_impl.dart`

**Steps:**
1. Line 262-265: Change `orElse: () => mailboxes.first` to `orElse: () => throw StateError('Mailbox not found: $mailboxPath')`
2. Line 336-339: Same fix for `moveMessagesToFlag`
3. Line 356-359: Same fix for `junkMessages`
4. Line 369-372: Same fix for `archiveMessages`

**Verification:** Add unit test in `test/features/email/data/email_repository_impl_test.dart`

### Task 1.4: Fix account.id! Force Unwrap

**File:** `lib/features/email/data/email_repository_impl.dart`

**Steps:**
1. Line 87: Add guard before `account.id!`:
   ```dart
   if (account.id == null) {
     throw ArgumentError('Account id cannot be null for update');
   }
   ```

**Verification:** Add unit test for null id case

### Task 1.5: Fix totalUnreadProvider account.id!

**File:** `lib/features/email/providers/email_providers.dart`

**Steps:**
1. Line 67: Wrap in null check:
   ```dart
   if (account.id != null) {
     final count = ref.watch(unreadCountProvider(account.id!));
     count.whenData((c) => total += c);
   }
   ```

**Verification:** Add unit test for empty/null account list

---

## Batch 2: P1 Security, Leaks, Logic

### Task 2.1: Encrypt Password Storage

**Files:**
- `lib/features/email/data/email_repository_impl.dart`
- `lib/core/security/credential_store.dart`

**Steps:**
1. In `createAccount` (line 69): Store password via `CredentialStore` instead of plaintext
2. In `updateAccount` (line 92): Same encryption
3. In `getAllAccounts` and `getAccountById`: Decrypt password from `CredentialStore`
4. Ensure `CredentialStore` is injected via constructor (currently not available in `EmailRepositoryImpl`)

**Verification:** Unit test for password round-trip encryption

### Task 2.2: Fix Memory Leak in MailDataSource.dispose()

**File:** `lib/features/email/data/mail_data_source.dart`

**Steps:**
1. Line 426: Change `void dispose()` to `Future<void> close() async`
2. Line 431: Add `await` before `disconnect()`
3. Add `bool _closed = false` guard
4. Update `MailDataSourcesNotifier` to call `close()` instead of `dispose()`

**Verification:** Unit test verifying IMAP connection is closed

### Task 2.3: Fix testConnection IMAP Leak

**File:** `lib/features/email/data/mail_data_source.dart`

**Steps:**
1. Lines 508-532: Wrap in `try-finally`:
   ```dart
   MailClient? client;
   try {
     client = MailClient(account, isLogEnabled: false);
     await client.connect(...);
     await client.listMailboxesAsTree();
     return ConnectionTestResult.success(...);
   } finally {
     await client?.disconnect();
   }
   ```

**Verification:** Unit test simulating non-MailException error

### Task 2.4: Fix Incremental Sync Logic

**File:** `lib/features/email/data/email_sync_service.dart`

**Steps:**
1. Add `lastSyncedUid` field to `EmailSyncService`
2. In `incrementalSync` (line 110): Use UID-based fetch instead of count-based
3. Store last synced UID in `SettingsDao` after sync
4. On first sync, store initial UID

**Verification:** Unit test verifying only new messages fetched

### Task 2.5: Persist Theme Mode

**File:** `lib/presentation/theme/theme_mode_notifier.dart`

**Steps:**
1. Inject `SettingsDao` via `ref`
2. In `build()`: Read theme from settings, default to `ThemeMode.system`
3. In `setThemeMode()`: Write to settings
4. Add loading state while reading initial value

**Verification:** Unit test verifying theme persists across provider recreation

### Task 2.6: Fix Late Initialization Error

**File:** `lib/features/email/data/mail_data_source.dart`

**Steps:**
1. Line 11: Change `late final MailClient _client` to `MailClient? _client`
2. Line 41: Update getter: `MailClient get client => _client ?? throw StateError('Not connected. Call connect() first.')`
3. Line 42: Update `isConnected` to check `_client != null && _connected`

**Verification:** Unit test verifying access before connect throws

---

## Batch 3: P2 Technical Debt

### Task 3.1: Enhance Result Type

**File:** `lib/core/errors/result.dart`

**Steps:**
1. Add `map` method: `Result<R> map<R>(R Function(T) transform, AppException Function(AppException) onError)`
2. Add `fold` method: `R fold<R>(R Function(T) onSuccess, R Function(AppException) onFailure)`
3. Add `when` method: `void when(void Function(T) onSuccess, void Function(AppException) onFailure)`
4. Add `getOrElse` method: `T getOrElse(T Function(AppException) onError)`
5. Add `toString` overrides to `Success` and `Failure`

**Verification:** Unit tests for all combinators

### Task 3.2: Singleton DAOs

**File:** `lib/core/providers/database_providers.dart`

**Steps:**
1. Change each DAO provider from `FutureProvider` to use late initialization pattern
2. Cache instances after first creation
3. Example:
   ```dart
   final emailsDaoProvider = FutureProvider<EmailsDao>((ref) async {
     final db = await ref.watch(appDatabaseProvider.future);
     return EmailsDao(db);
   });
   ```
   Note: This is already the pattern used. The issue is that each read creates a new instance. Change to use `Provider` with internal caching or `StateProvider` with lazy init.

**Verification:** Unit test verifying same instance returned

### Task 3.3: Unify Navigation Config

**File:** `lib/presentation/layouts/app_shell.dart`

**Steps:**
1. Create `NavigationItem` data class with `icon`, `selectedIcon`, `label`, `route`
2. Define shared `const List<NavigationItem> navigationItems` at top of file
3. Update `_NavigationRail` to use shared list
4. Update `_NavigationDrawer` to use shared list

**Verification:** Visual inspection, no regression

### Task 3.4: Add Error Route and Sub-routes

**File:** `lib/router/app_router.dart`

**Steps:**
1. Add `errorPageBuilder` to `GoRouter`:
   ```dart
   errorPageBuilder: (context, state) => const NoTransitionPage(
     child: ErrorPage(error: 'Page not found'),
   ),
   ```
2. Add sub-routes under `/email`:
   - `/email/compose` → `ComposePage`
   - `/email/:id` → `EmailDetailPage`
3. Create `ErrorPage` widget in `lib/presentation/pages/error_page.dart`

**Verification:** Test 404 navigation and deep linking

### Task 3.5: Add SafeArea to NavigationRail

**File:** `lib/presentation/layouts/app_shell.dart`

**Steps:**
1. Wrap `_NavigationRail` content in `SafeArea`:
   ```dart
   return SafeArea(
     child: NavigationRail(...),
   );
   ```

**Verification:** Visual inspection on notch devices

### Task 3.6: Fix Initialization Race Condition

**File:** `lib/main.dart`

**Steps:**
1. Add `Completer<void> _initCompleter = Completer<void>()`
2. In `_initializeEmailAccounts`: Complete the completer when done
3. In `build`: Await `_initCompleter.future` before rendering
4. Remove `Future.delayed` hack

**Verification:** Unit test verifying initialization order

### Task 3.7: Use i18n for Navigation Labels

**File:** `lib/presentation/layouts/app_shell.dart`

**Steps:**
1. Import `AppLocalizations`
2. Replace hardcoded Chinese strings with localized versions:
   - `'笔记'` → `AppLocalizations.of(context)!.notes`
   - `'任务'` → `AppLocalizations.of(context)!.tasks`
   - `'邮件'` → `AppLocalizations.of(context)!.email`
   - `'记账'` → `AppLocalizations.of(context)!.accounting`
   - `'运动'` → `AppLocalizations.of(context)!.exercise`
   - `'通讯录'` → `AppLocalizations.of(context)!.contacts`
   - `'设置'` → `AppLocalizations.of(context)!.settings`
3. Add missing keys to `app_en.arb` and `app_zh.arb`

**Verification:** Test Chinese/English label switching

---

## Testing

### Test Files to Create/Update

1. `test/features/email/data/email_repository_impl_test.dart` — Tasks 1.3, 1.4, 2.1
2. `test/features/email/providers/email_providers_test.dart` — Task 1.5
3. `test/features/email/data/mail_data_source_test.dart` — Tasks 2.2, 2.3, 2.6
4. `test/features/email/data/email_sync_service_test.dart` — Task 2.4
5. `test/presentation/theme/theme_mode_notifier_test.dart` — Task 2.5
6. `test/core/errors/result_test.dart` — Task 3.1
7. `test/router/app_router_test.dart` — Task 3.4
8. `test/presentation/layouts/app_shell_test.dart` — Tasks 3.3, 3.5, 3.7

### Verification Commands

```bash
dart analyze
dart test
flutter test
```

---

## Commit Plan

1. `fix: resolve P0 crash bugs (compose_page, repository_providers, email_repository)`
2. `fix: resolve P1 security, memory leaks, and logic errors`
3. `refactor: resolve P2 technical debt (result type, DAOs, navigation, i18n)`
