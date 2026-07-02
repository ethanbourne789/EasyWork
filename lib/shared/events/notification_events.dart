import '../../core/event/app_event.dart';

enum NotificationType { email, task, system }

class RequestNotificationEvent extends AppEvent {
  final String title;
  final String body;
  final NotificationType type;
  final String? routeOnTap;

  RequestNotificationEvent({
    required this.title,
    required this.body,
    required this.type,
    this.routeOnTap,
  }) : super(moduleName: 'notification');
}
