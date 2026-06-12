import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type {
  SinaQuote, KLinePoint, StockWatchItem, StockTrade, StockPosition, StockAlert,
} from "@easywork/shared"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import * as stockIpc from "@/lib/stock-ipc"
import { fetchQuotes, buildSinaKey } from "@/lib/stock-service"
import { useKLine } from "@/lib/hooks/useKLine"
import { useQuotesPoll, buildQuoteMap, findQuoteFor } from "@/lib/hooks/useQuotesPoll"

// ==================== Types ====================

type ChartType = "intraday" | "daily" | "weekly" | "monthly"
type ViewMode = "tile" | "list"
type AlertType = "price_above" | "price_below" | "pct_change_up" | "pct_change_down"

const chartTypeOptions: { label: string; value: ChartType }[] = [
  { label: "分时", value: "intraday" },
  { label: "日K", value: "daily" },
  { label: "周K", value: "weekly" },
]

const alertTypeOptions: { value: AlertType; label: string; suffix: string }[] = [
  { value: "price_above",     label: "价格 ≥", suffix: "元" },
  { value: "price_below",     label: "价格 ≤", suffix: "元" },
  { value: "pct_change_up",   label: "涨幅 ≥", suffix: "%" },
  { value: "pct_change_down", label: "跌幅 ≥", suffix: "%" },
]

/** Map chart type to scale value for fetchKLine */
function getScale(chartType: ChartType): number | string {
  switch (chartType) {
    case "intraday": return 5
    case "daily":    return 240
    case "weekly":   return "week"
    case "monthly":  return "month"
  }
}

// ==================== Mini SVG Line Chart ====================

