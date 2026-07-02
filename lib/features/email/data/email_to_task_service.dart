import 'package:enough_mail/enough_mail.dart';
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

/// Service to convert an email into a task
class EmailToTaskService {
  final EventBus _eventBus;

  EmailToTaskService({
    required EventBus eventBus,
  }) : _eventBus = eventBus;

  /// Convert an email to a task description
  /// Returns a result containing the task info (actual task creation is pending task module)
  Future<EmailToTaskResult> convertEmailToTask({
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

    // TODO: Integrate with task module when available
    final taskId = DateTime.now().millisecondsSinceEpoch;

    _eventBus.publish(EmailConvertedToTaskEvent(
      emailId: 0,
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
