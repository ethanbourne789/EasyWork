import 'dart:async';
import 'app_event.dart';

class EventBus {
  final _controller = StreamController<AppEvent>.broadcast();

  Stream<T> on<T extends AppEvent>() {
    return _controller.stream.where((e) => e is T).cast<T>();
  }

  void publish<T extends AppEvent>(T event) {
    _controller.add(event);
  }

  void dispose() {
    _controller.close();
  }
}
