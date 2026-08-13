import { useState, useEffect } from "react";
import { Plus, FileText } from "lucide-react";
import { useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { ModuleFab } from "@/components/layout/ModuleFab";
import { TaskListView } from "./TaskListView";
import { TaskBoardView } from "./TaskBoardView";
import { TaskCalendarView } from "./TaskCalendarView";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { TaskForm } from "./TaskForm";
import { useTasks, useCreateTask } from "./useTasks";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

type ViewMode = "list" | "board" | "calendar";

export function Tasks() {
  const [viewMode, setViewMode] = useState<ViewMode>("board"); // 默认看板（对齐原型）
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const { data: tasks = [] } = useTasks();
  const createTask = useCreateTask();

  // 内置任务模板（H2：原“从模板/新建清单”占位死链，现提供真实模板快捷创建）
  const TEMPLATES = [
    { name: "购物清单", title: "购物清单", description: "· 牛奶\n· 鸡蛋\n· 面包", priority: "medium" as const },
    { name: "周会准备", title: "周会准备", description: "· 整理本周进展\n· 准备下周计划", priority: "high" as const },
    { name: "项目计划", title: "项目计划", description: "· 需求确认\n· 排期\n· 开发\n· 测试", priority: "high" as const },
    { name: "旅行打包", title: "旅行打包清单", description: "· 证件\n· 充电器\n· 衣物", priority: "medium" as const },
  ];

  const createFromTemplate = (t: (typeof TEMPLATES)[number]) => {
    createTask.mutate(
      { title: t.title, description: t.description, priority: t.priority },
      { onSuccess: () => setTemplateOpen(false) }
    );
  };
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const { focus } = useSearch({ from: "/app/tasks" as const });
  useEffect(() => {
    if (focus) setSelectedTaskId(focus);
  }, [focus]);

  const openCreate = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingTask(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 页面头部 — 对齐原型 .screen-head */}
      <div className="flex items-end justify-between gap-4 border-b p-4 pb-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            拖动卡片调整状态 · 点击查看详情
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={openCreate} className="hidden md:flex items-center gap-1">
            <Plus size={15} /> 新建任务
          </Button>

          {/* 视图切换器 — 对齐原型 .seg-ctl，放在右侧 */}
          <div className="flex gap-2 rounded-[11px] bg-muted/60 p-1">
          <button
            onClick={() => setViewMode("board")}
            className={cn(
              "rounded-[9px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
              viewMode === "board"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            看板
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-[9px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
              viewMode === "list"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            列表
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={cn(
              "rounded-[9px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
              viewMode === "calendar"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            日历
          </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {viewMode === "list" && <TaskListView onTaskClick={(task) => setSelectedTaskId(task.id)} />}
        {viewMode === "board" && <TaskBoardView onTaskClick={(task) => setSelectedTaskId(task.id)} />}
        {viewMode === "calendar" && <TaskCalendarView onTaskClick={(task) => setSelectedTaskId(task.id)} />}
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onEdit={(task) => {
          setSelectedTaskId(null);
          openEdit(task);
        }}
      />

      <Dialog open={formOpen} onOpenChange={(o) => (o ? setFormOpen(true) : closeForm())}>
        <DialogContent className="max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "编辑任务" : "新建任务"}</DialogTitle>
          </DialogHeader>
          <DialogClose onClose={closeForm} />
          <TaskForm task={editingTask} onSuccess={closeForm} onCancel={closeForm} />
        </DialogContent>
      </Dialog>

      <ModuleFab
        mainIcon={Plus}
        actions={[
          { label: "新建任务", icon: Plus, onClick: openCreate },
          { label: "从模板", icon: FileText, onClick: () => setTemplateOpen(true) },
        ]}
      />

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>从模板新建</DialogTitle>
          </DialogHeader>
          <DialogClose onClose={() => setTemplateOpen(false)} />
          <ul className="space-y-2">
            {TEMPLATES.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => createFromTemplate(t)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
