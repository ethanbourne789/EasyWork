import { useState, useRef, useEffect } from "react";
import { User, Mail, Palette, Bell, Database, Check, Info, LogOut, Upload, Trash2, KeyRound, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore, getCurrentUserId } from "@/features/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { useTheme } from "@/components/theme/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { TOAST_DURATION } from "@/lib/constants";
import { formatDateLocal } from "@/lib/dateUtils";
import { useEmailAccounts } from "@/features/mail/useMail";
import { requestNotificationPermission, fireBudgetWarnings } from "@/lib/notify";
import { getAppVersion, isTauri, getAutostartStatus, setAutostart, getCloseBehavior, setCloseBehavior } from "@/lib/tauri";
import { useProfile, useUpdateProfile } from "./useProfile";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { confirm } from "@/lib/confirm";
import { useTranslation } from "react-i18next";

const NOTIFY_KEY = "easywork:notifications";

// 业务数据表（用户域，受 RLS 约束）：用于导出 / 导入 / 重置
const DATA_TABLES = [
  "tasks",
  "subtasks",
  "tags",
  "task_tags",
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "note_folders",
  "notes",
  "note_tags",
  "note_note_tags",
  "email_accounts",
  "email_folders",
  "emails",
  "email_attachments",
] as const;

// 导出 / 导入时必须剔除的敏感列（凭据泄露防护）
const SENSITIVE_COLUMNS: Record<string, string[]> = {
  email_accounts: ["password", "username"],
};

function stripSensitive(table: string, rows: Record<string, unknown>[]) {
  const cols = SENSITIVE_COLUMNS[table];
  if (!cols || !rows.length) return rows;
  return rows.map((row) => {
    const next = { ...row };
    cols.forEach((c) => delete next[c]);
    return next;
  });
}

interface NotifySettings {
  task_reminder: boolean;
  email_notify: boolean;
  budget_warning: boolean;
}

const defaultNotify: NotifySettings = {
  task_reminder: true,
  email_notify: true,
  budget_warning: false,
};

function loadNotify(): NotifySettings {
  try {
    return { ...defaultNotify, ...JSON.parse(localStorage.getItem(NOTIFY_KEY) || "") };
  } catch {
    return defaultNotify;
  }
}

