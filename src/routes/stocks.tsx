import { useState, useEffect, useRef, useCallback } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import type { StockWatchItem, StockTrade, StockPosition } from "./stocks"
import * as stockIpc from "@/lib/stock-ipc"
import * as stockService from "@/lib/stock-service"
import type { SinaQuote, KLinePoint } from "@/lib/stock-service"

// ==================== Types ====================

export interface StockWatchItem {
  id?: number
  symbol: string
  name: string
  market_type: string   // "a_stock" | "crypto"
  sort_order: number
}

export interface StockTrade {
  id?: number
  symbol: string
  trade_type: "buy" | "sell"
  price: number
  quantity: number
  fee: number
  traded_at: string
  note?: string
}

export interface StockPosition {
  symbol: string
  name: string
  market_type: string
  total_qty: number
  avg_cost: number
}

// ==================== K-Line Chart ====================

function KLineChart({
  symbol,
  marketType,
}: {
  symbol: string
  marketType: string
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInst = useRef<any>(null)
  const [kData, setKData] = useState<KLinePoint[]>([])
  const [scale, setScale] = useState<number>(240) // 240 = daily

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await stockService.fetchKLine(symbol, marketType, scale, 120)
      if (!cancelled) setKData(data)
    })()
    return () => { cancelled = true }
  }, [symbol, marketType, scale])

  useEffect(() => {
    if (kData.length === 0 || !chartRef.current) return
    let cancelled = false
    import("echarts").then((echarts) => {
      if (cancelled) return
      if (chartInst.current) chartInst.current.dispose()
      const chart = echarts.init(chartRef.current, "light", { renderer: "canvas" })
      chartInst.current = chart
      const dates = kData.map((p) => p.date)
      const values = kData.map((p) => [p.open, p.close, p.low, p.high])
      const volumes = kData.map((p) => p.volume)

      chart.setOption({
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
              color: "#ef4444",       // red = close > open (Chinese style)
              color0: "#22c55e",     // green = close < open
              borderColor: "#ef4444",
              borderColor0: "#22c55e",
            },
            gridIndex: 0,
          },
          {
            type: "bar",
            data: volumes,
            itemStyle: {
              color: (params: any) => {
                const idx = params.dataIndex
                if (idx > 0) {
                  return kData[idx]!.close >= kData[idx]!.open
                    ? "rgba(239,68,68,0.6)"
                    : "rgba(34,197,94,0.6)"
                }
                return "rgba(239,68,68,0.6)"
              },
            },
            gridIndex: 1,
          },
        ],
      })
    })
    return () => {
      cancelled = true
      if (chartInst.current) {
        chartInst.current.dispose()
        chartInst.current = null
      }
    }
  }, [kData])

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-surface-500">K线：</span>
        {[
          { label: "日线", v: 240 },
          { label: "周线", v: "week" as any },
          { label: "月线", v: "month" as any },
        ].map((opt) => (
          <button
            key={String(opt.v)}
            onClick={() => setScale(opt.v as number)}
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
      <div ref={chartRef} style={{ width: "100%", height: 380 }} />
    </div>
  )
}

// ==================== Quotes Tab ====================

function QuotesTab() {
  const [watchlist, setWatchlist] = useState<(StockWatchItem & { quote?: SinaQuote })[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addSymbol, setAddSymbol] = useState("")
  const [addName, setAddName] = useState("")
  const [addMarket, setAddMarket] = useState<"a_stock" | "crypto">("a_stock")
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)

  const loadWatchlist = useCallback(async () => {
    setLoading(true)
    try {
      const list = await stockIpc.stockWatchlistList()
      setWatchlist(list.map((item) => ({ ...item, quote: undefined })))
    } catch (e) { console.warn("加载自选股失败", e) }
    setLoading(false)
  }, [])

  useEffect(() => { loadWatchlist() }, [loadWatchlist])

  // Periodically fetch real-time quotes from Sina
  useEffect(() => {
    if (watchlist.length === 0) return
    let cancelled = false
    const fetch = async () => {
      if (cancelled) return
      const symbols = watchlist.map((w) => ({ symbol: w.symbol, market_type: w.market_type }))
      try {
        const quotes = await stockService.fetchQuotes(symbols)
        setWatchlist((prev) =>
          prev.map((w) => {
            const q = quotes.find((q) => q.symbol.endsWith(w.symbol) || q.symbol === w.symbol)
            return q ? { ...w, quote: q } : w
          }),
        )
      } catch (e) { console.warn("获取行情失败", e) }
    }
    fetch()
    const id = setInterval(fetch, 8_000) // every 8s
    return () => { cancelled = true; clearInterval(id) }
  }, [watchlist.length])

  const handleAdd = async () => {
    if (!addSymbol.trim()) return
    try {
      await stockIpc.stockWatchlistAdd({
        symbol: addSymbol.trim(),
        name: addName.trim() || addSymbol.trim(),
        market_type: addMarket,
        sort_order: watchlist.length,
      })
      setShowAdd(false)
      setAddSymbol("")
      setAddName("")
      loadWatchlist()
    } catch (e) { console.error("添加失败", e) }
  }

  const handleRemove = async (symbol: string) => {
    try { await stockIpc.stockWatchlistRemove(symbol); loadWatchlist() }
    catch (e) { console.error("删除失败", e) }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">自选股行情</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ 添加自选</Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
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
                  onChange={() => setAddMarket("a_stock")}
                />
                A股
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="market"
                  checked={addMarket === "crypto"}
                  onChange={() => setAddMarket("crypto")}
                />
                数字货币
              </label>
            </div>
            <div className="space-y-1">
              <Label>代码</Label>
              <Input
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                placeholder={addMarket === "a_stock" ? "600900" : "btcusd"}
              />
            </div>
            <div className="space-y-1">
              <Label>名称（可选）</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="留空则自动从行情获取"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={handleAdd}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Watchlist Table */}
      {loading ? (
        <div className="text-center py-8 text-surface-400 text-sm">加载中…</div>
      ) : watchlist.length === 0 ? (
        <div className="text-center py-8 text-surface-400 text-sm">暂无自选股，点击「添加自选」开始。</div>
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
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w) => {
                const q = w.quote
                const isUp = !q || q.change >= 0
                const color = isUp ? "text-red-600" : "text-green-600" // Chinese: red = up
                return (
                  <>
                    <tr
                      key={w.symbol}
                      className="border-t border-surface-100 hover:bg-surface-50 cursor-pointer"
                      onClick={() => setExpandedSymbol(expandedSymbol === w.symbol ? null : w.symbol)}
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
                        {q ? (q.volume / 100).toFixed(0) + "手" : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemove(w.symbol) }}
                          className="text-xs text-surface-400 hover:text-red-500"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                    {expandedSymbol === w.symbol && (
                      <tr>
                        <td colSpan={7} className="bg-surface-50/50 p-2">
                          <KLineChart symbol={w.symbol} marketType={w.market_type} />
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
  const [positions, setPositions] = useState<(StockPosition & { quote?: SinaQuote })[]>([])
  const [trades, setTrades] = useState<StockTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [showTrade, setShowTrade] = useState(false)
  const [tradeForm, setTradeForm] = useState<{
    symbol: string
    trade_type: "buy" | "sell"
    price: string
    quantity: string
    fee: string
    traded_at: string
    note: string
  }>({
    symbol: "",
    trade_type: "buy",
    price: "",
    quantity: "",
    fee: "0",
    traded_at: new Date().toISOString().slice(0, 10),
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

  // Refresh quotes for positions
  useEffect(() => {
    if (positions.length === 0) return
    let cancelled = false
    const fetch = async () => {
      if (cancelled) return
      const symbols = positions.map((p) => ({
        symbol: p.symbol,
        market_type: p.market_type,
      }))
      try {
        const quotes = await stockService.fetchQuotes(symbols)
        setPositions((prev) =>
          prev.map((p) => {
            const q = quotes.find((q) => q.symbol.endsWith(p.symbol) || q.symbol === p.symbol)
            return q ? { ...p, quote: q } : p
          }),
        )
      } catch {}
    }
    fetch()
    const id = setInterval(fetch, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [positions.length])

  const handleTradeSubmit = async () => {
    if (!tradeForm.symbol || !tradeForm.price || !tradeForm.quantity) return
    try {
      await stockIpc.stockTradeAdd({
        symbol: tradeForm.symbol,
        trade_type: tradeForm.trade_type,
        price: parseFloat(tradeForm.price),
        quantity: parseFloat(tradeForm.quantity),
        fee: parseFloat(tradeForm.fee || "0"),
        traded_at: tradeForm.traded_at,
        note: tradeForm.note || undefined,
      })
      setShowTrade(false)
      setTradeForm({
        symbol: "",
        trade_type: "buy",
        price: "",
        quantity: "",
        fee: "0",
        traded_at: new Date().toISOString().slice(0, 10),
        note: "",
      })
      load()
    } catch (e) { console.error("记录交易失败", e) }
  }

  const totalMarketValue = positions.reduce((s, p) => {
    const price = p.quote?.price ?? p.avg_cost
    return s + price * p.total_qty
  }, 0)

  const totalCost = positions.reduce((s, p) => s + p.avg_cost * p.total_qty, 0)
  const totalPnL = totalMarketValue - totalCost
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Summary Card */}
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

      {/* Trade Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">持仓明细</h3>
        <Button size="sm" onClick={() => setShowTrade(true)}>+ 记录交易</Button>
      </div>

      {/* Trade Dialog */}
      <Dialog open={showTrade} onOpenChange={setShowTrade}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>记录交易</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-3">
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" name="ttype" checked={tradeForm.trade_type === "buy"} onChange={() => setTradeForm(f => ({ ...f, trade_type: "buy" }))} />
                买入
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" name="ttype" checked={tradeForm.trade_type === "sell"} onChange={() => setTradeForm(f => ({ ...f, trade_type: "sell" }))} />
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
              <Input type="date" value={tradeForm.traded_at} onChange={e => setTradeForm(f => ({ ...f, traded_at: e.target.value }))} />
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

      {/* Positions Table */}
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
                const price = p.quote?.price ?? p.avg_cost
                const marketValue = price * p.total_qty
                const cost = p.avg_cost * p.total_qty
                const pnl = marketValue - cost
                const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
                const isUp = pnl >= 0
                const color = isUp ? "text-red-600" : "text-green-600"
                return (
                  <tr key={p.symbol} className="border-t border-surface-100 hover:bg-surface-50">
                    <td className="px-3 py-2 font-mono text-xs">{p.symbol}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.total_qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">¥{p.avg_cost.toFixed(2)}</td>
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

      {/* Trades History */}
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
                    <td className="px-2 py-1">{t.traded_at}</td>
                    <td className="px-2 py-1 font-mono">{t.symbol}</td>
                    <td className={`px-2 py-1 ${t.trade_type === "buy" ? "text-red-600" : "text-green-600"}`}>
                      {t.trade_type === "buy" ? "买入" : "卖出"}
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

// ==================== Main Page ====================

function StocksPage() {
  const [activeTab, setActiveTab] = useState<"quotes" | "positions">("quotes")

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-white">股票</h1>
        <p className="text-surface-500 text-sm mt-1">
          自选股行情追踪 — 数据来源：新浪财经（免费）
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200">
        {([
          { key: "quotes",  label: "行情" },
          { key: "positions", label: "持仓" },
        ] as { key: "quotes" | "positions"; label: string }[]).map((tab) => (
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

      {activeTab === "quotes" && <QuotesTab />}
      {activeTab === "positions" && <PositionsTab />}
    </div>
  )
}

export const Route = createFileRoute("/stocks")({
  component: StocksPage,
})
