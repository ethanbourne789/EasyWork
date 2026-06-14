//! Stock database operations — watchlist, trades, positions, alerts.
//!
//! DDL 由 `db::schema::create_tables` 统一管理，本文件只放 CRUD。
use rusqlite::{params, OptionalExtension, Result};
use crate::db::DbPool;

// ─── 公共类型 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StockWatchItem {
    pub id: Option<i64>,
    pub symbol: String,
    pub name: String,
    pub market_type: String, // "a_stock" | "crypto"
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StockPosition {
    pub symbol: String,
    pub name: String,
    pub market_type: String,
    pub total_qty: f64,
    pub avg_cost: f64,
    pub realized_pnl: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StockAlert {
    pub id: Option<i64>,
    pub symbol: String,
    pub market_type: String,
    pub alert_type: String,         // "price_above" | "price_below" | "pct_change_up" | "pct_change_down"
    pub target_value: f64,
    pub is_enabled: bool,
    pub cooldown_minutes: i32,
    pub last_triggered_at: Option<String>,
    pub trigger_count: i32,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── 输入校验辅助 ─────────────────────────────────────────────────────────

const VALID_MARKET_TYPES: &[&str] = &["a_stock", "crypto"];
const VALID_TRADE_TYPES: &[&str] = &["buy", "sell"];
const VALID_ALERT_TYPES: &[&str] = &["price_above", "price_below", "pct_change_up", "pct_change_down"];

/// 通用输入校验：返回 `Result<(), String>`，供上层 Tauri Command 转 `AppError::InvalidInput`。
pub fn validate_watch_item(symbol: &str, name: &str, market_type: &str) -> Result<(), String> {
    if symbol.trim().is_empty() {
        return Err("股票代码不能为空".into());
    }
    if name.trim().is_empty() {
        return Err("股票名称不能为空".into());
    }
    if !VALID_MARKET_TYPES.contains(&market_type) {
        return Err(format!("market_type 必须是 {:?} 之一", VALID_MARKET_TYPES));
    }
    Ok(())
}

pub fn validate_trade(
    trade_type: &str,
    price: f64,
    quantity: f64,
    fee: f64,
    traded_at: &str,
) -> Result<(), String> {
    if !VALID_TRADE_TYPES.contains(&trade_type) {
        return Err(format!("trade_type 必须是 {:?} 之一", VALID_TRADE_TYPES));
    }
    if !price.is_finite() || price <= 0.0 {
        return Err("price 必须 > 0".into());
    }
    if !quantity.is_finite() || quantity <= 0.0 {
        return Err("quantity 必须 > 0".into());
    }
    if !fee.is_finite() || fee < 0.0 {
        return Err("fee 必须 >= 0".into());
    }
    if traded_at.trim().is_empty() {
        return Err("traded_at 不能为空".into());
    }
    Ok(())
}

pub fn validate_alert(alert_type: &str, market_type: &str, target_value: f64) -> Result<(), String> {
    if !VALID_ALERT_TYPES.contains(&alert_type) {
        return Err(format!("alert_type 必须是 {:?} 之一", VALID_ALERT_TYPES));
    }
    if !VALID_MARKET_TYPES.contains(&market_type) {
        return Err(format!("market_type 必须是 {:?} 之一", VALID_MARKET_TYPES));
    }
    if !target_value.is_finite() {
        return Err("target_value 必须是有限数值".into());
    }
    Ok(())
}

// ─── Watchlist ────────────────────────────────────────────────────────────

pub fn watchlist_add(pool: &DbPool, item: &StockWatchItem) -> Result<i64, String> {
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;

    // CHECK / UNIQUE 约束是兜底，重复时直接返回友好错误（防竞态）
    match conn.execute(
        "INSERT INTO stock_watchlist (symbol, name, market_type, sort_order)
         VALUES (?1, ?2, ?3, ?4)",
        params![item.symbol, item.name, item.market_type, item.sort_order],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            crate::sync::helpers::mark_dirty(&conn, "stock_watchlist", id).map_err(|e| e.to_string())?;
            Ok(id)
        }
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            Err(format!("股票 {} ({}) 已在自选列表中", item.name, item.symbol))
        }
        Err(e) => Err(format!("Insert error: {}", e)),
    }
}

pub fn watchlist_remove(pool: &DbPool, symbol: &str, market_type: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // 软删除：标记为 deleting
    conn.execute(
        "UPDATE stock_watchlist SET sync_status = 'deleting', sync_version = sync_version + 1 WHERE symbol = ?1 AND market_type = ?2",
        params![symbol, market_type],
    )?;
    Ok(())
}

