import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/event_providers.dart';
import '../providers/database_providers.dart';
import '../providers/notification_providers.dart';
import '../event/window_events.dart';
import '../../features/email/providers/email_providers.dart';
import '../../features/email/data/email_sync_service.dart';
import '../../shared/events/email_events.dart';

class BackgroundSyncManager {
  final WidgetRef _ref;
  Timer? _pollTimer;
  bool _isInBackground = false;
  String _syncMode = 'idle';
  final List<StreamSubscription<dynamic>> _subscriptions = [];

  BackgroundSyncManager(this._ref);

  void init() {
    final eventBus = _ref.read(eventBusProvider);

    // BUG-14: cross-platform new-email notifications. Previously only the
    // Windows system tray showed a balloon; now every platform gets a native
    // local notification via [NotificationService].
    final notificationService = _ref.read(notificationServiceProvider);
    _subscriptions.add(
      eventBus.on<NewEmailReceivedEvent>().listen((event) {
        notificationService.showNewEmail(
          id: event.localEmailId,
          fromAddress: event.fromAddress,
          subject: event.subject,
        );
      }),
    );

    if (Platform.isWindows) {
      // On Windows, background polling is driven by window hide/show events.
      _subscriptions.add(
        eventBus.on<WindowHiddenEvent>().listen((_) => _onWindowHidden()),
      );
      _subscriptions.add(
        eventBus.on<WindowShownEvent>().listen((_) => _onWindowShown()),
      );
    } else {
      // BUG-14: background sync was Windows-tray-only. On other platforms run a
      // periodic sync while the app is alive so new mail is fetched and
      // notified. (OS-level background fetch via workmanager is a follow-up
      // that requires native manifest/capability setup.)
      _startPollingMode();
    }
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
    // On Windows only poll while the window is hidden; on other platforms the
    // periodic timer runs whenever the app is alive.
    if (Platform.isWindows && !_isInBackground) return;

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
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    _subscriptions.clear();
  }
}
