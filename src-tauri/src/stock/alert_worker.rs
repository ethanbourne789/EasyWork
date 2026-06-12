//! 价格预警后台 worker
//!
//! 周期性拉取启用预警的股票最新价，比对阈值后通过系统通知提醒用户。
//! - 同一 alert 在 cooldown 期内不重复触发
//! - 多 alert 共用同一 symbol 时只请求一次行情
//! - 网络/解析失败仅 warn，不影响 DB 状态
//!
//! 行情数据来自腾讯财经：`https://qt.gtimg.cn/q=sh600900,sz002459`
//! 返回 GBK 编码的字符串，字段以 `~` 分隔。
//! 我们只解析 price/change_percent（纯数字 ASCII），无需解码中文名。
use std::collections::HashMap;
use std::time::Duration;

use chrono::Local;
use regex::Regex;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::db::DbPool;
use crate::stock::db as stock_db;

const POLL_INTERVAL_SECS: u64 = 30;
const HTTP_TIMEOUT_SECS: u64 = 8;

#[derive(Debug, Clone)]
struct MiniQuote {
    symbol: String,
    price: f64,
    /// 涨跌幅（百分数），pct_change_* 预警需要
    change_percent: f64,
}

/// 启动价格预警后台轮询 worker
pub fn spawn(pool: DbPool, app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        log::info!(
            "Stock alert worker started, polling every {}s",
            POLL_INTERVAL_SECS
        );
        loop {
            tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
            if let Err(e) = tick(&app, &pool).await {
                log::warn!("Stock alert worker tick failed: {}", e);
            }
        }
    });
}

/// 单次扫描
async fn tick(app: &AppHandle, pool: &DbPool) -> Result<(), String> {
    let alerts = stock_db::alert_list_enabled(pool).map_err(|e| e.to_string())?;
    if alerts.is_empty() {
        return Ok(());
    }

    // 1) 收集去重 (symbol, market_type)
    let mut seen: HashMap<String, String> = HashMap::new();
    for a in &alerts {
        seen
            .entry(a.symbol.clone())
            .or_insert_with(|| a.market_type.clone());
    }
    let pairs: Vec<(String, String)> = seen.into_iter().collect();

    // 2) 拉行情（失败不中断整个 tick）
    let quotes = match fetch_quotes(&pairs).await {
        Ok(q) => q,
        Err(e) => {
            log::warn!("alert_worker: fetch_quotes failed: {e}");
            Vec::new()
        }
    };
    if quotes.is_empty() {
        return Ok(());
    }

    // 3) 逐条比对 + 触发通知
    let now = Local::now();
    for alert in &alerts {
        // cooldown 检查（用 last_triggered_at + cooldown_minutes）
        if let Some(last) = &alert.last_triggered_at {
            if let Ok(last_dt) = chrono::DateTime::parse_from_rfc3339(last) {
                let elapsed = now.signed_duration_since(last_dt.with_timezone(&Local));
                if elapsed.num_minutes() < alert.cooldown_minutes as i64 {
                    continue;
                }
            }
        }

        let Some(q) = quotes.iter().find(|q| q.symbol == alert.symbol) else {
            continue;
        };

        let triggered = match alert.alert_type.as_str() {
            "price_above" => q.price >= alert.target_value,
            "price_below" => q.price <= alert.target_value,
            "pct_change_up" => q.change_percent >= alert.target_value,
            "pct_change_down" => q.change_percent <= alert.target_value,
            _ => false,
        };
        if !triggered {
            continue;
        }

        // 触发：发通知 + 更新 DB
        let body = format!(
            "{} {} 阈值 {}  当前价 {} ({:+.2}%)",
            alert.symbol,
            alert_type_label(&alert.alert_type),
            alert.target_value,
            q.price,
            q.change_percent,
        );
        if let Err(e) = app
            .notification()
            .builder()
            .title("EasyWork 股票预警")
            .body(&body)
            .show()
        {
            log::warn!("alert_worker: notify failed: {e}");
        }

        if let Some(id) = alert.id {
            if let Err(e) = stock_db::alert_mark_triggered(pool, id) {
                log::warn!("alert_worker: mark_triggered({id}) failed: {e}");
            }
        }
    }

    Ok(())
}

fn alert_type_label(t: &str) -> &'static str {
    match t {
        "price_above" => "价格≥",
        "price_below" => "价格≤",
        "pct_change_up" => "涨幅≥",
        "pct_change_down" => "跌幅≥",
        _ => "触发",
    }
}

/// 批量拉取行情。
/// 腾讯返回的 `v_shXXX="..."` 中关键字段 (price, close_prev) 均为 ASCII 数字，
/// 我们用 bytes::find 定位首尾引号，按 `~` 切片，避免 GBK 解码。
async fn fetch_quotes(pairs: &[(String, String)]) -> Result<Vec<MiniQuote>, String> {
    if pairs.is_empty() {
        return Ok(Vec::new());
    }
    let keys = pairs
        .iter()
        .map(|(sym, mkt)| build_key(sym, mkt))
        .collect::<Vec<_>>()
        .join(",");

    let url = format!("https://qt.gtimg.cn/q={keys}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent("EasyWork/0.1")
        .build()
        .map_err(|e| format!("reqwest build: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP send: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP status {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read body: {e}"))?;

    // v_xxxx="....";  —— 取出第一对双引号之间的 payload
    // 整段是 GBK，但我们只关心 ASCII 字段（数字 / 字母），不会触发 UTF-8 错误。
    let body = String::from_utf8_lossy(&bytes);

    let re = Regex::new(r#"v_([a-zA-Z0-9]+)="([^"]*)""#).expect("static regex");

    let mut out = Vec::new();
    for caps in re.captures_iter(&body) {
        let sym = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        let payload = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        let parts: Vec<&str> = payload.split('~').collect();
        if parts.len() < 6 {
            continue;
        }
        // 索引参考 https://stock.gtimg.cn 字段定义：
        // [1] name [2] code [3] price [4] close_prev [5] open [6] ...
        let price = parts[3].parse::<f64>().unwrap_or(0.0);
        let close_prev = parts[4].parse::<f64>().unwrap_or(0.0);
        let change_percent = if close_prev > 0.0 {
            (price - close_prev) / close_prev * 100.0
        } else {
            0.0
        };
        out.push(MiniQuote {
            symbol: sym,
            price,
            change_percent,
        });
    }
    Ok(out)
}

/// sh/sz 前缀推断，与前端的 buildSinaKey 保持一致
fn build_key(symbol: &str, market_type: &str) -> String {
    if symbol.starts_with("sh") || symbol.starts_with("sz") {
        return symbol.to_string();
    }
    if market_type == "crypto" {
        return symbol.to_string();
    }
    if symbol.starts_with('6') {
        format!("sh{symbol}")
    } else {
        format!("sz{symbol}")
    }
}
