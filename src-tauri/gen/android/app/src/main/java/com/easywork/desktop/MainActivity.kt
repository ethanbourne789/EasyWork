package com.easywork.desktop

import android.os.Bundle
import android.view.View
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // ─── 不启用 edge-to-edge ──────────────────────────────────
    //
    // 【问题】enableEdgeToEdge() 会让 WebView 绘制到系统状态栏下方，
    // 但 Android WebView 不支持 CSS env(safe-area-inset-*) 变量，
    // 导致前端无法获得正确的状态栏高度来添加 padding，内容与状态栏重叠。
    //
    // 【解决方案】移除 enableEdgeToEdge()，让 Android 系统自动为
    // WebView 预留状态栏和导航栏的边距（fitSystemWindows 默认行为）。
    // 这是最兼容、最可靠的方式。
    //
    // 【状态栏外观】SystemUI 会为状态栏添加半透明 scrim，与 app
    // 页面自然过渡。如果需要更精细控制，可设置 statusBarColor：
    //
    //   window.statusBarColor = android.graphics.Color.TRANSPARENT
    //
    // 【未来增强】如需 edge-to-edge 沉浸体验但正确处理安全区域，
    // 可考虑接入 tauri-plugin-safe-area-insets 社区插件：
    //   https://github.com/ronickg/tauri-plugin-safe-area-insets
    //
    // ──────────────────────────────────────────────────────────

    // 让状态栏/导航栏图标颜色自适应（亮色/暗色主题）
    WindowCompat.setDecorFitsSystemWindows(window, true)

    // 设置状态栏文字颜色（跟随系统主题）
    WindowInsetsControllerCompat(window, window.decorView).let { controller ->
      controller.isAppearanceLightStatusBars = true
    }
  }
}