function MiniChart({ prices, chartType, isUp }: { prices: number[]; chartType: ChartType; isUp: boolean }) {
  if (prices.length < 2) return null
  const w = 160, h = 60, pad = 2
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - pad * 2)
    const y = h - pad - ((p - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  const color = chartType === "intraday" ? "#3b82f6" : (isUp ? "#ef4444" : "#22c55e")
  const fillColor = chartType === "intraday" ? "rgba(59,130,246,0.08)" : (isUp ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)")
  const areaPoints = `${points} ${(w - pad).toFixed(1)},${(h - pad).toFixed(1)} ${pad},${(h - pad).toFixed(1)}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polygon points={areaPoints} fill={fillColor} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ==================== Full K-Line Chart ====================

/** ECharts setOption payload builder for K-line chart */
function buildKLineOption(kData: KLinePoint[], scale: number | string) {
  const dates = kData.map((p) => p.date)
  const isIntraday = typeof scale === "number" && scale < 240

  if (isIntraday) {
    const closes = kData.map((p) => p.close)
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: { type: "category", data: dates, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { scale: true },
      series: [{
        type: "line",
        data: closes,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: "#3b82f6" },
        areaStyle: { color: "rgba(59,130,246,0.1)" },
      }],
    }
  }

  const values = kData.map((p) => [p.open, p.close, p.low, p.high])
  const volumes = kData.map((_, i) => {
    const cur = kData[i]!
    if (i === 0) return { value: cur.volume, itemStyle: { color: "rgba(239,68,68,0.6)" } }
    const up = cur.close >= cur.open
    return {
      value: cur.volume,
      itemStyle: { color: up ? "rgba(239,68,68,0.6)" : "rgba(34,197,94,0.6)" },
    }
  })
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: [
      { left: 60, right: 20, top: 40, height: "60%" },
      { left: 60, right: 20, top: "72%", height: "18%" },
    ],
    xAxis: [
      { type: "category", data: dates, gridIndex: 0, axisLabel: { show: false } },
      { type: "category", data: dates, gridIndex: 1 },
    ],
    yAxis: [
      { scale: true, gridIndex: 0 },
      { scale: true, gridIndex: 1 },
    ],
    series: [
      {
        type: "candlestick",
        data: values,
        itemStyle: {
          color: "#ef4444",
          color0: "#22c55e",
          borderColor: "#ef4444",
          borderColor0: "#22c55e",
        },
        gridIndex: 0,
      },
      {
        type: "bar",
        data: volumes,
        gridIndex: 1,
      },
    ],
  }
}

/** 单独的 hook，封装 ECharts 生命周期管理。返回 ref 绑到 div 即可。 */
function useChartRender(kData: KLinePoint[], scale: number | string) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartInst = useRef<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (kData.length === 0) return
    let cancelled = false
    setLoadError(null)
    import("echarts").then((echarts) => {
      if (cancelled) return
      if (!chartContainerRef.current) {
        requestAnimationFrame(() => {
          if (cancelled || !chartContainerRef.current) return
          if (chartInst.current) chartInst.current.dispose()
          chartInst.current = echarts.init(chartContainerRef.current, "light", { renderer: "canvas" })
          chartInst.current.setOption(buildKLineOption(kData, scale))
        })
        return
      }
      if (chartInst.current) chartInst.current.dispose()
      const chart = echarts.init(chartContainerRef.current, "light", { renderer: "canvas" })
      chartInst.current = chart
      chart.setOption(buildKLineOption(kData, scale))
    }).catch(() => {
      if (!cancelled) setLoadError("图表组件加载失败")
    })
    return () => {
      cancelled = true
      if (chartInst.current) {
        chartInst.current.dispose()
        chartInst.current = null
      }
    }
  }, [kData, scale])

  return { chartContainerRef, loadError }
}

function KLineChart({
  symbol,
  marketType,
  defaultScale,
}: {
  symbol: string
  marketType: string
  defaultScale?: number | string
}) {
  const [scale, setScale] = useState<number | string>(defaultScale ?? 240)
  const { data: kData, loading, error, refetch } = useKLine(symbol, marketType, scale, 120)
  const { chartContainerRef, loadError } = useChartRender(kData, scale)
  const displayError = error ?? loadError

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-surface-500">周期：</span>
        {[
          { label: "分时", v: 5 },
          { label: "日线", v: 240 },
          { label: "周线", v: "week" },
          { label: "月线", v: "month" },
        ].map((opt) => (
          <button
            key={String(opt.v)}
            onClick={() => setScale(opt.v)}
            className={`text-xs px-2 py-0.5 rounded ${
              scale === opt.v
                ? "bg-primary-500 text-white"
                : "bg-surface-100 text-surface-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {loading && (
        <div className="flex items-center justify-center" style={{ width: "100%", height: 380 }}>
          <div className="flex flex-col items-center gap-2">
            <svg className="animate-spin h-6 w-6 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-surface-400">加载中…</span>
          </div>
        </div>
      )}
      {!loading && displayError && (
        <div className="flex items-center justify-center" style={{ width: "100%", height: 380 }}>
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-amber-600">{displayError}</span>
            <button
              onClick={refetch}
              className="text-xs px-3 py-1 rounded bg-primary-500 text-white hover:bg-primary-600"
            >
              重试
            </button>
          </div>
        </div>
      )}
      {!loading && !displayError && (
        <div ref={chartContainerRef} style={{ width: "100%", height: 380 }} />
      )}
    </div>
  )
}

// ==================== Alert Dialog ====================

