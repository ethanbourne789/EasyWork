import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/notification_service.dart';

/// Cross-platform local notification service (BUG-14).
final notificationServiceProvider = Provider<NotificationService>((ref) {
  final service = NotificationService();
  // Best-effort initialisation; it is a no-op on Windows where the system
  // tray is used instead.
  service.init();
  return service;
});