pub fn watchlist_list(pool: &DbPool) -> Result<Vec<StockWatchItem>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, symbol, name, market_type, sort_order, created_at, updated_at
         FROM stock_watchlist
         ORDER BY sort_order, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(StockWatchItem {
            id: Some(row.get(0)?),
            symbol: row.get(1)?,
            name: row.get(2)?,
            market_type: row.get(3)?,
            sort_order: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    let mut items = Vec::new();
    for r in rows {
        items.push(r?);
    }
    Ok(items)
}

/// 调整排序：传一个按目标顺序排列的 (symbol, market_type) 列表。
pub fn watchlist_reorder(pool: &DbPool, order: &[(String, String)]) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("tx begin: {}", e))?;
    for (idx, (symbol, market_type)) in order.iter().enumerate() {
        tx.execute(
            "UPDATE stock_watchlist SET sort_order = ?1, updated_at = datetime('now')
             WHERE symbol = ?2 AND market_type = ?3",
            params![idx as i32, symbol, market_type],
        )
        .map_err(|e| format!("reorder update: {}", e))?;
    }
    tx.commit().map_err(|e| format!("tx commit: {}", e))?;
    // 标记所有涉及的记录为 dirty
    for (symbol, market_type) in order {
        let id: Option<i64> = conn.query_row(
            "SELECT id FROM stock_watchlist WHERE symbol = ?1 AND market_type = ?2 LIMIT 1",
            params![symbol, market_type],
            |row| row.get(0),
        ).ok();
        if let Some(id) = id {
            crate::sync::helpers::mark_dirty(&conn, "stock_watchlist", id).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ─── Trades ───────────────────────────────────────────────────────────────

pub fn trade_add(pool: &DbPool, trade: &StockTrade) -> Result<i64, String> {
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    conn.execute(
        "INSERT INTO stock_trades (symbol, trade_type, price, quantity, fee, traded_at, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            trade.symbol, trade.trade_type, trade.price,
            trade.quantity, trade.fee, trade.traded_at, trade.note
        ],
    )
    .map_err(|e| format!("Insert trade error: {}", e))?;
    let id = conn.last_insert_rowid();
    crate::sync::helpers::mark_dirty(&conn, "stock_trades", id).map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn trade_delete(pool: &DbPool, id: i64) -> Result<bool, String> {
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    let affected = conn.execute(
        "UPDATE stock_trades SET sync_status = 'deleting', sync_version = sync_version + 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Delete trade error: {}", e))?;
    Ok(affected > 0)
}

pub fn trades_list(
    pool: &DbPool,
    symbol: Option<&str>,
    market_type: Option<&str>,
    page: i64,
    page_size: i64,
) -> Result<Vec<StockTrade>> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 500);
    let offset = (page - 1) * page_size;

    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // 构造 (where_clause, param_values) — 市场过滤用 LEFT JOIN 关联 watchlist
    // 注意：market_type 参数占 ?1，symbol 占 ?2，...，依次递推
    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    all_params.push(Box::new(market_type.map(|s| s.to_string())));
    let join_market_idx = 1; // ?1 — market_type
    if let Some(s) = symbol {
        all_params.push(Box::new(s.to_string()));
    }
    if let Some(m) = market_type {
        all_params.push(Box::new(m.to_string()));
    }

    let where_sql = match (symbol, market_type) {
        (Some(_), Some(_)) => format!("WHERE t.symbol = ?2 AND w.market_type = ?3"),
        (Some(_), None)    => format!("WHERE t.symbol = ?2"),
        (None, Some(_))    => format!("WHERE w.market_type = ?3"),
        (None, None)       => String::new(),
    };
    let limit_idx = all_params.len() + 1;
    let offset_idx = all_params.len() + 2;
    all_params.push(Box::new(page_size));
    all_params.push(Box::new(offset));

    let sql = format!(
        "SELECT t.id, t.symbol, t.trade_type, t.price, t.quantity, t.fee,
                t.traded_at, t.note, t.created_at, t.updated_at
         FROM stock_trades t
         LEFT JOIN stock_watchlist w
                ON w.symbol = t.symbol AND w.market_type = ?{join_market}
         {where_sql}
         ORDER BY t.traded_at DESC, t.id DESC
         LIMIT ?{limit_idx} OFFSET ?{offset_idx}",
        join_market = join_market_idx,
        where_sql = where_sql,
        limit_idx = limit_idx,
        offset_idx = offset_idx,
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        all_params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(StockTrade {
            id: Some(row.get(0)?),
            symbol: row.get(1)?,
            trade_type: row.get(2)?,
            price: row.get(3)?,
            quantity: row.get(4)?,
            fee: row.get(5)?,
            traded_at: row.get(6)?,
            note: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn trades_count(
    pool: &DbPool,
    symbol: Option<&str>,
    market_type: Option<&str>,
) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    all_params.push(Box::new(market_type.map(|s| s.to_string())));
    if let Some(s) = symbol {
        all_params.push(Box::new(s.to_string()));
    }
    if let Some(m) = market_type {
        all_params.push(Box::new(m.to_string()));
    }

    let where_sql = match (symbol, market_type) {
        (Some(_), Some(_)) => "WHERE t.symbol = ?2 AND w.market_type = ?3",
        (Some(_), None)    => "WHERE t.symbol = ?2",
        (None, Some(_))    => "WHERE w.market_type = ?3",
        (None, None)       => "",
    };
    let sql = format!(
        "SELECT COUNT(*) FROM stock_trades t
         LEFT JOIN stock_watchlist w ON w.symbol = t.symbol AND w.market_type = ?1
         {where_sql}",
        where_sql = where_sql,
    );
    let refs: Vec<&dyn rusqlite::types::ToSql> = all_params.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&sql, refs.as_slice(), |row| row.get(0))?;
    Ok(total)
}

// ─── Positions ────────────────────────────────────────────────────────────

/// 计算当前持仓。
/// 平均成本 = sum(buy_price*buy_qty - buy_fee) / sum(buy_qty)
/// 净持仓 = sum(buy_qty) - sum(sell_qty)
/// 已实现盈亏 = sum(sell_proceeds) - 按比例分摊的原始成本
pub fn positions_get(pool: &DbPool) -> Result<Vec<StockPosition>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // 1) 找出所有有净持仓的 symbol（buy 数量 - sell 数量 > 0.0001）
    let mut stmt = conn.prepare(
        "SELECT symbol,
                SUM(CASE WHEN trade_type='buy'  THEN quantity ELSE 0 END)
              - SUM(CASE WHEN trade_type='sell' THEN quantity ELSE 0 END) AS net_qty,
                SUM(CASE WHEN trade_type='buy'
                         THEN price * quantity - fee
                         ELSE 0 END) AS buy_cost_total
         FROM stock_trades
         GROUP BY symbol
         HAVING net_qty > 0.0001",
    )?;
    let aggregates: Vec<(String, f64, f64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    let mut out = Vec::new();
    for (symbol, net_qty, buy_cost_total) in aggregates {
        // 平均成本 = sum(buy 净额) / sum(buy 数量) — 只看买入,忽略卖出
        let avg_cost = if net_qty > 0.0 { buy_cost_total / net_qty } else { 0.0 };

        // 已实现盈亏 ≈ sum(sell 收回) - sum(sell 数量) * 当前 avg_cost
        // 这是加权平均成本法下的常见简化:卖出按当下均价反算原始成本。
        // 多次调仓时与 FIFO/LIFO 会有偏差,但对个人记账足够直观。
        let (sell_proceeds, sell_qty): (f64, f64) = conn.query_row(
            "SELECT COALESCE(SUM(price * quantity - fee), 0.0),
                    COALESCE(SUM(quantity), 0.0)
             FROM stock_trades
             WHERE symbol = ?1 AND trade_type = 'sell'",
            params![symbol],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap_or((0.0, 0.0));
        let realized_pnl = sell_proceeds - sell_qty * avg_cost;

        // 自选股里查 name / market_type
        let meta: Option<(String, String)> = conn
            .query_row(
                "SELECT name, market_type FROM stock_watchlist WHERE symbol = ?1 LIMIT 1",
                params![symbol],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .unwrap_or(None);

        let (name, market_type) = meta.unwrap_or_else(|| (symbol.clone(), "a_stock".to_string()));

        out.push(StockPosition {
            symbol,
            name,
            market_type,
            total_qty: net_qty,
            avg_cost,
            realized_pnl,
        });
    }

    Ok(out)
}

// ─── Alerts ───────────────────────────────────────────────────────────────

pub fn alert_add(pool: &DbPool, alert: &StockAlert) -> Result<i64, String> {
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    conn.execute(
        "INSERT INTO stock_alerts
            (symbol, market_type, alert_type, target_value, is_enabled,
             cooldown_minutes, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            alert.symbol, alert.market_type, alert.alert_type, alert.target_value,
            alert.is_enabled as i32, alert.cooldown_minutes, alert.note,
        ],
    )
    .map_err(|e| format!("Insert alert error: {}", e))?;
    let id = conn.last_insert_rowid();
    crate::sync::helpers::mark_dirty(&conn, "stock_alerts", id).map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn alert_update(pool: &DbPool, alert: &StockAlert) -> Result<bool, String> {
    let id = alert.id.ok_or_else(|| "alert.id 不能为空".to_string())?;
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    let n = conn.execute(
        "UPDATE stock_alerts SET
            symbol = ?1, market_type = ?2, alert_type = ?3, target_value = ?4,
            is_enabled = ?5, cooldown_minutes = ?6, note = ?7,
            updated_at = datetime('now')
         WHERE id = ?8",
        params![
            alert.symbol, alert.market_type, alert.alert_type, alert.target_value,
            alert.is_enabled as i32, alert.cooldown_minutes, alert.note, id,
        ],
    )
    .map_err(|e| format!("Update alert error: {}", e))?;
    if n > 0 {
        crate::sync::helpers::mark_dirty(&conn, "stock_alerts", id).map_err(|e| e.to_string())?;
    }
    Ok(n > 0)
}

pub fn alert_delete(pool: &DbPool, id: i64) -> Result<bool, String> {
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    let n = conn.execute(
        "UPDATE stock_alerts SET sync_status = 'deleting', sync_version = sync_version + 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Delete alert error: {}", e))?;
    Ok(n > 0)
}

pub fn alert_toggle(pool: &DbPool, id: i64) -> Result<bool, String> {
    let conn = pool.get().map_err(|e| format!("DB connection error: {}", e))?;
    let current: bool = conn
        .query_row(
            "SELECT is_enabled FROM stock_alerts WHERE id = ?1",
            params![id],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .map_err(|e| format!("alert {id} not found: {e}"))?;
    let new_val = if current { 0i32 } else { 1i32 };
    conn.execute(
        "UPDATE stock_alerts SET is_enabled = ?1, updated_at = datetime('now')
         WHERE id = ?2",
        params![new_val, id],
    )
    .map_err(|e| format!("Toggle alert error: {e}"))?;
    crate::sync::helpers::mark_dirty(&conn, "stock_alerts", id).map_err(|e| e.to_string())?;
    Ok(!current)
}

pub fn alert_list(pool: &DbPool) -> Result<Vec<StockAlert>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, symbol, market_type, alert_type, target_value, is_enabled,
                cooldown_minutes, last_triggered_at, trigger_count, note,
                created_at, updated_at
         FROM stock_alerts
         ORDER BY is_enabled DESC, symbol, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(StockAlert {
            id: Some(row.get(0)?),
            symbol: row.get(1)?,
            market_type: row.get(2)?,
            alert_type: row.get(3)?,
            target_value: row.get(4)?,
            is_enabled: row.get::<_, i32>(5)? != 0,
            cooldown_minutes: row.get(6)?,
            last_triggered_at: row.get(7)?,
            trigger_count: row.get(8)?,
            note: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// 给价格预警 worker 用：拉所有启用的预警。
pub fn alert_list_enabled(pool: &DbPool) -> Result<Vec<StockAlert>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, symbol, market_type, alert_type, target_value, is_enabled,
                cooldown_minutes, last_triggered_at, trigger_count, note,
                created_at, updated_at
         FROM stock_alerts
         WHERE is_enabled = 1
         ORDER BY id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(StockAlert {
            id: Some(row.get(0)?),
            symbol: row.get(1)?,
            market_type: row.get(2)?,
            alert_type: row.get(3)?,
            target_value: row.get(4)?,
            is_enabled: true,
            cooldown_minutes: row.get(6)?,
            last_triggered_at: row.get(7)?,
            trigger_count: row.get(8)?,
            note: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// 标记预警已触发。worker 在 cooldown 通过后再次触发，会更新 last_triggered_at 与 trigger_count。
pub fn alert_mark_triggered(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE stock_alerts SET
            last_triggered_at = datetime('now'),
            trigger_count = trigger_count + 1,
            updated_at = datetime('now')
         WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}
