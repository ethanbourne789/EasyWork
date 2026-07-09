# Email Accounts UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit/delete buttons to email account list and rearrange form page buttons.

**Architecture:** Pure UI changes to two existing page files. No new files, no data model changes.

**Tech Stack:** Flutter, Riverpod

## Global Constraints

- Follow existing Flutter widget patterns in the codebase
- All text in Chinese (matching existing: '编辑', '删除', '确认删除', '取消', '测试连接', '保存')
- Delete requires a confirmation AlertDialog before executing

---

### Task 1: Update account list page — add edit/delete, remove switch

**Files:**
- Modify: `lib/features/email/presentation/pages/email_accounts_page.dart`

- [ ] **Step 1: Read the file**

```bash
cat lib/features/email/presentation/pages/email_accounts_page.dart
```

- [ ] **Step 2: Replace the ListTile's trailing and onTap**

Find the `ListTile` builder inside `ListView.builder`. Remove the `trailing: Switch(...)` and its `onChanged` logic.

Replace the `trailing` with:
```dart
trailing: Row(
  mainAxisSize: MainAxisSize.min,
  children: [
    IconButton(
      icon: const Icon(Icons.edit, size: 20),
      tooltip: '编辑',
      onPressed: () => Navigator.push<Widget>(
        context,
        MaterialPageRoute<Widget>(
          builder: (_) => EmailAccountFormPage(account: account),
        ),
      ),
    ),
    IconButton(
      icon: const Icon(Icons.delete, size: 20),
      tooltip: '删除',
      onPressed: () => _confirmDelete(context, ref, account),
    ),
  ],
),
```

Keep the existing `onTap` which navigates to edit page.

- [ ] **Step 3: Add the delete confirmation method**

Add this method to `EmailAccountsPage`:
```dart
  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, EmailAccountEntity account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除邮箱账户「${account.displayName}」吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed == true && account.id != null) {
      final repo = ref.read(emailRepositoryProvider);
      await repo.deleteAccount(account.id!);
      ref.invalidate(emailAccountListProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('账户已删除')),
        );
      }
    }
  }
```

- [ ] **Step 4: Verify compilation**

```bash
cd E:\Dev\EasyWork070101 && flutter analyze --no-fatal-infos lib/features/email/presentation/pages/email_accounts_page.dart 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add lib/features/email/presentation/pages/email_accounts_page.dart
git commit -m "feat: add edit/delete buttons, remove active switch in email accounts list"
```

---

### Task 2: Update account form page — bottom button row

**Files:**
- Modify: `lib/features/email/presentation/pages/email_account_form_page.dart`

- [ ] **Step 1: Read the file**

```bash
cat lib/features/email/presentation/pages/email_account_form_page.dart
```

- [ ] **Step 2: Remove save button from AppBar**

Change:
```dart
appBar: AppBar(
  title: Text(widget.account != null ? '编辑账户' : '添加账户'),
  actions: [
    TextButton(
      onPressed: _isSaving ? null : _save,
      child: _isSaving
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : const Text('保存'),
    ),
  ],
),
```
To:
```dart
appBar: AppBar(
  title: Text(widget.account != null ? '编辑账户' : '添加账户'),
),
```

- [ ] **Step 3: Add button row at bottom of form**

Remove the existing standalone test connection button:
```dart
            OutlinedButton.icon(
              onPressed: _isTesting ? null : _testConnection,
              icon: _isTesting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.wifi_find),
              label: const Text('测试连接'),
            ),
```

Add a button row after the test result block:
```dart
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _isTesting ? null : _testConnection,
                    icon: _isTesting
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.wifi_find),
                    label: const Text('测试连接'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isSaving ? null : _save,
                    icon: _isSaving
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save),
                    label: const Text('保存'),
                  ),
                ),
              ],
            ),
```

- [ ] **Step 4: Verify compilation**

```bash
cd E:\Dev\EasyWork070101 && flutter analyze --no-fatal-infos lib/features/email/presentation/pages/email_account_form_page.dart 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add lib/features/email/presentation/pages/email_account_form_page.dart
git commit -m "feat: move test and save buttons side by side at form bottom"
```
