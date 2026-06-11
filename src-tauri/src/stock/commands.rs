//! Tauri commands for the stock module.
use tauri::State;
use crate::db::DbPool;
use crate::stock::db::{
    StockWatchItem, StockTrade, StockPosition,
    watchlist_add, watchlist_remove, watchlist_list,
    trade_add, trades_list, positions_get,
};

// ==================== Watchlist ====================

#[tauri::command]
pub async fn stock_watchlist_list(
    pool: State<'_, DbPool>,
) -> Result<Vec<StockWatchItem>, String> {
    watchlist_list(&pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stock_watchlist_add(
    pool: State<'_, DbPool>,
    item: StockWatchItem,
) -> Result<i64, String> {
    watchlist_add(&pool, &item).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stock_watchlist_remove(
    pool: State<'_, DbPool>,
    symbol: String,
) -> Result<(), String> {
    watchlist_remove(&pool, &symbol).map_err(|e| e.to_string())
}

// ==================== Trades ====================

#[tauri::command]
pub async fn stock_trade_add(
    pool: State<'_, DbPool>,
    trade: StockTrade,
) -> Result<i64, String> {
    trade_add(&pool, &trade).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stock_trades_list(
    pool: State<'_, DbPool>,
    symbol: Option<String>,
) -> Result<Vec<StockTrade>, String> {
    trades_list(&pool, symbol.as_deref()).map_err(|e| e.to_string())
}

// ==================== Positions ====================

#[tauri::command]
pub async fn stock_positions_get(
    pool: State<'_, DbPool>,
) -> Result<Vec<StockPosition>, String> {
    let raw = positions_get(&pool).map_err(|e| e.to_string())?;
    // Strip the name (second tuple element) — callers only need position fields.
    let positions: Vec<StockPosition> = raw.into_iter().map(|(p, _)| p).collect();
    Ok(positions)
}
