use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::commands::AppState;

use super::{cents_to_yuan, new_id, now};

// ---------------------------------------------------------------------------
// 记账模块
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TransactionOut {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub amount: f64,
    pub account_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_transaction(row: &rusqlite::Row) -> rusqlite::Result<TransactionOut> {
    Ok(TransactionOut {
        id: row.get(0)?,
        user_id: String::new(),
        r#type: row.get(1)?,
        amount: cents_to_yuan(row.get(2)?),
        account_id: row.get(3)?,
        to_account_id: row.get(4)?,
        category_id: row.get(5)?,
        date: row.get(6)?,
        note: row.get(7)?,
        receipt_url: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const TXN_COLS: &str =
    "id,type,amount_cents,account_id,transfer_account_id,category_id,date,description,receipt_path,created_at,updated_at";

#[tauri::command]
pub async fn transaction_list_all(state: State<'_, AppState>) -> Result<Vec<TransactionOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM transactions ORDER BY date DESC, created_at DESC", TXN_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn transaction_get(state: State<'_, AppState>, id: String) -> Result<TransactionOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM transactions WHERE id = ?1", TXN_COLS), params![id], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transaction_create(
    state: State<'_, AppState>,
    r#type: String,
    amount_cents: i64,
    account_id: String,
    transfer_account_id: Option<String>,
    category_id: Option<String>,
    date: String,
    description: Option<String>,
    receipt_path: Option<String>,
) -> Result<TransactionOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO transactions (id,type,amount_cents,currency,category_id,account_id,transfer_account_id,date,description,receipt_path,created_at,updated_at) \
         VALUES (?1,?2,?3,'CNY',?4,?5,?6,?7,?8,?9,?10,?10)",
        params![id, r#type, amount_cents, category_id, account_id, transfer_account_id, date, description, receipt_path, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM transactions WHERE id = ?1", TXN_COLS), params![id], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transaction_update(
    state: State<'_, AppState>,
    id: String,
    r#type: Option<String>,
    amount_cents: Option<i64>,
    account_id: Option<String>,
    transfer_account_id: Option<String>,
    category_id: Option<String>,
    date: Option<String>,
    description: Option<String>,
    receipt_path: Option<String>,
) -> Result<TransactionOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE transactions SET \
         type = COALESCE(?2, type), \
         amount_cents = COALESCE(?3, amount_cents), \
         account_id = COALESCE(?4, account_id), \
         transfer_account_id = COALESCE(?5, transfer_account_id), \
         category_id = COALESCE(?6, category_id), \
         date = COALESCE(?7, date), \
         description = COALESCE(?8, description), \
         receipt_path = COALESCE(?9, receipt_path), \
         updated_at = ?10 WHERE id = ?1",
        params![id, r#type, amount_cents, account_id, transfer_account_id, category_id, date, description, receipt_path, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM transactions WHERE id = ?1", TXN_COLS), params![id], |r| row_to_transaction(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transaction_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Account ----

#[derive(Serialize)]
pub struct AccountOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub r#type: String,
    pub initial_balance: f64,
    pub currency: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<AccountOut> {
    Ok(AccountOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        r#type: row.get(2)?,
        initial_balance: cents_to_yuan(row.get(3)?),
        currency: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const ACCOUNT_COLS: &str = "id,name,type,balance_cents,currency,sort_order,created_at,updated_at";

#[tauri::command]
pub async fn account_list_all(state: State<'_, AppState>) -> Result<Vec<AccountOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM accounts ORDER BY sort_order", ACCOUNT_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_account(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn account_get(state: State<'_, AppState>, id: String) -> Result<AccountOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM accounts WHERE id = ?1", ACCOUNT_COLS), params![id], |r| row_to_account(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn account_create(
    state: State<'_, AppState>,
    name: String,
    r#type: String,
    balance_cents: i64,
    currency: Option<String>,
) -> Result<AccountOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let sort_order = db
        .query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0);
    db.execute(
        "INSERT INTO accounts (id,name,type,balance_cents,currency,sort_order,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![id, name, r#type, balance_cents, currency.unwrap_or_else(|| "CNY".into()), sort_order, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM accounts WHERE id = ?1", ACCOUNT_COLS), params![id], |r| row_to_account(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn account_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    r#type: Option<String>,
    balance_cents: Option<i64>,
    currency: Option<String>,
) -> Result<AccountOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE accounts SET \
         name = COALESCE(?2, name), \
         type = COALESCE(?3, type), \
         balance_cents = COALESCE(?4, balance_cents), \
         currency = COALESCE(?5, currency), \
         updated_at = ?6 WHERE id = ?1",
        params![id, name, r#type, balance_cents, currency, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM accounts WHERE id = ?1", ACCOUNT_COLS), params![id], |r| row_to_account(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn account_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM accounts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Category ----

#[derive(Serialize)]
pub struct CategoryOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

fn row_to_category(row: &rusqlite::Row) -> rusqlite::Result<CategoryOut> {
    Ok(CategoryOut {
        id: row.get(0)?,
        user_id: String::new(),
        name: row.get(1)?,
        r#type: row.get(2)?,
        icon: row.get(3)?,
        parent_id: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const CATEGORY_COLS: &str = "id,name,type,icon,parent_id,sort_order,created_at";

#[tauri::command]
pub async fn category_list_all(state: State<'_, AppState>) -> Result<Vec<CategoryOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM categories ORDER BY sort_order", CATEGORY_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_category(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn category_create(
    state: State<'_, AppState>,
    name: String,
    r#type: String,
    icon: Option<String>,
    parent_id: Option<String>,
) -> Result<CategoryOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let sort_order = db
        .query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0);
    db.execute(
        "INSERT INTO categories (id,name,type,icon,parent_id,sort_order,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, name, r#type, icon, parent_id, sort_order, ts],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM categories WHERE id = ?1", CATEGORY_COLS), params![id], |r| row_to_category(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn category_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    r#type: Option<String>,
    icon: Option<String>,
    parent_id: Option<String>,
) -> Result<CategoryOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE categories SET \
         name = COALESCE(?2, name), \
         type = COALESCE(?3, type), \
         icon = COALESCE(?4, icon), \
         parent_id = COALESCE(?5, parent_id), \
         sort_order = COALESCE(?6, sort_order) WHERE id = ?1",
        params![id, name, r#type, icon, parent_id, None::<i64>],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM categories WHERE id = ?1", CATEGORY_COLS), params![id], |r| row_to_category(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn category_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM categories WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Budget ----

#[derive(Serialize)]
pub struct BudgetOut {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub amount: f64,
    pub year_month: i64,
    pub scope: String,
    pub carry_over: f64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_budget(row: &rusqlite::Row) -> rusqlite::Result<BudgetOut> {
    Ok(BudgetOut {
        id: row.get(0)?,
        user_id: String::new(),
        category_id: row.get(1)?,
        amount: cents_to_yuan(row.get(2)?),
        year_month: row.get::<_, Option<String>>(3)?.and_then(|s| s.parse().ok()).unwrap_or(0),
        scope: row.get(4)?,
        carry_over: cents_to_yuan(row.get(5)?),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const BUDGET_COLS: &str =
    "id,category_id,amount_cents,year_month,scope,carry_over_cents,created_at,updated_at";

#[tauri::command]
pub async fn budget_list_all(state: State<'_, AppState>) -> Result<Vec<BudgetOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM budgets ORDER BY year_month DESC, created_at DESC", BUDGET_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_budget(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn budget_create(
    state: State<'_, AppState>,
    category_id: Option<String>,
    amount_cents: i64,
    year_month: Option<String>,
    scope: Option<String>,
    carry_over_cents: Option<i64>,
    period: Option<String>,
    period_start: Option<String>,
    period_end: Option<String>,
) -> Result<BudgetOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let ym = year_month.unwrap_or_default();
    db.execute(
        "INSERT INTO budgets (id,category_id,amount_cents,period,period_start,period_end,rollover,carry_over_cents,scope,year_month,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8,?9,?10,?10)",
        params![
            id,
            category_id,
            amount_cents,
            period.unwrap_or_else(|| "monthly".into()),
            period_start.unwrap_or_default(),
            period_end.unwrap_or_default(),
            carry_over_cents.unwrap_or(0),
            scope.unwrap_or_else(|| "category".into()),
            ym,
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM budgets WHERE id = ?1", BUDGET_COLS), params![id], |r| row_to_budget(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn budget_update(
    state: State<'_, AppState>,
    id: String,
    category_id: Option<String>,
    amount_cents: Option<i64>,
    year_month: Option<String>,
    scope: Option<String>,
    carry_over_cents: Option<i64>,
    period: Option<String>,
    period_start: Option<String>,
    period_end: Option<String>,
) -> Result<BudgetOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE budgets SET \
         category_id = COALESCE(?2, category_id), \
         amount_cents = COALESCE(?3, amount_cents), \
         year_month = COALESCE(?4, year_month), \
         scope = COALESCE(?5, scope), \
         carry_over_cents = COALESCE(?6, carry_over_cents), \
         period = COALESCE(?7, period), \
         period_start = COALESCE(?8, period_start), \
         period_end = COALESCE(?9, period_end), \
         updated_at = ?10 WHERE id = ?1",
        params![id, category_id, amount_cents, year_month, scope, carry_over_cents, period, period_start, period_end, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM budgets WHERE id = ?1", BUDGET_COLS), params![id], |r| row_to_budget(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn budget_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM budgets WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}
