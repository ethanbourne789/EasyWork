// 日志模块 IPC 接口

// Tauri API 可用性检查
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri not available, command "${cmd}" skipped`)
    throw new Error("Tauri not available")
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(cmd, args)
}

// ==================== 类型定义 ====================

export interface AppLog {
  id: number
  traceId: string | null
  level: string
  module: string
  action: string | null
  status: string | null
  params: string | null
  result: string | null
  errorMsg: string | null
  durationMs: number | null
  sourceFile: string | null
  sourceLine: number | null
  createdAt: string
}

export interface LogQuery {
  page?: number
  pageSize?: number
  module?: string
  level?: string
  action?: string
  traceId?: string
  startTime?: string
  endTime?: string
  keyword?: string
}

export interface LogQueryResult {
  logs: AppLog[]
  total: number
  page: number
  pageSize: number
}

export interface LogStats {
  total: number
  today: number
  errorCount: number
  warnCount: number
  infoCount: number
  debugCount: number
}

// ==================== API 函数 ====================

export async function queryLogs(query: LogQuery): Promise<LogQueryResult> {
  return tauriInvoke<LogQueryResult>("query_logs", { query })
}

export async function getTraceChain(traceId: string): Promise<AppLog[]> {
  return tauriInvoke<AppLog[]>("get_trace_chain", { traceId })
}

export async function getLogStats(): Promise<LogStats> {
  return tauriInvoke<LogStats>("get_log_stats")
}

export async function clearLogs(): Promise<number> {
  return tauriInvoke<number>("clear_logs")
}

export async function exportLogs(
  format?: "json" | "text",
  startTime?: string,
  endTime?: string
): Promise<string> {
  return tauriInvoke<string>("export_logs", {
    format: format || "json",
    startTime,
    endTime,
  })
}

export async function getLogModules(): Promise<string[]> {
  return tauriInvoke<string[]>("get_log_modules")
}
