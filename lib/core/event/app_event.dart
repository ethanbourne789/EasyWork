abstract class AppEvent {
  final DateTime occurredAt;
  final String moduleName;

  AppEvent({DateTime? occurredAt, required this.moduleName})
      : occurredAt = occurredAt ?? DateTime.now();
}

class DataChangedEvent<T> extends AppEvent {
  final ChangeType changeType;
  final T data;
  final String? description;

  DataChangedEvent({
    required super.moduleName,
    required this.changeType,
    required this.data,
    this.description,
  });
}

enum ChangeType { created, updated, deleted }
