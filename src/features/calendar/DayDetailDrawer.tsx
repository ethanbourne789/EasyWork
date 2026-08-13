import { Drawer, DrawerHeader, DrawerTitle, DrawerClose, DrawerBody } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { statusColors, statusLabels } from "@/features/tasks/taskConstants";
import { cn } from "@/lib/utils";
import { formatEventTime, type DayBucket } from "./calendarUtils";
import type { CalendarEvent, Task } from "@/types";

interface DayDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  bucket?: DayBucket;
  onEventClick: (event: CalendarEvent) => void;
  onTaskClick: (task: Task) => void;
  onAddEvent: () => void;
}

function moneyRow(label: string, amount: number, positive: boolean) {
  if (amount <= 0) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-semibold", positive ? "text-success" : "text-destructive")}>
        {positive ? "+" : "-"}
        {formatMoney(amount)}
      </span>
    </div>
  );
}

export function DayDetailDrawer({
  open,
  onOpenChange,
  date,
  bucket,
  onEventClick,
  onTaskClick,
  onAddEvent,
}: DayDetailDrawerProps) {
  const dateLabel = date
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${
        ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]
      }`
    : "";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} ariaLabel="当日详情">
      <DrawerHeader className="flex items-center justify-between border-b">
        <DrawerTitle>当日详情</DrawerTitle>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onAddEvent}>
            新建日程
          </Button>
          <DrawerClose onClose={() => onOpenChange(false)} />
        </div>
      </DrawerHeader>
      <DrawerBody className="space-y-5">
        <div className="text-sm font-medium text-muted-foreground">{dateLabel}</div>

        {/* 收支汇总 */}
        {(bucket?.income ?? 0) > 0 || (bucket?.expense ?? 0) > 0 ? (
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">收支</div>
            <div className="space-y-1">
              {moneyRow("收入", bucket?.income ?? 0, true)}
              {moneyRow("支出", bucket?.expense ?? 0, false)}
              <div className="flex items-center justify-between border-t pt-1.5 text-sm">
                <span className="text-muted-foreground">净结余</span>
                <span
                  className={cn(
                    "font-mono font-semibold",
                    (bucket!.income - bucket!.expense) >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatMoney(bucket!.income - bucket!.expense)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
            当日无收支记录
          </div>
        )}

        {/* 日程 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              日程{bucket ? `（${bucket.events.length}）` : ""}
            </span>
          </div>
          {!bucket || bucket.events.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无日程</p>
          ) : (
            <div className="space-y-2">
              {bucket.events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onEventClick(ev)}
                  className="flex w-full items-start gap-2 rounded-lg border-l-2 bg-card p-2.5 text-left text-sm shadow-sm transition-colors hover:bg-accent"
                  style={{ borderLeftColor: ev.color ?? "#6366f1" }}
                >
                  <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                    {formatEventTime(ev)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{ev.title}</span>
                    {ev.location && (
                      <span className="block truncate text-xs text-muted-foreground">@ {ev.location}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 任务 */}
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            任务{bucket ? `（${bucket.tasks.length}）` : ""}
          </div>
          {!bucket || bucket.tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">当日无任务</p>
          ) : (
            <div className="space-y-2">
              {bucket.tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTaskClick(t)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border bg-card p-2.5 text-left text-sm shadow-sm transition-colors hover:bg-accent",
                    t.status === "done" && "opacity-60",
                  )}
                >
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px]", statusColors[t.status])}>
                    {statusLabels[t.status]}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate font-medium", t.status === "done" && "line-through")}>
                    {t.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}
