//! Stock database operations — watchlist, trades, positions
use rusqlite::{params, Result};
use crate::db::DbPool;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StockWatchItem {
    pub id: Option<i64>,
    pub symbol: String,
    pub name: String,
    pub market_type: String, // "a_stock" | "crypto"
    pub sort_order: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StockTrade {
    pub id: Option<i64>,
    pub symbol: String,
    pub trade_type: String, // "buy" | "sell"
    pub price: f64,
    pub quantity: f64,
    pub fee: f64,
    pub traded_at: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StockPosition {
    pub symbol: String,
    pub name: String,
    pub market_type: String,
    pub total_qty: f64,
    pub avg_cost: f64,
}

/// Initialize stock tables. Called from `db::init_db`.
pub fn init_stock_tables(pool: &DbPool) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stock_watchlist (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT    NOT NULL,
            name        TEXT    NOT NULL,
            market_type TEXT    NOT NULL DEFAULT 'a_stock',
            sort_order  INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_stock_watchlist_symbol ON stock_watchlist(symbol);

        CREATE TABLE IF NOT EXISTS stock_trades (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol      TEXT    NOT NULL,
            trade_type  TEXT    NOT NULL CHECK(trade_type IN ('buy','sell')),
            price       REAL    NOT NULL,
            quantity    REAL    NOT NULL,
            fee         REAL    DEFAULT 0,
            traded_at   TEXT    NOT NULL,
            note        TEXT,
            created_at  TEXT    DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_stock_trades_symbol ON stock_trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_stock_trades_traded_at ON stock_trades(traded_at);

        -- read-only view: current positions (calculated from trades)
        DROP VIEW IF EXISTS stock_positions;
        CREATE VIEW stock_positions AS
        SELECT
            symbol,
            SUM(CASE WHEN trade_type='buy' THEN quantity ELSE -quantity END) AS total_qty,
            CASE
                WHEN SUM(CASE WHEN trade_type='buy' THEN quantity ELSE -quantity END) > 0
                THEN
                    (SUM(CASE WHEN trade_type='buy' THEN price*quantity - fee ELSE -(price*quantity + fee) END)
                    / SUM(CASE WHEN trade_type='buy' THEN quantity ELSE -quantity END)
                ELSE 0
            END AS avg_cost
        FROM stock_trades
        GROUP BY symbol
        HAVING total_qty > 0.0001;
        ",
    )?;

    Ok(())
}

// ==================== Watchlist ====================

pub fn watchlist_add(pool: &DbPool, item: &StockWatchItem) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO stock_watchlist (symbol, name, market_type, sort_order)
         VALUES (?1, ?2, ?3, ?4)",
        params![item.symbol, item.name, item.market_type, item.sort_order],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn watchlist_remove(pool: &DbPool, symbol: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("DELETE FROM stock_watchlist WHERE symbol = ?1", params![symbol])?;
    Ok(())
}

pub fn watchlist_list(pool: &DbPool) -> Result<Vec<StockWatchItem>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, symbol, name, market_type, sort_order
         FROM stock_watchlist ORDER BY sort_order, id"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(StockWatchItem {
            id: Some(row.get(0)?),
            symbol: row.get(1)?,
            name: row.get(2)?,
            market_type: row.get(3)?,
            sort_order: row.get(4)?,
        })
    })?;
    let mut items = Vec::new();
    for r in rows { items.push(r?); }
    Ok(items)
}

// ==================== Trades ====================

pub fn trade_add(pool: &DbPool, trade: &StockTrade) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO stock_trades (symbol, trade_type, price, quantity, fee, traded_at, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            trade.symbol, trade.trade_type, trade.price,
            trade.quantity, trade.fee, trade.traded_at, trade.note
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn trades_list(pool: &DbPool, symbol: Option<&str>) -> Result<Vec<StockTrade>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let sql = match symbol {
        Some(_) => {
            "SELECT id, symbol, trade_type, price, quantity, fee, traded_at, note
             FROM stock_trades WHERE symbol = ?1 ORDER BY traded_at DESC, id DESC"
        }
        None => {
            "SELECT id, symbol, trade_type, price, quantity, fee, traded_at, note
             FROM stock_trades ORDER BY traded_at DESC, id DESC"
        }
    };
    let mut stmt = conn.prepare(sql)?;
    let trades: Vec<StockTrade> = if let Some(s) = symbol {
        let rows = stmt.query_map(params![s], |row| {
            Ok(StockTrade {
                id: Some(row.get(0)?),
                symbol: row.get(1)?,
                trade_type: row.get(2)?,
                price: row.get(3)?,
                quantity: row.get(4)?,
                fee: row.get(5)?,
                traded_at: row.get(6)?,
                note: row.get(7)?,
            })
        })?;
        let mut trades = Vec::new();
        for r in rows { trades.push(r?); }
        trades
    } else {
        let rows = stmt.query_map([], |row| {
            Ok(StockTrade {
                id: Some(row.get(0)?),
                symbol: row.get(1)?,
                trade_type: row.get(2)?,
                price: row.get(3)?,
                quantity: row.get(4)?,
                fee: row.get(5)?,
                traded_at: row.get(6)?,
                note: row.get(7)?,
            })
        })?;
        let mut trades = Vec::new();
        for r in rows { trades.push(r?); }
        trades
    };
    Ok(trades)
}

// ==================== Positions ====================

pub fn positions_get(pool: &DbPool) -> Result<Vec<(StockPosition, Option<String>)>> {
    // Returns (position, name) — name comes from watchlist
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT p.symbol, COALESCE(w.name, p.symbol), p.total_qty, p.avg_cost, COALESCE(w.market_type, 'a_stock')
         FROM stock_positions p
         LEFT JOIN stock_watchlist w ON p.symbol = w.symbol
         ORDER BY w.sort_order, p.symbol"
    )?;
    let rows = stmt.query_map([], |row| {
        let pos = StockPosition {
            symbol: row.get(0)?,
            name: row.get(1)?,
            market_type: row.get(4)?,
            total_qty: row.get(2)?,
            avg_cost: row.get(3)?,
        };
        let name: Option<String> = row.get(1)?;
        Ok((pos, name))
    })?;
    let mut result = Vec::new();
    for r in rows { result.push(r?); }
    Ok(result)
}
