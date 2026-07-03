# Bug Fix Batch Design — EasyWork

## Overview

Comprehensive fix of all identified bugs, security issues, memory leaks, logic errors, and technical debt in the EasyWork codebase. Organized into 3 priority batches, each independently verifiable.

## Batch 1: P0 Crash Fixes

### 1.1 compose_page.dart — DropdownButtonFormField Parameter

**File:** `lib/features/email/presentation/pages/compose_page.dart:291`
**Issue:** `initialValue` parameter does not exist on `DropdownButtonFormField`
**Fix:** Change to `value: _selectedAccount`, initialize `_selectedAccount` in `initState` from account list
**Test:** Verify page renders without compile error

### 1.2 repository_providers.dart — Remove Stub Repositories

**File:** `lib/core/providers/repository_providers.dart`
**Issue:** Contains empty stub `*RepositoryImpl` classes with `dynamic` fields. Conflicts with real implementations in `features/email/providers/email_providers.dart`. Causes `emailRepositoryProvider` name collision.
**Fix:** Delete entire file. Move the real Provider definitions (lines 5-52) to `database_providers.dart` or keep them in feature-level providers. Remove all abstract class definitions and stub implementations (lines 54-103).
**Test:** Verify all providers resolve correctly at runtime

### 1.3 email_repository_impl.dart — Fix Mailbox Deletion Logic

**File:** `lib/features/email/data/email_repository_impl.dart:262-265, 336-339, 356-359, 369-372`
**Issue:** `orElse: () => mailboxes.first` silently deletes the first mailbox (possibly INBOX) when target is not found
**Fix:** Change `orElse` to throw `StateError('Mailbox not found: $mailboxPath')` in all 4 locations
**Test:** Unit test verifying exception on nonexistent mailbox path

### 1.4 email_repository_impl.dart — Fix account.id! Force Unwrap

**File:** `lib/features/email/data/email_repository_impl.dart:87`
**Issue:** `account.id!` crashes when id is null (new accounts)
**Fix:** Add `if (account.id == null) throw ArgumentError('Account id cannot be null for update')` guard
**Test:** Test updateAccount with null id throws ArgumentError

### 1.5 email_providers.dart — Fix account.id! in totalUnreadProvider

**File:** `lib/features/email/providers/email_providers.dart:67`
**Issue:** `account.id!` force unwrap in loop
**Fix:** Add `if (account.id != null)` guard before accessing id
**Test:** Test with account list containing null-id accounts

## Batch 2: P1 Security, Leaks, Logic

### 2.1 Password Encryption Storage

**Files:** `lib/features/email/data/email_repository_impl.dart:69,92`, `lib/core/security/credential_store.dart`
**Issue:** Plaintext password stored directly in SQLite
**Fix:** In `createAccount` and `updateAccount`, encrypt password via `CredentialStore` before storing. Store encrypted value in database. On read, decrypt via `CredentialStore`.
**Test:** Verify password round-trip encryption

### 2.2 mail_data_source.dart — Fix Memory Leak in dispose()

**File:** `lib/features/email/data/mail_data_source.dart:426-432`
**Issue:** `disconnect()` is async but called without await in `dispose()`
**Fix:** Change `dispose()` to `Future<void> close() async`, await `disconnect()`, add `isClosed` guard
**Test:** Verify IMAP connection is properly closed

### 2.3 testConnection — Fix IMAP Connection Leak

**File:** `lib/features/email/data/mail_data_source.dart:508-532`
**Issue:** Non-`MailException` errors skip `client.disconnect()`
**Fix:** Wrap in `try-finally` to ensure `client.disconnect()` always runs
**Test:** Simulate non-MailException during connection test

### 2.4 email_sync_service.dart — Fix Incremental Sync Logic

**File:** `lib/features/email/data/email_sync_service.dart:105-153`
**Issue:** Always fetches latest 30 messages, not truly incremental
**Fix:** Store last synced UID in SettingsDao. Use `UID FETCH uid:lastSyncedUid:*` to fetch only new messages.
**Test:** Verify only new messages are fetched after initial sync

