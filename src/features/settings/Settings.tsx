import { useState, useRef, useEffect } from "react";
import { User, Mail, Palette, Bell, Database, Check, Info, LogOut, Upload, Trash2 } from "lucide-react";
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
import { getAppVersion, isTauri } from "@/lib/tauri";
import { useProfile, useUpdateProfile } from "./useProfile";
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
  const { i18n } = useTranslation();
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
  // 消费 Tauri 真实命令（修复 #6 空壳）：桌面端显示真实版本，Web 端显示回退值
  useEffect(() => {
    getAppVersion().then(setAppVersion);
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
    { id: "profile", label: "个人资料", icon: User },
    { id: "email", label: "邮箱账号", icon: Mail },
    { id: "appearance", label: "外观", icon: Palette },
    { id: "notifications", label: "通知", icon: Bell },
    { id: "data", label: "数据管理", icon: Database },
    { id: "about", label: "关于", icon: Info },
  ];

  const handleSaveProfile = async () => {
    // 表单验证：显示名称不能为空
    if (!displayName.trim()) {
      toast("显示名称不能为空", "error");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
      });
      flashSaved("profile");
    } catch (err) {
      toast("保存失败：" + (err instanceof Error ? err.message : "未知错误"), "error");
    }
  };

  // 头像上传：落到 avatars 公开桶，按 <user_id>/avatar.<ext> 前缀隔离，upsert 覆盖旧图。
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const userId = getCurrentUserId();
      if (!userId) throw new Error("未登录");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl + "?v=" + Date.now());
    } catch (err) {
      toast("头像上传失败：" + (err instanceof Error ? err.message : "未知错误"), "error");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleAvatarRemove = () => {
    setAvatarUrl(null);
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
    for (const t of DATA_TABLES) {
      const { data } = await supabase.from(t).select("*");
      dump[t] = stripSensitive(t, (data ?? []) as Record<string, unknown>[]);
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
          title: "导入数据",
          description: "导入将覆盖当前所有数据，确定继续吗？",
          confirmText: "导入",
          destructive: true,
        })) {
          const uid = getCurrentUserId();
          for (const t of DATA_TABLES) {
            const rows = parsed[t];
            if (Array.isArray(rows) && rows.length) {
              // 将 user_id 统一改写为当前用户，避免越权写入 / RLS 拒绝
              const remapped = uid
                ? rows.map((r: Record<string, unknown>) =>
                    "user_id" in r ? { ...r, user_id: uid } : r
                  )
                : rows;
              const { error } = await supabase
                .from(t)
                .upsert(stripSensitive(t, remapped) as never);
              if (error) throw error;
            }
          }
          // 用失效刷新替代整页 reload，避免丢失前端内存状态
          await qc.invalidateQueries();
          toast("数据导入成功", "success");
        }
      } catch {
        toast("导入失败：文件不是有效的 EasyWork 备份 JSON。", "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = async () => {
    if (await confirm({
      title: "清空所有数据",
      description:
        "将永久删除任务、记账、笔记、邮件等全部业务数据，且不会恢复任何演示数据。此操作不可撤销，建议先导出备份。",
      confirmText: "清空",
      destructive: true,
    })) {
      for (const t of DATA_TABLES) {
        const { error } = await supabase.from(t).delete();
        if (error) {
          toast(`清空失败：${t}`, "error");
          return;
        }
      }
      await qc.invalidateQueries();
      toast("所有数据已清空", "success");
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
            <h2 className="text-xl font-semibold">个人资料</h2>

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
                    {uploadingAvatar ? "上传中..." : "上传头像"}
                  </Button>
                  {avatarUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={handleAvatarRemove}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> 移除
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">支持 JPG / PNG，建议正方形图片</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">邮箱</label>
              <Input value={sessionEmail} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">显示名称</label>
              <Input
                placeholder="输入显示名称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveProfile}>保存</Button>
              {savedFlag === "profile" && (
                <span className="text-sm text-success flex items-center gap-1">
                  <Check className="h-4 w-4" /> 已保存
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
                <LogOut className="mr-2 h-4 w-4" /> 退出登录
              </Button>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">邮箱账号</h2>
            <p className="text-sm text-muted-foreground">
              邮箱账号（IMAP/SMTP）配置保存在云端 Supabase（受 RLS
              保护）。接入 Tauri 桌面端后，凭证将改为使用系统密钥串安全存储。
            </p>
            <div className="space-y-2">
              {emailAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无邮箱账号。</p>
              ) : (
                emailAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="rounded-lg border p-4 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{acc.email}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {acc.display_name || "未命名账号"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate({ to: "/mail" })}
                    >
                      管理
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "appearance" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">外观</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium">主题</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                >
                  浅色
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                >
                  深色
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  onClick={() => setTheme("system")}
                >
                  系统
                </Button>
              </div>
            </div>

            {/* 语言切换 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">语言</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={i18n.language.startsWith("zh") ? "default" : "outline"}
                  onClick={() => {
                    i18n.changeLanguage("zh-CN");
                    localStorage.setItem("language", "zh-CN");
                  }}
                >
                  中文
                </Button>
                <Button
                  variant={i18n.language.startsWith("en") ? "default" : "outline"}
                  onClick={() => {
                    i18n.changeLanguage("en-US");
                    localStorage.setItem("language", "en-US");
                  }}
                >
                  English
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">通知</h2>
            <div className="space-y-3">
              {([
                { id: "task_reminder", label: "任务到期提醒" },
                { id: "email_notify", label: "新邮件通知" },
                { id: "budget_warning", label: "预算超支警告" },
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
              <Button onClick={handleSaveNotify}>保存设置</Button>
              {savedFlag === "notifications" && (
                <span className="text-sm text-success flex items-center gap-1">
                  <Check className="h-4 w-4" /> 已保存
                </span>
              )}
            </div>
          </div>
        )}

        {activeTab === "data" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">数据管理</h2>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="font-medium">导出数据</h3>
                <p className="text-sm text-muted-foreground">
                  将所有数据导出为 JSON 文件，用于备份或迁移。
                </p>
                <Button onClick={handleExportData}>导出</Button>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="font-medium">导入数据</h3>
                <p className="text-sm text-muted-foreground">
                  从此前导出的 JSON 备份恢复数据（将覆盖当前数据）。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportData}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  选择备份文件
                </Button>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="font-medium">清空所有数据（不可撤销）</h3>
                <p className="text-sm text-muted-foreground">
                  永久删除任务、记账、笔记、邮件等全部业务数据，不会恢复演示数据。
                  此操作不可撤销，建议先导出备份。
                </p>
                <Button variant="destructive" onClick={handleResetData}>
                  清空所有数据
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "about" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl font-semibold">关于 EasyWork</h2>
            <div className="rounded-lg border p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">版本</span>
                <span className="font-medium">{appVersion || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">运行环境</span>
                <span className="font-medium">{isTauri() ? "桌面端 (Tauri)" : "浏览器 / Web"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">数据存储</span>
                <span className="font-medium">云端 (Supabase)</span>
              </div>
            </div>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
              <p>
                认证与业务数据均由 Supabase 提供与存储，并通过行级安全策略（RLS，
                按 <code>auth.uid()</code> 隔离）保护。个人资料（显示名称、头像）同步
                保存在云端 <code>profiles</code> 表，跨设备一致；通知偏好等非敏感设置
                仍保存在本地（localStorage）。
              </p>
              <p>
                当前为演示版本，邮箱收发与系统级后台通知需接入 Tauri 桌面端或后端服务。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
