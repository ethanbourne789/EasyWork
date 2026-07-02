import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../event/event_bus.dart';
import '../security/credential_store.dart';

final eventBusProvider = Provider<EventBus>((ref) {
  final bus = EventBus();
  ref.onDispose(bus.dispose);
  return bus;
});

final credentialStoreProvider = Provider<CredentialStore>((ref) {
  return CredentialStore();
});

final eventSubscriptionsProvider = Provider<EventSubscriptions>((ref) {
  final subs = EventSubscriptions(ref);
  ref.onDispose(subs.dispose);
  return subs;
});

class EventSubscriptions {
  EventSubscriptions(Ref ref);

  void dispose() {}
}