### 2.5 theme_mode_notifier.dart — Add Persistence

**File:** `lib/presentation/theme/theme_mode_notifier.dart`
**Issue:** Theme resets to system on every app restart
**Fix:** Inject `SettingsDao` via ref, read theme on init, write on change. Store as `'theme_mode'` key.
**Test:** Verify theme persists across provider recreation

### 2.6 mail_data_source.dart — Fix Late Initialization Error

**File:** `lib/features/email/data/mail_data_source.dart:11,41`
**Issue:** `_client` is `late final`, accessible before `connect()`
**Fix:** Change to `MailClient? _client`, add `MailClient get client => _client ?? throw StateError('Not connected')`, add `bool get isConnected => _client != null && _connected`
**Test:** Verify access before connect throws descriptive error

## Batch 3: P2 Technical Debt

### 3.1 result.dart — Enhance Result Type

**File:** `lib/core/errors/result.dart`
**Issue:** Missing `map`, `fold`, `when`, `getOrElse`, `toString` methods
**Fix:** Add all combinators. Add `toString` overrides for `Success` and `Failure`.
**Test:** Cover all combinators with unit tests

### 3.2 database_providers.dart — Singleton DAOs

**File:** `lib/core/providers/database_providers.dart:32-140`
**Issue:** Each DAO created as new instance on every access
**Fix:** Cache DAO instances using late initialization pattern or Provider override
**Test:** Verify same DAO instance returned on multiple reads

### 3.3 app_shell.dart — Unify Navigation Config

**File:** `lib/presentation/layouts/app_shell.dart:37,125-172`
**Issue:** Navigation items duplicated between Rail and Drawer
**Fix:** Extract `List<NavigationItem>` as shared constant, both widgets reference same data
**Test:** Verify navigation consistency

### 3.4 app_router.dart — Add Error Route and Sub-routes

**File:** `lib/router/app_router.dart`
**Issue:** No error/fallback route, no sub-routes for compose/detail
**Fix:** Add `errorPageBuilder`, add routes for `/email/compose`, `/email/:id`
**Test:** Verify 404 page and deep linking

### 3.5 app_shell.dart — Add SafeArea to NavigationRail

**File:** `lib/presentation/layouts/app_shell.dart:26-85`
**Issue:** NavigationRail not wrapped in SafeArea
**Fix:** Wrap `_NavigationRail` content in `SafeArea`
**Test:** Verify display on notch devices

### 3.6 main.dart — Fix Initialization Race Condition

**File:** `lib/main.dart:38-96`
**Issue:** `_initialized` flag set before async work completes, `Future.delayed` timing hack
**Fix:** Use `Completer<void>` to signal initialization completion, await in `build`
**Test:** Verify build waits for initialization

### 3.7 app_shell.dart — Use i18n for Navigation Labels

**File:** `lib/presentation/layouts/app_shell.dart:44,48,52,57,62,67,129,134,139,144,149,154,159,176`
**Issue:** Navigation labels hardcoded in Chinese
**Fix:** Import `AppLocalizations`, use localized strings
**Test:** Verify Chinese/English label switching

## Testing Strategy

Each batch includes unit tests for all fixes. Tests are placed in `test/features/` mirroring the source structure.

| Batch | Test Files | Coverage |
|-------|-----------|----------|
| 1 | `email_repository_impl_test.dart`, `email_providers_test.dart` | Mailbox deletion, null checks, provider resolution |
| 2 | `credential_store_test.dart`, `mail_data_source_test.dart`, `email_sync_service_test.dart`, `theme_mode_notifier_test.dart` | Encryption, resource cleanup, sync logic, persistence |
| 3 | `result_test.dart`, `app_router_test.dart`, `app_shell_test.dart` | Combinators, routing, navigation |

## Dependencies

- No new external dependencies required
- All fixes use existing packages (flutter_secure_storage, drift, go_router, flutter_riverpod)

## Rollback Plan

Each batch is a separate commit. If a batch introduces regressions, revert that commit independently.
