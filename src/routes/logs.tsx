import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Terminal,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  Download,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Link2,
} from "lucide-react"
import { useEffect, useState, useCallback } from "react"
import {
  queryLogs,
  getTraceChain,
  getLogStats,
  clearLogs,
  exportLogs,
  getLogModules,
  type AppLog,
  type LogQuery,
  type LogStats,
} from "@/lib/log-ipc"

const levelConfig = {
  INFO: { icon: Info, color: "text-sky-500", bg: "bg-sky-100", label: "INFO", variant: "info" as const },
  WARN: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100", label: "WARN", variant: "warning" as const },
  ERROR: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-100", label: "ERROR", variant: "danger" as const },
  DEBUG: { icon: Bug, color: "text-violet-500", bg: "bg-violet-100", label: "DEBUG", variant: "default" as const },
}

function LogsPage() {
  const [logs, setLogs] = useState<AppLog[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [modules, setModules] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState<LogQuery>({
    page: 1,
    pageSize: 50,
  })
  const [total, setTotal] = useState(0)
  const [traceChain, setTraceChain] = useState<AppLog[] | null>(null)
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)

  const totalPages = Math.ceil(total / (query.pageSize || 50))

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await queryLogs(query)
      setLogs(result.logs)
      setTotal(result.total)
    } catch (err) {
      console.error("Failed to load logs:", err)
    } finally {
      setLoading(false)
    }
  }, [query])

  const loadStats = useCallback(async () => {
    try {
      const s = await getLogStats()
      setStats(s)
    } catch (err) {
      console.error("Failed to load stats:", err)
    }
  }, [])

  const loadModules = useCallback(async () => {
    try {
      const m = await getLogModules()
      setModules(m)
    } catch (err) {
      console.error("Failed to load modules:", err)
    }
  }, [])

  useEffect(() => {
    loadLogs()
    loadStats()
    loadModules()
  }, [loadLogs, loadStats, loadModules])

  const handleFilterChange = (key: keyof LogQuery, value: string | undefined) => {
    // "all" 表示全部，转换为 undefined
    const actualValue = value === "all" ? undefined : value
    setQuery((prev) => ({ ...prev, [key]: actualValue, page: 1 }))
  }

  const handlePageChange = (page: number) => {
    setQuery((prev) => ({ ...prev, page }))
  }

  const handleClearLogs = async () => {
    if (!confirm("确定要清空所有日志吗？此操作不可恢复。")) return
    try {
      const deleted = await clearLogs()
      console.log(`Cleared ${deleted} logs`)
      loadLogs()
      loadStats()
    } catch (err) {
      console.error("Failed to clear logs:", err)
    }
  }

  const handleExportLogs = async () => {
    try {
      const json = await exportLogs("json", query.startTime, query.endTime)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `easywork-logs-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export logs:", err)
    }
  }

  const handleViewTraceChain = async (traceId: string) => {
    setSelectedTraceId(traceId)
    try {
      const chain = await getTraceChain(traceId)
      setTraceChain(chain)
    } catch (err) {
      console.error("Failed to load trace chain:", err)
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight dark:text-white">系统日志</h1>
          <p className="text-surface-500 text-sm mt-1">
            实时应用运行记录 {stats && `• 总计 ${stats.total} 条 • 今日 ${stats.today} 条`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportLogs}>
            <Download size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearLogs}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-surface-500">总计</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-500">{stats.errorCount}</div>
              <div className="text-xs text-surface-500">错误</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-500">{stats.warnCount}</div>
              <div className="text-xs text-surface-500">警告</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-sky-500">{stats.infoCount}</div>
              <div className="text-xs text-surface-500">信息</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-violet-500">{stats.debugCount}</div>
              <div className="text-xs text-surface-500">调试</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 过滤器 */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-surface-500 mb-1 block">级别</label>
              <Select
                value={query.level || "all"}
                onValueChange={(v: string) => handleFilterChange("level", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="ERROR">ERROR</SelectItem>
                  <SelectItem value="WARN">WARN</SelectItem>
                  <SelectItem value="INFO">INFO</SelectItem>
                  <SelectItem value="DEBUG">DEBUG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">模块</label>
              <Select
                value={query.module || "all"}
                onValueChange={(v: string) => handleFilterChange("module", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">关键词</label>
              <Input
                placeholder="搜索..."
                value={query.keyword || ""}
                onChange={(e) => handleFilterChange("keyword", e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <div className="text-xs text-surface-500">
                共 {total} 条 • 第 {query.page} / {totalPages || 1} 页
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 日志列表 */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-surface-100 font-mono">
            {logs.map((log) => {
              const config = levelConfig[log.level as keyof typeof levelConfig] || levelConfig.INFO
              const Icon = config.icon
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-surface-50 transition-colors"
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
                      {log.action && (
                        <span className="text-[10px] text-surface-600">{log.action}</span>
                      )}
                      {log.traceId && (
                        <button
                          onClick={() => handleViewTraceChain(log.traceId!)}
                          className="text-[10px] text-sky-500 hover:underline flex items-center gap-1"
                        >
                          <Link2 size={10} />
                          {log.traceId.slice(0, 8)}
                        </button>
                      )}
                      <span className="text-[10px] text-surface-400 ml-auto">
                        {log.createdAt.replace("T", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-surface-700">
                      {log.status && <span className="font-semibold">{log.status} </span>}
                      {log.params && <span className="text-surface-500">{log.params}</span>}
                    </p>
                    {log.errorMsg && (
                      <p className="text-xs text-red-500">{log.errorMsg}</p>
                    )}
                    {log.durationMs !== null && (
                      <p className="text-[10px] text-surface-400">{log.durationMs}ms</p>
                    )}
                  </div>
                </div>
              )
            })}
            {logs.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-surface-500">暂无日志</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange((query.page || 1) - 1)}
            disabled={(query.page || 1) <= 1}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-surface-600">
            第 {query.page} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange((query.page || 1) + 1)}
            disabled={(query.page || 1) >= totalPages}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* 调用链对话框 */}
      <Dialog open={!!selectedTraceId} onOpenChange={(open) => !open && setSelectedTraceId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>调用链追踪: {selectedTraceId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {traceChain?.map((log) => {
              const config = levelConfig[log.level as keyof typeof levelConfig] || levelConfig.INFO
              const Icon = config.icon
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 p-3 bg-surface-50 rounded-lg"
                >
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={config.variant} className="text-[10px]">
                        {config.label}
                      </Badge>
                      <span className="text-surface-600">{log.module}</span>
                      {log.action && <span className="font-semibold">{log.action}</span>}
                      {log.status && <span className="text-surface-500">{log.status}</span>}
                      <span className="ml-auto text-surface-400">
                        {log.createdAt.replace("T", " ")}
                      </span>
                    </div>
                    {log.params && (
                      <pre className="text-[10px] text-surface-600 mt-1 overflow-x-auto">
                        {log.params}
                      </pre>
                    )}
                    {log.errorMsg && (
                      <p className="text-xs text-red-500 mt-1">{log.errorMsg}</p>
                    )}
                  </div>
                </div>
              )
            })}
            {traceChain?.length === 0 && (
              <div className="text-center text-surface-500 py-8">未找到相关日志</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-surface-400">
        <div className="flex items-center gap-2">
          <Terminal size={12} />
          <span>共 {total} 条日志</span>
        </div>
        <span>EasyWork v0.1.0-alpha — Tauri 2.0 + React + Rust</span>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/logs")({
  component: LogsPage,
})
