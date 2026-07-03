import 'dart:io';

class PlatformCapabilities {
  static bool get hasSystemTray => Platform.isWindows;
  static bool get hasBackgroundService => Platform.isAndroid;
  static bool get hasDeepLinks => Platform.isAndroid;
  static bool get hasShareIntent => Platform.isAndroid;
  static bool get hasAutoStart => Platform.isWindows;
  static bool get hasFileAssociation => Platform.isWindows;
  static bool get hasSingleInstance => Platform.isWindows;
  static bool get hasCloseToTray => Platform.isWindows;
  static bool get hasWindowPersistence => Platform.isWindows;
  static bool get hasBackgroundEmailSync => Platform.isWindows;
}
