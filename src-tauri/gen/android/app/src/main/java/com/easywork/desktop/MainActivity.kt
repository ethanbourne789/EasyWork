package com.easywork.desktop

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.content.res.Configuration
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 1001

        // Notification channel IDs — must match the Rust side (tauri-plugin-notification
        // uses these on Android 8+). Register them in onCreate BEFORE any notification
        // is posted, otherwise the system will silently drop them.
        const val CHANNEL_MAIL_ID = "easywork_mail"
        const val CHANNEL_MAIL_NAME = "新邮件提醒"
        const val CHANNEL_MAIL_DESC = "新邮件到达时通知用户"
    }

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

        // ─── 注册通知渠道 (Android 8+ 必须) ─────────────────────
        // 必须在请求通知权限之前完成注册，
        // 否则系统将静默丢弃所有通知。
        registerNotificationChannels()

        // ─── 通知权限请求 (Android 13+) ─────────────────────────
        // Android 13 (API 33) 开始需要运行时申请通知权限
        requestNotificationPermission()
    }

    /**
     * 注册所有通知渠道（Android 8+ 必需）。
     * 渠道配置完成后才能成功发送通知。
     */
    private fun registerNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 新邮件渠道 — 高优先级
            val mailChannel = NotificationChannel(
                CHANNEL_MAIL_ID,
                CHANNEL_MAIL_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = CHANNEL_MAIL_DESC
                enableLights(true)
                enableVibration(true)
                setShowBadge(true)
            }
            manager.createNotificationChannel(mailChannel)

            android.util.Log.i("EasyWork", "Notification channel '$CHANNEL_MAIL_ID' registered")
        }
    }

    /**
     * 请求通知权限（仅 Android 13+ 需要）
     * Android 12 及以下版本通知权限在安装时自动授予
     */
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                // 权限未授予，请求用户授权
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                )
            }
        }
    }

    /**
     * 权限请求结果回调
     * 可用于处理用户拒绝/授予权限后的逻辑
     */
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                android.util.Log.i("EasyWork", "Notification permission granted")
            } else {
                android.util.Log.w("EasyWork", "Notification permission denied - push notifications will not work")
            }
        }
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
