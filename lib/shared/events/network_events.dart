import '../../core/event/app_event.dart';

class OnlineEvent extends AppEvent {
  OnlineEvent() : super(moduleName: 'system');
}

class OfflineEvent extends AppEvent {
  OfflineEvent() : super(moduleName: 'system');
}
