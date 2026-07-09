import 'dart:developer' as dev;
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Cross-platform local notifications (BUG-14).
///
/// Previously new-email alerts were only surfaced through the Windows system
/// tray. This service uses `flutter_local_notifications` so every platform
/// (Android / iOS / macOS / Linux) gets a native notification when a new email
/// arrives. On Windows it is intentionally a no-op because the tray balloon is
/// already handled by [SystemTrayService].
class NotificationService {
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    if (Platform.isWindows) {
      // Windows relies on the system tray for notifications.
      _initialized = true;
      return;
    }
    const initializationSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
      macOS: DarwinInitializationSettings(),
      linux: LinuxInitializationSettings(defaultActionName: '打开'),
    );
    try {
      await _plugin.initialize(
        initializationSettings,
        onDidReceiveNotificationResponse: _onNotificationTapped,
      );
      _initialized = true;
    } catch (e) {
      dev.log('通知服务初始化失败: $e', name: 'NotificationService');
    }
  }

  void _onNotificationTapped(NotificationResponse response) {
    // Hook for opening the tapped email; left for future wiring.
  }

  Future<void> showNewEmail({
    required int id,
    required String fromAddress,
    required String subject,
  }) async {
    await init();
    if (!_initialized || Platform.isWindows) return;
    const androidDetails = AndroidNotificationDetails(
      'email_channel',
      '新邮件',
      channelDescription: '收到新邮件时通知',
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
    );
    const details = NotificationDetails(android: androidDetails);
    try {
      await _plugin.show(
        id,
        subject.isEmpty ? '(无主题)' : subject,
        fromAddress,
        details,
      );
    } catch (e) {
      dev.log('显示新邮件通知失败: $e', name: 'NotificationService');
    }
  }
}