export function Settings() {
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const sessionEmail = useAuthStore((s) => s.session?.user?.email) || "";
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [savedFlag, setSavedFlag] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: emailAccounts = [] } = useEmailAccounts();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [notify, setNotify] = useState<NotifySettings>(() => loadNotify());
  const [appVersion, setAppVersion] = useState<string>("");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [closeOnExit, setCloseOnExit] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  // 消费 Tauri 真实命令（修复 #6 空壳）：桌面端显示真实版本，Web 端显示回退值
  useEffect(() => {
    getAppVersion().then(setAppVersion);
    if (isTauri()) {
      getAutostartStatus().then(setAutostartEnabled);
      getCloseBehavior().then(setCloseOnExit);
    }
  }, []);
  // 个人资料：从 Supabase profiles 加载一次，作为可编辑初始值（之后以本地编辑为准）
  useEffect(() => {
    if (profile && !profileLoaded) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
      setProfileLoaded(true);
    }
  }, [profile, profileLoaded]);

  const flashSaved = (tab: string) => {
    setSavedFlag(tab);
    setTimeout(() => setSavedFlag((cur) => (cur === tab ? null : cur)), TOAST_DURATION);
  };

  const tabs = [
    { id: "profile", label: t('settings.profile'), icon: User },
    { id: "email", label: t('settings.mailAccounts'), icon: Mail },
    { id: "appearance", label: t('settings.appearance'), icon: Palette },
    { id: "notifications", label: t('settings.notifications'), icon: Bell },
    { id: "system", label: t('settings.system'), icon: SettingsIcon },
    { id: "data", label: t('settings.dataManagement'), icon: Database },
    { id: "about", label: t('settings.about'), icon: Info },
  ];

  const handleSaveProfile = async () => {
    // 表单验证：显示名称不能为空
    if (!displayName.trim()) {
      toast(t('settings.displayNameRequired'), "error");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
      });
      flashSaved("profile");
    } catch (err) {
      toast(t('settings.saveFailed') + (err instanceof Error ? err.message : t('settings.unknownError')), "error");
    }
  };

  const handleAvatarRemove = () => {
    setAvatarUrl(null);
  };
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const userId = getCurrentUserId();
      if (!userId) throw new Error(t('settings.notLoggedIn'));
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl + "?v=" + Date.now());
    } catch (err) {
      toast(t('settings.avatarUploadFailed') + (err instanceof Error ? err.message : t('settings.unknownError')), "error");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleSaveNotify = async () => {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(notify));
    // 开启通知时申请系统通知权限，并按需立即检查预算超支（修复 P2 #9 通知无消费）
    await requestNotificationPermission();
    if (notify.budget_warning) {
      fireBudgetWarnings();
    }
    flashSaved("notifications");
  };

  const handleExportData = async () => {
    const dump: Record<string, unknown[]> = {};
    for (const table of DATA_TABLES) {
      const { data } = await supabase.from(table).select("*");
      dump[table] = stripSensitive(table, (data ?? []) as Record<string, unknown>[]);
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `easywork-backup-${formatDateLocal(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object") throw new Error("格式错误");
        if (await confirm({
          title: t('settings.importData'),
          description: t('settings.importDataConfirm'),
          confirmText: t('settings.import'),
          destructive: true,
        })) {
          const uid = getCurrentUserId();
          for (const table of DATA_TABLES) {
            const rows = parsed[table];
            if (Array.isArray(rows) && rows.length) {
              const remapped = uid
                ? rows.map((r: Record<string, unknown>) =>
                    "user_id" in r ? { ...r, user_id: uid } : r
                  )
                : rows;
              const { error } = await supabase
                .from(table)
                .upsert(stripSensitive(table, remapped) as never);
              if (error) throw error;
            }
          }
          // 用失效刷新替代整页 reload，避免丢失前端内存状态
          await qc.invalidateQueries();
          toast(t('settings.importSuccess'), "success");
        }
      } catch {
        toast(t('settings.importFailed'), "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleToggleAutostart = async (enabled: boolean) => {
    setAutostartEnabled(enabled);
    await setAutostart(enabled);
    flashSaved("system");
  };

  const handleToggleCloseBehavior = async (closeOnExitVal: boolean) => {
    setCloseOnExit(closeOnExitVal);
    await setCloseBehavior(closeOnExitVal);
    flashSaved("system");
  };

  const handleResetData = async () => {
    if (await confirm({
      title: t('settings.clearAllData'),
      description:
        t('settings.clearAllDataConfirm'),
      confirmText: t('settings.clear'),
      destructive: true,
    })) {
      for (const table of DATA_TABLES) {
        const { error } = await supabase.from(table).delete();
        if (error) {
          toast(`${t('settings.clearFailed')}${table}`, "error");
          return;
        }
      }
      await qc.invalidateQueries();
      toast(t('settings.cleared'), "success");
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Mobile: dropdown selector */}
      <div className="w-full border-b p-3 md:hidden">
        <Select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          className="w-full"
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </Select>
      </div>
      {/* Desktop: vertical tabs */}
      <div className="hidden w-48 border-r p-2 flex-col gap-1 md:flex shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors w-full ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {activeTab === "profile" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.profile')}</h2>

            {/* 头像 */}
            <div className="flex items-center gap-4">
              <Avatar
                src={avatarUrl ?? undefined}
                name={displayName || sessionEmail || "E"}
                size="lg"
              />
              <div className="flex flex-col gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    {uploadingAvatar ? t('settings.uploading') : t('settings.uploadAvatar')}
                  </Button>
                  {avatarUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={handleAvatarRemove}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> {t('settings.remove')}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t('settings.supportJpgPng')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.email')}</label>
              <Input value={sessionEmail} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.displayName')}</label>
              <Input
                placeholder={t('settings.displayNamePlaceholder')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            {/* 密码修改 */}
            <div className="pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setPasswordDialogOpen(true)}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                {t('settings.changePassword')}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveProfile}>{t('settings.save')}</Button>
              {savedFlag === "profile" && (
                <span className="text-sm text-success flex items-center gap-1">
                  <Check className="h-4 w-4" /> {t('settings.saved')}
                </span>
              )}
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> {t('settings.logout')}
              </Button>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.mailAccounts')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.mailAccountsDesc')}
            </p>
            <div className="space-y-2">
              {emailAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('settings.noMailAccounts')}</p>
              ) : (
                emailAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="rounded-lg border p-4 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{acc.email}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {acc.display_name || t('settings.unnamedAccount')}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate({ to: "/mail" })}
                    >
                      {t('common.manage')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "appearance" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.appearance')}</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.theme')}</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                >
                  {t('settings.light')}
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                >
                  {t('settings.dark')}
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  onClick={() => setTheme("system")}
                >
                  {t('settings.system')}
                </Button>
              </div>
            </div>

            {/* 语言切换 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.language')}</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={i18n.language.startsWith("zh") ? "default" : "outline"}
                  onClick={() => {
                    i18n.changeLanguage("zh-CN");
                    localStorage.setItem("language", "zh-CN");
                  }}
                >
                  {t('settings.chinese')}
                </Button>
                <Button
                  variant={i18n.language.startsWith("en") ? "default" : "outline"}
                  onClick={() => {
                    i18n.changeLanguage("en-US");
                    localStorage.setItem("language", "en-US");
                  }}
                >
                  {t('settings.english')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.notifications')}</h2>
            <div className="space-y-3">
              {([
                { id: "task_reminder", label: t('settings.taskReminder') },
                { id: "email_notify", label: t('settings.emailNotify') },
                { id: "budget_warning", label: t('settings.budgetWarning') },
              ] as const).map(({ id, label }) => (
                <label
                  key={id}
                  className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm">{label}</span>
                  <input
                    type="checkbox"
                    checked={notify[id]}
                    onChange={(e) =>
                      setNotify((prev) => ({ ...prev, [id]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveNotify}>{t('settings.saveSettings')}</Button>
              {savedFlag === "notifications" && (
                <span className="text-sm text-success flex items-center gap-1">
                  <Check className="h-4 w-4" /> {t('settings.saved')}
                </span>
              )}
            </div>
          </div>
        )}

        {activeTab === "system" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.system')}</h2>
            {!isTauri() && (
              <p className="text-sm text-muted-foreground rounded-lg border p-4">
                {t('settings.desktopOnly')}
              </p>
            )}
            <div className="space-y-3">
              <label
                className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{t('settings.autostart')}</div>
                  <div className="text-xs text-muted-foreground">{t('settings.autostartDesc')}</div>
                </div>
                <div className="flex items-center gap-3">
                  {savedFlag === "system" && (
                    <span className="text-xs text-success flex items-center gap-1">
                      <Check className="h-3 w-3" /> {t('settings.saved')}
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={autostartEnabled}
                    onChange={(e) => handleToggleAutostart(e.target.checked)}
                    disabled={!isTauri()}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                </div>
              </label>
              <label
                className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{t('settings.closeOnExit')}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('settings.closeOnExitDesc')}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={closeOnExit}
                  onChange={(e) => handleToggleCloseBehavior(e.target.checked)}
                  disabled={!isTauri()}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </label>
            </div>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
              <p>
                {t('settings.trayMenuDesc')}
              </p>
              <p>
                {t('settings.bgSyncDesc')}
              </p>
            </div>
          </div>
        )}

        {activeTab === "data" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.dataManagement')}</h2>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="font-medium">{t('settings.exportData')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings.exportDataDesc')}
                </p>
                <Button onClick={handleExportData}>{t('settings.export')}</Button>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="font-medium">{t('settings.importData')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings.importDataDesc')}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportData}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  {t('settings.selectBackupFile')}
                </Button>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="font-medium">{t('settings.clearAllData')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings.clearAllDataDesc')}
                </p>
                <Button variant="destructive" onClick={handleResetData}>
                  {t('settings.clearAllData')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "about" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">{t('settings.about')} EasyWork</h2>
            <div className="rounded-lg border p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('settings.version')}</span>
                <span className="font-medium">{appVersion || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('settings.environment')}</span>
                <span className="font-medium">{isTauri() ? t('settings.desktop') : t('settings.web')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('settings.storage')}</span>
                <span className="font-medium">{t('settings.cloudStorage')}</span>
              </div>
            </div>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
              <p>
                {t('settings.aboutDesc')}
              </p>
              <p>
                {t('settings.aboutDemoNotice')}
              </p>
            </div>
          </div>
        )}
      </div>

      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </div>
  );
}
