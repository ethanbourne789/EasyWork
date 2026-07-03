// Flutter web plugin registrant file.
//
// Generated file. Do not edit.
//

// @dart = 2.13
// ignore_for_file: type=lint

import 'package:connectivity_plus/src/connectivity_plus_web.dart';
import 'package:file_picker/_internal/file_picker_web.dart';
import 'package:flutter_keyboard_visibility_temp_fork/flutter_keyboard_visibility_web.dart';
import 'package:flutter_native_splash/flutter_native_splash_web.dart';
import 'package:flutter_secure_storage_web/flutter_secure_storage_web.dart';
import 'package:permission_handler_html/permission_handler_html.dart';
import 'package:quill_native_bridge_web/quill_native_bridge_web.dart';
import 'package:url_launcher_web/url_launcher_web.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';

void registerPlugins([final Registrar? pluginRegistrar]) {
  final Registrar registrar = pluginRegistrar ?? webPluginRegistrar;
  ConnectivityPlusWebPlugin.registerWith(registrar);
  FilePickerWeb.registerWith(registrar);
  FlutterKeyboardVisibilityTempForkWeb.registerWith(registrar);
  FlutterNativeSplashWeb.registerWith(registrar);
  FlutterSecureStorageWeb.registerWith(registrar);
  WebPermissionHandler.registerWith(registrar);
  QuillNativeBridgeWeb.registerWith(registrar);
  UrlLauncherPlugin.registerWith(registrar);
  registrar.registerMessageHandler();
}
