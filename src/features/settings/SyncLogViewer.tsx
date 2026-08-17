import { ArrowUp, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncLog } from "../sync/useSync";
import { formatDateLocal } from "@/lib/dateUtils";

export function SyncLogViewer() {
  const { t } = useTranslation();
  const { data: logs, isLoading } = useSyncLog(20);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("sync.noLog")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("sync.time")}</TableHead>
          <TableHead>{t("sync.result")}</TableHead>
          <TableHead>{t("sync.table")}</TableHead>
          <TableHead className="text-right">{t("sync.records")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((entry) => {
          const isUpload = entry.direction === "upload";
          const ok = entry.status === "success";
          return (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateLocal(new Date(entry.created_at))}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {isUpload ? (
                    <ArrowUp size={14} className="text-brand-500" />
                  ) : (
                    <ArrowDown size={14} className="text-brand-500" />
                  )}
                  <span className="text-xs">{isUpload ? t("sync.directionUpload") : t("sync.directionDownload")}</span>
                  {ok ? (
                    <Badge variant="success">{t("sync.success")}</Badge>
                  ) : (
                    <Badge variant="danger">
                      {t("common.error")}
                    </Badge>
                  )}
                </div>
                {!ok && entry.error_message && (
                  <div className="mt-1 text-xs text-destructive">{entry.error_message}</div>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">{entry.table_name}</TableCell>
              <TableCell className="text-right tabular-nums">{entry.records_count}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
