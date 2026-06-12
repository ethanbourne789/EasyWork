//! Tauri commands for the stock module.
use tauri::State;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::stock::db::{
    self, StockWatchItem, StockTrade, StockPosition, StockAlert,
    watchlist_add, watchlist_remove, watchlist_list, watchlist_reorder,
    trade_add, trade_delete, trades_list, trades_count, positions_get,
    alert_add, alert_update, alert_delete, alert_toggle, alert_list,
};
// ─── Watchlist ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn stock_watchlist_list(
    pool: State<'_, DbPool>,
) -> AppResult<Vec<StockWatchItem>> {
    watchlist_list(&pool).map_err(AppError::from)
}

#[tauri::command]
pub async fn stock_watchlist_add(
    pool: State<'_, DbPool>,
    item: StockWatchItem,
) -> AppResult<i64> {
    db::validate_watch_item(&item.symbol, &item.name, &item.market_type)
        .map_err(AppError::InvalidInput)?;
    watchlist_add(&pool, &item).map_err(AppError::InvalidInput)
}

#[tauri::command]
pub async fn stock_watchlist_remove(
    pool: State<'_, DbPool>,
    symbol: String,
    market_type: Option<String>,
) -> AppResult<()> {
    // 前端常只传 symbol；未指定时默认 a_stock，与 watchlist_add 一致。
    let mt = market_type.unwrap_or_else(|| "a_stock".to_string());
    watchlist_remove(&pool, &symbol, &mt).map_err(AppError::from)
}

#[tauri::command]
pub async fn stock_watchlist_reorder(
    pool: State<'_, DbPool>,
    order: Vec<(String, String)>,
) -> AppResult<()> {
    watchlist_reorder(&pool, &order).map_err(AppError::InvalidInput)
}

// ─── Trades ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn stock_trade_add(
    pool: State<'_, DbPool>,
    trade: StockTrade,
) -> AppResult<i64> {
    db::validate_trade(
        &trade.trade_type,
        trade.price,
        trade.quantity,
        trade.fee,
        &trade.traded_at,
    )
    .map_err(AppError::InvalidInput)?;
    trade_add(&pool, &trade).map_err(AppError::InvalidInput)
}

#[tauri::command]
pub async fn stock_trade_delete(pool: State<'_, DbPool>, id: i64) -> AppResult<bool> {
    trade_delete(&pool, id).map_err(AppError::InvalidInput)
}

#[tauri::command]
pub async fn stock_trades_list(
    pool: State<'_, DbPool>,
    symbol: Option<String>,
    market_type: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> AppResult<Vec<StockTrade>> {
    trades_list(
        &pool,
        symbol.as_deref(),
        market_type.as_deref(),
        page.unwrap_or(1),
        page_size.unwrap_or(50),
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub async fn stock_trades_count(
    pool: State<'_, DbPool>,
    symbol: Option<String>,
    market_type: Option<String>,
) -> AppResult<i64> {
    trades_count(&pool, symbol.as_deref(), market_type.as_deref()).map_err(AppError::from)
}

// ─── Positions ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn stock_positions_get(
    pool: State<'_, DbPool>,
) -> AppResult<Vec<StockPosition>> {
    positions_get(&pool).map_err(AppError::from)
}

// ─── Alerts ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn stock_alert_list(pool: State<'_, DbPool>) -> AppResult<Vec<StockAlert>> {
    alert_list(&pool).map_err(AppError::from)
}

#[tauri::command]
pub async fn stock_alert_add(
    pool: State<'_, DbPool>,
    alert: StockAlert,
) -> AppResult<i64> {
    db::validate_alert(&alert.alert_type, &alert.market_type, alert.target_value)
        .map_err(AppError::InvalidInput)?;
    alert_add(&pool, &alert).map_err(AppError::InvalidInput)
}

#[tauri::command]
pub async fn stock_alert_update(
    pool: State<'_, DbPool>,
    alert: StockAlert,
) -> AppResult<bool> {
    db::validate_alert(&alert.alert_type, &alert.market_type, alert.target_value)
        .map_err(AppError::InvalidInput)?;
    alert_update(&pool, &alert).map_err(AppError::InvalidInput)
}

#[tauri::command]
pub async fn stock_alert_delete(pool: State<'_, DbPool>, id: i64) -> AppResult<bool> {
    alert_delete(&pool, id).map_err(AppError::InvalidInput)
}

#[tauri::command]
pub async fn stock_alert_toggle(pool: State<'_, DbPool>, id: i64) -> AppResult<bool> {
    alert_toggle(&pool, id).map_err(AppError::InvalidInput)
}
