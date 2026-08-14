import { Cloud, CloudOff, CloudDownload, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/ui/tooltip";
import { useSyncStatus } from "@/features/sync/useSync";
import { isTauri } from "@/lib/tauri";
import type { SyncStatus } from "@/features/sync/syncApi";

type Kind = "syncing" | "error" | "disabled" | "unknown" | "synced" | "pending";

function deriveKind(status: SyncStatus | undefined, fetching: boolean): Kind {
  if (fetching) return "syncing";
  if (!isTauri()) return "unknown";
  if (!status) return "unknown";
  if (status.sync_error) return "error";
  if (!status.enabled) return "disabled";
  if (!status.last_sync_at) return "pending";
  const diffMs = Date.now() - new Date(status.last_sync_at).getTime();
  return diffMs < 5 * 60 * 1000 ? "synced" : "pending";
}

const META: Record<Kind, { Icon: typeof Cloud; color: string; tip: (t: (k: string) => string, s?: SyncStatus) => string }> = {
  syncing: { Icon: Loader2, color: "text-brand-500", tip: (t) => t("sync.syncing") },
  error: { Icon: CloudOff, color: "text-destructive", tip: (t, s) => `${t("sync.error")}${s?.sync_error ? "：" + s.sync_error : ""}` },
  disabled: { Icon: CloudOff, color: "text-muted-foreground", tip: (t) => t("sync.disabled") },
  unknown: { Icon: CloudOff, color: "text-muted-foreground", tip: (t) => t("sync.desktopOnly") },
  synced: { Icon: Cloud, color: "text-success", tip: (t) => t("sync.synced") },
  pending: { Icon: CloudDownload, color: "text-warning", tip: (t) => t("sync.pending") },
};

/**
 * 全局同步状态指示器：用于侧边栏 / 顶栏，实时反映云端同步状态。
 * 仅做指示，点击由外层包裹的链接跳转到同步设置页。
 */
export function SyncStatusIcon() {
  const { t } = useTranslation();
  const { data: status, isFetching } = useSyncStatus();
  const kind = deriveKind(status, isFetching);
  const meta = META[kind];
  const Icon = meta.Icon;

  return (
    <Tooltip content={meta.tip(t, status)}>
      <Icon size={23} className={`${meta.color} ${kind === "syncing" ? "animate-spin" : ""}`} />
    </Tooltip>
  );
}
