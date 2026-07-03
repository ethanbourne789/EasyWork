import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/event_providers.dart';
import '../providers/database_providers.dart';
import '../event/window_events.dart';
import '../../features/email/providers/email_providers.dart';
import '../../features/email/data/email_sync_service.dart';

class BackgroundSyncManager {
  final WidgetRef _ref;
  Timer? _pollTimer;
  bool _isInBackground = false;
  String _syncMode = 'idle';

  BackgroundSyncManager(this._ref);

  void init() {
    if (!Platform.isWindows) return;

    final eventBus = _ref.read(eventBusProvider);

    eventBus.on<WindowHiddenEvent>().listen((_) {
      _onWindowHidden();
    });

    eventBus.on<WindowShownEvent>().listen((_) {
      _onWindowShown();
    });
  }

  Future<void> _onWindowHidden() async {
    _isInBackground = true;
    await _loadSyncMode();

    if (_syncMode == 'polling') {
      await _startPollingMode();
    }
  }

  Future<void> _onWindowShown() async {
    _isInBackground = false;

    if (_syncMode == 'polling') {
      await _stopPollingMode();
    }
  }

  Future<void> _loadSyncMode() async {
    try {
      final dao = await _ref.read(settingsDaoProvider.future);
      final setting = await dao.getSetting('emailSyncMode');
      _syncMode = setting?.value ?? 'idle';
    } catch (e) {
      _syncMode = 'idle';
    }
  }

  Future<void> _startPollingMode() async {
    final interval = await _getPollInterval();

    _pollTimer = Timer.periodic(interval, (_) {
      _pollForNewEmails();
    });

    await _pollForNewEmails();
  }

  Future<void> _stopPollingMode() async {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<Duration> _getPollInterval() async {
    try {
      final dao = await _ref.read(settingsDaoProvider.future);
      final setting = await dao.getSetting('email_poll_interval');
      final minutes = int.tryParse(setting?.value ?? '5') ?? 5;
      return Duration(minutes: minutes);
    } catch (e) {
      return const Duration(minutes: 5);
    }
  }

  Future<void> _pollForNewEmails() async {
    if (!_isInBackground) return;

    try {
      final syncService = _ref.read(emailSyncServiceProvider);
      if (syncService == null) return;

      final dataSources = _ref.read(mailDataSourcesProvider);
      final accountIds = dataSources.keys.toList();

      for (final accountId in accountIds) {
        await syncService.incrementalSync(accountId);
      }
    } catch (e) {
      debugPrint('Background poll error: $e');
    }
  }

  void dispose() {
    _pollTimer?.cancel();
  }
}
