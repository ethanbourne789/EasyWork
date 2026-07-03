import 'app_event.dart';

class WindowHiddenEvent extends AppEvent {
  WindowHiddenEvent() : super(moduleName: 'system');
}

class WindowShownEvent extends AppEvent {
  WindowShownEvent() : super(moduleName: 'system');
}
