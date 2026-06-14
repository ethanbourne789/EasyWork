import { useState, useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useThemeStore } from "@/stores/theme-store"
import { useSyncStore } from "@/stores/sync-store"
import * as mailIpc from "@/lib/mail-ipc"
import {
  Monitor, Sun, Moon, Database, Keyboard, Bell, Globe, Info, ChevronRight, Check,
  LogOut, Minimize2, Mail, Clock, Cloud, CloudOff, RefreshCw, CheckCircle, XCircle,
} from "lucide-react"

const themeOptions = [
  { key: "system", icon: Monitor },
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
] as const

const langOptions = [
  { key: "zh", labelKey: "settings.chinese" },
  { key: "en", labelKey: "settings.english" },
] as const

function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const [themeOpen, setThemeOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)

  // Close behavior & auto-fetch & remote images
  const [closeBehavior, setCloseBehaviorState] = useState<"minimize" | "exit">("minimize")
  const [_autoFetchInterval, setAutoFetchIntervalState] = useState(300)
  const [fetchIntervalInput, setFetchIntervalInput] = useState("5")
  const [fetchIntervalUnit, setFetchIntervalUnit] = useState<"minutes" | "hours">("minutes")
  const [remoteImagesEnabled, setRemoteImagesEnabledState] = useState(true)

  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      mailIpc.getCloseBehavior().then((v: string) => setCloseBehaviorState(v as "minimize" | "exit")).catch(() => {})
      mailIpc.getAutoFetchInterval().then(async (secs: number) => {
        setAutoFetchIntervalState(secs)
        if (secs >= 3600) {
          setFetchIntervalInput(String(secs / 3600))
          setFetchIntervalUnit("hours")
        } else {
          setFetchIntervalInput(String(secs / 60))
          setFetchIntervalUnit("minutes")
        }
      }).catch(() => {})
      mailIpc.getRemoteImagesEnabled().then(setRemoteImagesEnabledState).catch(() => {})
    }
  }, [])

  const handleCloseBehaviorChange = async (behavior: "minimize" | "exit") => {
    setCloseBehaviorState(behavior)
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      await mailIpc.setCloseBehavior(behavior).catch(() => {})
    }
  }

  const handleAutoFetchChange = async () => {
    const val = parseInt(fetchIntervalInput, 10)
    if (isNaN(val) || val <= 0) return
    const secs = fetchIntervalUnit === "hours" ? val * 3600 : val * 60
    setAutoFetchIntervalState(secs)
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      await mailIpc.setAutoFetchInterval(secs).catch(() => {})
    }
  }

  const handleRemoteImagesToggle = async () => {
    const newVal = !remoteImagesEnabled
    setRemoteImagesEnabledState(newVal)
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      await mailIpc.setRemoteImagesEnabled(newVal).catch(() => {})
    }
  }

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang)
    localStorage.setItem("easywork-lang", lang)
    setLangOpen(false)
  }

  const currentLang = i18n.language?.startsWith("en") ? "en" : "zh"

  return (
    <div className="space-y-6 max-w-[800px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-white">{t("settings.title")}</h1>
        <p className="text-surface-500 text-sm mt-1 dark:text-surface-400">{t("settings.subtitle")}</p>
      </div>

      {/* Appearance */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Sun size={18} className="text-amber-500" />
            {t("settings.appearance")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Theme mode selector */}
          <div className="relative">
            <button
              onClick={() => { setThemeOpen(!themeOpen); setLangOpen(false) }}
              className="flex items-center justify-between w-full py-2"
            >
              <div className="flex items-center gap-3">
                <Monitor size={17} className="text-surface-400" />
                <span className="text-sm dark:text-surface-200">{t("settings.themeMode")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-500 dark:text-surface-400">{t(`theme.${theme}`)}</span>
                <ChevronRight size={14} className="text-surface-300" />
              </div>
            </button>
            {themeOpen && (
              <div className="absolute right-0 top-10 z-50 w-44 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setTheme(opt.key); setThemeOpen(false) }}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 dark:text-surface-200"
                  >
                    <span className="flex items-center gap-2">
                      <opt.icon size={15} />
                      {t(`theme.${opt.key}`)}
                    </span>
                    {theme === opt.key && <Check size={14} className="text-primary-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font size */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Keyboard size={17} className="text-surface-400" />
              <span className="text-sm dark:text-surface-200">{t("settings.fontSize")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-500 dark:text-surface-400">{t("settings.medium")}</span>
              <ChevronRight size={14} className="text-surface-300" />
            </div>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => { setLangOpen(!langOpen); setThemeOpen(false) }}
              className="flex items-center justify-between w-full py-2"
            >
              <div className="flex items-center gap-3">
                <Globe size={17} className="text-surface-400" />
                <span className="text-sm dark:text-surface-200">{t("settings.language")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-500 dark:text-surface-400">
                  {currentLang === "zh" ? t("settings.chinese") : t("settings.english")}
                </span>
                <ChevronRight size={14} className="text-surface-300" />
              </div>
            </button>
            {langOpen && (
              <div className="absolute right-0 top-10 z-50 w-44 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1">
                {langOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleLanguageChange(opt.key)}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 dark:text-surface-200"
                  >
                    <span>{t(opt.labelKey)}</span>
                    {currentLang === opt.key && <Check size={14} className="text-primary-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Close Behavior */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <LogOut size={18} className="text-surface-500" />
            {t("settings.closeBehavior")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">{t("settings.closeBehaviorDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Minimize2 size={17} className="text-surface-400" />
              <div>
                <span className="text-sm dark:text-surface-200">{t("settings.minimizeToTray")}</span>
                <p className="text-xs text-surface-400 dark:text-surface-500">{t("settings.minimizeToTrayHint")}</p>
              </div>
            </div>
            <button
              onClick={() => handleCloseBehaviorChange(closeBehavior === "minimize" ? "exit" : "minimize")}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                closeBehavior === "minimize" ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-600"
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                closeBehavior === "minimize" ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-2 opacity-60">
            <div className="flex items-center gap-3">
              <LogOut size={17} className="text-surface-400" />
              <div>
                <span className="text-sm dark:text-surface-200">{t("settings.exitOnClose")}</span>
                <p className="text-xs text-surface-400 dark:text-surface-500">{t("settings.exitOnCloseHint")}</p>
              </div>
            </div>
            <div className={`w-9 h-5 rounded-full ${closeBehavior === "exit" ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-600"} flex items-center px-0.5 ${closeBehavior === "exit" ? "justify-end" : "justify-start"}`}>
              <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto Fetch */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Mail size={18} className="text-primary-500" />
            {t("settings.autoFetch")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">{t("settings.autoFetchDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={fetchIntervalInput}
              onChange={e => setFetchIntervalInput(e.target.value)}
              className="w-20 h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-transparent dark:text-surface-200"
            />
            <select
              value={fetchIntervalUnit}
              onChange={e => setFetchIntervalUnit(e.target.value as "minutes" | "hours")}
              className="h-9 px-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-transparent dark:text-surface-200"
            >
              <option value="minutes">{t("settings.minutes")}</option>
              <option value="hours">{t("settings.hours")}</option>
            </select>
            <Button size="sm" onClick={handleAutoFetchChange} disabled={!fetchIntervalInput}>
              <Clock size={14} />{t("settings.apply")}
            </Button>
          </div>
          <p className="text-xs text-surface-400 dark:text-surface-500 mt-2">
            {t("settings.autoFetchHint")}
          </p>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Bell size={18} className="text-amber-500" />
            {t("settings.notifications")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">{t("settings.notificationsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Remote images toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1">
              <span className="text-sm dark:text-surface-200">{t("settings.remoteImages")}</span>
              <p className="text-xs text-surface-400 dark:text-surface-500">{t("settings.remoteImagesHint")}</p>
            </div>
            <button
              onClick={handleRemoteImagesToggle}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                remoteImagesEnabled ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-600"
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                remoteImagesEnabled ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </button>
          </div>
          {[
            { label: "任务到期提醒", enabled: true },
            { label: "日历事件提醒", enabled: true },
            { label: "股票价格预警", enabled: false },
            { label: "运动目标达成", enabled: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <span className="text-sm dark:text-surface-200">{item.label}</span>
              <div
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${
                  item.enabled ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-600"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    item.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cloud Sync */}
      <CloudSyncCard />

      {/* Data */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Database size={18} className="text-primary-500" />
            {t("settings.data")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">{t("settings.dataDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium dark:text-surface-200">数据库位置</p>
              <p className="text-xs text-surface-400">~/easywork/data.db</p>
            </div>
            <Badge variant="success">运行中</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium dark:text-surface-200">自动备份</p>
              <p className="text-xs text-surface-400">每日 03:00 自动备份到本地</p>
            </div>
            <Badge variant="info">已启用</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">立即备份</Button>
            <Button variant="outline" size="sm">恢复数据</Button>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200">
              清空所有数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Info size={18} className="text-surface-400" />
            {t("settings.about")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">{t("settings.aboutDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-surface-500 dark:text-surface-400">版本</span>
              <span className="font-medium dark:text-surface-200">v0.1.0-alpha</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500 dark:text-surface-400">技术栈</span>
              <span className="font-medium dark:text-surface-200">Tauri 2.0 + React + Rust</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500 dark:text-surface-400">构建日期</span>
              <span className="font-medium dark:text-surface-200">2026-06-10</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500 dark:text-surface-400">开发者</span>
              <span className="font-medium dark:text-surface-200">Ethan</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Click-outside handlers */}
      {(themeOpen || langOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => { setThemeOpen(false); setLangOpen(false) }} />
      )}
    </div>
  )
}

function CloudSyncCard() {
  const {
    status,
    isAuthenticated,
    lastSyncedAt,
    error,
    isLoading,
    refreshStatus,
    signInWithOAuth,
    signOut,
    syncNow,
  } = useSyncStore();

  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleOAuthLogin = async () => {
    setLocalError(null);
    try {
      await signInWithOAuth();
    } catch (err) {
      setLocalError(String(err));
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSync = async () => {
    setLocalError(null);
    try {
      await syncNow();
    } catch (err) {
      setLocalError(String(err));
    }
  };

  const statusConfig = {
    not_authenticated: { icon: CloudOff, color: "text-surface-400", label: "未连接" },
    offline: { icon: CloudOff, color: "text-amber-500", label: "离线" },
    syncing: { icon: RefreshCw, color: "text-blue-500 animate-spin", label: "同步中..." },
    synced: { icon: CheckCircle, color: "text-green-500", label: "已同步" },
    failed: { icon: XCircle, color: "text-red-500", label: "同步失败" },
  };

  const cfg = statusConfig[status] ?? statusConfig.not_authenticated;
  const StatusIcon = cfg.icon;

  return (
    <Card className="dark:bg-surface-800 dark:border-surface-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-white">
          <Cloud size={18} className="text-blue-500" />
          云同步
        </CardTitle>
        <CardDescription className="dark:text-surface-400">
          在 Windows 和 Android 设备间同步记账、运动、股票、邮件等数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status bar */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <StatusIcon size={16} className={cfg.color} />
            <span className="text-sm dark:text-surface-200">{cfg.label}</span>
          </div>
          {lastSyncedAt && (
            <span className="text-xs text-surface-400">
              上次同步: {new Date(lastSyncedAt).toLocaleString()}
            </span>
          )}
        </div>

        {!isAuthenticated ? (
          /* GitHub OAuth login button */
          <div className="space-y-3">
            {(localError || error) && (
              <p className="text-xs text-red-500">{localError || error}</p>
            )}
            <p className="text-xs text-surface-500 dark:text-surface-400">
              使用 GitHub 账号登录以在设备间同步数据
            </p>
            <Button
              size="sm"
              onClick={handleOAuthLogin}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <svg viewBox="0 0 16 16" fill="currentColor" width={14} height={14}>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                </svg>
              )}
              {isLoading ? "正在打开浏览器..." : "使用 GitHub 登录"}
            </Button>
          </div>
        ) : (
          /* Authenticated: sync button + sign out */
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSync}
              disabled={status === "syncing" || isLoading}
            >
              <RefreshCw size={14} className={status === "syncing" ? "animate-spin" : ""} />
              {status === "syncing" ? "同步中..." : "立即同步"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSignOut}
              disabled={status === "syncing" || isLoading}
            >
              <LogOut size={14} />
              退出登录
            </Button>
            {(localError || error) && (
              <p className="text-xs text-red-500 ml-2">{localError || error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})
