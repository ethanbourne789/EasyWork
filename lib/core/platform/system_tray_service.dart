import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:system_tray/system_tray.dart';
import 'package:window_manager/window_manager.dart';

import '../event/app_event.dart';
import '../providers/event_providers.dart';
import '../../shared/events/email_events.dart';

class SystemTrayService {
  final WidgetRef _ref;
  final SystemTray _systemTray = SystemTray();
  bool _isInitialized = false;
  Timer? _flashTimer;
  int _flashCount = 0;
  late String _iconPath;
  late String _iconHighlightPath;

  SystemTrayService(this._ref);

  Future<void> init() async {
    if (!Platform.isWindows || _isInitialized) return;

    _iconPath = _getIconPath('app_icon.ico');
    _iconHighlightPath = _getIconPath('app_icon_highlight.ico');

    await _systemTray.initSystemTray(
      title: 'EasyWork',
      iconPath: _iconPath,
    );

    await _initContextMenu();

    _systemTray.registerSystemTrayEventHandler(_onSystemTrayEvent);

    _listenToEmailEvents();

    _isInitialized = true;
  }

  String _getIconPath(String iconName) {
    if (Platform.isWindows) {
      final exePath = Platform.resolvedExecutable;
      final exeDir = File(exePath).parent.path;
      return '$exeDir\\data\\flutter_assets\\assets\\icon\\$iconName';
    }
    return 'assets/icon/$iconName';
  }

  Future<void> _initContextMenu() async {
    final menu = Menu();
    await menu.buildFrom([
      MenuItemLabel(
        label: '显示 EasyWork',
        onClicked: (_) => _showWindow(),
      ),
      MenuSeparator(),
      MenuItemLabel(
        label: '新建任务',
        onClicked: (_) => _navigateTo('/tasks/new'),
      ),
      MenuItemLabel(
        label: '写邮件',
        onClicked: (_) => _navigateTo('/email/compose'),
      ),
      MenuSeparator(),
      MenuItemLabel(
        label: '退出',
        onClicked: (_) => _exitApp(),
      ),
    ]);

    await _systemTray.setContextMenu(menu);
  }

  void _onSystemTrayEvent(String event) {
    if (event == kSystemTrayEventClick) {
      _showWindow();
    } else if (event == kSystemTrayEventDoubleClick) {
      _showWindow();
    } else if (event == kSystemTrayEventRightClick) {
      _systemTray.popUpContextMenu();
    }
  }

  Future<void> _showWindow() async {
    await windowManager.show();
    await windowManager.focus();
  }

  void _navigateTo(String route) {
    _showWindow();
    final eventBus = _ref.read(eventBusProvider);
    eventBus.publish<NavigationRequestedEvent>(NavigationRequestedEvent(route: route));
  }

  void _exitApp() {
    final eventBus = _ref.read(eventBusProvider);
    eventBus.publish<AppClosingEvent>(AppClosingEvent());

    Timer(const Duration(milliseconds: 500), () {
      _systemTray.destroy();
      exit(0);
    });
  }

  void _listenToEmailEvents() {
    final eventBus = _ref.read(eventBusProvider);
    eventBus.on<NewEmailReceivedEvent>().listen((event) {
      flashIcon();
    });
  }

  void flashIcon() {
    if (!Platform.isWindows || !_isInitialized) return;

    _flashCount = 0;
    _flashTimer?.cancel();
    _flashTimer = Timer.periodic(const Duration(milliseconds: 300), (timer) {
      _flashCount++;
      if (_flashCount >= 10) {
        timer.cancel();
        _flashTimer = null;
        _systemTray.setImage(_iconPath);
        return;
      }

      final iconPath = _flashCount.isOdd ? _iconHighlightPath : _iconPath;
      _systemTray.setImage(iconPath);
    });
  }

  void dispose() {
    _flashTimer?.cancel();
    _systemTray.destroy();
  }
}

class NavigationRequestedEvent extends AppEvent {
  final String route;

  NavigationRequestedEvent({required this.route}) : super(moduleName: 'system');
}

class AppClosingEvent extends AppEvent {
  AppClosingEvent() : super(moduleName: 'system');
}
