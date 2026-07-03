import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:window_manager/window_manager.dart';

import '../providers/event_providers.dart';
import '../providers/database_providers.dart';
import '../event/window_events.dart';

class WindowManagerService implements WindowListener {
  final WidgetRef _ref;
  Timer? _debounceTimer;
  bool _isInitialized = false;

  WindowManagerService(this._ref);

  Future<void> init() async {
    if (!Platform.isWindows || _isInitialized) return;

    await windowManager.ensureInitialized();
    await windowManager.setMinimumSize(const Size(800, 600));
    await windowManager.setPreventClose(true);

    await _restoreWindowState();

    windowManager.addListener(this);

    _isInitialized = true;
  }

  Future<void> _restoreWindowState() async {
    try {
      final dao = await _ref.read(settingsDaoProvider.future);

      final widthSetting = await dao.getSetting('windowWidth');
      final heightSetting = await dao.getSetting('windowHeight');
      final xSetting = await dao.getSetting('windowX');
      final ySetting = await dao.getSetting('windowY');

      final width = widthSetting?.value;
      final height = heightSetting?.value;
      final x = xSetting?.value;
      final y = ySetting?.value;

      if (width != null && height != null) {
        await windowManager.setSize(
          Size(double.parse(width), double.parse(height)),
        );
      }

      if (x != null && y != null) {
        await windowManager.setPosition(
          Offset(double.parse(x), double.parse(y)),
        );
      } else {
        await windowManager.center();
      }
    } catch (e) {
      debugPrint('Failed to restore window state: $e');
      await windowManager.setSize(const Size(1280, 720));
      await windowManager.center();
    }
  }

  Future<void> _saveWindowState() async {
    if (!Platform.isWindows) return;

    try {
      final size = await windowManager.getSize();
      final position = await windowManager.getPosition();

      final dao = await _ref.read(settingsDaoProvider.future);

      await dao.setSetting('windowWidth', size.width.toInt().toString());
      await dao.setSetting('windowHeight', size.height.toInt().toString());
      await dao.setSetting('windowX', position.dx.toInt().toString());
      await dao.setSetting('windowY', position.dy.toInt().toString());
    } catch (e) {
      debugPrint('Failed to save window state: $e');
    }
  }

  Future<void> show() async {
    if (!Platform.isWindows) return;
    await windowManager.show();
    await windowManager.focus();
    _publishWindowShown();
  }

  Future<void> hide() async {
    if (!Platform.isWindows) return;
    await windowManager.hide();
    _publishWindowHidden();
  }

  void _publishWindowHidden() {
    final eventBus = _ref.read(eventBusProvider);
    eventBus.publish<WindowHiddenEvent>(WindowHiddenEvent());
  }

  void _publishWindowShown() {
    final eventBus = _ref.read(eventBusProvider);
    eventBus.publish<WindowShownEvent>(WindowShownEvent());
  }

  Future<bool> shouldCloseToTray() async {
    if (!Platform.isWindows) return false;

    try {
      final dao = await _ref.read(settingsDaoProvider.future);
      final setting = await dao.getSetting('closeToTray');
      return setting?.value != 'false';
    } catch (e) {
      return true;
    }
  }

  @override
  void onWindowClose() async {
    final shouldMinimize = await shouldCloseToTray();

    if (shouldMinimize) {
      await hide();
    } else {
      await _saveWindowState();
      await windowManager.destroy();
    }
  }

  @override
  void onWindowResize() {
    _debounceSave();
  }

  @override
  void onWindowMove() {
    _debounceSave();
  }

  @override
  void onWindowFocus() {}

  @override
  void onWindowBlur() {}

  @override
  void onWindowMaximize() {}

  @override
  void onWindowUnmaximize() {}

  @override
  void onWindowMinimize() {}

  @override
  void onWindowRestore() {}

  @override
  void onWindowDocked() {}

  @override
  void onWindowUndocked() {}

  @override
  void onWindowMoved() {}

  @override
  void onWindowResized() {}

  @override
  void onWindowEnterFullScreen() {}

  @override
  void onWindowLeaveFullScreen() {}

  @override
  void onWindowEvent(String eventName) {}

  void _debounceSave() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 500), () {
      _saveWindowState();
    });
  }

  void dispose() {
    _debounceTimer?.cancel();
    windowManager.removeListener(this);
  }
}
