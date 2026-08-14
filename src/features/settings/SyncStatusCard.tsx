import { Cloud, CloudOff, CloudDownload, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSyncStatus, useTriggerSync } from "../sync/useSync";
import { formatDateLocal } from "@/lib/dateUtils";
import { isTauri } from "@/lib/tauri";
import type { SyncStatus } from "../sync/syncApi";

type Kind = "syncing" | "error" | "disabled" | "unknown" | "synced" | "pending";

function deriveKind(status: SyncStatus | undefined, isPending: boolean): Kind {
  if (isPending) return "syncing";
  if (!status) return "unknown";
  if (status.sync_error) return "error";
  if (!status.enabled) return "disabled";
  if (!status.last_sync_at) return "pending";
  const diffMs = Date.now() - new Date(status.last_sync_at).getTime();
  return diffMs < 5 * 60 * 1000 ? "synced" : "pending";
}

const META: Record<Kind, { Icon: typeof Cloud; color: string; labelKey: string }> = {
  syncing: { Icon: Loader2, color: "text-brand-500", labelKey: "sync.syncing" },
  error: { Icon: CloudOff, color: "text-destructive", labelKey: "sync.error" },
  disabled: { Icon: CloudOff, color: "text-muted-foreground", labelKey: "sync.disabled" },
  unknown: { Icon: CloudOff, color: "text-muted-foreground", labelKey: "sync.notConfigured" },
  synced: { Icon: Cloud, color: "text-success", labelKey: "sync.synced" },
  pending: { Icon: CloudDownload, color: "text-warning", labelKey: "sync.pending" },
};

export function SyncStatusCard() {
  const { t } = useTranslation();
  const { data: status } = useSyncStatus();
  const trigger = useTriggerSync();

  if (!isTauri()) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        {t("sync.desktopOnly")}
      </div>
    );
  }

  const kind = deriveKind(status, trigger.isPending);
  const meta = META[kind];
  const Icon = meta.Icon;

  return (
    <div className="rounded-lg border p-4 flex items-start gap-3">
      <div className={`mt-0.5 ${meta.color}`}>
        <Icon size={28} className={kind === "syncing" ? "animate-spin" : ""} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t(meta.labelKey)}</span>
          {status?.sync_error && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle size={14} />
              {status.sync_error}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
          <div>
            {t("sync.device")}：{status?.device_name || "—"}
          </div>
          <div>
            {t("sync.lastSync")}：
            {status?.last_sync_at
              ? formatDateLocal(new Date(status.last_sync_at))
              : t("sync.never")}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending || !status?.enabled}
      >
        <RefreshCw size={14} className={trigger.isPending ? "animate-spin" : ""} />
        {t("sync.trigger")}
      </Button>
    </div>
  );
}