function AlertDialog({
  open, onClose, onSave, defaultSymbol, defaultMarket,
}: {
  open: boolean
  onClose: () => void
  onSave: (a: Omit<StockAlert, "id" | "lastTriggeredAt" | "triggerCount" | "createdAt" | "updatedAt">) => Promise<void>
  defaultSymbol?: string
  defaultMarket?: string
}) {
  const [symbol, setSymbol] = useState(defaultSymbol ?? "")
  const [marketType, setMarketType] = useState(defaultMarket ?? "a_stock")
  const [alertType, setAlertType] = useState<AlertType>("price_above")
  const [targetValue, setTargetValue] = useState("")
  const [cooldown, setCooldown] = useState("30")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSymbol(defaultSymbol ?? "")
      setMarketType(defaultMarket ?? "a_stock")
      setAlertType("price_above")
      setTargetValue("")
      setCooldown("30")
      setNote("")
      setErr(null)
    }
  }, [open, defaultSymbol, defaultMarket])

  const handleSubmit = async () => {
    setErr(null)
    const tv = parseFloat(targetValue)
    if (!symbol.trim() || !targetValue || !Number.isFinite(tv)) {
      setErr("请填写代码与阈值")
      return
    }
    setSubmitting(true)
    try {
      await onSave({
        symbol: symbol.trim(),
        marketType,
        alertType,
        targetValue: tv,
        isEnabled: true,
        cooldownMinutes: parseInt(cooldown, 10) || 30,
        note: note.trim() || null,
      })
      onClose()
    } catch (e: any) {
      setErr(e?.toString() || "保存失败")
    } finally {
      setSubmitting(false)
    }
  }

  const suffix = alertTypeOptions.find((o) => o.value === alertType)?.suffix ?? ""

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>添加价格预警</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>代码</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="600519" />
            </div>
            <div className="space-y-1">
              <Label>市场</Label>
              <select
                className="w-full h-9 rounded-md border border-surface-200 bg-white px-2 text-sm"
                value={marketType}
                onChange={(e) => setMarketType(e.target.value)}
              >
                <option value="a_stock">A 股</option>
                <option value="crypto">数字货币</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>触发条件</Label>
            <div className="grid grid-cols-2 gap-2">
              {alertTypeOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="alert_type"
                    checked={alertType === opt.value}
                    onChange={() => setAlertType(opt.value)}
                  />
                  {opt.label}{suffix}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>阈值{suffix && `（${suffix}）`}</Label>
            <Input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={alertType.startsWith("price_") ? "1800.00" : "5.0"}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>冷却（分钟）</Label>
              <Input
                type="number"
                min="0"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>备注（可选）</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Quotes Tab ====================

function QuotesTab({
  watchlist, onAdd, onRemove, onAddAlert,
}: {
  watchlist: StockWatchItem[]
  onAdd: (item: Omit<StockWatchItem, "id" | "createdAt" | "updatedAt">) => Promise<void>
  onRemove: (symbol: string, marketType: string) => Promise<void>
  onAddAlert: (symbol: string, marketType: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [addSymbol, setAddSymbol] = useState("")
  const [addName, setAddName] = useState("")
  const [addMarket, setAddMarket] = useState<"a_stock" | "crypto">("a_stock")
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>("tile")
  const [chartType, setChartType] = useState<ChartType>("intraday")
  const [chartDataMap, setChartDataMap] = useState<Record<string, number[]>>({})

  const [quotePreview, setQuotePreview] = useState<SinaQuote | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const doSearch = useCallback(async (sym: string, market: string) => {
    if (!sym.trim()) { setQuotePreview(null); return }
    setSearchLoading(true)
    try {
      const quotes = await fetchQuotes([{ symbol: sym.trim(), market_type: market }])
      const want = buildSinaKey(sym.trim(), market)
      const found = quotes.find((q) => q.symbol === want || q.symbol === sym.trim())
      if (found) {
        setQuotePreview(found)
        setAddName(found.name)
      } else {
        setQuotePreview(null)
      }
    } catch {
      setQuotePreview(null)
    }
    setSearchLoading(false)
  }, [])

  useEffect(() => {
    if (!addSymbol.trim()) { setQuotePreview(null); return }
    const id = setTimeout(() => doSearch(addSymbol, addMarket), 500)
    return () => clearTimeout(id)
  }, [addSymbol, addMarket, doSearch])

  // 实时行情轮询
  const quotes = useQuotesPoll(watchlist, 8_000)
  const quoteMap = useMemo(() => buildQuoteMap(quotes), [quotes])

  // Mini K线（仅 tile 视图）。注意 watchlist 用 buildStableKey 序列化避免不必要的重连。
  const watchKey = useMemo(
    () => watchlist.map((w) => `${w.symbol}@${w.marketType}`).sort().join(","),
    [watchlist],
  )
  useEffect(() => {
    if (watchlist.length === 0 || viewMode === "list") {
      setChartDataMap({})
      return
    }
    let cancelled = false
    const fetchAll = async () => {
      const result: Record<string, number[]> = {}
      for (const w of watchlist) {
        if (cancelled) break
        try {
          const data = await fetchQuotes([{ symbol: w.symbol, market_type: w.marketType }])
          if (!cancelled && data.length > 0) {
            result[w.symbol] = data.map((d) => d.price)
          }
        } catch (e) { console.warn("mini chart fetch failed", w.symbol, e) }
      }
      if (!cancelled) setChartDataMap(result)
    }
    fetchAll()
    const id = chartType === "intraday" ? setInterval(fetchAll, 60_000) : undefined
    return () => { cancelled = true; if (id) clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey, chartType, viewMode])

  const handleAdd = async () => {
    if (!addSymbol.trim()) return
    try {
      await onAdd({
        symbol: addSymbol.trim(),
        name: addName.trim() || addSymbol.trim(),
        marketType: addMarket,
        sortOrder: watchlist.length,
      })
      setShowAdd(false)
      setAddSymbol("")
      setAddName("")
      setQuotePreview(null)
    } catch (e: any) {
      alert(e?.toString() || "添加失败")
    }
  }

  const handleRemove = async (symbol: string, marketType: string) => {
    try { await onRemove(symbol, marketType) }
    catch (e) { console.error("删除失败", e) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex border border-surface-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("tile")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "tile" ? "bg-primary-500 text-white" : "bg-white text-surface-500 hover:bg-surface-50"
              }`}
            >
              平铺
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "list" ? "bg-primary-500 text-white" : "bg-white text-surface-500 hover:bg-surface-50"
              }`}
            >
              列表
            </button>
          </div>
          {viewMode === "tile" && (
            <div className="flex border border-surface-200 rounded-lg overflow-hidden">
              {chartTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChartType(opt.value)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    chartType === opt.value ? "bg-surface-800 text-white" : "bg-white text-surface-500 hover:bg-surface-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ 添加自选</Button>
      </div>

      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) { setQuotePreview(null); setAddSymbol(""); setAddName(""); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>添加自选股</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-3">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="market"
                  checked={addMarket === "a_stock"}
                  onChange={() => { setAddMarket("a_stock"); setQuotePreview(null) }}
                />
                A股
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="market"
                  checked={addMarket === "crypto"}
                  onChange={() => { setAddMarket("crypto"); setQuotePreview(null) }}
                />
                数字货币
              </label>
            </div>
            <div className="space-y-1">
              <Label>股票代码</Label>
              <Input
                value={addSymbol}
                onChange={(e) => { setAddSymbol(e.target.value); setAddName("") }}
                placeholder={addMarket === "a_stock" ? "600900" : "btcusd"}
              />
              {searchLoading && <p className="text-xs text-surface-400 mt-1">正在查询…</p>}
            </div>
            {quotePreview && (
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{quotePreview.name}</span>
                  <span className="font-mono text-xs text-surface-400">{quotePreview.symbol}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-base">{quotePreview.price.toFixed(2)}</span>
                  <span className={quotePreview.change >= 0 ? "text-red-600" : "text-green-600"}>
                    {quotePreview.change >= 0 ? "+" : ""}{quotePreview.change.toFixed(2)}
                  </span>
                  <span className={quotePreview.changePercent >= 0 ? "text-red-600" : "text-green-600"}>
                    {quotePreview.changePercent >= 0 ? "+" : ""}{quotePreview.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
            {!quotePreview && addSymbol.trim() && !searchLoading && (
              <p className="text-xs text-amber-600">未查询到该股票信息，请检查代码是否正确</p>
            )}
            <div className="space-y-1">
              <Label>名称（可选）</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="留空则使用股票代码"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={handleAdd}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {watchlist.length === 0 ? (
        <div className="text-center py-8 text-surface-400 text-sm">暂无自选股，点击「添加自选」开始。</div>
      ) : viewMode === "tile" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {watchlist.map((w) => {
            const q = findQuoteFor(quoteMap, w)
            const isUp = !q || q.change >= 0
            const color = isUp ? "text-red-600" : "text-green-600"
            const prices = chartDataMap[w.symbol] ?? []
            const isExpanded = expandedSymbol === w.symbol

            return (
              <Card
                key={`${w.symbol}@${w.marketType}`}
                className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                onClick={() => setExpandedSymbol(isExpanded ? null : w.symbol)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{q?.name || w.name}</p>
                      <p className="text-xs text-surface-400 font-mono">{w.symbol}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={`text-base font-bold ${color}`}>
                        {q ? q.price.toFixed(2) : "—"}
                      </p>
                      {q && (
                        <p className={`text-xs ${color}`}>
                          {q.change >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>

                  {prices.length >= 2 && (
                    <div className="flex justify-center my-1">
                      <MiniChart prices={prices} chartType={chartType} isUp={isUp} />
                    </div>
                  )}

                  <div className="text-center mt-1">
                    <span className="text-[10px] text-surface-300">
                      {isExpanded ? "▲ 收起图表" : "▼ 展开图表"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 border-t border-surface-100 pt-2" onClick={(e) => e.stopPropagation()}>
                      <KLineChart symbol={w.symbol} marketType={w.marketType} defaultScale={getScale(chartType)} />
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddAlert(w.symbol, w.marketType) }}
                      className="text-[10px] text-primary-500 hover:text-primary-600"
                    >
                      + 预警
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(w.symbol, w.marketType) }}
                      className="text-[10px] text-surface-300 hover:text-red-500"
                    >
                      删除
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="border border-surface-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-surface-500">
              <tr>
                <th className="text-left px-3 py-2">代码</th>
                <th className="text-left px-3 py-2">名称</th>
                <th className="text-right px-3 py-2">现价</th>
                <th className="text-right px-3 py-2">涨跌额</th>
                <th className="text-right px-3 py-2">涨跌幅</th>
                <th className="text-right px-3 py-2">成交量</th>
                <th className="px-3 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w) => {
                const q = findQuoteFor(quoteMap, w)
                const isUp = !q || q.change >= 0
                const color = isUp ? "text-red-600" : "text-green-600"
                const isExpanded = expandedSymbol === w.symbol
                return (
                  <>
                    <tr
                      key={`${w.symbol}@${w.marketType}`}
                      className="border-t border-surface-100 hover:bg-surface-50 cursor-pointer"
                      onClick={() => setExpandedSymbol(isExpanded ? null : w.symbol)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{w.symbol}</td>
                      <td className="px-3 py-2 font-medium">{q?.name || w.name}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${color}`}>
                        {q ? q.price.toFixed(2) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right ${color}`}>
                        {q ? (isUp ? "+" : "") + q.change.toFixed(2) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right ${color}`}>
                        {q ? (isUp ? "+" : "") + q.changePercent.toFixed(2) + "%" : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-surface-500">
                        {q ? q.volume.toFixed(0) + "手" : "—"}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); onAddAlert(w.symbol, w.marketType) }}
                          className="text-xs text-primary-500 hover:text-primary-600 mr-2"
                        >
                          + 预警
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemove(w.symbol, w.marketType) }}
                          className="text-xs text-surface-400 hover:text-red-500"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-surface-50/50 p-2">
                          <KLineChart symbol={w.symbol} marketType={w.marketType} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==================== Positions Tab ====================

function PositionsTab() {
  const [positions, setPositions] = useState<StockPosition[]>([])
  const [trades, setTrades] = useState<StockTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [showTrade, setShowTrade] = useState(false)
  const [tradeForm, setTradeForm] = useState({
    symbol: "",
    tradeType: "buy" as "buy" | "sell",
    price: "",
    quantity: "",
    fee: "0",
    tradedAt: new Date().toISOString().slice(0, 10),
    note: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, trd] = await Promise.all([
        stockIpc.stockPositionsGet(),
        stockIpc.stockTradesList(),
      ])
      setPositions(pos)
      setTrades(trd)
    } catch (e) { console.warn("加载持仓失败", e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 行情轮询（10s）
  const quotes = useQuotesPoll(positions, 10_000)
  const quoteMap = useMemo(() => buildQuoteMap(quotes), [quotes])

  const handleTradeSubmit = async () => {
    if (!tradeForm.symbol || !tradeForm.price || !tradeForm.quantity) return
    try {
      await stockIpc.stockTradeAdd({
        symbol: tradeForm.symbol,
        tradeType: tradeForm.tradeType,
        price: parseFloat(tradeForm.price),
        quantity: parseFloat(tradeForm.quantity),
        fee: parseFloat(tradeForm.fee || "0"),
        tradedAt: tradeForm.tradedAt,
        note: tradeForm.note || null,
      })
      setShowTrade(false)
      setTradeForm({
        symbol: "",
        tradeType: "buy",
        price: "",
        quantity: "",
        fee: "0",
        tradedAt: new Date().toISOString().slice(0, 10),
        note: "",
      })
      load()
    } catch (e) { console.error("记录交易失败", e) }
  }

  const totalMarketValue = positions.reduce((s, p) => {
    const price = findQuoteFor(quoteMap, p)?.price ?? p.avgCost
    return s + price * p.totalQty
  }, 0)

  const totalCost = positions.reduce((s, p) => s + p.avgCost * p.totalQty, 0)
  const totalPnL = totalMarketValue - totalCost
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "持仓市值", value: `¥${totalMarketValue.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` },
          { label: "持仓成本", value: `¥${totalCost.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` },
          { label: "浮动盈亏", value: `${totalPnL >= 0 ? "+" : ""}¥${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "text-red-600" : "text-green-600" },
          { label: "收益率", value: `${totalPnL >= 0 ? "+" : ""}${totalPnLPercent.toFixed(2)}%`, color: totalPnL >= 0 ? "text-red-600" : "text-green-600" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-3">
              <p className="text-xs text-surface-500">{item.label}</p>
              <p className={`text-base font-bold mt-0.5 ${item.color ?? ""}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">持仓明细</h3>
        <Button size="sm" onClick={() => setShowTrade(true)}>+ 记录交易</Button>
      </div>

      <Dialog open={showTrade} onOpenChange={setShowTrade}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>记录交易</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-3">
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" name="ttype" checked={tradeForm.tradeType === "buy"} onChange={() => setTradeForm((f) => ({ ...f, tradeType: "buy" }))} />
                买入
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" name="ttype" checked={tradeForm.tradeType === "sell"} onChange={() => setTradeForm((f) => ({ ...f, tradeType: "sell" }))} />
                卖出
              </label>
            </div>
            <div className="space-y-1">
              <Label>代码</Label>
              <Input value={tradeForm.symbol} onChange={e => setTradeForm(f => ({ ...f, symbol: e.target.value }))} placeholder="600900" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>价格</Label>
                <Input value={tradeForm.price} onChange={e => setTradeForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>数量</Label>
                <Input value={tradeForm.quantity} onChange={e => setTradeForm(f => ({ ...f, quantity: e.target.value }))} placeholder="100" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>手续费</Label>
              <Input value={tradeForm.fee} onChange={e => setTradeForm(f => ({ ...f, fee: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>交易日期</Label>
              <Input type="date" value={tradeForm.tradedAt} onChange={e => setTradeForm(f => ({ ...f, tradedAt: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Input value={tradeForm.note} onChange={e => setTradeForm(f => ({ ...f, note: e.target.value }))} placeholder="可选" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTrade(false)}>取消</Button>
            <Button onClick={handleTradeSubmit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-center py-8 text-surface-400 text-sm">加载中…</div>
      ) : positions.length === 0 ? (
        <div className="text-center py-8 text-surface-400 text-sm">暂无持仓，点击「记录交易」开始。</div>
      ) : (
        <div className="border border-surface-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-surface-500">
              <tr>
                <th className="text-left px-3 py-2">代码</th>
                <th className="text-left px-3 py-2">名称</th>
                <th className="text-right px-3 py-2">持仓量</th>
                <th className="text-right px-3 py-2">成本价</th>
                <th className="text-right px-3 py-2">现价</th>
                <th className="text-right px-3 py-2">市值</th>
                <th className="text-right px-3 py-2">盈亏</th>
                <th className="text-right px-3 py-2">收益率</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const q = findQuoteFor(quoteMap, p)
                const price = q?.price ?? p.avgCost
                const marketValue = price * p.totalQty
                const cost = p.avgCost * p.totalQty
                const pnl = marketValue - cost
                const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
                const isUp = pnl >= 0
                const color = isUp ? "text-red-600" : "text-green-600"
                return (
                  <tr key={p.symbol} className="border-t border-surface-100 hover:bg-surface-50">
                    <td className="px-3 py-2 font-mono text-xs">{p.symbol}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.totalQty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">¥{p.avgCost.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${color}`}>
                      ¥{price.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-right ${color}`}>
                      ¥{marketValue.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-right ${color}`}>
                      {isUp ? "+" : ""}¥{pnl.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-right ${color}`}>
                      {isUp ? "+" : ""}{pnlPct.toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {trades.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">交易记录</h3>
          <div className="border border-surface-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-50 text-surface-500">
                <tr>
                  <th className="text-left px-2 py-1">日期</th>
                  <th className="text-left px-2 py-1">代码</th>
                  <th className="text-left px-2 py-1">类型</th>
                  <th className="text-right px-2 py-1">价格</th>
                  <th className="text-right px-2 py-1">数量</th>
                  <th className="text-right px-2 py-1">手续费</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 50).map((t) => (
                  <tr key={t.id} className="border-t border-surface-100">
                    <td className="px-2 py-1">{t.tradedAt}</td>
                    <td className="px-2 py-1 font-mono">{t.symbol}</td>
                    <td className={`px-2 py-1 ${t.tradeType === "buy" ? "text-red-600" : "text-green-600"}`}>
                      {t.tradeType === "buy" ? "买入" : "卖出"}
                    </td>
                    <td className="px-2 py-1 text-right">¥{t.price.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{t.quantity.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">¥{t.fee.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Alerts Tab ====================

function AlertsTab({ refreshKey, onAdded }: { refreshKey: number; onAdded?: () => void }) {
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<StockAlert | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAlerts(await stockIpc.stockAlertList())
    } catch (e) { console.warn("加载预警失败", e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const handleAdd = async (a: Omit<StockAlert, "id" | "lastTriggeredAt" | "triggerCount" | "createdAt" | "updatedAt">) => {
    await stockIpc.stockAlertAdd(a)
    onAdded?.()
    await load()
  }

  const handleUpdate = async (a: StockAlert) => {
    await stockIpc.stockAlertUpdate(a)
    setEditing(null)
    await load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除此预警？")) return
    try {
      await stockIpc.stockAlertDelete(id)
      await load()
    } catch (e) { console.error("删除预警失败", e) }
  }

  const handleToggle = async (id: number) => {
    try { await stockIpc.stockAlertToggle(id); await load() }
    catch (e) { console.error("切换预警状态失败", e) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">价格预警</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ 添加预警</Button>
      </div>

      <AlertDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
      />

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>编辑预警</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>代码</Label>
                <Input value={editing.symbol} onChange={(e) => setEditing({ ...editing, symbol: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>阈值</Label>
                <Input
                  type="number"
                  value={editing.targetValue}
                  onChange={(e) => setEditing({ ...editing, targetValue: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>冷却（分钟）</Label>
                <Input
                  type="number"
                  value={editing.cooldownMinutes}
                  onChange={(e) => setEditing({ ...editing, cooldownMinutes: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>备注</Label>
                <Input
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value || null })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button onClick={() => handleUpdate(editing)}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <div className="text-center py-8 text-surface-400 text-sm">加载中…</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-8 text-surface-400 text-sm">暂无预警，点击「添加预警」开始。</div>
      ) : (
        <div className="border border-surface-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-surface-500">
              <tr>
                <th className="text-left px-3 py-2">代码</th>
                <th className="text-left px-3 py-2">类型</th>
                <th className="text-right px-3 py-2">阈值</th>
                <th className="text-right px-3 py-2">冷却</th>
                <th className="text-right px-3 py-2">触发次数</th>
                <th className="text-right px-3 py-2">最近触发</th>
                <th className="text-left px-3 py-2">备注</th>
                <th className="px-3 py-2 w-32" />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-t border-surface-100">
                  <td className="px-3 py-2 font-mono text-xs">{a.symbol}</td>
                  <td className="px-3 py-2 text-xs">
                    {alertTypeOptions.find((o) => o.value === a.alertType)?.label ?? a.alertType}
                  </td>
                  <td className="px-3 py-2 text-right">{a.targetValue}</td>
                  <td className="px-3 py-2 text-right text-xs">{a.cooldownMinutes}m</td>
                  <td className="px-3 py-2 text-right text-xs">{a.triggerCount}</td>
                  <td className="px-3 py-2 text-right text-xs text-surface-500">
                    {a.lastTriggeredAt ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-surface-500 truncate max-w-[200px]">
                    {a.note ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleToggle(a.id!)}
                      className={`text-xs mr-2 ${a.isEnabled ? "text-amber-600" : "text-green-600"}`}
                    >
                      {a.isEnabled ? "停用" : "启用"}
                    </button>
                    <button
                      onClick={() => setEditing(a)}
                      className="text-xs text-primary-500 mr-2"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(a.id!)}
                      className="text-xs text-red-500"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==================== Main Page ====================

function StocksPage() {
  const [activeTab, setActiveTab] = useState<"quotes" | "positions" | "alerts">("quotes")
  const [watchlist, setWatchlist] = useState<StockWatchItem[]>([])
  const [alertDialogState, setAlertDialogState] = useState<{ open: boolean; symbol?: string; marketType?: string }>({ open: false })
  const [alertRefreshKey, setAlertRefreshKey] = useState(0)

  const loadWatchlist = useCallback(async () => {
    try {
      setWatchlist(await stockIpc.stockWatchlistList())
    } catch (e) { console.warn("加载自选股失败", e) }
  }, [])

  useEffect(() => { loadWatchlist() }, [loadWatchlist])

  const handleAdd = async (item: Omit<StockWatchItem, "id" | "createdAt" | "updatedAt">) => {
    await stockIpc.stockWatchlistAdd(item)
    await loadWatchlist()
  }

  const handleRemove = async (symbol: string, marketType: string) => {
    await stockIpc.stockWatchlistRemove(symbol, marketType)
    await loadWatchlist()
  }

  const handleAddAlert = (symbol: string, marketType: string) => {
    setActiveTab("alerts")
    setAlertDialogState({ open: true, symbol, marketType })
  }

  const handleAlertAdded = () => {
    setAlertDialogState({ open: false })
    setAlertRefreshKey((n) => n + 1)
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-white">股票</h1>
        <p className="text-surface-500 text-sm mt-1">
          自选股行情追踪 — 实时行情：腾讯财经（免费）｜K线数据：新浪财经
        </p>
      </div>

      <div className="flex gap-1 border-b border-surface-200">
        {([
          { key: "quotes",    label: "行情" },
          { key: "positions", label: "持仓" },
          { key: "alerts",    label: "预警" },
        ] as { key: "quotes" | "positions" | "alerts"; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-surface-500 hover:text-surface-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "quotes" && (
        <QuotesTab
          watchlist={watchlist}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onAddAlert={handleAddAlert}
        />
      )}
      {activeTab === "positions" && <PositionsTab />}
      {activeTab === "alerts" && (
        <AlertsTab refreshKey={alertRefreshKey} onAdded={handleAlertAdded} />
      )}

      <AlertDialog
        open={alertDialogState.open}
        onClose={() => setAlertDialogState({ open: false })}
        defaultSymbol={alertDialogState.symbol}
        defaultMarket={alertDialogState.marketType}
        onSave={async (a) => {
          await stockIpc.stockAlertAdd(a)
          handleAlertAdded()
        }}
      />
    </div>
  )
}

export const Route = createFileRoute("/stocks")({
  component: StocksPage,
})
