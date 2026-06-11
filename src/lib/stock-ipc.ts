import type { StockWatchItem, StockTrade, StockPosition } from "@/routes/stocks"

// ==================== Watchlist ====================

export async function stockWatchlistList(): Promise<StockWatchItem[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("stock_watchlist_list")
}

export async function stockWatchlistAdd(
  item: Omit<StockWatchItem, "id">
): Promise<number> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("stock_watchlist_add", { item })
}

export async function stockWatchlistRemove(symbol: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("stock_watchlist_remove", { symbol })
}

// ==================== Trades ====================

export async function stockTradeAdd(
  trade: Omit<StockTrade, "id">
): Promise<number> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("stock_trade_add", { trade })
}

export async function stockTradesList(
  symbol?: string
): Promise<StockTrade[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("stock_trades_list", { symbol: symbol ?? null })
}

// ==================== Positions ====================

export async function stockPositionsGet(): Promise<StockPosition[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke("stock_positions_get")
}
