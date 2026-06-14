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

/// 更新交易记录
#[tauri::command]
pub async fn txn_update(
    id: i64,
    txn_type: String,
    amount: f64,
    category: String,
    subcategory: Option<String>,
    note: Option<String>,
    date: String,
    pool: State<'_, DbPool>,
) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    if amount <= 0.0 {
        return Err(AppError::InvalidInput("金额必须大于 0".into()));
    }

    let affected = conn.execute(
        "UPDATE transactions SET type = ?1, amount = ?2, category = ?3, subcategory = ?4, note = ?5, date = ?6, updated_at = datetime('now') WHERE id = ?7",
        params![txn_type, amount, category, subcategory, note, date, id],
    )?;
    Ok(affected > 0)
}

// ==================== 分类操作 ====================

/// 分类记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub r#type: String,
    pub icon: String,
    pub color: String,
    pub parent_id: i64,
    pub sort_order: i64,
    pub created_at: String,
}

impl Category {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Category {
            id: row.get("id")?,
            name: row.get("name")?,
            r#type: row.get("type")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            parent_id: row.get("parent_id")?,
            sort_order: row.get("sort_order")?,
            created_at: row.get("created_at")?,
        })
    }
}

/// 获取分类列表
#[tauri::command]
pub async fn category_list(pool: State<'_, DbPool>) -> AppResult<Vec<Category>> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT id, name, type, icon, color, parent_id, sort_order, created_at \
         FROM categories ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map([], Category::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// 创建分类
#[tauri::command]
pub async fn category_create(
    name: String,
    r#type: String,
    icon: Option<String>,
    color: Option<String>,
    parent_id: Option<i64>,
    sort_order: Option<i64>,
    pool: State<'_, DbPool>,
) -> AppResult<i64> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let icon = icon.unwrap_or_default();
    let color = color.unwrap_or_default();
    let parent_id = parent_id.unwrap_or(0);
    let sort_order = sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO categories (name, type, icon, color, parent_id, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![name, r#type, icon, color, parent_id, sort_order],
    )?;

    Ok(conn.last_insert_rowid())
}

/// 更新分类
#[tauri::command]
pub async fn category_update(
    id: i64,
    name: Option<String>,
    r#type: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    parent_id: Option<i64>,
    sort_order: Option<i64>,
    pool: State<'_, DbPool>,
) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let mut updates = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(name) = name {
        updates.push("name = ?");
        params_vec.push(Box::new(name));
    }
    if let Some(r#type) = r#type {
        updates.push("type = ?");
        params_vec.push(Box::new(r#type));
    }
    if let Some(icon) = icon {
        updates.push("icon = ?");
        params_vec.push(Box::new(icon));
    }
    if let Some(color) = color {
        updates.push("color = ?");
        params_vec.push(Box::new(color));
    }
    if let Some(parent_id) = parent_id {
        updates.push("parent_id = ?");
        params_vec.push(Box::new(parent_id));
    }
    if let Some(sort_order) = sort_order {
        updates.push("sort_order = ?");
        params_vec.push(Box::new(sort_order));
    }

    if updates.is_empty() {
        return Ok(false);
    }

    let sql = format!("UPDATE categories SET {} WHERE id = ?", updates.join(", "));
    params_vec.push(Box::new(id));

    let refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let affected = conn.execute(&sql, refs.as_slice())?;
    Ok(affected > 0)
}

/// 删除分类
#[tauri::command]
pub async fn category_delete(id: i64, pool: State<'_, DbPool>) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let affected = conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ==================== 预算操作 ====================

/// 预算记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    pub id: i64,
    pub category: String,
    pub amount: f64,
    pub year: i64,
    pub month: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Budget {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Budget {
            id: row.get("id")?,
            category: row.get("category")?,
            amount: row.get("amount")?,
            year: row.get("year")?,
            month: row.get("month")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// 获取预算列表
#[tauri::command]
pub async fn budget_list(year: i64, month: i64, pool: State<'_, DbPool>) -> AppResult<Vec<Budget>> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT id, category, amount, year, month, created_at, updated_at \
         FROM budgets WHERE year = ?1 AND month = ?2",
    )?;
    let rows = stmt.query_map(params![year, month], Budget::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// 创建预算
#[tauri::command]
pub async fn budget_create(
    category: String,
    amount: f64,
    year: i64,
    month: i64,
    pool: State<'_, DbPool>,
) -> AppResult<i64> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    if amount <= 0.0 {
        return Err(AppError::InvalidInput("预算金额必须大于 0".into()));
    }

    conn.execute(
        "INSERT INTO budgets (category, amount, year, month) VALUES (?1, ?2, ?3, ?4)",
        params![category, amount, year, month],
    )?;

    Ok(conn.last_insert_rowid())
}

/// 更新预算
#[tauri::command]
pub async fn budget_update(
    id: i64,
    category: Option<String>,
    amount: Option<f64>,
    pool: State<'_, DbPool>,
) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let mut updates = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(category) = category {
        updates.push("category = ?");
        params_vec.push(Box::new(category));
    }
    if let Some(amount) = amount {
        if amount <= 0.0 {
            return Err(AppError::InvalidInput("预算金额必须大于 0".into()));
        }
        updates.push("amount = ?");
        params_vec.push(Box::new(amount));
    }

    if updates.is_empty() {
        return Ok(false);
    }

    updates.push("updated_at = datetime('now')");
    let sql = format!("UPDATE budgets SET {} WHERE id = ?", updates.join(", "));
    params_vec.push(Box::new(id));

    let refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let affected = conn.execute(&sql, refs.as_slice())?;
    Ok(affected > 0)
}

/// 预算项（用于批量保存）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetItem {
    pub category: String,
    pub amount: f64,
}

/// 删除预算
#[tauri::command]
pub async fn budget_delete(id: i64, pool: State<'_, DbPool>) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    let affected = conn.execute("DELETE FROM budgets WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

/// 批量保存预算（先删除当月所有预算，再重新插入）
#[tauri::command]
pub async fn budget_save_all(
    year: i64,
    month: i64,
    items: Vec<BudgetItem>,
    pool: State<'_, DbPool>,
) -> AppResult<bool> {
    let conn = pool
        .get()
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {}", e)))?;

    conn.execute(
        "DELETE FROM budgets WHERE year = ?1 AND month = ?2",
        params![year, month],
    )?;

    for item in &items {
        if item.amount > 0.0 {
            conn.execute(
                "INSERT INTO budgets (category, amount, year, month) VALUES (?1, ?2, ?3, ?4)",
                params![item.category, item.amount, year, month],
            )?;
        }
    }

    Ok(true)
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
