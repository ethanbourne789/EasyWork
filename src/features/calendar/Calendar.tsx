import { useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarClock,
  List,
  CalendarRange,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useTasks } from "@/features/tasks/useTasks";
import { useTransactions } from "@/features/finance/useFinance";
import {
  useCalendarEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useCalendarSubscriptions,
  useCreateSubscription,
  useUpdateSubscription,
  useDeleteSubscription,
  useSyncSubscription,
} from "./useCalendar";
import {
  buildDayMap,
  getMonthGrid,
  getWeekDays,
  sumRange,
  toDateKey,
  type DayBucket,
} from "./calendarUtils";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarAgendaView } from "./CalendarAgendaView";
import { DayDetailDrawer } from "./DayDetailDrawer";
import { EventFormDialog } from "./EventFormDialog";
import { SubscriptionDialog } from "./SubscriptionDialog";
import type { CalendarEvent, Task } from "@/types";

type ViewMode = "month" | "week" | "agenda";

const VIEWS: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: "month", label: "月", icon: CalendarRange },
  { value: "week", label: "周", icon: CalendarClock },
  { value: "agenda", label: "清单", icon: List },
];

/** 清单视图时间窗口：前后各 60 天 */
const AGENDA_WINDOW_DAYS = 60;
const MS_PER_DAY = 86400000;

