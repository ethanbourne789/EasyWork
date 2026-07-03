# Windows 平台特性设计

> 版本：1.0.0 | 日期：2026-07-02 |

## 1. 概述

为 EasyWork Windows 桌面端添加以下平台特性：

| 功能 | 说明 |
|---|---|
| 唯一实例 | 同一时间只允许一个 EasyWork 实例运行 |
| 托盘图标 | 系统托盘常驻图标 + 右键菜单 + 通知 |
| 后台运行 | 关闭按钮最小化到托盘，不在任务栏显示 |
| 后台邮件同步 | 窗口最小化后保持邮件同步（可配置策略） |
| 关闭到托盘 | 关闭按钮行为可配置（最小化到托盘 / 退出） |
| 窗口状态记忆 | 记住窗口大小和位置，下次启动恢复 |

**技术方案**：Dart 纯 Dart 层实现，使用 `dart:ffi` 调用 Win32 API（唯一实例），结合现有 `system_tray` 和 `window_manager` 包。

---

## 2. 唯一实例

### 2.1 目标

确保同一时间只有一个 EasyWork 实例运行。第二个实例启动时，激活已有实例窗口并自行退出。

### 2.2 实现

通过 `dart:ffi` 调用 Win32 `CreateMutexW` API。

### 2.3 流程

```
main() 启动
  → FFI 调用 CreateMutexW("EasyWork_SingleInstance")
  → 检查 GetLastError() == ERROR_ALREADY_EXISTS
  ├── 是 → 已有实例运行中
  │   → 查找已有窗口（FindWindow + SetForegroundWindow）
  │   → exit(0)
  └── 否 → 这是第一个实例，继续正常启动
      → Mutex 保持到进程退出时自动释放
```

### 2.4 FFI 绑定

使用 `win32` 包提供 Win32 API 的 Dart 绑定（已封装 `CreateMutexW`、`GetLastError`、`FindWindow`、`SetForegroundWindow`）。

```dart
import 'dart:ffi';
import 'dart:io';
import 'package:ffi/ffi.dart';
import 'package:win32/win32.dart';

class WindowsSingleInstance {
  /// 检测是否已有实例运行，如果有则激活已有窗口并返回 true
  static Future<bool> ensureOnlyInstance() async {
    if (!Platform.isWindows) return false;

    final mutexName = 'EasyWork_SingleInstance'.toNativeUtf16();
    final hMutex = CreateMutexW(nullptr, TRUE, mutexName);
    free(mutexName);

    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      // 已有实例运行中，尝试激活窗口
      final windowTitle = 'EasyWork'.toNativeUtf16();
      final hWnd = FindWindow(nullptr, windowTitle);
      free(windowTitle);

      if (hWnd != 0) {
        SetForegroundWindow(hWnd);
        ShowWindow(hWnd, SW_RESTORE);
      }
      return true;
    }

    // 这是第一个实例，Mutex 保持到进程退出时自动释放
    return false;
  }
}
```

### 2.5 调用时机

在 `main()` 中、`WidgetsFlutterBinding.ensureInitialized()` 之前调用：

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 唯一实例检测
  if (Platform.isWindows) {
    final isDuplicate = await WindowsSingleInstance.ensureOnlyInstance();
    if (isDuplicate) exit(0);
  }

  runApp(const ProviderScope(child: EasyWorkApp()));
}
```

### 2.6 文件

```
lib/core/platform/windows_single_instance.dart  # FFI 绑定 + 检测逻辑
```

### 2.7 平台降解

非 Windows 平台跳过唯一实例检测，不做任何操作。

---

## 3. 窗口管理 + 关闭到托盘

### 3.1 目标

- 关闭按钮最小化到托盘（可配置为直接退出）
- 记住窗口大小和位置，下次启动恢复

### 3.2 实现

使用现有 `window_manager` 包。

### 3.3 窗口状态持久化

**设置项**（Settings 表）：

| Key | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `windowWidth` | int | 1280 | 窗口宽度 |
| `windowHeight` | int | 720 | 窗口高度 |
| `windowX` | int | null | 窗口 X 坐标 |
| `windowY` | int | null | 窗口 Y 坐标 |
| `closeToTray` | bool | true | 关闭时最小化到托盘 |

### 3.4 启动流程

```
应用启动
  → windowManager.ensureInitialized()
  → 设置最小尺寸 setMinimumSize(800, 600)
  → 从 SettingsDao 读取上次窗口状态
  → 有记录 → setSize + setPosition
  → 无记录 → 使用默认大小 1280x720，居中显示
```

### 3.5 关闭拦截

```
windowManager.onWindowClose 触发
  → 读取设置：closeToTray
  ├── true → event.preventDefault() + windowManager.hide()
  └── false → 保存窗口状态 + 退出
