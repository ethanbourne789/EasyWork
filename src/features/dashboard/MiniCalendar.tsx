import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useTasks } from "@/features/tasks/useTasks";
import { useTransactions } from "@/features/finance/useFinance";
import { cn } from "@/lib/utils";
import { sumMoney } from "@/lib/money";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Dashboard 迷你月历：展示当月日期网格，带任务/日程/收支标记。
 * 点击日期跳转到日历页查看当日详情。
 */
export function MiniCalendar() {
  const { data: tasks = [] } = useTasks();
  const { data: transactions = [] } = useTransactions();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  // 当月天数网格（含前后月填充）
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const cells: { day: number; inMonth: boolean; key: string }[] = [];

    // 前月填充
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevLastDay - i;
      const dt = new Date(year, month - 1, d);
      cells.push({
        day: d,
        inMonth: false,
        key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }

    // 当月
    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        day: d,
        inMonth: true,
        key: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }

    // 后月填充至 6 行
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const dt = new Date(year, month + 1, d);
      cells.push({
        day: d,
        inMonth: false,
        key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }

    return cells;
  }, [year, month]);

  // 按日期聚合标记
  const dayMarkers = useMemo(() => {
    const map = new Map<string, { task: number; expense: number }>();

    for (const t of tasks) {
      if (!t.due_date) continue;
      if (t.status === "done") continue;
      const key = t.due_date.slice(0, 10);
      const entry = map.get(key) ?? { task: 0, expense: 0 };
      entry.task++;
      map.set(key, entry);
    }

    for (const tx of transactions) {
      if (tx.type !== "expense") continue;
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const entry = map.get(key) ?? { task: 0, expense: 0 };
      entry.expense += tx.amount;
      map.set(key, entry);
    }

    return map;
  }, [tasks, transactions]);

  // 本月汇总
  const monthStats = useMemo(() => {
    let taskCount = 0;
    let expenseTotal = 0;
    for (const cell of days) {
      if (!cell.inMonth) continue;
      const m = dayMarkers.get(cell.key);
      if (m) {
        taskCount += m.task;
        expenseTotal += m.expense;
      }
    }
    return { taskCount, expenseTotal };
  }, [days, dayMarkers]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-[15px] font-semibold">
          {year}年{month + 1}月
        </strong>
        <Link
          to="/calendar"
          className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700 no-underline"
        >
          查看日历 →
        </Link>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-center text-[11px] font-medium text-muted-foreground py-1"
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-[2px]">
        {days.map((cell, i) => {
          const isToday = cell.inMonth && cell.day === today;
          const marker = dayMarkers.get(cell.key);
          const hasTask = marker && marker.task > 0;
          const hasExpense = marker && marker.expense > 0;

          return (
            <Link
              key={i}
              to="/calendar"
              className={cn(
                "relative flex flex-col items-center justify-center rounded-md py-[6px] text-[13px] transition-colors",
                cell.inMonth
                  ? "font-medium hover:bg-muted/60"
                  : "text-muted-foreground/40 hover:bg-muted/30",
                isToday && "bg-brand-500 text-white font-semibold hover:bg-brand-600",
              )}
            >
              <span>{cell.day}</span>
              {/* 标记点 */}
              {!isToday && (hasTask || hasExpense) && (
                <div className="absolute bottom-[3px] flex gap-[3px]">
                  {hasTask && (
                    <span className="h-[4px] w-[4px] rounded-full bg-brand-500" />
                  )}
                  {hasExpense && (
                    <span className="h-[4px] w-[4px] rounded-full bg-destructive" />
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* 本月汇总 */}
      <div className="mt-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[8px] w-[8px] rounded-full bg-brand-500" />
          {monthStats.taskCount} 项待办
        </span>
        {monthStats.expenseTotal > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[8px] w-[8px] rounded-full bg-destructive" />
            {monthStats.expenseTotal > 0 ? `支出 ${sumMoney([monthStats.expenseTotal])}` : null}
          </span>
        )}
      </div>
    </div>
  );
}