export function Calendar() {
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formDefaultDate, setFormDefaultDate] = useState<string | undefined>();
  const [subsOpen, setSubsOpen] = useState(false);

  const { data: events = [], isLoading: eventsLoading, isError } = useCalendarEvents();
  const { data: subscriptions = [] } = useCalendarSubscriptions();
  const { data: tasks = [] } = useTasks();
  const { data: transactions = [] } = useTransactions();

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const createSub = useCreateSubscription();
  const updateSub = useUpdateSubscription();
  const deleteSub = useDeleteSubscription();
  const syncSub = useSyncSubscription();

  const dayMap = useMemo(
    () => buildDayMap({ events, tasks, transactions }),
    [events, tasks, transactions],
  );

  const monthDays = useMemo(() => getMonthGrid(anchor), [anchor]);
  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);

  // 清单视图：取当前 anchor 前后各 AGENDA_WINDOW_DAYS 天内有内容的日期
  const agendaEntries = useMemo(() => {
    const windowMs = AGENDA_WINDOW_DAYS * MS_PER_DAY;
    const windowStart = new Date(anchor.getTime() - windowMs);
    const windowEnd = new Date(anchor.getTime() + windowMs);
    const out: { key: string; date: Date; bucket: DayBucket }[] = [];
    const keys = Array.from(dayMap.keys()).sort();
    for (const key of keys) {
      const date = new Date(`${key}T00:00:00`);
      if (date < windowStart || date > windowEnd) continue;
      const bucket = dayMap.get(key)!;
      out.push({ key, date, bucket });
    }
    return out;
  }, [dayMap, anchor]);

  const rangeSummary = useMemo(() => {
    const days = view === "month" ? monthDays : view === "week" ? weekDays : [];
    return sumRange(dayMap, days);
  }, [dayMap, view, monthDays, weekDays]);

  // ---- 导航 ----
  const shift = (delta: number) => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  };
  const goToday = () => setAnchor(new Date());

  const label =
    view === "agenda"
      ? format(anchor, "yyyy年M月", { locale: zhCN })
      : format(anchor, view === "month" ? "yyyy年M月" : "yyyy年M月d日", { locale: zhCN });

  // ---- 交互 ----
  const openCreate = (dateKey?: string) => {
    setEditingEvent(null);
    setFormDefaultDate(dateKey ?? toDateKey(anchor));
    setFormOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    // 订阅同步来的事件只读，不可编辑
    if (event.source !== "local") {
      setSelectedKey(toDateKey(new Date(event.start_at)));
      return;
    }
    setEditingEvent(event);
    setFormDefaultDate(undefined);
    setFormOpen(true);
  };

  const onEventClick = (event: CalendarEvent) => openEdit(event);
  const onTaskClick = (_task: Task) => {
    // 点击任务 -> 跳转到任务页查看详情（日历页只做聚合展示）
    window.dispatchEvent(new CustomEvent("ew:navigate", { detail: { to: "/tasks" } }));
  };

  const saveEvent = (data: Partial<CalendarEvent>) => {
    if (editingEvent) updateEvent.mutate({ id: editingEvent.id, data });
    else createEvent.mutate(data);
  };

  const selectedDate = selectedKey ? new Date(`${selectedKey}T00:00:00`) : null;
  const selectedBucket = selectedKey ? dayMap.get(selectedKey) : undefined;

  const loading = eventsLoading;

  if (isError) {
    return <div className="flex items-center justify-center h-full text-destructive">日历数据加载失败，请重试</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-display text-[28px] font-semibold leading-tight">日历</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            任务进度 · 日程 · 每日收支，一图掌握
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="上一页">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            今天
          </Button>
          <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="下一页">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="hidden min-w-[110px] text-sm font-medium sm:inline">{label}</span>

          {/* 视图切换 */}
          <div className="flex gap-1 rounded-[11px] bg-muted/60 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                className={cn(
                  "flex items-center gap-1 rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold transition-colors",
                  view === v.value
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={v.label}
              >
                <v.icon size={15} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => setSubsOpen(true)}>
            <CalendarClock size={15} className="mr-1" /> 订阅
          </Button>
          <Button size="sm" onClick={() => openCreate()}>
            <Plus size={15} className="mr-1" /> 日程
          </Button>
        </div>
      </div>

      {/* 区间汇总条 */}
      {(view === "month" || view === "week") && (rangeSummary.income > 0 || rangeSummary.expense > 0) && (
        <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            本{view === "month" ? "月" : "周"}
          </span>
          {rangeSummary.income > 0 && (
            <span className="font-mono font-semibold text-success">收入 {formatMoney(rangeSummary.income)}</span>
          )}
          {rangeSummary.expense > 0 && (
            <span className="font-mono font-semibold text-destructive">支出 {formatMoney(rangeSummary.expense)}</span>
          )}
          {(rangeSummary.eventCount > 0 || rangeSummary.taskCount > 0) && (
            <span className="text-muted-foreground">
              {rangeSummary.eventCount} 个日程 · {rangeSummary.taskCount} 个任务
            </span>
          )}
        </div>
      )}

      {/* 主体 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : view === "month" ? (
          <CalendarMonthView
            days={monthDays}
            dayMap={dayMap}
            onSelectDay={(k) => setSelectedKey(k)}
            onEventClick={onEventClick}
            onTaskClick={onTaskClick}
          />
        ) : view === "week" ? (
          <CalendarWeekView
            days={weekDays}
            dayMap={dayMap}
            onSelectDay={(k) => setSelectedKey(k)}
            onEventClick={onEventClick}
            onTaskClick={onTaskClick}
          />
        ) : (
          <CalendarAgendaView entries={agendaEntries} onEventClick={onEventClick} onTaskClick={onTaskClick} />
        )}
      </div>

      {/* 当日详情 */}
      <DayDetailDrawer
        open={!!selectedKey}
        onOpenChange={(o) => !o && setSelectedKey(null)}
        date={selectedDate}
        bucket={selectedBucket}
        onEventClick={onEventClick}
        onTaskClick={onTaskClick}
        onAddEvent={() => {
          if (selectedKey) openCreate(selectedKey);
        }}
      />

      {/* 新建/编辑日程 */}
      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editingEvent}
        defaultDate={formDefaultDate}
        onCreate={saveEvent}
        onUpdate={(id, data) => updateEvent.mutate({ id, data })}
        onDelete={(id) => deleteEvent.mutate(id)}
      />

      {/* 订阅管理 */}
      <SubscriptionDialog
        open={subsOpen}
        onOpenChange={setSubsOpen}
        subscriptions={subscriptions}
        onCreate={(data) => createSub.mutate(data)}
        onUpdate={(id, data) => updateSub.mutate({ id, data })}
        onDelete={(id) => deleteSub.mutate(id)}
        onSync={(id) => syncSub.mutate(id)}
        syncing={syncSub.isPending}
        creating={createSub.isPending}
        updating={updateSub.isPending}
      />
    </div>
  );
}
