-- ============================================
-- V4__stock.sql — 股票模块（参考文档）
-- ============================================
-- 实际 DDL 由 db/schema.rs::create_tables() 创建。
-- 旧 `stocks` 表（含 alert_type / target_price）已废弃。

-- 自选股：用户关注的股票/币种
CREATE TABLE IF NOT EXISTS stock_watchlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    market_type TEXT    NOT NULL DEFAULT 'a_stock'
                        CHECK(market_type IN ('a_stock','crypto')),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(symbol, market_type)
);

CREATE INDEX IF NOT EXISTS idx_stock_watchlist_symbol
    ON stock_watchlist(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_watchlist_sort_order
    ON stock_watchlist(sort_order, id);

-- 交易记录：每次买入/卖出，触发持仓平均成本与盈亏计算
CREATE TABLE IF NOT EXISTS stock_trades (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT    NOT NULL,
    trade_type TEXT    NOT NULL CHECK(trade_type IN ('buy','sell')),
    price      REAL    NOT NULL CHECK(price > 0),
    quantity   REAL    NOT NULL CHECK(quantity > 0),
    fee        REAL    NOT NULL DEFAULT 0 CHECK(fee >= 0),
    traded_at  TEXT    NOT NULL,
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_trades_symbol_date
    ON stock_trades(symbol, traded_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stock_trades_traded_at ON stock_trades(traded_at);

-- 价格预警：达到阈值时由后台 worker 推系统通知
CREATE TABLE IF NOT EXISTS stock_alerts (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol             TEXT    NOT NULL,
    market_type        TEXT    NOT NULL DEFAULT 'a_stock'
                                 CHECK(market_type IN ('a_stock','crypto')),
    alert_type         TEXT    NOT NULL
                                 CHECK(alert_type IN ('price_above','price_below','pct_change_up','pct_change_down')),
    target_value       REAL    NOT NULL,
    is_enabled         INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
    cooldown_minutes   INTEGER NOT NULL DEFAULT 30 CHECK(cooldown_minutes >= 0),
    last_triggered_at  TEXT,
    trigger_count      INTEGER NOT NULL DEFAULT 0,
    note               TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_enabled
    ON stock_alerts(is_enabled, symbol);

-- ============================================
-- Demo 数据（自选股 / 交易 / 预警）
-- ============================================

-- 自选股：3 条
INSERT INTO stock_watchlist (symbol, name, market_type, sort_order) VALUES
    ('600519', '贵州茅台', 'a_stock', 0),
    ('000858', '五粮液',   'a_stock', 1),
    ('300750', '宁德时代', 'a_stock', 2);

-- 交易记录：4 条（覆盖买卖混合，便于验证平均成本 / 已实现盈亏）
INSERT INTO stock_trades (symbol, trade_type, price, quantity, fee, traded_at, note) VALUES
    ('600519', 'buy',  1500.00, 10,  5.00, date('now', '-30 days'), '首次建仓'),
    ('600519', 'buy',  1700.00, 10,  5.00, date('now', '-15 days'), '加仓'),
    ('600519', 'sell', 1680.00,  5,  5.00, date('now',  '-3 days'), '部分止盈'),
    ('000858', 'buy',  150.00, 100, 3.00, date('now',  '-7 days'), '五粮液建仓');

-- 价格预警：2 条
INSERT INTO stock_alerts (symbol, market_type, alert_type, target_value, cooldown_minutes, note) VALUES
    ('600519', 'a_stock', 'price_above',    1800.00, 30, '突破前高提醒'),
    ('000858', 'a_stock', 'pct_change_up',       5.00, 60, '日内涨幅超 5%');
