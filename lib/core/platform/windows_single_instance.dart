import 'dart:ffi';
import 'dart:io';
import 'package:ffi/ffi.dart';

typedef CreateMutexWNative = IntPtr Function(Pointer<Void> bMutexAttributes, Int32 bInitialOwner, Pointer<Utf16> lpName);
typedef CreateMutexWDart = int Function(Pointer<Void> bMutexAttributes, int bInitialOwner, Pointer<Utf16> lpName);

typedef GetLastErrorNative = Int32 Function();
typedef GetLastErrorDart = int Function();

typedef FindWindowWNative = IntPtr Function(Pointer<Utf16> lpClassName, Pointer<Utf16> lpWindowName);
typedef FindWindowWDart = int Function(Pointer<Utf16> lpClassName, Pointer<Utf16> lpWindowName);

typedef ShowWindowNative = Int32 Function(IntPtr hWnd, Int32 nCmdShow);
typedef ShowWindowDart = int Function(int hWnd, int nCmdShow);

typedef SetForegroundWindowNative = Int32 Function(IntPtr hWnd);
typedef SetForegroundWindowDart = int Function(int hWnd);

class WindowsSingleInstance {
  static const _mutexName = 'EasyWork_SingleInstance';
  static const _windowTitle = 'EasyWork';
  static const _swRestore = 9;
  static const _errorAlreadyExists = 183;

  static final _kernel32 = DynamicLibrary.open('kernel32.dll');
  static final _user32 = DynamicLibrary.open('user32.dll');

  static final _createMutexW = _kernel32
      .lookupFunction<CreateMutexWNative, CreateMutexWDart>('CreateMutexW');
  static final _getLastError = _kernel32
      .lookupFunction<GetLastErrorNative, GetLastErrorDart>('GetLastError');
  static final _findWindowW = _user32
      .lookupFunction<FindWindowWNative, FindWindowWDart>('FindWindowW');
  static final _showWindow = _user32
      .lookupFunction<ShowWindowNative, ShowWindowDart>('ShowWindow');
  static final _setForegroundWindow = _user32
      .lookupFunction<SetForegroundWindowNative, SetForegroundWindowDart>('SetForegroundWindow');

  static Future<bool> ensureOnlyInstance() async {
    if (!Platform.isWindows) return false;

    final mutexName = _mutexName.toNativeUtf16();
    final hMutex = _createMutexW(nullptr, 1, mutexName);
    calloc.free(mutexName);

    if (hMutex == 0) {
      return false;
    }

    if (_getLastError() == _errorAlreadyExists) {
      _activateExistingWindow();
      return true;
    }

    return false;
  }

  static void _activateExistingWindow() {
    final windowTitle = _windowTitle.toNativeUtf16();
    final hWnd = _findWindowW(nullptr, windowTitle);
    calloc.free(windowTitle);

    if (hWnd != 0) {
      _showWindow(hWnd, _swRestore);
      _setForegroundWindow(hWnd);
    }
  }
}
