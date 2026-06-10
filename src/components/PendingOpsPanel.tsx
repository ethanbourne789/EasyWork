import { useState, useEffect, useCallback } from "react"
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react"

interface PendingOpsSummary {
  pending_count: number
  failed_count: number
  retrying_count: number
  total_active: number
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function fetchSummary(): Promise<PendingOpsSummary> {
  if (!isTauri) return { pending_count: 0, failed_count: 0, retrying_count: 0, total_active: 0 }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<PendingOpsSummary>("get_pending_ops_summary")
}

/**
 * Pending operations monitoring panel.
 * Shows counts of pending/failed/retrying operations with manual reconcile trigger.
 */
export function PendingOpsPanel() {
  const [summary, setSummary] = useState<PendingOpsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetchSummary()
      setSummary(s)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleReconcile = async () => {
    if (!isTauri) return
    setReconciling(true)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("reconcile_account", { accountId: null })
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setReconciling(false) }
  }

  if (!isTauri) return null

  return (
    <div className="p-4 bg-white border-t border-surface-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide">同步状态</h4>
        <button onClick={load} className="text-surface-400 hover:text-surface-600" title="刷新">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {summary && (
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-surface-500">
            <Clock size={12} /> 待处理: {summary.pending_count}
          </span>
          <span className="flex items-center gap-1 text-amber-500">
            <Loader2 size={12} className={summary.retrying_count > 0 ? "animate-spin" : ""} /> 重试中: {summary.retrying_count}
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <AlertTriangle size={12} /> 失败: {summary.failed_count}
          </span>
          {summary.total_active > 0 && (
            <button onClick={handleReconcile} disabled={reconciling}
              className="ml-auto text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1">
              {reconciling ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              同步标志
            </button>
          )}
        </div>
      )}

      {loading && !summary && <p className="text-xs text-surface-400">加载中...</p>}
    </div>
  )
}
