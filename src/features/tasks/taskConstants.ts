import type { TaskPriority, TaskStatus } from "@/types";

export const priorityColors: Record<TaskPriority, string> = {
  low: "bg-muted/60 text-muted-foreground",
  medium: "bg-brand-50 text-brand-700 dark:bg-brand-50 dark:text-brand-700",
  high: "bg-warning/20 text-warning dark:bg-warning/20 dark:text-warning",
  urgent: "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive",
};

/** 实心圆点用色：徽标用的 bg-*-100 太淡，小色点需要饱和色才看得清 */
export const priorityDotColors: Record<TaskPriority, string> = {
  low: "bg-muted-foreground/40",
  medium: "bg-brand-500",
  high: "bg-warning",
  urgent: "bg-destructive",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export const statusColors: Record<TaskStatus, string> = {
  todo: "bg-muted/60 text-muted-foreground",
  in_progress: "bg-brand-50 text-brand-700 dark:bg-brand-50 dark:text-brand-700",
  done: "bg-success/20 text-success dark:bg-success/20 dark:text-success",
  cancelled: "bg-muted/60 text-muted-foreground dark:bg-muted/20 dark:text-muted-foreground",
};

export const statusLabels: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "完成",
  cancelled: "已取消",
};
