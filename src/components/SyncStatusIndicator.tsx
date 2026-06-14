import { useEffect } from "react";
import { useSyncStore } from "@/stores/sync-store";
import { CloudOff, RefreshCw, CheckCircle, XCircle } from "lucide-react";

export function SyncStatusIndicator() {
  const { status, isAuthenticated, refreshStatus } = useSyncStore();

  // 定期刷新状态（每 30 秒）
  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  if (!isAuthenticated) {
    return null;
  }

  const statusConfig = {
    not_authenticated: { icon: CloudOff, color: "text-gray-400", label: "未登录" },
    offline: { icon: CloudOff, color: "text-gray-400", label: "离线" },
    syncing: { icon: RefreshCw, color: "text-blue-500 animate-spin", label: "同步中" },
    synced: { icon: CheckCircle, color: "text-green-500", label: "已同步" },
    failed: { icon: XCircle, color: "text-red-500", label: "同步失败" },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`w-4 h-4 ${config.color}`} />
      <span className="text-gray-600 dark:text-gray-400">{config.label}</span>
    </div>
  );
}