```

### 3.6 窗口状态保存

resize/move 事件触发时写入 SettingsDao，使用 500ms 防抖避免频繁 IO。

### 3.7 文件

```
lib/core/platform/window_manager_service.dart  # 窗口管理 + 状态持久化
```

### 3.8 设置页 UI

Windows 分组下新增"关闭时最小化到托盘"开关（Switch）。

### 3.9 平台降解

非 Windows 平台：关闭按钮正常退出，不拦截；不保存窗口状态。

---

## 4. 系统托盘

### 4.1 目标

- 系统托盘图标常驻
- 右键菜单：显示 EasyWork / 分隔线 / 新建任务 / 写邮件 / 分隔线 / 退出
- 新邮件到达时：图标闪烁 + 气泡通知

### 4.2 实现

使用现有 `system_tray` 包。

### 4.3 初始化

在 `main()` 中、`runApp()` 之前初始化：

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 唯一实例检测
  // ...

  // 初始化系统托盘
  if (Platform.isWindows) {
    await SystemTrayService.instance.init();
  }

  runApp(const ProviderScope(child: EasyWorkApp()));
}
```

### 4.4 右键菜单

| 菜单项 | 操作 |
|---|---|
| 显示 EasyWork | `windowManager.show()` + `activate()` |
| ──── | 分隔线 |
| 新建任务 | `windowManager.show()` + `context.go('/tasks/new')` |
| 写邮件 | `windowManager.show()` + `context.go('/email/compose')` |
| ──── | 分隔线 |
| 退出 | 释放所有资源 → `exit(0)` |

### 4.5 双击行为

双击托盘图标 → `windowManager.show()` + `windowManager.focus()`。

### 4.6 通知流程

```
NewEmailReceivedEvent 触发
  → EventBus 订阅者收到事件
  → systemTrayService.showNotification(
      title: "新邮件",
      body: "${fromName} - ${subject}",
    )
  → systemTrayService.flashIcon()
    → 切换正常/高亮图标 5 次，每次 300ms
```

### 4.7 图标资源

- 托盘图标：`assets/icon/app_icon.ico`（已有 256x256 版本）
- 闪烁效果：准备两个图标变体（正常 + 高亮），交替显示

### 4.8 文件

```
lib/core/platform/system_tray_service.dart  # 托盘图标 + 菜单 + 通知
```

### 4.9 退出清理

托盘菜单"退出"点击后：

```
EventBus 发布 AppClosingEvent
  → MailDataSource.disconnectAll()
  → SystemTray.destroy()
  → WindowManager.destroy()
  → AppDatabase.close()
  → exit(0)
```

### 4.10 平台降解

非 Windows 平台：不初始化托盘，相关逻辑跳过。

---

## 5. 后台邮件同步

### 5.1 目标

用户可配置窗口最小化到托盘后的邮件同步行为。

### 5.2 两种模式

| 模式 | 行为 | 适用场景 |
|---|---|---|
| 保持连接（idle） | IMAP IDLE/轮询不断开，新邮件实时推送 | 需要实时收信 |
| 定时同步（polling） | 断开 IMAP，每 N 分钟短暂连接检查一次 | 节省资源 |

### 5.3 设置项

| Key | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `emailSyncMode` | String | 'idle' | 后台同步模式：'idle' / 'polling' |
| `emailPollInterval` | int | 5 | 定时同步间隔（分钟）：1/5/15/30 |

### 5.4 切换流程

```
窗口隐藏到托盘
  → 读取设置：emailSyncMode
  ├── idle → 什么都不做，MailDataSource 继续运行
  └── polling → 断开所有 MailDataSource
      → 启动定时器（每 N 分钟）
      → 定时器触发 → 临时连接 → fetchMessages(count: 1) → 对比本地最新
      → 有新邮件 → 下载 + 写入 drift + 触发 NewEmailReceivedEvent
      → 断开临时连接

窗口恢复显示
  → 如果处于 polling 模式 → 停止定时器 → 重建 MailDataSource 连接
  → 如果处于 idle 模式 → 什么都不做
```

### 5.5 EventBus 集成

WindowManagerService 发布窗口可见性事件，BackgroundSyncManager 订阅：

```dart
// 窗口隐藏时发布
EventBus.publish(WindowHiddenEvent());

// 窗口显示时发布
EventBus.publish(WindowShownEvent());
```

### 5.6 定时同步细节

- 使用临时 MailClient（不复用 MailDataSource 的长连接）
- 每次连接时间控制在 10 秒内，超时跳过本次
- 对比本地最新邮件的 messageId 与服务器最新邮件
- 有新邮件 → 下载完整 MIME → 写入 drift → 发布 NewEmailReceivedEvent
- 无新邮件 → 直接断开

### 5.7 文件

```
lib/core/platform/background_sync_manager.dart  # 后台同步策略调度
```

### 5.8 设置页 UI

邮箱分组下新增"后台同步模式"下拉选择（保持连接 / 定时同步）。
选择"定时同步"时，显示"同步间隔"下拉（1/5/15/30 分钟）。

---

## 6. Provider 设计

### 6.1 新增 Provider

