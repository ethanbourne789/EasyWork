import '../../core/event/app_event.dart';

class TaskCreatedEvent extends AppEvent {
  final int taskId;
  final String title;
  final String priority;

  TaskCreatedEvent({
    required this.taskId,
    required this.title,
    required this.priority,
  }) : super(moduleName: 'task_board');
}

class TaskStatusChangedEvent extends AppEvent {
  final int taskId;
  final String title;
  final String oldStatus;
  final String newStatus;

  TaskStatusChangedEvent({
    required this.taskId,
    required this.title,
    required this.oldStatus,
    required this.newStatus,
  }) : super(moduleName: 'task_board');
}

class TaskDeletedEvent extends AppEvent {
  final int taskId;
  final String title;

  TaskDeletedEvent({required this.taskId, required this.title})
      : super(moduleName: 'task_board');
}
