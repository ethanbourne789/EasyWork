/**
 * 行情定时轮询 hook
 *
 * - 组件挂载时立即拉一次
 * - 之后按 intervalMs 周期拉
 * - 卸载后自动 stop
 * - 上一次 fetch 未结束就遇到新 tick 时，丢弃旧结果
 */
import { useEffect, useRef, useState } from "react"
import type { SinaQuote } from "@easywork/shared"
import { buildSinaKey, fetchQuotes } from "../stock-service"

export interface WatchItemLike {
  symbol: string
  marketType: string
}

export function useQuotesPoll(
  items: WatchItemLike[],
  intervalMs: number,
): SinaQuote[] {
  const [quotes, setQuotes] = useState<SinaQuote[]>([])
  const cancelledRef = useRef(false)

  // 让 effect 只依赖 items 数量 + 序列化后的 key 列表，避免无谓重连
  const key = items
    .map((w) => `${w.symbol}@${w.marketType}`)
    .sort()
    .join(",")

  useEffect(() => {
    if (items.length === 0) {
      setQuotes([])
      return
    }
    cancelledRef.current = false

    const fetchOnce = async () => {
      if (cancelledRef.current) return
      try {
        const result = await fetchQuotes(
          items.map((w) => ({ symbol: w.symbol, market_type: w.marketType })),
        )
        if (cancelledRef.current) return
        setQuotes(result)
      } catch (e) {
        // 静默：单次失败不影响后续轮询
        console.warn("useQuotesPoll fetch failed:", e)
      }
    }

    fetchOnce()
    const id = setInterval(fetchOnce, intervalMs)
    return () => {
      cancelledRef.current = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])

  return quotes
}

/** 用 quote 列表构造 symbol → quote 的查找表 */
export function buildQuoteMap(quotes: SinaQuote[]): Record<string, SinaQuote> {
  const out: Record<string, SinaQuote> = {}
  for (const q of quotes) out[q.symbol] = q
  return out
}

/**
 * 从 quoteMap 找到对应 watch item 的实时价。
 * 兼容 sh/sz 前缀的回填差异。
 */
export function findQuoteFor(
  map: Record<string, SinaQuote>,
  watch: WatchItemLike,
): SinaQuote | undefined {
  const key = buildSinaKey(watch.symbol, watch.marketType)
  return map[key] ?? map[watch.symbol]
}
