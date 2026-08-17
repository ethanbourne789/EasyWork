import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/money";
import { statusColors, statusLabels } from "@/features/tasks/taskConstants";
import { cn } from "@/lib/utils";
import { formatEventTime, type DayBucket } from "./calendarUtils";
import type { CalendarEvent, Task } from "@/types";

interface AgendaViewProps {
  /** 已按日期升序排列、且包含内容的 (dateKey, bucket) 列表 */
  entries: { key: string; date: Date; bucket: DayBucket }[];
  onEventClick: (event: CalendarEvent) => void;
  onTaskClick: (task: Task) => void;
}

export function CalendarAgendaView({ entries, onEventClick, onTaskClick }: AgendaViewProps) {
  const { t } = useTranslation();
  const WEEKDAYS = [t("calendar.weekdaySun"), t("calendar.weekdayMon"), t("calendar.weekdayTue"), t("calendar.weekdayWed"), t("calendar.weekdayThu"), t("calendar.weekdayFri"), t("calendar.weekdaySat")];

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-16 text-sm text-muted-foreground">
        {t("calendar.agendaEmpty")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      {entries.map(({ key, date, bucket }) => (
        <div key={key} className="flex gap-3">
          {/* 左侧日期列 */}
          <div className="flex w-16 shrink-0 flex-col items-center pt-1">
            <span className="text-2xl font-semibold leading-none">{date.getDate()}</span>
            <span className="text-[11px] text-muted-foreground">
              {WEEKDAYS[date.getDay()]}
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {date.getMonth() + 1}{t("calendar.monthUnit")}
            </span>
          </div>

          {/* 右侧内容 */}
          <div className="min-w-0 flex-1 space-y-1.5 border-l pb-4 pl-3">
            {bucket.events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => onEventClick(ev)}
                className="flex w-full items-center gap-2 rounded-md border-l-2 bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent"
                style={{ borderLeftColor: ev.color ?? "#6366f1" }}
              >
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                  {formatEventTime(ev)}
                </span>
                <span className="truncate font-medium">{ev.title}</span>
                {ev.location && <span className="truncate text-xs text-muted-foreground">@ {ev.location}</span>}
                {ev.source !== "local" && (
                  <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t("calendar.subscribed")}
                  </span>
                )}
              </button>
            ))}

            {bucket.tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTaskClick(t)}
                className="flex w-full items-center gap-2 rounded-md border-l-2 bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent"
                style={{ borderLeftColor: t.status === "done" ? "#10b981" : "#6366f1" }}
              >
                <span className="w-12 shrink-0 text-xs text-muted-foreground">
                  <span className={cn("rounded px-1.5 py-0.5", statusColors[t.status])}>
                    {statusLabels[t.status]}
                  </span>
                </span>
                <span className={cn("truncate font-medium", t.status === "done" && "line-through opacity-60")}>
                  {t.title}
                </span>
              </button>
            ))}

            {(bucket.income > 0 || bucket.expense > 0) && (
              <div className="flex items-center gap-4 px-3 py-1 text-xs">
                <span className="text-muted-foreground">{t("calendar.dailyIncomeExpense")}</span>
                {bucket.income > 0 && (
                  <span className="font-mono font-semibold text-success">{t("calendar.income")} +{formatMoney(bucket.income)}</span>
                )}
                {bucket.expense > 0 && (
                  <span className="font-mono font-semibold text-destructive">{t("calendar.expense")} -{formatMoney(bucket.expense)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
