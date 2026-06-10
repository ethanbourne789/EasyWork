import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { demoLogs } from "@/data/demo-data"
import { Terminal, AlertTriangle, AlertCircle, Info, Bug } from "lucide-react"

const levelConfig = {
  info: { icon: Info, color: "text-sky-500", bg: "bg-sky-100", label: "INFO", variant: "info" as const },
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100", label: "WARN", variant: "warning" as const },
  error: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-100", label: "ERROR", variant: "danger" as const },
  debug: { icon: Bug, color: "text-violet-500", bg: "bg-violet-100", label: "DEBUG", variant: "default" as const },
}

function LogsPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight dark:text-white">系统日志</h1>
          <p className="text-surface-500 text-sm mt-1">实时应用运行记录</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
            {(["info", "warning", "error", "debug"] as const).map((level) => (
              <button
                key={level}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-all bg-white text-surface-700"
              >
                {levelConfig[level].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-surface-100 font-mono">
            {demoLogs.map((log) => {
              const config = levelConfig[log.level]
              const Icon = config.icon
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={config.variant} className="text-[10px] font-mono">
                        {config.label}
                      </Badge>
                      <Badge variant="default" className="text-[10px] font-mono">
                        {log.module}
                      </Badge>
                      <span className="text-[10px] text-surface-400 ml-auto">
                        {log.timestamp.replace("T", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-surface-700">{log.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-surface-400">
        <div className="flex items-center gap-2">
          <Terminal size={12} />
          <span>共 {demoLogs.length} 条日志</span>
        </div>
        <span>EasyWork v0.1.0-alpha — Tauri 2.0 + React + Rust</span>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/logs")({
  component: LogsPage,
})
