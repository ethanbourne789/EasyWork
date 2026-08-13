import { Loader2, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncProgress } from "./useSyncProgress";

interface SyncProgressIndicatorProps {
  /** 账户 email → id 映射，用于显示账户标识 */
  accountLabels?: Record<string, string>;
  /** 是否在标题栏展示紧凑模式 */
  compact?: boolean;
  /** 关闭回调 */
  onDismiss?: () => void;
}

/**
 * 同步进度指示器。
 * 监听 Tauri `mail://sync-progress` 事件，实时显示同步状态。
 */
export function SyncProgressIndicator({
  accountLabels = {},
  compact = false,
  onDismiss,
}: SyncProgressIndicatorProps) {
  const { syncingAccounts, lastResults, isSyncing, clearProgress } = useSyncProgress();

  if (!isSyncing && lastResults.length === 0) return null;

  const handleDismiss = () => {
    clearProgress();
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        compact ? "px-3 py-1.5" : "px-4 py-3",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isSyncing ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          )}
          <span className="text-sm font-medium truncate">
            {isSyncing
              ? syncingAccounts.length === 1
                ? "正在同步…"
                : `正在同步 ${syncingAccounts.length} 个账户…`
              : lastResults.length === 1
                ? `同步完成：${lastResults[0].fetched} 封新邮件`
                : `同步完成：${lastResults.reduce((s, r) => s + r.fetched, 0)} 封新邮件`}
          </span>
        </div>
        {onDismiss && !isSyncing && (
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 同步中的账户详情 */}
      {isSyncing && syncingAccounts.length > 0 && !compact && (
        <div className="mt-2 space-y-1.5">
          {syncingAccounts.map((account) => {
            const label = accountLabels[account.id] ?? account.id.slice(0, 8);
            return (
              <div key={account.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate max-w-[120px]">{label}</span>
                {account.phase === "connecting" ? (
                  <span className="text-muted-foreground">连接中…</span>
                ) : (
                  <span className="truncate">
                    {account.folderDone > 0
                      ? `${account.folderDone}/${account.folderTotal}`
                      : ""}
                    {account.currentFolder && ` · ${account.currentFolder.split("/").pop() ?? account.currentFolder}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 异步错误提示 */}
      {lastResults.length > 0 && !compact && (
        <div className="mt-2 space-y-1">
          {lastResults.map((result) => {
            const label = accountLabels[result.id] ?? result.id.slice(0, 8);
            return (
              <div key={result.id} className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{label}：{result.fetched} 封新邮件</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 紧凑型同步进度条——用于标题栏下方。
 * 只显示当前同步状态，不显示详细账户进度。
 */
export function SyncProgressBar() {
  const { syncingAccounts, isSyncing } = useSyncProgress();

  if (!isSyncing) return null;

  // 收集所有文件夹进度
  const totalDone = syncingAccounts.reduce((s, a) => s + a.folderDone, 0);
  const totalTotal = syncingAccounts.reduce((s, a) => s + a.folderTotal, 0);
  const pct = totalTotal > 0 ? Math.min(100, Math.round((totalDone / totalTotal) * 100)) : 0;

  return (
    <div className="h-1 w-full overflow-hidden bg-muted">
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}