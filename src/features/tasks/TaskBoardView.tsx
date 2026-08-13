import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
} from "@dnd-kit/core";
import { useTasks, useUpdateTask } from "./useTasks";
import { cn } from "@/lib/utils";
import { MS_PER_DAY } from "@/lib/constants";
import type { Task, TaskStatus, TaskPriority } from "@/types";

/** 看板列定义：待办/进行中/已取消/完成（与 statusLabels 保持一致） */
const columns: { status: TaskStatus; label: string; dotClass: string }[] = [
  { status: "todo",        label: "待办",   dotClass: "bg-brand-500" },      // p3 蓝
  { status: "in_progress", label: "进行中", dotClass: "bg-warning" },         // p2 橙
  { status: "cancelled",   label: "已取消", dotClass: "bg-muted-foreground/40" }, // p4 灰
  { status: "done",        label: "完成",   dotClass: "bg-success" },          // 绿
];

/** 优先级 → 标签 chip 文字 */
const priorityTag = (p: TaskPriority): string => {
  switch (p) {
    case "urgent": return "紧急";
    case "high":   return "高优";
    case "medium": return "中";
    case "low":    return "低";
    default:       return "";
  }
};

/**
 * 类别关键词表 — 从标题/描述中按关键词匹配生成标签。
 * 集中配置，便于后续按业务扩展或改为可用户自定义的标签规则。
 */
const CATEGORY_KEYWORDS: { label: string; keywords: string[]; branded?: boolean }[] = [
  { label: "设计", keywords: ["设计"] },
  { label: "文档", keywords: ["代码", "pr", "审查", "周会", "纪要"] },
  { label: "后端", keywords: ["后端", "supabase", "迁移"] },
  { label: "邮件", keywords: ["邮件"] },
  { label: "采购", keywords: ["采购", "日用品"] },
  { label: "已交付", keywords: ["交付", "原型"], branded: true },
];

/** 从任务标题/描述提取标签关键词（基于可配置的关键词表） */
function extractTags(task: Task): { text: string; branded?: boolean }[] {
  const tags: { text: string; branded?: boolean }[] = [];
  const title = task.title.toLowerCase();
  const desc = (task.description ?? "").toLowerCase();

  // 优先级标签
  if (task.priority === "high" || task.priority === "urgent") {
    tags.push({ text: priorityTag(task.priority), branded: true });
  }

  // 类别关键词（可配置）
  for (const { label, keywords, branded } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => title.includes(k) || desc.includes(k))) {
      tags.push({ text: label, branded });
    }
  }

  // 时间标签
  if (task.due_date) {
    const d = new Date(task.due_date);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / MS_PER_DAY);
    if (diffDays >= 0 && diffDays <= 7) tags.push({ text: "本周", branded: true });
  }

  return tags.slice(0, 3); // 最多 3 个标签
}

/** 格式化日期显示 — 对齐原型 */
function formatDate(task: Task): string {
  if (!task.due_date) {
    switch (task.status) {
      case "done": return "已完成";
      case "in_progress": return "进行中";
      case "cancelled": return "已取消";
      default: return "待办";
    }
  }
  const d = new Date(task.due_date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / MS_PER_DAY);
  if (diffDays < 0) {
    switch (task.status) {
      case "done": return "已完成";
      case "cancelled": return "已取消";
      default: return "待确认";
    }
  }
  if (diffDays === 0) return `今天 ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  if (diffDays === 1) return "明天";
  const weekdays = ["日","一","二","三","四","五","六"];
  return `周${weekdays[d.getDay()]}`;
}

/** 头像字母 + 背景色 */
function taskAvatar(task: Task, idx: number) {
  const letter = (task.title?.[0] ?? "E").toUpperCase();
  const bgs = [
    "bg-brand-100 text-brand-700",
    "bg-brand-50 text-brand-700",
    "bg-secondary text-foreground",
    "bg-accent text-foreground",
  ];
  return { letter, bg: bgs[idx % bgs.length] };
}

interface TaskBoardViewProps {
  onTaskClick: (task: Task) => void;
}

/* ── Draggable Task Card — 对齐原型 .task-card ── */
function DraggableTask({ task, onClick, idx }: { task: Task; onClick: () => void; idx: number }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const tags = extractTags(task);
  const dateText = formatDate(task);
  const avatar = taskAvatar(task, idx);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="cursor-pointer rounded-xl border bg-card p-3 shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-border-strong"
    >
      {/* 标题 — 对齐原型 .task-card .t */}
      <h4 className="text-[14px] font-semibold leading-snug">{task.title}</h4>

      {/* 标签 chips — 对齐原型 .task-card .meta > .tag */}
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.text}
              className={cn(
                "inline-block rounded-[7px] px-2 py-0.5 text-[12px] font-semibold",
                tag.branded
                  ? "bg-brand-50 text-brand-700"
                  : "bg-muted/60 text-muted-foreground"
              )}
            >
              {tag.text}
            </span>
          ))}
        </div>
      )}

      {/* 底部：日期 + 头像 — 对齐原型 .task-card .foot */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12.5px] text-muted-foreground">{dateText}</span>
        <span
          className={cn(
            "flex h-[28px] w-[28px] items-center justify-center rounded-full text-[11px] font-bold",
            avatar.bg
          )}
        >
          {avatar.letter}
        </span>
      </div>
    </div>
  );
}

/* ── Droppable Column — 对齐原型 .col ── */
function DroppableColumn({
  status,
  label,
  dotClass,
  tasks,
  onTaskClick,
}: {
  status: TaskStatus;
  label: string;
  dotClass: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-[var(--radius,14px)] bg-muted/30 p-2.5 transition-colors",
        "min-w-0 min-w-[260px] md:flex-1",
        isOver && "bg-muted"
      )}
    >
      {/* 列头 — 对齐原型 .col-head */}
      <div className="mb-2.5 flex items-center gap-2 px-1.5 py-1">
        <span className={cn("h-[9px] w-[9px] shrink-0 rounded-full", dotClass)} />
        <span className="font-bold text-[13.5px]">{label}</span>
        <span className="ml-auto text-[12px] font-semibold text-muted-foreground/60">
          {tasks.length}
        </span>
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 space-y-2 overflow-auto">
        {tasks.map((task, idx) => (
          <DraggableTask
            key={task.id}
            task={task}
            idx={idx}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Board ── */
export function TaskBoardView({ onTaskClick }: TaskBoardViewProps) {
  const { data: tasks = [] } = useTasks();
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task;
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (over && active.id !== over.id) {
      const task = active.data.current?.task;
      const newStatus = over.id as TaskStatus;
      if (task && task.status !== newStatus) {
        updateTask.mutate({ id: task.id, status: newStatus });
      }
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* 窄屏横向滚动，列不被压扁（每列 min-w-[260px]） */}
      <div className="flex h-full flex-col gap-3.5 overflow-x-auto md:flex-row md:gap-3.5 p-0 pb-2">
        {columns.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.status);
          return (
            <DroppableColumn
              key={col.status}
              status={col.status}
              label={col.label}
              dotClass={col.dotClass}
              tasks={columnTasks}
              onTaskClick={onTaskClick}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rotate-3 cursor-grabbing rounded-xl border bg-card p-3 shadow-lg opacity-90">
            <h4 className="text-[14px] font-semibold leading-snug">{activeTask.title}</h4>
            {activeTask.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {activeTask.description}
              </p>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
