import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { toDateKey, isToday, WEEKDAY_LABELS, type DayBucket } from "./calendarUtils";
import type { CalendarEvent, Task } from "@/types";

interface WeekViewProps {
  days: Date[];
  dayMap: Map<string, DayBucket>;
  onSelectDay: (dateKey: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  onTaskClick: (task: Task) => void;
}

function DayColumn({
  date,
  bucket,
  onSelectDay,
  onEventClick,
  onTaskClick,
}: {
  date: Date;
  bucket?: DayBucket;
  onSelectDay: (k: string) => void;
  onEventClick: (e: CalendarEvent) => void;
  onTaskClick: (t: Task) => void;
}) {
  const key = toDateKey(date);
  const today = isToday(date);
  return (
    <div className={cn("flex min-w-[130px] flex-col border-r last:border-r-0", today && "bg-primary/5")}>
      <button
        type="button"
        onClick={() => onSelectDay(key)}
        className={cn(
          "flex flex-col items-center gap-0.5 border-b py-2 transition-colors hover:bg-accent/50",
          today && "bg-primary/5",
        )}
      >
        <span className="text-[11px] text-muted-foreground">周{WEEKDAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1]}</span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold",
            today && "bg-primary text-primary-foreground",
          )}
        >
          {date.getDate()}
        </span>
        {bucket && (bucket.income > 0 || bucket.expense > 0) && (
          <span className="flex flex-col items-center text-[9px] leading-tight font-mono">
            {bucket.income > 0 && <span className="text-success">+{formatMoney(bucket.income)}</span>}
            {bucket.expense > 0 && <span className="text-destructive">-{formatMoney(bucket.expense)}</span>}
          </span>
        )}
      </button>
      <div className="flex-1 space-y-1 overflow-auto p-1.5">
        {!bucket || (bucket.events.length === 0 && bucket.tasks.length === 0) ? (
          <div className="py-4 text-center text-[11px] text-muted-foreground">空闲</div>
        ) : (
          <>
            {bucket.events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => onEventClick(ev)}
                className="block w-full rounded-md border-l-2 bg-card px-2 py-1 text-left text-xs shadow-sm transition-colors hover:bg-accent"
                style={{ borderLeftColor: ev.color ?? "#6366f1" }}
                title={ev.title}
              >
                {!ev.all_day && (
                  <span className="mr-1 font-mono text-[10px] text-muted-foreground">
                    {new Date(ev.start_at).getHours().toString().padStart(2, "0")}:
                    {new Date(ev.start_at).getMinutes().toString().padStart(2, "0")}
                  </span>
                )}
                <span className="truncate font-medium">{ev.title}</span>
                {ev.location && <span className="block truncate text-[10px] text-muted-foreground">@ {ev.location}</span>}
              </button>
            ))}
            {bucket.tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTaskClick(t)}
                className={cn(
                  "block w-full rounded-md border-l-2 bg-card px-2 py-1 text-left text-xs shadow-sm transition-colors hover:bg-accent",
                  t.status === "done" && "opacity-60 line-through",
                )}
                style={{ borderLeftColor: t.status === "done" ? "#10b981" : "#6366f1" }}
                title={`${t.title}（${t.status === "done" ? "完成" : "进行中"}）`}
              >
                <span className="truncate font-medium">{t.title}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function CalendarWeekView({ days, dayMap, onSelectDay, onEventClick, onTaskClick }: WeekViewProps) {
  return (
    <div className="flex h-full flex-col overflow-x-auto">
      <div className="flex flex-1">
        {days.map((date) => (
          <DayColumn
            key={toDateKey(date)}
            date={date}
            bucket={dayMap.get(toDateKey(date))}
            onSelectDay={onSelectDay}
            onEventClick={onEventClick}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  );
}
