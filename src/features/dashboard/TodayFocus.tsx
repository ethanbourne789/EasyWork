import { useState } from "react";
import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTasks, useUpdateTask } from "@/features/tasks/useTasks";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

/** 优先级 → 圆点色 (对齐原型 .dot.p1~p4) */
const dotColor = (p: Task["priority"]) => {
  switch (p) {
    case "urgent": return "bg-destructive";       // p1 红
    case "high":   return "bg-warning";           // p2 橙
    case "medium": return "bg-brand-500";         // p3 品牌蓝
    default:       return "bg-muted-foreground/40"; // p4 灰
  }
};

export function TodayFocus() {
  const { data: tasks = [] } = useTasks();
  const updateTask = useUpdateTask();
  const [optimisticDone, setOptimisticDone] = useState<Set<string>>(new Set());

  // 取前 4 条待办/进行中任务，按优先级排序
  const focusTasks = [...tasks]
    .filter((t) => t.status === "todo" || t.status === "in_progress")
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] ?? 99) - (order[b.priority] ?? 99);
    })
    .slice(0, 4);

  const toggleCheck = (task: Task) => {
    const willDone = !(task.status === "done" || optimisticDone.has(task.id));
    if (willDone) setOptimisticDone((prev) => new Set(prev).add(task.id));
    else setOptimisticDone((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
    updateTask.mutate(
      {
        id: task.id,
        status: willDone ? "done" : "todo",
      },
      {
        onError: () => {
          // 失败时回滚乐观勾选，避免"勾了但实际没改"的假象
          setOptimisticDone((prev) => {
            const next = new Set(prev);
            if (willDone) next.delete(task.id);
            else next.add(task.id);
            return next;
          });
        },
      },
    );
  };

  // 状态文字映射
  const statusText = (t: Task) => {
    if (t.status === "done") return "已完成";
    if (t.status === "in_progress") return "进行中";
    return "待办";
  };

  const timeText = (t: Task) => {
    if (!t.due_date) return statusText(t);
    const d = new Date(t.due_date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return statusText(t);
    if (diffDays === 0) return `今天 ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
    if (diffDays === 1) return "明天";
    const weekdays = ["日","一","二","三","四","五","六"];
    return `周${weekdays[d.getDay()]}`;
  };

  return (
    <div>
      {/* 标题栏 — 对齐原型 */}
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-[15px] font-semibold">今日聚焦</strong>
        <Link
          to="/tasks"
          search={{ focus: undefined }}
          className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700 no-underline"
        >
          查看全部 →
        </Link>
      </div>

      {/* 任务列表 — 对齐原型 .list-row */}
      <div className="divide-y divide-border">
        {focusTasks.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            今日暂无待办 🎉
          </div>
        )}
        {focusTasks.map((task) => {
          const checked = task.status === "done" || optimisticDone.has(task.id);
          return (
            <div
              key={task.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl py-3 px-3.5 transition-colors hover:bg-muted/60"
              )}
              onClick={() => toggleCheck(task)}
            >
              {/* 复选框 — 对齐原型 .check */}
              <span
                className={cn(
                  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors",
                  checked
                    ? "border-success bg-success text-white"
                    : "border-border-strong bg-surface"
                )}
              >
                {checked && <Check size={13} strokeWidth={3} />}
              </span>

              {/* 标题 + 时间 */}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{task.title}</div>
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {statusText(task)} · {timeText(task)}
                </div>
              </div>

              {/* 优先级圆点 — 对齐原型 .dot */}
              <span
                className={cn(
                  "h-[9px] w-[9px] shrink-0 rounded-full",
                  dotColor(task.priority)
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
