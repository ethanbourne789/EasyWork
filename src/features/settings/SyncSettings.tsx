import { useTranslation } from "react-i18next";
import { SyncStatusCard } from "./SyncStatusCard";
import { SyncConfigForm } from "./SyncConfigForm";
import { SyncLogViewer } from "./SyncLogViewer";
import { isTauri } from "@/lib/tauri";

/**
 * 云端同步主面板：状态卡片 + 配置表单 + 同步日志。
 * 仅在桌面端（Tauri）可用；Web 端提示不可用。
 */
export function SyncSettings() {
  const { t } = useTranslation();

  if (!isTauri()) {
    return (
      <div className="max-w-2xl space-y-4">
        <h2 className="text-xl font-semibold">{t("sync.title")}</h2>
        <p className="text-sm text-muted-foreground rounded-lg border p-4">{t("sync.desktopOnly")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("sync.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("sync.subtitle")}</p>
      </div>

      <SyncStatusCard />

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-medium">{t("sync.provider")}</h3>
        <SyncConfigForm />
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-medium">{t("sync.log")}</h3>
        <SyncLogViewer />
      </div>
    </div>
  );
}
