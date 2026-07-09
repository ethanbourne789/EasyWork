import 'package:drift/drift.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../../core/database/app_database.dart';
import '../../../core/database/tables/tasks_dao.dart';
import '../../../core/event/event_bus.dart';
import '../../../shared/events/email_events.dart';

class EmailToTaskResult {
  final int taskId;
  final String title;
  final String description;

  const EmailToTaskResult({
    required this.taskId,
    required this.title,
    required this.description,
  });
}

class EmailToTaskService {
  final EventBus _eventBus;
  final TasksDao _tasksDao;

  EmailToTaskService({
    required EventBus eventBus,
    required TasksDao tasksDao,
  })  : _eventBus = eventBus,
        _tasksDao = tasksDao;

  Future<EmailToTaskResult> convertEmailToTask({
    required int emailId,
    required MimeMessage email,
    required String title,
    String? description,
    String priority = 'medium',
    DateTime? dueDate,
  }) async {
    final from = email.from?.first.toString() ?? '';
    final subject = email.decodeSubject() ?? '';
    final date = email.decodeDate();
    final body = email.decodeTextPlainPart() ?? '';

    final fullDescription = [
      if (description != null && description.isNotEmpty) description,
      '---',
      '来源邮件: $subject',
      '发件人: $from',
      if (date != null) '日期: ${date.toLocal()}',
      if (body.isNotEmpty) '\n邮件内容:\n$body',
    ].join('\n');

    final now = DateTime.now();
    final taskId = await _tasksDao.insertTask(TasksCompanion.insert(
      title: title,
      description: Value(fullDescription),
      priority: Value(priority),
      dueDate: Value(dueDate),
      createdAt: now,
      updatedAt: now,
    ));

    _eventBus.publish(EmailConvertedToTaskEvent(
      emailId: emailId,
      taskId: taskId,
      subject: subject,
    ));

    return EmailToTaskResult(
      taskId: taskId,
      title: title,
      description: fullDescription,
    );
  }
}