```dart
// 托盘服务 Provider（全局单例）
final systemTrayServiceProvider = Provider<SystemTrayService>((ref) {
  return SystemTrayService(ref);
});

// 窗口管理服务 Provider
final windowManagerServiceProvider = Provider<WindowManagerService>((ref) {
  return WindowManagerService(ref);
});

// 后台同步管理器 Provider
final backgroundSyncManagerProvider = Provider<BackgroundSyncManager>((ref) {
  return BackgroundSyncManager(ref);
});
```

### 6.2 依赖关系

```
eventBusProvider
      │
      ├── systemTrayServiceProvider（订阅 NewEmailReceivedEvent）
      ├── windowManagerServiceProvider（发布 WindowHiddenEvent / WindowShownEvent）
      └── backgroundSyncManagerProvider（订阅 WindowHiddenEvent / WindowShownEvent）
            │
            └── mailDataSourcesProvider（读写 MailDataSource 连接）
```

---

## 7. 启动流程

```
main() async
  → WidgetsFlutterBinding.ensureInitialized()
  → 唯一实例检测 → 已有实例 → exit(0)
  → 初始化 SystemTray（仅 Windows）
  → 初始化 WindowManager（仅 Windows）
  → runApp(ProviderScope(child: EasyWorkApp()))

EasyWorkApp.initState()
  → 注册 windowManager.onWindowClose 回调
  → 初始化 BackgroundSyncManager
  → 邮箱账户连接（现有逻辑）
  → 监听 EventBus：NewEmailReceivedEvent → 托盘通知 + 图标闪烁
```

---

## 8. 退出流程

```
托盘菜单 "退出" 点击
  → EventBus 发布 AppClosingEvent
  → 各模块清理：
      ├── MailDataSource.disconnectAll()
      ├── SystemTray.destroy()
      ├── WindowManager.destroy()
      └── AppDatabase.close()
  → exit(0)
```

---

## 9. 文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `lib/core/platform/windows_single_instance.dart` | 新增 | 唯一实例检测（FFI + Win32） |
| `lib/core/platform/window_manager_service.dart` | 新增 | 窗口管理 + 状态持久化 |
| `lib/core/platform/system_tray_service.dart` | 新增 | 托盘图标 + 菜单 + 通知 |
| `lib/core/platform/background_sync_manager.dart` | 新增 | 后台同步策略调度 |
| `lib/core/platform/platform_capabilities.dart` | 修改 | 增加 hasCloseToTray 等属性 |
| `lib/main.dart` | 修改 | 集成平台服务初始化 |
| `lib/presentation/pages/settings/settings_page.dart` | 修改 | 新增设置项 UI |

---

## 10. 设置项汇总

| Key | 类型 | 默认值 | 所属分组 | UI 控件 |
|---|---|---|---|---|
| `closeToTray` | bool | true | 通用 | Switch |
| `emailSyncMode` | String | 'idle' | 邮箱 | 下拉选择 |
| `emailPollInterval` | int | 5 | 邮箱 | 下拉选择 |
| `windowWidth` | int | 1280 | 内部 | 不显示 |
| `windowHeight` | int | 720 | 内部 | 不显示 |
| `windowX` | int | null | 内部 | 不显示 |
| `windowY` | int | null | 内部 | 不显示 |

---

## 11. 依赖

需新增以下依赖：

| 包 | 用途 | pubspec.yaml |
|---|---|---|
| `win32` | Win32 API 的 Dart 绑定（CreateMutexW 等） | 新增 |
| `ffi` | FFI 辅助函数（toNativeUtf16 等） | 新增 |
| `system_tray` | 托盘图标、菜单、通知 | 已有 |
| `window_manager` | 窗口控制、事件监听 | 已有 |

---

## 12. 平台降解

| 功能 | Windows | Android |
|---|---|---|
| 唯一实例 | FFI Mutex 检测 | 跳过 |
| 托盘图标 | system_tray 初始化 | 跳过 |
| 关闭到托盘 | 拦截关闭事件 | 不拦截 |
| 后台邮件同步 | IDLE/轮询保持 | workmanager |
| 窗口状态记忆 | 保存/恢复 | 不适用 |

---

## 13. 测试策略

| 测试项 | 方法 |
|---|---|
| 唯一实例 | 启动两个实例，验证第二个自动退出并激活第一个 |
| 关闭到托盘 | 点击关闭按钮，验证窗口隐藏到托盘 |
| 窗口状态记忆 | 调整窗口大小/位置，重启验证恢复 |
| 托盘右键菜单 | 右键托盘图标，验证所有菜单项功能 |
| 新邮件通知 | 触发 NewEmailReceivedEvent，验证图标闪烁 + 气泡 |
| 后台同步模式切换 | 切换设置，验证窗口最小化后行为变化 |
| 退出清理 | 点击退出，验证所有资源释放 |
| 非 Windows 降级 | 在 Android 上运行，验证跳过所有 Windows 特有逻辑 |
