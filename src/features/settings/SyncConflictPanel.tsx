import { useTranslation } from "react-i18next";
import { GitMerge, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncConflicts, useResolveConflict } from "../sync/useSync";
import { formatDateLocal } from "@/lib/dateUtils";

/** 从 JSON 快照中挑出可读的摘要字段（标题/名称/主题等），没有则回退为原始 JSON。 */
function summarize(snapshot: string): string {
  try {
    const obj = JSON.parse(snapshot) as Record<string, unknown>;
    const preferred = ["title", "name", "subject", "note_title", "task_title", "label"];
    for (const k of preferred) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return snapshot.length > 120 ? snapshot.slice(0, 120) + "…" : snapshot;
  } catch {
    return snapshot.length > 120 ? snapshot.slice(0, 120) + "…" : snapshot;
  }
}

export function SyncConflictPanel() {
  const { t } = useTranslation();
  const { data: conflicts, isLoading } = useSyncConflicts();
  const resolve = useResolveConflict();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!conflicts || conflicts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <GitMerge size={14} className="text-success" />
          {t("sync.noConflicts")}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {conflicts.map((c) => (
        <div key={c.id} className="rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="warning" showIcon={false}>
              <span className="inline-flex items-center gap-1">
                <GitMerge size={12} />
                {t("sync.conflict")}
              </span>
            </Badge>
            <span className="font-mono text-xs">{c.table_name}</span>
            <span className="font-mono text-xs text-muted-foreground">pk: {c.pk_value}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDateLocal(new Date(c.detected_at))}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-muted/40 p-2 text-xs">
              <div className="mb-1 font-medium text-foreground">{t("sync.localVersion")}</div>
              <div className="line-clamp-2 text-muted-foreground">{summarize(c.local_snapshot)}</div>
            </div>
            <div className="rounded-md bg-muted/40 p-2 text-xs">
              <div className="mb-1 font-medium text-foreground">{t("sync.remoteVersion")}</div>
              <div className="line-clamp-2 text-muted-foreground">{summarize(c.remote_snapshot)}</div>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: c.id, keepLocal: true })}
            >
              <Check size={14} />
              {t("sync.keepLocal")}
            </Button>
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: c.id, keepLocal: false })}
            >
              <RefreshCw size={14} />
              {t("sync.keepRemote")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
