# Settings Page Implementation Plan

## Order
1. Add `win32` dep → add DB defaults → build base
2. Create `AutoStartService` (registry read/write)
3. Rewrite `settings_page.dart` (all 5 sections)
4. Update `BackgroundSyncManager` (DB-backed config)
5. Build → fix → commit

## Step Details

### 1. Dependencies & Defaults
- `pubspec.yaml`: add `win32: ^5.5.0`
- `lib/core/database/app_database.dart`: add `closeToTray=true`, `emailSyncMode=idle` defaults

### 2. AutoStartService
- `lib/core/platform/auto_start_service.dart`
- Uses `win32` package's `RegOpenKeyEx`, `RegSetValueEx`, `RegDeleteValue`
- Writes to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Methods: `isEnabled()`, `enable()`, `disable()`

### 3. Settings Page (core)
- Convert to `ConsumerStatefulWidget`, load settings in `initState`
- 5 sections via `ListView` + `_buildSectionHeader`:
  - 通用: language, theme, autoStart, closeToTray
  - 邮箱: newEmailNotification, syncMode, pollInterval, syncDays, syncLimit, blockExternalImages
  - 通知: taskDueNotification, exerciseNotification
  - 数据: autoBackup (coming soon)
  - 关于: version
- Dialogs: language picker, theme picker, sync mode picker, numeric pickers
- Language switch: snackbar + restart action

### 4. BackgroundSyncManager
- `_loadSyncMode()`: read `emailSyncMode` from SettingsDao
- `_getPollInterval()`: read `email_poll_interval` from SettingsDao
