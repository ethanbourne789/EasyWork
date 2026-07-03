import '../../core/event/app_event.dart';

class NewEmailReceivedEvent extends AppEvent {
  final String messageId;
  final int localEmailId;
  final String fromAddress;
  final String subject;

  NewEmailReceivedEvent({
    required this.messageId,
    required this.localEmailId,
    required this.fromAddress,
    required this.subject,
  }) : super(moduleName: 'email');
}

class EmailConvertedToTaskEvent extends AppEvent {
  final int emailId;
  final int taskId;
  final String subject;

  EmailConvertedToTaskEvent({
    required this.emailId,
    required this.taskId,
    required this.subject,
  }) : super(moduleName: 'email');
}

class UnreadCountChangedEvent extends AppEvent {
  final int totalUnread;

  UnreadCountChangedEvent({required this.totalUnread})
      : super(moduleName: 'email');
}

class EmailConnectionLostEvent extends AppEvent {
  final int accountId;

  EmailConnectionLostEvent({required this.accountId})
      : super(moduleName: 'email');
}

class EmailConnectionReestablishedEvent extends AppEvent {
  final int accountId;

  EmailConnectionReestablishedEvent({required this.accountId})
      : super(moduleName: 'email');
}

class EmailFlagsChangedEvent extends AppEvent {
  final int accountId;
  final String messageId;
  final bool? isSeen;
  final bool? isFlagged;
  final bool? isAnswered;
  final bool? isForwarded;

  EmailFlagsChangedEvent({
    required this.accountId,
    required this.messageId,
    this.isSeen,
    this.isFlagged,
    this.isAnswered,
    this.isForwarded,
  }) : super(moduleName: 'email');
}

class EmailVanishedEvent extends AppEvent {
  final int accountId;
  final List<int> uids;

  EmailVanishedEvent({
    required this.accountId,
    required this.uids,
  }) : super(moduleName: 'email');
}
