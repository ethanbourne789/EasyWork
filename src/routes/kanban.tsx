import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { demoKanbanTasks, type KanbanTask } from "@/data/demo-data"
import { Plus, MoreHorizontal, Calendar, User } from "lucide-react"

const columns = [
  { key: "todo" as const, label: "待办", color: "bg-surface-200" },
  { key: "in_progress" as const, label: "进行中", color: "bg-sky-400" },
  { key: "review" as const, label: "评审中", color: "bg-amber-400" },
  { key: "done" as const, label: "已完成", color: "bg-emerald-400" },
]

const priorityConfig = {
  urgent: { label: "紧急", variant: "danger" as const },
  high: { label: "高", variant: "warning" as const },
  medium: { label: "中", variant: "info" as const },
  low: { label: "低", variant: "default" as const },
}

function TaskCard({ task }: { task: KanbanTask }) {
  return (
    <Card className="hover:shadow-md transition-all cursor-grab active:cursor-grabbing group">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium flex-1">{task.title}</p>
          <button className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-surface-400 hover:text-surface-600">
            <MoreHorizontal size={14} />
          </button>
        </div>
        <p className="text-xs text-surface-500 line-clamp-2">{task.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Badge variant={priorityConfig[task.priority].variant}>
              {priorityConfig[task.priority].label}
            </Badge>
            {task.tags.map((tag) => (
              <span key={tag} className="text-[10px] text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-surface-400 pt-1 border-t border-surface-100">
          <div className="flex items-center gap-1">
            <User size={12} />
            <span>{task.assignee}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar size={12} />
            <span>{task.dueDate}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function KanbanPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">看板</h1>
          <p className="text-surface-500 text-sm mt-1">拖拽任务卡片以更新状态</p>
        </div>
        <Button>
          <Plus size={16} />
          新建任务
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((column) => {
          const tasks = demoKanbanTasks.filter((t) => t.status === column.key)
          return (
            <div key={column.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                <h3 className="text-sm font-semibold text-surface-700">{column.label}</h3>
                <span className="text-xs text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded-full">
                  {tasks.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {tasks.length === 0 && (
                  <div className="flex items-center justify-center h-24 border-2 border-dashed border-surface-200 rounded-xl text-xs text-surface-400">
                    暂无任务
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/kanban")({
  component: KanbanPage,
})
