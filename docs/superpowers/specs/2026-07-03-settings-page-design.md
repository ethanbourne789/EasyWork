# Settings Page Design

## Goal
Replace the current stub settings page (`lib/presentation/pages/settings/settings_page.dart`) with a complete, grouped settings page covering all seeded database settings plus the new platform services.

## Architecture

**Pattern**: Hybrid — `ConsumerStatefulWidget` with `SettingsDao` for most settings, `themeModeProvider` (existing Riverpod) for theme.

**Layout**: `ResponsiveScaffold` → `ListView` → grouped sections with `_buildSectionHeader()`.

## Module Groups

### 1. 通用 (General)
| Setting | Key | Control | Platform |
|---------|-----|---------|----------|
| Language | `language` | Tap → dialog (中文 / English) → snackbar with restart option | All |
| Theme mode | `theme_mode` | Tap → dialog (浅色 / 深色 / 跟随系统) via `themeModeProvider` | All |
| Auto start | `auto_start` | `SwitchListTile`, Windows registry (HKCU\Run) | Windows |
| Close to tray | `closeToTray` | `SwitchListTile`, used by `WindowManagerService` | Windows |

**Language switching**: `AlertDialog` with `RadioListTile`. On selection, show `SnackBar` with "部分语言更改将在下次启动时生效" and a "立即重启" action button. On restart, call `windowManager.destroy()` / `exit(0)`.

**Auto-start**: Use `win32` package (already a transitive dep) to write/read/delete `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run` key named `EasyWork` with the executable path from `Platform.resolvedExecutable`.

**Close to tray**: Toggle writes `closeToTray` to DB. `WindowManagerService.shouldCloseToTray()` reads it at close time.

### 2. 邮箱 (Email)
| Setting | Key | Control | Platform |
|---------|-----|---------|----------|
| New email notification | `new_email_notification` | `SwitchListTile` | All |
| Background sync mode | `emailSyncMode` | Tap → dialog (保持连接 / 定时同步) | Windows |
| Sync interval | `email_poll_interval` | Shown only when polling mode; tap → numeric picker (1/5/15/30 min) | Windows |
| Sync days | `email_sync_days` | Tap → numeric picker (7/14/30/60/90) | All |
| Sync limit | `email_sync_limit` | Tap → numeric picker (50/100/200/500) | All |
| Block external images | `email_block_external_images` | `SwitchListTile` | All |

**Numeric picker**: `AlertDialog` with `RadioListTile<int>` options. Selection writes to DB immediately via `dao.setSetting()`.

### 3. 通知 (Notifications)
| Setting | Key | Control |
|---------|-----|---------|
| Task due notification | `task_due_notification` | `SwitchListTile` |
| Exercise reminder | `exercise_notification` | `SwitchListTile` |

### 4. 数据 (Data)
| Setting | Key | Control |
|---------|-----|---------|
| Auto backup | `auto_backup` | `SwitchListTile`, subtitle: "备份功能即将推出" |

### 5. 关于 (About)
| Item | Value |
|------|-------|
| Version | `0.1.0+1` (from pubspec.yaml) |

Read-only `ListTile` with `Text` subtitle.

## Database Changes

Add these missing defaults to `AppDatabase._populateDefaultData()`:
```dart
SettingsCompanion.insert(key: 'closeToTray', value: 'true'),
SettingsCompanion.insert(key: 'emailSyncMode', value: 'idle'),
```

## Service Integration Updates

### `BackgroundSyncManager`
- `_loadSyncMode()`: read `emailSyncMode` from `SettingsDao` instead of hardcoded `'idle'`
- `_getPollInterval()`: read `email_poll_interval` from `SettingsDao` and parse to `Duration(minutes: ...)` instead of hardcoded `Duration(minutes: 5)`

### `WindowManagerService`
- Already reads `closeToTray` from DB — no change needed.

## Files to Modify

| File | Change |
|------|--------|
| `lib/presentation/pages/settings/settings_page.dart` | Full rewrite (~250 lines) |
| `lib/core/database/app_database.dart` | Add 2 default settings |
| `lib/core/platform/background_sync_manager.dart` | Read sync mode / interval from DB |
| `pubspec.yaml` | Add `win32` dependency (if not already direct) |

## Files to Create

None (all changes are modifications).

## Not in Scope
- Actual backup/restore logic
- Background service for Android
- Actual language switching mechanism (l10n already handles it)
