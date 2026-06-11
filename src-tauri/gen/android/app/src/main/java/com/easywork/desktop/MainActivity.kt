package com.easywork.desktop

import android.os.Bundle
import android.content.res.Configuration
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ─── 状态栏配置 ─────────────────────────────────────────
        //
        // 由 Android 系统管理 WebView 的安全区域边距，
        // 不启用 edge-to-edge 以避免内容与状态栏重叠。
        //
        // ──────────────────────────────────────────────────────────

        WindowCompat.setDecorFitsSystemWindows(window, true)

        // 根据系统暗色模式自动切换状态栏文字颜色：
        //  - 亮色模式 → 深色文字（isAppearanceLight = true）
        //  - 暗色模式 → 白色文字（isAppearanceLight = false）
        applyStatusBarAppearance()
    }

    /** 响应系统主题变化（用户切换亮色/暗色模式时回调） */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyStatusBarAppearance()
    }

    private fun applyStatusBarAppearance() {
        val nightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        val isDark = nightMode == Configuration.UI_MODE_NIGHT_YES

        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.isAppearanceLightStatusBars = !isDark
            controller.isAppearanceLightNavigationBars = !isDark
        }
    }
}
