import '../../core/event/app_event.dart';

class TransactionRecordedEvent extends AppEvent {
  final double amount;
  final String type;
  final String category;

  TransactionRecordedEvent({
    required this.amount,
    required this.type,
    required this.category,
  }) : super(moduleName: 'accounting');
}
