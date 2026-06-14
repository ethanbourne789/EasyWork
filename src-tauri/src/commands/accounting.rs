//! 记账（收支流水与统计）
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use rusqlite::params;

/// 交易记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    #[serde(rename = "type")]
    pub txn_type: String,
    pub amount: f64,
    pub category: String,
    pub subcategory: Option<String>,
    pub note: Option<String>,
    pub date: String,
    pub created_at: String,
}

impl Transaction {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Transaction {
            id: row.get("id")?,
            txn_type: row.get::<_, String>("type")?,
            amount: row.get("amount")?,
            category: row.get("category")?,
            subcategory: row.get("subcategory")?,
            note: row.get("note")?,
            date: row.get("date")?,
            created_at: row.get("created_at")?,
        })
    }
}

/// 记账统计摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountingSummary {
    pub total_income: f64,
    pub total_expense: f64,
    pub balance: f64,
    pub budget_usage_rate: f64,
}

// ==================== 交易操作 ====================

/// 获取交易列表
#[tauri::command]
pub async fn txn_list(
    start_date: Option<String>,
    end_date: Option<String>,
    pool: State<'_, DbPool>,
) -> AppResult<Vec<Transaction>> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let rows = match (start_date, end_date) {
        (Some(start), Some(end)) => {
            let mut stmt = conn.prepare(
                "SELECT id, type, amount, category, subcategory, note, date, created_at \
                 FROM transactions \
                 WHERE date BETWEEN ?1 AND ?2 \
                 ORDER BY date DESC",
            )?;
            let rows = stmt.query_map(params![start, end], Transaction::from_row)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        }
        (Some(start), None) => {
            let mut stmt = conn.prepare(
                "SELECT id, type, amount, category, subcategory, note, date, created_at \
                 FROM transactions \
                 WHERE date >= ?1 \
                 ORDER BY date DESC",
            )?;
            let rows = stmt.query_map(params![start], Transaction::from_row)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        }
        (None, Some(end)) => {
            let mut stmt = conn.prepare(
                "SELECT id, type, amount, category, subcategory, note, date, created_at \
                 FROM transactions \
                 WHERE date <= ?1 \
                 ORDER BY date DESC",
            )?;
            let rows = stmt.query_map(params![end], Transaction::from_row)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        }
        (None, None) => {
            let mut stmt = conn.prepare(
                "SELECT id, type, amount, category, subcategory, note, date, created_at \
                 FROM transactions \
                 ORDER BY date DESC",
            )?;
            let rows = stmt.query_map([], Transaction::from_row)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        }
    };

    Ok(rows)
}

/// 创建交易记录
#[tauri::command]
pub async fn txn_create(
    txn_type: String,
    amount: f64,
    category: String,
    subcategory: Option<String>,
    note: Option<String>,
    date: String,
    pool: State<'_, DbPool>,
) -> AppResult<Transaction> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    if amount <= 0.0 {
        return Err(AppError::InvalidInput("金额必须大于 0".into()));
    }

    conn.execute(
        "INSERT INTO transactions (type, amount, category, subcategory, note, date) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![txn_type, amount, category, subcategory, note, date],
    )?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, type, amount, category, subcategory, note, date, created_at \
         FROM transactions WHERE id = ?1",
    )?;

    let txn = stmt
        .query_row(params![id], Transaction::from_row)
        .map_err(|_| AppError::NotFound(format!("交易记录 {} 未找到", id)))?;

    Ok(txn)
}

/// 删除交易记录
#[tauri::command]
pub async fn txn_delete(id: i64, pool: State<'_, DbPool>) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let affected = conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ==================== 统计 ====================

/// 获取记账统计摘要
#[tauri::command]
pub async fn stats_summary(pool: State<'_, DbPool>) -> AppResult<AccountingSummary> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    // 查询总收入和总支出
    let summary: (f64, f64) = conn.query_row(
        "SELECT \
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) \
         FROM transactions",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let (total_income, total_expense) = summary;
    let balance = total_income - total_expense;

    // 预算使用率：支出 / 收入（如果收入 > 0），否则为 0
    let budget_usage_rate = if total_income > 0.0 {
        total_expense / total_income
    } else {
        0.0
    };

    Ok(AccountingSummary {
        total_income,
        total_expense,
        balance,
        budget_usage_rate,
    })
}
