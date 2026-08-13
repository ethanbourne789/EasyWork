import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useSubtasks,
  useUpdateTask,
  useDeleteTask,
  useCreateSubtask,
  useUpdateSubtask,
  useDeleteSubtask,
  useTaskTags,
} from "./useTasks";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { statusLabels, priorityLabels, priorityDotColors } from "./taskConstants";
import type { Task } from "@/types";
import { confirm } from "@/lib/confirm";

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onEdit?: (task: Task) => void;
}

export function TaskDetailDrawer({ task, onClose, onEdit }: TaskDetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const { data: subtasks = [] } = useSubtasks(task?.id ?? null);
  const { data: taskTags = [] } = useTaskTags(task?.id ?? null);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createSubtask = useCreateSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();

  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // 切换任务时重置编辑态，避免把上一个任务的草稿写进新任务
  useEffect(() => {
    setIsEditing(false);
    setEditTitle(task?.title ?? "");
    setEditDescription(task?.description ?? "");
    setNewSubtaskTitle("");
  }, [task?.id, task?.title, task?.description]);

  // 可访问性增强：打开时锁定 body 滚动、ESC 关闭、并将焦点移入抽屉
  useEffect(() => {
    if (!task) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lastFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const focusable = panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
      lastFocused.current?.focus?.();
    };
  }, [task, onClose]);

  if (!task) return null;

  const handleStartEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const title = editTitle.trim();
    if (!title) {
      toast("标题不能为空", "error");
      return;
    }
    updateTask.mutate({
      id: task.id,
      title,
      description: editDescription,
    });
    setIsEditing(false);
  };

  const handleStatusChange = (status: Task["status"]) => {
    updateTask.mutate({ id: task.id, status });
  };

  const handlePriorityChange = (priority: Task["priority"]) => {
    updateTask.mutate({ id: task.id, priority });
  };

  const handleDueDateChange = (value: string) => {
    updateTask.mutate({ id: task.id, due_date: value || null });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "删除任务",
      description: `确定删除任务「${task.title}」吗？此操作不可撤销。`,
      confirmText: "删除",
      destructive: true,
    });
    if (ok) deleteTask.mutate(task.id, { onSuccess: onClose });
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      className="fixed inset-y-0 right-0 w-full sm:w-96 bg-background border-l shadow-lg z-50 flex flex-col focus:outline-none"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">任务详情</h2>
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
              完整编辑
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="描述..."
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                保存
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-xl font-medium mb-2">{task.title}</h3>
            {task.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            )}
            <Button size="sm" variant="outline" className="mt-2" onClick={handleStartEdit}>
              编辑标题/描述
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium w-16 shrink-0">状态</span>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value as Task["status"])}
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium w-16 shrink-0">优先级</span>
            <span
              className={cn("h-2.5 w-2.5 rounded-full shrink-0", priorityDotColors[task.priority])}
              aria-hidden="true"
            />
            <select
              value={task.priority}
              onChange={(e) => handlePriorityChange(e.target.value as Task["priority"])}
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            >
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium w-16 shrink-0">截止日期</span>
            <input
              type="date"
              value={task.due_date ? task.due_date.slice(0, 10) : ""}
              onChange={(e) => handleDueDateChange(e.target.value)}
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>

          {taskTags.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-sm font-medium w-16 shrink-0 pt-1">标签</span>
              <div className="flex flex-wrap gap-1.5">
                {taskTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">子任务</h4>
          <div className="space-y-2">
            {subtasks.map((subtask) => (
              <div key={subtask.id} className="flex items-center gap-2 group">
                <input
                  type="checkbox"
                  checked={subtask.done}
                  onChange={() => {
                    updateSubtask.mutate({
                      id: subtask.id,
                      task_id: task.id,
                      done: !subtask.done,
                    });
                  }}
                  className="rounded"
                />
                <span className={cn("text-sm flex-1", subtask.done && "line-through text-muted-foreground")}>
                  {subtask.title}
                </span>
                <button
                  onClick={() => deleteSubtask.mutate({ id: subtask.id, task_id: task.id })}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-3">
            <Input
              placeholder="新子任务..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSubtaskTitle.trim()) {
                  createSubtask.mutate({ task_id: task.id, title: newSubtaskTitle.trim() });
                  setNewSubtaskTitle("");
                }
              }}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => {
                if (newSubtaskTitle.trim()) {
                  createSubtask.mutate({ task_id: task.id, title: newSubtaskTitle.trim() });
                  setNewSubtaskTitle("");
                }
              }}
              disabled={!newSubtaskTitle.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="border-t p-4">
        <Button variant="outline" size="sm" className="w-full text-destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-1" />
          删除任务
        </Button>
      </div>
    </div>
  );
}
