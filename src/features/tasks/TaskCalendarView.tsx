import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useTasks } from "./useTasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getMonday } from "@/lib/utils";
import { priorityColors, priorityLabels } from "./taskConstants";
import type { Task } from "@/types";

interface TaskCalendarViewProps {
  onTaskClick: (task: Task) => void;
}

export function TaskCalendarView({ onTaskClick }: TaskCalendarViewProps) {
  const { t } = useTranslation();
  const WEEKDAYS = [t("calendar.weekdaySun"), t("calendar.weekdayMon"), t("calendar.weekdayTue"), t("calendar.weekdayWed"), t("calendar.weekdayThu"), t("calendar.weekdayFri"), t("calendar.weekdaySat")];
  const { data: tasks = [] } = useTasks();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday());
  
  const today = new Date();

  const previousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const nextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToToday = () => {
    setCurrentWeekStart(getMonday());
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() + i);
    return date;
  });

  const getTasksForDate = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return tasks.filter((task) => {
      if (!task.due_date) return false;
      const taskDate = task.due_date.substring(0, 10);
      return taskDate === dateStr;
    });
  };

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const weekLabel = `${weekDays[0].getMonth() + 1}${t("calendar.monthUnit")}${weekDays[0].getDate()}${t("calendar.dayUnit")} - ${weekDays[6].getMonth() + 1}${t("calendar.monthUnit")}${weekDays[6].getDate()}${t("calendar.dayUnit")}`;

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("calendarView.title")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={previousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            {t("calendarView.today")}
          </Button>
          <Button variant="outline" size="sm" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:inline ml-2">{weekLabel}</span>
        </div>
      </div>

      <div className="relative flex-1">
        <div className="flex-1 overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 h-full min-w-[560px]">
          {weekDays.map((date, idx) => {
          const dayTasks = getTasksForDate(date);
          return (
            <div
              key={idx}
              className={cn(
                "flex flex-col border rounded-lg p-2 transition-colors",
                isToday(date) && "border-primary bg-primary/5 shadow-sm"
              )}
            >
              <div className="text-center mb-2">
                <div className="text-xs text-muted-foreground">
                  {WEEKDAYS[idx]}
                </div>
                <div className={cn(
                  "text-lg font-semibold rounded-full w-8 h-8 mx-auto flex items-center justify-center",
                  isToday(date) && "bg-primary text-primary-foreground"
                )}>
                  {date.getDate()}
                </div>
              </div>
              <div className="flex-1 space-y-1.5 overflow-auto">
                {dayTasks.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-2">{t("calendarView.noTasks")}</div>
                ) : (
                  dayTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={cn(
                        "p-2 rounded-md border text-xs cursor-pointer transition-all hover:shadow-md",
                        task.status === 'done' ? 'opacity-50 bg-muted/30' : 'bg-card',
                        task.priority === 'urgent' && 'border-l-2 border-l-destructive',
                        task.priority === 'high' && 'border-l-2 border-l-warning'
                      )}
                    >
                      <div className={cn("font-medium truncate", task.status === 'done' && 'line-through')}>
                        {task.title}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <Badge className={cn("text-[10px]", priorityColors[task.priority])}>
                          {priorityLabels[task.priority]}
                        </Badge>
                        {task.status === 'done' && (
                          <span className="text-[10px] text-success">✓</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
          </div>
        </div>
        {/* 小屏横滚视觉提示 */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background to-transparent sm:hidden" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background to-transparent sm:hidden" />
      </div>
    </div>
  );
}
