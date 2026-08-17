import { useTasks, useUpdateTask } from "./useTasks";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeRecurrence } from "@/lib/recurrence";
import { priorityColors, priorityLabels } from "./taskConstants";
import { formatDateChinese } from "@/lib/dateUtils";
import type { Task } from "@/types";

interface TaskListViewProps {
  onTaskClick: (task: Task) => void;
}

export function TaskListView({ onTaskClick }: TaskListViewProps) {
  const { data: tasks = [], isLoading, isError, refetch } = useTasks();
  const updateTask = useUpdateTask();

  const handleToggleDone = (task: Task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTask.mutate({ id: task.id, status: newStatus });
  };

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">加载中...</div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-destructive">加载失败</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>重试</Button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <div className="text-4xl mb-2">📋</div>
        <div className="text-sm">暂无任务</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          onClick={() => onTaskClick(task)}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-md transition-shadow cursor-pointer",
            task.status === "done" && "opacity-60"
          )}
        >
          <Checkbox
            checked={task.status === "done"}
            onCheckedChange={() => handleToggleDone(task)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex-1 min-w-0">
            <h2 className={cn("font-medium text-sm", task.status === "done" && "line-through text-muted-foreground")}>
              {task.title}
            </h2>
            {task.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {task.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", priorityColors[task.priority])}>
              {priorityLabels[task.priority]}
            </Badge>
            {describeRecurrence(task.recurrence_rule) && (
              <span
                title={describeRecurrence(task.recurrence_rule)!}
                className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700"
              >
                ↻ 周期
              </span>
            )}
            {task.due_date && (
              <span className="text-xs text-muted-foreground">
                {formatDateChinese(new Date(task.due_date))}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
