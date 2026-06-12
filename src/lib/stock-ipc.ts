/**
 * 股票模块 IPC 客户端。
 *
 * Rust 端字段是 snake_case (symbol / market_type / alert_type …)，
 * Tauri 默认会把结构体字段原样传给前端。
 * 因此我们把入参 / 出参显式映射到 camelCase 的 shared 类型，
 * 避免前端出现 `market_type` / `target_value` 这种混合风格。
 */
import type {
  StockAlert,
  StockTrade,
  StockPosition,
  StockWatchItem,
} from "@easywork/shared"

// 内部 snake_case 形态（与 Rust 端 StockAlert 一一对应）
interface AlertWire {
  id?: number
  symbol: string
  market_type: string
  alert_type: string
  target_value: number
  is_enabled: boolean
  cooldown_minutes: number
  last_triggered_at?: string | null
  trigger_count: number
  note?: string | null
  created_at: string
  updated_at: string
}

interface TradeWire {
  id?: number
  symbol: string
  trade_type: string
  price: number
  quantity: number
  fee: number
  traded_at: string
  note?: string | null
  created_at: string
  updated_at: string
}

interface PositionWire {
  symbol: string
  name: string
  market_type: string
  total_qty: number
  avg_cost: number
  realized_pnl: number
}

interface WatchItemWire {
  id?: number
  symbol: string
  name: string
  market_type: string
  sort_order: number
  created_at: string
  updated_at: string
}

const toAlert = (w: AlertWire): StockAlert => ({
  id: w.id,
  symbol: w.symbol,
  marketType: w.market_type,
  alertType: w.alert_type,
  targetValue: w.target_value,
  isEnabled: w.is_enabled,
  cooldownMinutes: w.cooldown_minutes,
  lastTriggeredAt: w.last_triggered_at ?? null,
  triggerCount: w.trigger_count,
  note: w.note ?? null,
  createdAt: w.created_at,
  updatedAt: w.updated_at,
})

const fromAlert = (a: StockAlert): AlertWire => ({
  id: a.id,
  symbol: a.symbol,
  market_type: a.marketType,
  alert_type: a.alertType,
  target_value: a.targetValue,
  is_enabled: a.isEnabled,
  cooldown_minutes: a.cooldownMinutes,
  last_triggered_at: a.lastTriggeredAt ?? null,
  trigger_count: a.triggerCount,
  note: a.note ?? null,
  created_at: a.createdAt,
  updated_at: a.updatedAt,
})

const toTrade = (w: TradeWire): StockTrade => ({
  id: w.id,
  symbol: w.symbol,
  tradeType: w.trade_type,
  price: w.price,
  quantity: w.quantity,
  fee: w.fee,
  tradedAt: w.traded_at,
  note: w.note ?? null,
  createdAt: w.created_at,
  updatedAt: w.updated_at,
})

const fromTrade = (t: Omit<StockTrade, "id" | "createdAt" | "updatedAt">): TradeWire => ({
  symbol: t.symbol,
  trade_type: t.tradeType,
  price: t.price,
  quantity: t.quantity,
  fee: t.fee,
  traded_at: t.tradedAt,
  note: t.note ?? null,
  created_at: "",
  updated_at: "",
})

const toPosition = (w: PositionWire): StockPosition => ({
  symbol: w.symbol,
  name: w.name,
  marketType: w.market_type,
  totalQty: w.total_qty,
  avgCost: w.avg_cost,
  realizedPnl: w.realized_pnl,
})

const toWatch = (w: WatchItemWire): StockWatchItem => ({
  id: w.id,
  symbol: w.symbol,
  name: w.name,
  marketType: w.market_type,
  sortOrder: w.sort_order,
  createdAt: w.created_at,
  updatedAt: w.updated_at,
})

const fromWatch = (w: Omit<StockWatchItem, "id" | "createdAt" | "updatedAt">): WatchItemWire => ({
  symbol: w.symbol,
  name: w.name,
  market_type: w.marketType,
  sort_order: w.sortOrder,
  created_at: "",
  updated_at: "",
})

// ==================== invoke helper ====================

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core")
  return tauriInvoke<T>(cmd, args)
}

// ==================== Watchlist ====================

export async function stockWatchlistList(): Promise<StockWatchItem[]> {
  const raw = await invoke<WatchItemWire[]>("stock_watchlist_list")
  return raw.map(toWatch)
}

export async function stockWatchlistAdd(item: Omit<StockWatchItem, "id" | "createdAt" | "updatedAt">): Promise<number> {
  return invoke<number>("stock_watchlist_add", { item: fromWatch(item) })
}

export async function stockWatchlistRemove(symbol: string, marketType?: string): Promise<void> {
  return invoke<void>("stock_watchlist_remove", { symbol, marketType: marketType ?? null })
}

export async function stockWatchlistReorder(order: Array<[string, string]>): Promise<void> {
  return invoke<void>("stock_watchlist_reorder", { order })
}

// ==================== Trades ====================

export async function stockTradeAdd(trade: Omit<StockTrade, "id" | "createdAt" | "updatedAt">): Promise<number> {
  return invoke<number>("stock_trade_add", { trade: fromTrade(trade) })
}

export async function stockTradeDelete(id: number): Promise<boolean> {
  return invoke<boolean>("stock_trade_delete", { id })
}

export async function stockTradesList(
  symbol?: string,
  marketType?: string,
  page = 1,
  pageSize = 50,
): Promise<StockTrade[]> {
  const raw = await invoke<TradeWire[]>("stock_trades_list", {
    symbol: symbol ?? null,
    marketType: marketType ?? null,
    page,
    pageSize,
  })
  return raw.map(toTrade)
}

export async function stockTradesCount(symbol?: string, marketType?: string): Promise<number> {
  return invoke<number>("stock_trades_count", {
    symbol: symbol ?? null,
    marketType: marketType ?? null,
  })
}

// ==================== Positions ====================

export async function stockPositionsGet(): Promise<StockPosition[]> {
  const raw = await invoke<PositionWire[]>("stock_positions_get")
  return raw.map(toPosition)
}

// ==================== Alerts ====================

export async function stockAlertList(): Promise<StockAlert[]> {
  const raw = await invoke<AlertWire[]>("stock_alert_list")
  return raw.map(toAlert)
}

export async function stockAlertAdd(alert: Omit<StockAlert, "id" | "lastTriggeredAt" | "triggerCount" | "createdAt" | "updatedAt">): Promise<number> {
  const wire = fromAlert({
    ...alert,
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: "",
    updatedAt: "",
  })
  return invoke<number>("stock_alert_add", { alert: wire })
}

export async function stockAlertUpdate(alert: StockAlert): Promise<boolean> {
  return invoke<boolean>("stock_alert_update", { alert: fromAlert(alert) })
}

export async function stockAlertDelete(id: number): Promise<boolean> {
  return invoke<boolean>("stock_alert_delete", { id })
}

export async function stockAlertToggle(id: number): Promise<boolean> {
  return invoke<boolean>("stock_alert_toggle", { id })
}
