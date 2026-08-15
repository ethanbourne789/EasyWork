import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { statusLabels } from "@/features/tasks/taskConstants";
import {
  toDateKey,
  isToday,
  WEEKDAY_LABELS,
  type DayBucket,
} from "./calendarUtils";
import type { CalendarEvent, Task } from "@/types";

interface MonthViewProps {
  days: Date[];
  dayMap: Map<string, DayBucket>;
  onSelectDay: (dateKey: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  onTaskClick: (task: Task) => void;
}

function EventChip({ event, onClick }: { event: CalendarEvent; onClick: (e: CalendarEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-accent"
      style={{ color: event.color ?? "#6366f1" }}
      title={event.title}
    >
      <span className="truncate font-medium">{event.title}</span>
    </button>
  );
}

function TaskChip({ task, onClick }: { task: Task; onClick: (t: Task) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(task);
      }}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-accent",
        task.status === "done" && "opacity-50",
      )}
      title={`${task.title}（${statusLabels[task.status]}）`}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          task.status === "done" ? "bg-success" : "bg-primary",
        )}
      />
      <span className={cn("truncate", task.status === "done" && "line-through")}>{task.title}</span>
    </button>
  );
}

export function CalendarMonthView({
  days,
  dayMap,
  onSelectDay,
  onEventClick,
  onTaskClick,
}: MonthViewProps) {
  // 动态计算行数：6 周月（42 天）需要 6 行，避免 grid-rows-5 硬编码导致的渲染错乱
  const weeks = Math.ceil(days.length / 7);
  return (
    <div className="relative flex h-full flex-col overflow-x-auto md:overflow-x-visible">
      {/* 星期表头 */}
      <div className="grid min-w-[560px] grid-cols-7 border-b border-l md:min-w-0">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w + i}
            className={cn(
              "border-r py-1.5 text-center text-xs font-medium",
              i >= 5 ? "text-muted-foreground" : "text-foreground",
            )}
          >
            周{w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div
        className="grid min-w-[560px] flex-1 grid-cols-7 border-b border-l md:min-w-0"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {days.map((date, idx) => {
          const key = toDateKey(date);
          const bucket = dayMap.get(key);
          const inMonth = date.getMonth() === days[10].getMonth();
          const today = isToday(date);
          // 统一展示逻辑：事件+任务混合最多 3 个 chip，超出显示 "+N 更多"
          const events = bucket?.events ?? [];
          const tasks = bucket?.tasks ?? [];
          const allItems: ({ type: "event"; value: CalendarEvent } | { type: "task"; value: Task })[] = [
            ...events.slice(0, 3).map((e) => ({ type: "event" as const, value: e })),
            ...tasks.slice(0, 3).map((t) => ({ type: "task" as const, value: t })),
          ].slice(0, 3);
          const total = events.length + tasks.length;
          const hidden = total - allItems.length;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDay(key)}
              className={cn(
                "flex flex-col border-r border-t p-1 text-left transition-colors hover:bg-accent/50",
                !inMonth && "bg-muted/30",
                today && "bg-primary/5",
              )}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    today && "bg-primary text-primary-foreground",
                    !inMonth && !today && "text-muted-foreground",
                  )}
                >
                  {date.getDate()}
                </span>
                {bucket && (bucket.income > 0 || bucket.expense > 0) && (
                  <span className="flex flex-col items-end text-[9px] leading-tight font-mono">
                    {bucket.income > 0 && <span className="text-success">+{formatMoney(bucket.income)}</span>}
                    {bucket.expense > 0 && <span className="text-destructive">-{formatMoney(bucket.expense)}</span>}
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-0.5 overflow-hidden">
                {allItems.map((item) =>
                  item.type === "event" ? (
                    <EventChip key={item.value.id} event={item.value} onClick={onEventClick} />
                  ) : (
                    <TaskChip key={item.value.id} task={item.value} onClick={onTaskClick} />
                  ),
                )}
                {hidden > 0 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{hidden} 更多
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {/* 小屏横滚视觉提示 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background to-transparent md:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background to-transparent md:hidden" />
    </div>
  );
}
