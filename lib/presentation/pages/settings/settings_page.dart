import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../layouts/responsive_scaffold.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/platform/auto_start_service.dart';
import '../../theme/theme_mode_notifier.dart';
import '../../theme/locale_notifier.dart';
import '../../../l10n/app_localizations.dart';
import '../../../features/signatures/presentation/pages/signatures_page.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  static const _languageKey = 'language';
  static const _autoStartKey = 'auto_start';
  static const _closeToTrayKey = 'closeToTray';
  static const _newEmailNotificationKey = 'new_email_notification';
  static const _emailSyncModeKey = 'emailSyncMode';
  static const _emailPollIntervalKey = 'email_poll_interval';
  static const _emailSyncDaysKey = 'email_sync_days';
  static const _emailSyncLimitKey = 'email_sync_limit';
  static const _emailBlockExternalImagesKey = 'email_block_external_images';
  static const _taskDueNotificationKey = 'task_due_notification';
  static const _exerciseNotificationKey = 'exercise_notification';
  static const _autoBackupKey = 'auto_backup';

  bool _isLoading = true;
  String _language = 'zh';
  bool _autoStart = false;
  bool _closeToTray = true;
  bool _newEmailNotification = true;
  String _emailSyncMode = 'idle';
  int _emailPollInterval = 5;
  int _emailSyncDays = 30;
  int _emailSyncLimit = 200;
  bool _emailBlockExternalImages = false;
  bool _taskDueNotification = true;
  bool _exerciseNotification = false;
  bool _autoBackup = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    try {
      final dao = await ref.read(settingsDaoProvider.future);
      // Batch-load all settings in a single DB query instead of 12+ serial queries.
      final settings = await dao.getAllSettings();

      _language = settings[_languageKey] ?? 'zh';
      _autoStart = settings[_autoStartKey] == 'true';
      _closeToTray = settings[_closeToTrayKey] != 'false';
      _newEmailNotification = settings[_newEmailNotificationKey] == 'true';
      _emailSyncMode = settings[_emailSyncModeKey] ?? 'idle';
      _emailPollInterval = int.tryParse(settings[_emailPollIntervalKey] ?? '5') ?? 5;
      _emailSyncDays = int.tryParse(settings[_emailSyncDaysKey] ?? '30') ?? 30;
      _emailSyncLimit = int.tryParse(settings[_emailSyncLimitKey] ?? '200') ?? 200;
      _emailBlockExternalImages = settings[_emailBlockExternalImagesKey] == 'true';
      _taskDueNotification = settings[_taskDueNotificationKey] == 'true';
      _exerciseNotification = settings[_exerciseNotificationKey] == 'true';
      _autoBackup = settings[_autoBackupKey] == 'true';

      setState(() => _isLoading = false);
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _updateSetting(String key, String value) async {
    try {
      final dao = await ref.read(settingsDaoProvider.future);
      await dao.setSetting(key, value);
    } catch (e) {
      debugPrint('Failed to update setting $key: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = EasyWorkLocalizations.of(context)!;

    if (_isLoading) {
      return ResponsiveScaffold(
        title: loc.nav_settings,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return ResponsiveScaffold(
      title: loc.nav_settings,
      body: ListView(
        children: [
          _buildSectionHeader('通用'),
          _buildLanguageTile(),
          _buildThemeTile(),
          if (Platform.isWindows) _buildAutoStartTile(),
          if (Platform.isWindows) _buildCloseToTrayTile(),
          _buildSectionHeader('邮箱'),
          _buildNewEmailNotificationTile(),
          if (Platform.isWindows) _buildEmailSyncModeTile(),
          if (Platform.isWindows && _emailSyncMode == 'polling')
            _buildEmailPollIntervalTile(),
          _buildEmailSyncDaysTile(),
          _buildEmailSyncLimitTile(),
          _buildEmailBlockExternalImagesTile(),
          _buildSignatureManagementTile(),
          _buildSectionHeader('通知'),
          _buildTaskDueNotificationTile(),
          _buildExerciseNotificationTile(),
          _buildSectionHeader('数据'),
          _buildAutoBackupTile(),
          _buildSectionHeader('关于'),
          _buildVersionTile(),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }

  Widget _buildLanguageTile() {
    final loc = EasyWorkLocalizations.of(context)!;
    return ListTile(
      title: Text(loc.settings_language),
      subtitle: Text(_language == 'zh' ? '中文' : 'English'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _showLanguageDialog(),
    );
  }

  Widget _buildThemeTile() {
    final loc = EasyWorkLocalizations.of(context)!;
    return ListTile(
      title: Text(loc.settings_theme),
      subtitle: Text(_getThemeModeText()),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _showThemeDialog(),
    );
  }

  String _getThemeModeText() {
    final themeMode = ref.watch(themeModeProvider).valueOrNull;
    switch (themeMode) {
      case ThemeMode.light:
        return '浅色';
      case ThemeMode.dark:
        return '深色';
      default:
        return '跟随系统';
    }
  }

  Widget _buildAutoStartTile() {
    return SwitchListTile(
      title: const Text('开机自启'),
      subtitle: const Text('系统启动时自动运行'),
      value: _autoStart,
      onChanged: (value) {
        setState(() => _autoStart = value);
        if (value) {
          AutoStartService.enable();
        } else {
          AutoStartService.disable();
        }
        _updateSetting(_autoStartKey, value.toString());
        AutoStartService.isEnabled();
      },
    );
  }

  Widget _buildCloseToTrayTile() {
    return SwitchListTile(
      title: const Text('关闭时最小化到托盘'),
      subtitle: const Text('点击关闭按钮时隐藏到系统托盘'),
      value: _closeToTray,
      onChanged: (value) {
        setState(() => _closeToTray = value);
        _updateSetting(_closeToTrayKey, value.toString());
      },
    );
  }

  Widget _buildNewEmailNotificationTile() {
    return SwitchListTile(
      title: const Text('新邮件通知'),
      value: _newEmailNotification,
      onChanged: (value) {
        setState(() => _newEmailNotification = value);
        _updateSetting(_newEmailNotificationKey, value.toString());
      },
    );
  }

  Widget _buildEmailSyncModeTile() {
    return ListTile(
      title: const Text('后台同步模式'),
      subtitle: Text(_emailSyncMode == 'idle' ? '保持连接' : '定时同步'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _showEmailSyncModeDialog(),
    );
  }

  Widget _buildEmailPollIntervalTile() {
    return ListTile(
      title: const Text('同步间隔'),
      subtitle: Text('每 $_emailPollInterval 分钟'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _showPollIntervalDialog(),
    );
  }

  Widget _buildEmailSyncDaysTile() {
    return ListTile(
      title: const Text('同步天数'),
      subtitle: Text('$_emailSyncDays 天'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _showNumericPickerDialog(
        title: '同步天数',
        value: _emailSyncDays,
        options: const [7, 14, 30, 60, 90],
        suffix: '天',
        onSelected: (v) {
          setState(() => _emailSyncDays = v);
          _updateSetting(_emailSyncDaysKey, v.toString());
        },
      ),
    );
  }

  Widget _buildEmailSyncLimitTile() {
    return ListTile(
      title: const Text('同步数量限制'),
      subtitle: Text('$_emailSyncLimit 封'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => _showNumericPickerDialog(
        title: '同步数量限制',
        value: _emailSyncLimit,
        options: const [50, 100, 200, 500],
        suffix: '封',
        onSelected: (v) {
          setState(() => _emailSyncLimit = v);
          _updateSetting(_emailSyncLimitKey, v.toString());
        },
      ),
    );
  }

  Widget _buildEmailBlockExternalImagesTile() {
    return SwitchListTile(
      title: const Text('屏蔽外部图片'),
      subtitle: const Text('邮件中不自动加载外部图片'),
      value: _emailBlockExternalImages,
      onChanged: (value) {
        setState(() => _emailBlockExternalImages = value);
        _updateSetting(_emailBlockExternalImagesKey, value.toString());
      },
    );
  }

  Widget _buildSignatureManagementTile() {
    return ListTile(
      leading: const Icon(Icons.edit_note),
      title: const Text('邮件签名'),
      subtitle: const Text('管理发件签名'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () {
        Navigator.push<Widget>(
          context,
          MaterialPageRoute<Widget>(
            builder: (_) => const SignaturesPage(),
          ),
        );
      },
    );
  }

  Widget _buildTaskDueNotificationTile() {
    return SwitchListTile(
      title: const Text('任务到期通知'),
      value: _taskDueNotification,
      onChanged: (value) {
        setState(() => _taskDueNotification = value);
        _updateSetting(_taskDueNotificationKey, value.toString());
      },
    );
  }

  Widget _buildExerciseNotificationTile() {
    return SwitchListTile(
      title: const Text('运动提醒'),
      value: _exerciseNotification,
      onChanged: (value) {
        setState(() => _exerciseNotification = value);
        _updateSetting(_exerciseNotificationKey, value.toString());
      },
    );
  }

  Widget _buildAutoBackupTile() {
    return SwitchListTile(
      title: const Text('自动备份'),
      subtitle: const Text('备份功能即将推出'),
      value: _autoBackup,
      onChanged: (value) {
        setState(() => _autoBackup = value);
        _updateSetting(_autoBackupKey, value.toString());
      },
    );
  }

  Widget _buildVersionTile() {
    return const ListTile(
      title: Text('版本'),
      subtitle: Text('0.1.0+1'),
    );
  }

  void _showLanguageDialog() {
    showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('语言'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: const Text('中文'),
              value: 'zh',
              groupValue: _language,
              onChanged: (value) {
                Navigator.pop(context, value);
              },
            ),
            RadioListTile<String>(
              title: const Text('English'),
              value: 'en',
              groupValue: _language,
              onChanged: (value) {
                Navigator.pop(context, value);
              },
            ),
          ],
        ),
      ),
    ).then((value) async {
      if (value != null && value != _language) {
        setState(() => _language = value);
        await _updateSetting(_languageKey, value);
        try {
          await ref.read(localeProvider.notifier).setLocaleCode(value);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Language updated')),
          );
        } catch (e) {
          debugPrint('Failed to apply locale immediately: $e');
          _showRestartSnackBar();
        }
      }
    });
  }

  void _showRestartSnackBar() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('部分语言更改将在下次启动时生效'),
        action: SnackBarAction(
          label: '立即重启',
          onPressed: () {
            if (Platform.isWindows) {
              exit(0);
            }
          },
        ),
      ),
    );
  }

  void _showThemeDialog() {
    final currentTheme = ref.read(themeModeProvider).valueOrNull ?? ThemeMode.system;
    final loc = EasyWorkLocalizations.of(context)!;
    showDialog<ThemeMode>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('主题模式'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: ThemeMode.values.map((mode) {
            String label;
            switch (mode) {
              case ThemeMode.light:
                label = loc.settings_theme_light;
              case ThemeMode.dark:
                label = loc.settings_theme_dark;
              case ThemeMode.system:
                label = loc.settings_theme_system;
            }
            return RadioListTile<ThemeMode>(
              title: Text(label),
              value: mode,
              groupValue: currentTheme,
              onChanged: (value) {
                Navigator.pop(context, value);
              },
            );
          }).toList(),
        ),
      ),
    ).then((value) {
      if (value != null && value != currentTheme) {
        ref.read(themeModeProvider.notifier).setThemeMode(value);
      }
    });
  }

  void _showEmailSyncModeDialog() {
    showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('后台同步模式'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: const Text('保持连接'),
              subtitle: const Text('窗口最小化后保持邮件连接'),
              value: 'idle',
              groupValue: _emailSyncMode,
              onChanged: (value) {
                Navigator.pop(context, value);
              },
            ),
            RadioListTile<String>(
              title: const Text('定时同步'),
              subtitle: const Text('断开连接，定时检查新邮件'),
              value: 'polling',
              groupValue: _emailSyncMode,
              onChanged: (value) {
                Navigator.pop(context, value);
              },
            ),
          ],
        ),
      ),
    ).then((value) {
      if (value != null && value != _emailSyncMode) {
        setState(() => _emailSyncMode = value);
        _updateSetting(_emailSyncModeKey, value);
      }
    });
  }

  void _showPollIntervalDialog() {
    _showNumericPickerDialog(
      title: '同步间隔',
      value: _emailPollInterval,
      options: const [1, 5, 15, 30],
      suffix: '分钟',
      onSelected: (v) {
        setState(() => _emailPollInterval = v);
        _updateSetting(_emailPollIntervalKey, v.toString());
      },
    );
  }

  void _showNumericPickerDialog({
    required String title,
    required int value,
    required List<int> options,
    required String suffix,
    required void Function(int) onSelected,
  }) {
    showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: options.map((option) {
            return RadioListTile<int>(
              title: Text('$option $suffix'),
              value: option,
              groupValue: value,
              onChanged: (v) {
                Navigator.pop(context, v);
              },
            );
          }).toList(),
        ),
      ),
    ).then((v) {
      if (v != null && v != value) {
        onSelected(v);
      }
    });
  }
}
