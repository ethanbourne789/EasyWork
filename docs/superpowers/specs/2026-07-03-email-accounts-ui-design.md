# Email Accounts UI Design

**Date**: 2026-07-03
**Status**: Approved

## Overview

Enhance the email account management UI: add edit/delete buttons to the account list, and rearrange the form page to have test-connection and save buttons side by side at the bottom.

## 1. Account List Page (`email_accounts_page.dart`)

### Changes

- Remove the `trailing: Switch(...)` widget and its `onChanged` logic (active/inactive toggle)
- Add edit and delete icon buttons as a `Row` in `trailing`:

```
leading: CircleAvatar
title: displayName
subtitle: email
trailing: Row(mainAxisSize: MainAxisSize.min, children: [
  IconButton(icon: Icons.edit, onPressed: → EmailAccountFormPage(account: account)),
  IconButton(icon: Icons.delete, onPressed: → confirm dialog → repo.deleteAccount → invalidate),
])
```

- Keep existing `onTap` on `ListTile` (also navigates to form page for editing)
- Delete confirmation dialog: `AlertDialog` with "确认删除" / "取消" buttons
- After delete, call `ref.invalidate(emailAccountListProvider)` and show a snackbar

## 2. Account Form Page (`email_account_form_page.dart`)

### Changes

- Remove `actions: [TextButton('保存')]` from AppBar
- At the bottom of the form body (after the test result display), add a row:

```dart
const SizedBox(height: 24),
Row(
  children: [
    Expanded(child: OutlinedButton.icon(
      icon: test loading indicator,
      label: Text('测试连接'),
      onPressed: _isTesting ? null : _testConnection,
    )),
    const SizedBox(width: 16),
    Expanded(child: ElevatedButton.icon(
      icon: save loading indicator,
      label: Text('保存'),
      onPressed: _isSaving ? null : _save,
    )),
  ],
),
```

- Both buttons are equal width via `Expanded`
- Test button: `OutlinedButton` (existing style)
- Save button: `ElevatedButton`
- Each shows its own `CircularProgressIndicator` when busy
- Existing test result display area remains unchanged

## 3. Files Modified

- `lib/features/email/presentation/pages/email_accounts_page.dart`
- `lib/features/email/presentation/pages/email_account_form_page.dart`
