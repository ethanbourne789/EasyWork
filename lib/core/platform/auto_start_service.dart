import 'dart:ffi';
import 'dart:io';
import 'package:ffi/ffi.dart';

typedef RegOpenKeyExWNative = Int32 Function(
  IntPtr hKey,
  Pointer<Utf16> lpSubKey,
  Int32 ulOptions,
  Int32 samDesired,
  Pointer<IntPtr> phkResult,
);
typedef RegOpenKeyExWDart = int Function(
  int hKey,
  Pointer<Utf16> lpSubKey,
  int ulOptions,
  int samDesired,
  Pointer<IntPtr> phkResult,
);

typedef RegQueryValueExWNative = Int32 Function(
  IntPtr hKey,
  Pointer<Utf16> lpValueName,
  Pointer<IntPtr> lpReserved,
  Pointer<Int32> lpType,
  Pointer<Uint8> lpData,
  Pointer<Int32> lpcbData,
);
typedef RegQueryValueExWDart = int Function(
  int hKey,
  Pointer<Utf16> lpValueName,
  Pointer<IntPtr> lpReserved,
  Pointer<Int32> lpType,
  Pointer<Uint8> lpData,
  Pointer<Int32> lpcbData,
);

typedef RegSetValueExWNative = Int32 Function(
  IntPtr hKey,
  Pointer<Utf16> lpValueName,
  Int32 reserved,
  Int32 dwType,
  Pointer<Uint8> lpData,
  Int32 cbData,
);
typedef RegSetValueExWDart = int Function(
  int hKey,
  Pointer<Utf16> lpValueName,
  int reserved,
  int dwType,
  Pointer<Uint8> lpData,
  int cbData,
);

typedef RegDeleteValueWNative = Int32 Function(
  IntPtr hKey,
  Pointer<Utf16> lpValueName,
);
typedef RegDeleteValueWDart = int Function(
  int hKey,
  Pointer<Utf16> lpValueName,
);

typedef RegCloseKeyNative = Int32 Function(IntPtr hKey);
typedef RegCloseKeyDart = int Function(int hKey);

class AutoStartService {
  static const _appName = 'EasyWork';
  static const _runKeyPath = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  static const _hkeyCurrentUser = 0x80000001;
  static const _keySetValue = 0x0002;
  static const _keyRead = 0x20019;
  static const _regSz = 1;
  static const _errorSuccess = 0;

  static final _advapi32 = DynamicLibrary.open('advapi32.dll');

  static final _regOpenKeyExW = _advapi32
      .lookupFunction<RegOpenKeyExWNative, RegOpenKeyExWDart>('RegOpenKeyExW');
  static final _regQueryValueExW = _advapi32
      .lookupFunction<RegQueryValueExWNative, RegQueryValueExWDart>('RegQueryValueExW');
  static final _regSetValueExW = _advapi32
      .lookupFunction<RegSetValueExWNative, RegSetValueExWDart>('RegSetValueExW');
  static final _regDeleteValueW = _advapi32
      .lookupFunction<RegDeleteValueWNative, RegDeleteValueWDart>('RegDeleteValueW');
  static final _regCloseKey = _advapi32
      .lookupFunction<RegCloseKeyNative, RegCloseKeyDart>('RegCloseKey');

  static bool isEnabled() {
    if (!Platform.isWindows) return false;

    final phKey = calloc<IntPtr>();
    final subKey = _runKeyPath.toNativeUtf16();

    final result = _regOpenKeyExW(_hkeyCurrentUser, subKey, 0, _keyRead, phKey);
    calloc.free(subKey);

    if (result != _errorSuccess) {
      calloc.free(phKey);
      return false;
    }

    final hKey = phKey.value;
    final valueName = _appName.toNativeUtf16();
    final pSize = calloc<Int32>();
    pSize.value = 0;

    final queryResult = _regQueryValueExW(hKey, valueName, nullptr, nullptr, nullptr, pSize);
    calloc.free(valueName);
    calloc.free(pSize);

    _regCloseKey(hKey);
    calloc.free(phKey);

    return queryResult == _errorSuccess;
  }

  static void enable() {
    if (!Platform.isWindows) return;

    final exePath = Platform.resolvedExecutable;
    final phKey = calloc<IntPtr>();
    final subKey = _runKeyPath.toNativeUtf16();

    final result = _regOpenKeyExW(_hkeyCurrentUser, subKey, 0, _keySetValue, phKey);
    calloc.free(subKey);

    if (result != _errorSuccess) {
      calloc.free(phKey);
      return;
    }

    final hKey = phKey.value;
    final valueName = _appName.toNativeUtf16();
    final value = '"$exePath"'.toNativeUtf16();
    final size = (value.length) * 2;

    _regSetValueExW(hKey, valueName, 0, _regSz, value.cast<Uint8>(), size);
    calloc.free(valueName);
    calloc.free(value);

    _regCloseKey(hKey);
    calloc.free(phKey);
  }

  static void disable() {
    if (!Platform.isWindows) return;

    final phKey = calloc<IntPtr>();
    final subKey = _runKeyPath.toNativeUtf16();

    final result = _regOpenKeyExW(_hkeyCurrentUser, subKey, 0, _keySetValue, phKey);
    calloc.free(subKey);

    if (result != _errorSuccess) {
      calloc.free(phKey);
      return;
    }

    final hKey = phKey.value;
    final valueName = _appName.toNativeUtf16();
    _regDeleteValueW(hKey, valueName);
    calloc.free(valueName);

    _regCloseKey(hKey);
    calloc.free(phKey);
  }
}
