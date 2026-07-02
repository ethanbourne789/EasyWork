import 'dart:io';

enum DeviceType { mobile, tablet, desktop }

class PlatformUtil {
  static bool get isDesktop => Platform.isWindows || Platform.isLinux || Platform.isMacOS;
  static bool get isMobile => Platform.isAndroid || Platform.isIOS;
  static bool get isTablet => false;

  static DeviceType getDeviceType(double width) {
    if (width > 900) return DeviceType.desktop;
    if (width > 600) return DeviceType.tablet;
    return DeviceType.mobile;
  }

  static bool isWideScreen(double width) => width > 900;
  static bool isMediumScreen(double width) => width > 600 && width <= 900;
  static bool isNarrowScreen(double width) => width <= 600;
}
