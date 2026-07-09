import 'dart:developer' as dev;
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
    bool smtpStartTls = false,
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
      smtpStartTls: smtpStartTls,
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
    final dataSources = state.values.toList();
    state = {};
    // StateNotifier.dispose() must return synchronously, so we cannot await the
    // async close() here. We still kick off the teardown (cancel subscriptions,
    // stop polling, disconnect) and surface any failure via the logger instead
    // of silently swallowing it (previous `.catchError((_) {})` hid all errors).
    if (dataSources.isNotEmpty) {
      Future.wait(dataSources.map((ds) => ds.close())).catchError((e) {
        dev.log('关闭数据源时发生错误: $e', name: 'MailDataSourcesNotifier');
      });
    }
    super.dispose();
  }
}
