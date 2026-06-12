/**
 * KLine 数据获取 hook
 *
 * - 内置 loading / error / data 三态
 * - 失败时可重试（手动调用 refetch）
 * - 组件卸载后 setState 自动短路，避免内存泄漏
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { KLinePoint } from "@easywork/shared"
import { fetchKLine } from "../stock-service"

export function useKLine(
  symbol: string,
  marketType: string,
  scale: number | string,
  datalen = 120,
) {
  const [data, setData] = useState<KLinePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 每次 refetch 自增，effect 看到 key 变化会重拉
  const [tick, setTick] = useState(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    setLoading(true)
    setError(null)
    setData([])
    fetchKLine(symbol, marketType, scale, datalen)
      .then((points) => {
        if (cancelledRef.current) return
        setData(points)
        if (points.length === 0) setError("暂无数据")
      })
      .catch((e) => {
        if (cancelledRef.current) return
        console.error("fetchKLine error:", e)
        setError("数据加载失败")
      })
      .finally(() => {
        if (!cancelledRef.current) setLoading(false)
      })
    return () => {
      cancelledRef.current = true
    }
  }, [symbol, marketType, scale, datalen, tick])

  const refetch = useCallback(() => setTick((n) => n + 1), [])

  return { data, loading, error, refetch }
}
