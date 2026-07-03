import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/event_providers.dart';
import 'mail_data_source.dart';

class MailDataSourcesNotifier extends StateNotifier<Map<int, MailDataSource>> {
  final Ref _ref;

  MailDataSourcesNotifier(this._ref) : super({});

  Future<void> addAccount({
    required int accountId,
    required String displayName,
    required String email,
    required String password,
    required String imapHost,
    int imapPort = 993,
    bool imapUseSsl = true,
    required String smtpHost,
    int smtpPort = 465,
    bool smtpUseSsl = true,
  }) async {
    final eventBus = _ref.read(eventBusProvider);
    final ds = MailDataSource(
      accountId: accountId,
      displayName: displayName,
      email: email,
      password: password,
      imapHost: imapHost,
      imapPort: imapPort,
      imapUseSsl: imapUseSsl,
      smtpHost: smtpHost,
      smtpPort: smtpPort,
      smtpUseSsl: smtpUseSsl,
      appEventBus: eventBus,
    );
    await ds.connect();
    state = {...state, accountId: ds};
  }

  Future<void> removeAccount(int accountId) async {
    final ds = state[accountId];
    if (ds != null) {
      await ds.close();
      state = Map.from(state)..remove(accountId);
    }
  }

  MailDataSource? get(int accountId) => state[accountId];

  @override
  void dispose() {
    // Snapshot data sources before clearing state so close() can run.
    // StateNotifier.dispose() is synchronous — we cannot await, but we
    // must fire the close futures so IMAP/SMTP connections are torn down.
    final dataSources = state.values.toList();
    state = {};
    for (final ds in dataSources) {
      ds.close(); // ignore: unawaited_futures — dispose is sync
    }
    super.dispose();
  }
}
