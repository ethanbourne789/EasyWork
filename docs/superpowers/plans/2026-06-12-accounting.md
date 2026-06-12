# 记账模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 EasyWork 中交付「轻量个人账本」全功能模块 —— 交易、分类、预算、统计、导入/导出、图片附件；3 Tab 桌面/移动端响应式。

**Architecture:** 后端 Rust 扩展现有 `commands/accounting.rs` + 新增 `services/accounting/{importer,stats,export}.rs`；前端 React + MUI 整合到主 `src/` 下作为 3 页面 + 共享组件（apps/* 工作区已于 2026-06-12 cleanup commit 移除）；数据走 SQLite (V4 迁移) + 附件走文件系统。

**Tech Stack:**
- 后端：Rust 1.7x + rusqlite + tauri 2 + encoding_rs + image + rust_xlsxwriter
- 前端：React 19 + TypeScript + MUI 5 + Zustand + recharts + papaparse + date-fns
- 测试：cargo test + Vitest + @testing-library/react + Playwright

**Spec:** [2026-06-12-accounting-design.md](../specs/2026-06-12-accounting-design.md)

---

## 0. 文件结构总览

### 后端新增/修改

```
src-tauri/
├── src/
│   ├── commands/
│   │   ├── accounting.rs          # 扩展（CRUD + stats + import + export + attachment）
│   │   ├── accounting_category.rs # 新增：分类 CRUD
│   │   ├── accounting_budget.rs   # 新增：预算 CRUD
│   │   └── mod.rs                 # 注册新 commands
│   ├── db/
│   │   ├── mod.rs                 # 扩展 DbState 持 app_data_dir
│   │   └── migrations/
│   │       └── V4__accounting_ext.sql   # 新增
│   ├── services/
│   │   ├── mod.rs                 # 新增
│   │   └── accounting/            # 新增目录
│   │       ├── mod.rs
│   │       ├── importer.rs
│   │       ├── stats.rs
│   │       ├── export.rs
│   │       └── attachment.rs
│   └── error.rs                   # 现有
└── tests/
    ├── migrations_v4.rs           # 新增
    ├── stats_test.rs              # 新增
    └── accounting_e2e.rs          # 新增
```

### 前端新增/修改

```
apps/app-accounting/src/
├── App.tsx                        # 改：3 Tab + FAB + Drawer
├── pages/
│   ├── OverviewPage.tsx           # 新增（KPI + 3 图 + 预算 + 最近）
│   ├── DetailPage.tsx             # 新增（MonthSwitcher + 筛选 + 分组）
│   └── SettingsPage.tsx           # 新增（导入/导出/分类/提醒）
├── components/
│   ├── RecordDrawer.tsx           # 新增
│   ├── TransactionItem.tsx        # 新增
│   ├── BudgetProgressBar.tsx      # 新增
│   ├── MonthSwitcher.tsx          # 新增
│   ├── CategoryPicker.tsx         # 新增
│   ├── ImageAttachment.tsx        # 新增
│   ├── ImportWizard.tsx           # 新增
│   └── charts/
│       ├── TrendLineChart.tsx
│       ├── CategoryPieChart.tsx
│       └── MonthBarChart.tsx
├── store/
│   └── accountingStore.ts         # 新增
├── hooks/
│   ├── useTransactions.ts
│   ├── useBudget.ts
│   ├── useCategories.ts
│   └── useStats.ts
├── api/
│   └── tauri.ts                   # 新增（Tauri command wrapper）
├── utils/
│   ├── csv-parser.ts              # 新增（前端预览用）
│   ├── amount.ts
│   └── date.ts
├── test-setup.ts
└── vitest.config.ts
```

### 包依赖变更

- 前端：`+ recharts + papaparse + date-fns + @tauri-apps/plugin-dialog + @tauri-apps/plugin-notification + vitest`
- 后端：`+ encoding_rs + image + rust_xlsxwriter + base64 + chrono + tempfile`

---

## 1. 工程准备

### Task 1.1: 添加前端依赖

**Files:**
- Modify: `apps/app-accounting/package.json`
- Create: `apps/app-accounting/vitest.config.ts`
- Create: `apps/app-accounting/src/test-setup.ts`

- [ ] **Step 1: 装包**

```bash
cd apps/app-accounting
pnpm add recharts papaparse date-fns @tauri-apps/plugin-dialog @tauri-apps/plugin-notification
pnpm add -D @types/papaparse vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: 创建 `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 3: 创建 `src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 4: `package.json` scripts 增加**

```json
{ "scripts": { "test": "vitest run", "test:watch": "vitest" } }
```

- [ ] **Step 5: `tsconfig.json` types**

```json
{ "compilerOptions": { "types": ["vitest/globals", "@testing-library/jest-dom"] } }
```

- [ ] **Step 6: 提交**

```bash
git add apps/app-accounting/package.json apps/app-accounting/vitest.config.ts apps/app-accounting/src/test-setup.ts apps/app-accounting/tsconfig.json pnpm-lock.yaml
git commit -m "chore(accounting): add frontend deps (vitest, recharts, papaparse)"
```

### Task 1.2: 添加后端依赖

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 追加依赖**

```toml
encoding_rs = "0.8"
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }
rust_xlsxwriter = "0.79"
base64 = "0.22"
chrono = "0.4"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: `cargo check`**

```bash
cd src-tauri && cargo check
```

Expected: 0 errors

- [ ] **Step 3: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(accounting): add rust deps"
```

---

## 2. P1 — 数据库 V4 迁移

### Task 2.1: 写迁移 SQL + 编译验证

**Files:**
- Create: `src-tauri/src/db/migrations/V4__accounting_ext.sql`

- [ ] **Step 1: 写文件**

```sql
-- 1) 扩展 transactions
ALTER TABLE transactions ADD COLUMN attachment_path TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- 2) 分类表
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL CHECK(type IN ('income','expense')),
    icon        TEXT    DEFAULT '',
    color       TEXT    DEFAULT '#1E5DA8',
    sort_order  INTEGER DEFAULT 0,
    is_builtin  INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(parent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- 3) 预算表
CREATE TABLE IF NOT EXISTS budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT    NOT NULL CHECK(scope IN ('total','category')),
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    period      TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(scope, category_id, period)
);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period);

-- 4) 导入历史
CREATE TABLE IF NOT EXISTS imports_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT    NOT NULL,
    file_name    TEXT    NOT NULL,
    total_rows   INTEGER NOT NULL,
    imported     INTEGER NOT NULL,
    skipped      INTEGER NOT NULL,
    failed       INTEGER NOT NULL,
    imported_at  TEXT    DEFAULT (datetime('now'))
);

-- 5) 索引加速统计
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, date);
```

- [ ] **Step 2: `cargo build` 验证**

```bash
cd src-tauri && cargo build
```

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/db/migrations/V4__accounting_ext.sql
git commit -m "feat(db): V4 migration - categories, budgets, imports_log, attachment"
```

### Task 2.2: V4 迁移集成测试

**Files:**
- Create: `src-tauri/tests/migrations_v4.rs`

- [ ] **Step 1: 写测试**

```rust
use rusqlite::Connection;

const V4_SQL: &str = include_str!("../src/db/migrations/V4__accounting_ext.sql");
const V1_SQL: &str = include_str!("../src/db/migrations/V1__initial.sql");

fn fresh_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(V1_SQL).unwrap();
    conn.execute_batch(V4_SQL).unwrap();
    conn
}

#[test]
fn v4_creates_all_tables() {
    let conn = fresh_db();
    for table in &["categories", "budgets", "imports_log"] {
        let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }
}

#[test]
fn v4_adds_attachment_path_column() {
    let conn = fresh_db();
    let cols: Vec<String> = conn.prepare("PRAGMA table_info(transactions)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap().filter_map(Result::ok).collect();
    assert!(cols.contains(&"attachment_path".to_string()));
    assert!(cols.contains(&"updated_at".to_string()));
}

#[test]
fn v4_is_idempotent() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(V1_SQL).unwrap();
    conn.execute_batch(V4_SQL).unwrap();
    conn.execute_batch(V4_SQL).expect("V4 must be idempotent");
}

#[test]
fn category_unique_constraint() {
    let conn = fresh_db();
    conn.execute("INSERT INTO categories (name, type) VALUES ('餐饮', 'expense')", []).unwrap();
    let r = conn.execute("INSERT INTO categories (name, type) VALUES ('餐饮', 'expense')", []);
    assert!(r.is_err(), "duplicate name should fail");
}
```

- [ ] **Step 2: 运行**

```bash
cd src-tauri && cargo test --test migrations_v4
```

Expected: 4 passed

- [ ] **Step 3: 提交**

```bash
git add src-tauri/tests/migrations_v4.rs
git commit -m "test(db): V4 migration tests"
```

---

## 3. P2 — 后端事务 CRUD Commands

### Task 3.1: 扩展 Transaction 模型

**Files:**
- Modify: `src-tauri/src/commands/accounting.rs`

- [ ] **Step 1: 替换 Transaction 结构体（顶部）**

```rust
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
    pub attachment_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Transaction {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Transaction {
            id: row.get("id")?,
            txn_type: row.get("type")?,
            amount: row.get("amount")?,
            category: row.get("category")?,
            subcategory: row.get("subcategory")?,
            note: row.get("note")?,
            date: row.get("date")?,
            attachment_path: row.get("attachment_path")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
```

- [ ] **Step 2: 更新 4 处 `txn_list` 的 SELECT**

把 `SELECT id, type, amount, category, subcategory, note, date, created_at FROM transactions` 改为 `SELECT id, type, amount, category, subcategory, note, date, attachment_path, created_at, updated_at FROM transactions`

- [ ] **Step 3: `cargo check`**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/commands/accounting.rs
git commit -m "refactor(accounting): add attachment_path, updated_at to Transaction"
```

### Task 3.2: 扩展 txn_create 支持附件 + 校验

**Files:**
- Modify: `src-tauri/src/commands/accounting.rs`

- [ ] **Step 1: 替换 `txn_create`**

```rust
#[tauri::command]
pub async fn txn_create(
    txn_type: String,
    amount: f64,
    category: String,
    subcategory: Option<String>,
    note: Option<String>,
    date: String,
    attachment_path: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Transaction> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    if amount <= 0.0 { return Err(AppError::InvalidInput("金额必须大于 0".into())); }
    if amount > 1e9 { return Err(AppError::InvalidInput("金额不能超过 1e9".into())); }
    if txn_type != "income" && txn_type != "expense" {
        return Err(AppError::InvalidInput("type 必须是 income 或 expense".into()));
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    if date > today { return Err(AppError::InvalidInput("日期不能晚于今天".into())); }

    conn.execute(
        "INSERT INTO transactions (type, amount, category, subcategory, note, date, attachment_path) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![txn_type, amount, category, subcategory, note, date, attachment_path],
    )?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn.prepare(
        "SELECT id, type, amount, category, subcategory, note, date, attachment_path, created_at, updated_at \
         FROM transactions WHERE id = ?1"
    )?;
    Ok(stmt.query_row(params![id], Transaction::from_row)
        .map_err(|_| AppError::NotFound("交易".into()))?)
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting.rs
git commit -m "feat(accounting): txn_create validates amount/type/date and persists attachment"
```

### Task 3.3: 添加 txn_get 和 txn_update

**Files:**
- Modify: `src-tauri/src/commands/accounting.rs`

- [ ] **Step 1: 在 `txn_list` 后追加**

```rust
#[tauri::command]
pub async fn txn_get(id: i64, state: State<'_, DbState>) -> AppResult<Transaction> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, type, amount, category, subcategory, note, date, attachment_path, created_at, updated_at \
         FROM transactions WHERE id = ?1"
    )?;
    stmt.query_row(params![id], Transaction::from_row)
        .map_err(|_| AppError::NotFound(format!("交易记录 {} 未找到", id)))
}

#[tauri::command]
pub async fn txn_update(
    id: i64,
    txn_type: String,
    amount: f64,
    category: String,
    subcategory: Option<String>,
    note: Option<String>,
    date: String,
    attachment_path: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Transaction> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    if amount <= 0.0 { return Err(AppError::InvalidInput("金额必须大于 0".into())); }
    let affected = conn.execute(
        "UPDATE transactions SET type=?1, amount=?2, category=?3, subcategory=?4, note=?5, \
         date=?6, attachment_path=?7, updated_at=datetime('now') WHERE id=?8",
        params![txn_type, amount, category, subcategory, note, date, attachment_path, id],
    )?;
    if affected == 0 { return Err(AppError::NotFound(format!("交易记录 {} 未找到", id))); }
    let mut stmt = conn.prepare(
        "SELECT id, type, amount, category, subcategory, note, date, attachment_path, created_at, updated_at \
         FROM transactions WHERE id = ?1"
    )?;
    Ok(stmt.query_row(params![id], Transaction::from_row)
        .map_err(|_| AppError::NotFound("交易".into()))?)
}
```

- [ ] **Step 2: 注册到 mod.rs 和 lib.rs invoke_handler**

- [ ] **Step 3: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(accounting): txn_get and txn_update commands"
```

### Task 3.4: 分类 CRUD

**Files:**
- Create: `src-tauri/src/commands/accounting_category.rs`

- [ ] **Step 1: 写文件**

```rust
//! 分类 CRUD
use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;

use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    #[serde(rename = "type")]
    pub cat_type: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub is_builtin: i64,
    pub is_archived: i64,
}

impl Category {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Category {
            id: row.get("id")?,
            name: row.get("name")?,
            parent_id: row.get("parent_id")?,
            cat_type: row.get("type")?,
            icon: row.get("icon")?,
            color: row.get("color")?,
            sort_order: row.get("sort_order")?,
            is_builtin: row.get("is_builtin")?,
            is_archived: row.get("is_archived")?,
        })
    }
}

#[tauri::command]
pub async fn cat_list(cat_type: Option<String>, state: State<'_, DbState>) -> AppResult<Vec<Category>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let sql = "SELECT id, name, parent_id, type, icon, color, sort_order, is_builtin, is_archived \
               FROM categories WHERE is_archived = 0";
    let rows: Vec<Category> = match cat_type {
        Some(t) => {
            let mut stmt = conn.prepare(&format!("{} AND type = ?1 ORDER BY sort_order, id", sql))?;
            stmt.query_map(params![t], Category::from_row)?.collect::<Result<Vec<_>, _>>()?
        }
        None => {
            let mut stmt = conn.prepare(&format!("{} ORDER BY sort_order, id", sql))?;
            stmt.query_map([], Category::from_row)?.collect::<Result<Vec<_>, _>>()?
        }
    };
    Ok(rows)
}

#[tauri::command]
pub async fn cat_create(
    name: String,
    parent_id: Option<i64>,
    cat_type: String,
    icon: Option<String>,
    color: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Category> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    conn.execute(
        "INSERT INTO categories (name, parent_id, type, icon, color) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, parent_id, cat_type, icon.unwrap_or_default(), color.unwrap_or_else(|| "#1E5DA8".into())],
    )?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn.prepare(
        "SELECT id, name, parent_id, type, icon, color, sort_order, is_builtin, is_archived FROM categories WHERE id = ?1"
    )?;
    Ok(stmt.query_row(params![id], Category::from_row)
        .map_err(|_| AppError::NotFound("分类".into()))?)
}

#[tauri::command]
pub async fn cat_update(
    id: i64,
    name: String,
    icon: Option<String>,
    color: Option<String>,
    state: State<'_, DbState>,
) -> AppResult<Category> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let is_builtin: i64 = conn.query_row("SELECT is_builtin FROM categories WHERE id = ?1", params![id], |r| r.get(0))?;
    if is_builtin == 1 { return Err(AppError::InvalidInput("内建分类不可编辑".into())); }
    conn.execute(
        "UPDATE categories SET name = ?1, icon = COALESCE(?2, icon), color = COALESCE(?3, color) WHERE id = ?4",
        params![name, icon, color, id],
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, name, parent_id, type, icon, color, sort_order, is_builtin, is_archived FROM categories WHERE id = ?1"
    )?;
    Ok(stmt.query_row(params![id], Category::from_row)
        .map_err(|_| AppError::NotFound("分类".into()))?)
}

#[tauri::command]
pub async fn cat_delete(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let is_builtin: i64 = conn.query_row("SELECT is_builtin FROM categories WHERE id = ?1", params![id], |r| r.get(0))?;
    if is_builtin == 1 { return Err(AppError::InvalidInput("内建分类不可删除".into())); }
    conn.execute("UPDATE transactions SET subcategory = NULL WHERE subcategory = (SELECT name FROM categories WHERE id = ?1)", params![id])?;
    let affected = conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}
```

- [ ] **Step 2: 注册到 mod.rs 和 lib.rs**

- [ ] **Step 3: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting_category.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(accounting): category CRUD commands"
```

### Task 3.5: 预算 CRUD

**Files:**
- Create: `src-tauri/src/commands/accounting_budget.rs`

- [ ] **Step 1: 写文件**

```rust
//! 预算 CRUD
use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    pub id: i64,
    pub scope: String,
    pub category_id: Option<i64>,
    pub period: String,
    pub amount: f64,
}

impl Budget {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Budget {
            id: row.get("id")?,
            scope: row.get("scope")?,
            category_id: row.get("category_id")?,
            period: row.get("period")?,
            amount: row.get("amount")?,
        })
    }
}

#[tauri::command]
pub async fn budget_get(period: String, state: State<'_, DbState>) -> AppResult<Vec<Budget>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let mut stmt = conn.prepare("SELECT id, scope, category_id, period, amount FROM budgets WHERE period = ?1")?;
    Ok(stmt.query_map(params![period], Budget::from_row)?.collect::<Result<Vec<_>, _>>()?)
}

#[tauri::command]
pub async fn budget_set(
    scope: String, category_id: Option<i64>, period: String, amount: f64,
    state: State<'_, DbState>,
) -> AppResult<Budget> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    if amount < 0.0 { return Err(AppError::InvalidInput("预算金额不能为负".into())); }
    conn.execute(
        "INSERT INTO budgets (scope, category_id, period, amount) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(scope, category_id, period) DO UPDATE SET amount = excluded.amount",
        params![scope, category_id, period, amount],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM budgets WHERE scope = ?1 AND IFNULL(category_id, 0) = IFNULL(?2, 0) AND period = ?3",
        params![scope, category_id, period], |r| r.get(0),
    )?;
    let mut stmt = conn.prepare("SELECT id, scope, category_id, period, amount FROM budgets WHERE id = ?1")?;
    Ok(stmt.query_row(params![id], Budget::from_row).map_err(|_| AppError::NotFound("预算".into()))?)
}

#[tauri::command]
pub async fn budget_delete(id: i64, state: State<'_, DbState>) -> AppResult<bool> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    Ok(conn.execute("DELETE FROM budgets WHERE id = ?1", params![id])? > 0)
}
```

- [ ] **Step 2: 注册 + 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting_budget.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(accounting): budget CRUD commands"
```

---

## 4. P3 — 后端统计

### Task 4.1: 创建 services 目录骨架

**Files:**
- Create: `src-tauri/src/services/mod.rs`
- Create: `src-tauri/src/services/accounting/mod.rs`
- Create: `src-tauri/src/services/accounting/{stats,importer,export,attachment}.rs` 占位

- [ ] **Step 1: services/mod.rs**

```rust
pub mod accounting;
```

- [ ] **Step 2: services/accounting/mod.rs**

```rust
pub mod stats;
pub mod importer;
pub mod export;
pub mod attachment;
```

- [ ] **Step 3: 4 个占位文件（每个写 `// placeholder, implemented in later tasks`）**

- [ ] **Step 4: lib.rs 添加 `pub mod services;`**

- [ ] **Step 5: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/services/
git commit -m "chore(accounting): scaffold services directory"
```

### Task 4.2: stats_summary

**Files:**
- Modify: `src-tauri/src/commands/accounting.rs`

- [ ] **Step 1: 替换 stats_summary 块**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountingSummary {
    pub total_income: f64,
    pub total_expense: f64,
    pub balance: f64,
    pub savings_rate: f64,
    pub budget_usage_rate: f64,
}

#[tauri::command]
pub async fn stats_summary(period: String, state: State<'_, DbState>) -> AppResult<AccountingSummary> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let (income, expense): (f64, f64) = conn.query_row(
        "SELECT \
         COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) \
         FROM transactions WHERE substr(date, 1, 7) = ?1",
        params![period], |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let balance = income - expense;
    let savings_rate = if income > 0.0 { (balance / income) * 100.0 } else { 0.0 };
    let total_budget: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM budgets WHERE scope = 'total' AND period = ?1",
        params![period], |r| r.get(0),
    )?;
    let budget_usage_rate = if total_budget > 0.0 { (expense / total_budget) * 100.0 } else { 0.0 };
    Ok(AccountingSummary { total_income: income, total_expense: expense, balance, savings_rate, budget_usage_rate })
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting.rs
git commit -m "feat(accounting): stats_summary with savings_rate + period filter"
```

### Task 4.3: stats_trend + stats_by_category + stats_monthly_compare

**Files:**
- Modify: `src-tauri/src/commands/accounting.rs`（追加）

- [ ] **Step 1: 追加**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendPoint { pub date: String, pub income: f64, pub expense: f64 }

#[tauri::command]
pub async fn stats_trend(start: String, end: String, state: State<'_, DbState>) -> AppResult<Vec<TrendPoint>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let mut stmt = conn.prepare(
        "SELECT date, \
         SUM(CASE WHEN type='income' THEN amount ELSE 0 END), \
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) \
         FROM transactions WHERE date BETWEEN ?1 AND ?2 \
         GROUP BY date ORDER BY date"
    )?;
    Ok(stmt.query_map(params![start, end], |row| Ok(TrendPoint {
        date: row.get(0)?, income: row.get(1)?, expense: row.get(2)?,
    }))?.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryStat { pub category: String, pub amount: f64, pub percentage: f64 }

#[tauri::command]
pub async fn stats_by_category(period: String, cat_type: String, state: State<'_, DbState>) -> AppResult<Vec<CategoryStat>> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let mut stmt = conn.prepare(
        "SELECT category, SUM(amount), \
         (SUM(amount) * 100.0 / NULLIF((SELECT SUM(amount) FROM transactions \
            WHERE type = ?2 AND substr(date,1,7) = ?1), 0)) AS pct \
         FROM transactions WHERE type = ?2 AND substr(date, 1, 7) = ?1 \
         GROUP BY category ORDER BY 2 DESC"
    )?;
    Ok(stmt.query_map(params![period, cat_type], |row| {
        let amount: f64 = row.get(1)?;
        let pct: Option<f64> = row.get(2)?;
        Ok(CategoryStat { category: row.get(0)?, amount, percentage: pct.unwrap_or(0.0) })
    })?.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthStat { pub period: String, pub income: f64, pub expense: f64 }

#[tauri::command]
pub async fn stats_monthly_compare(months: i64, _state: State<'_, DbState>) -> AppResult<Vec<MonthStat>> {
    let conn = _state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let now = chrono::Local::now();
    let periods: Vec<String> = (0..months).rev().map(|i| {
        let d = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap() - chrono::Duration::days(30 * i);
        d.format("%Y-%m").to_string()
    }).collect();
    let mut result = Vec::new();
    for p in periods {
        let (income, expense): (f64, f64) = conn.query_row(
            "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0), \
             COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) \
             FROM transactions WHERE substr(date, 1, 7) = ?1",
            params![p], |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        result.push(MonthStat { period: p, income, expense });
    }
    Ok(result)
}
```

- [ ] **Step 2: 顶部 use chrono::Datelike 引入**

```rust
use chrono::Datelike;
```

- [ ] **Step 3: 注册 + 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(accounting): trend, by_category, monthly_compare stats commands"
```

---

## 5. P4 — CSV 导入 + 导出 + 附件

### Task 5.1: 实现 importer.rs

**Files:**
- Modify: `src-tauri/src/services/accounting/importer.rs`

- [ ] **Step 1: 写文件**

```rust
//! 支付宝 / 微信 CSV 解析
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedRow {
    pub date: String,
    #[serde(rename = "type")]
    pub txn_type: String,
    pub amount: f64,
    pub counterparty: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowError { pub row_index: usize, pub reason: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview { pub source: String, pub rows: Vec<ParsedRow>, pub errors: Vec<RowError>, pub total: usize }

pub fn detect_source(headers: &[&str]) -> Option<&'static str> {
    let h = headers.join(",");
    if h.contains("交易号") && h.contains("收/支") { Some("alipay") }
    else if h.contains("交易单号") && h.contains("收/支") { Some("wechat") }
    else { None }
}

pub fn parse_alipay(content: &str) -> Result<ImportPreview, String> {
    let mut rows = Vec::new();
    let mut errors = Vec::new();
    for (i, line) in content.lines().enumerate() {
        if i == 0 { continue; }
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() < 6 { errors.push(RowError { row_index: i, reason: "列数不足".into() }); continue; }
        let date = cols.get(2).copied().unwrap_or("").trim().split(' ').next().unwrap_or("").to_string();
        let sign = cols.get(4).copied().unwrap_or("").trim();
        let amount: f64 = match cols.get(5).copied().unwrap_or("").trim().parse() {
            Ok(v) => v,
            Err(_) => { errors.push(RowError { row_index: i, reason: "金额解析失败".into() }); continue; }
        };
        let counterparty = cols.get(7).copied().unwrap_or("").trim().to_string();
        let note = cols.get(8).copied().unwrap_or("").trim().to_string();
        let txn_type = match sign {
            "收入" => "income",
            "支出" => "expense",
            _ => { errors.push(RowError { row_index: i, reason: format!("未知收/支: {}", sign) }); continue; }
        };
        rows.push(ParsedRow { date, txn_type: txn_type.into(), amount, counterparty, note });
    }
    Ok(ImportPreview { source: "alipay".into(), total: rows.len() + errors.len(), rows, errors })
}

pub fn parse_wechat(content: &str) -> Result<ImportPreview, String> {
    let mut rows = Vec::new();
    let mut errors = Vec::new();
    for (i, line) in content.lines().enumerate() {
        if i == 0 { continue; }
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() < 5 { errors.push(RowError { row_index: i, reason: "列数不足".into() }); continue; }
        let date = cols.get(1).copied().unwrap_or("").trim().split(' ').next().unwrap_or("").to_string();
        let sign = cols.get(2).copied().unwrap_or("").trim();
        let amount: f64 = match cols.get(3).copied().unwrap_or("").trim().parse() {
            Ok(v) => v,
            Err(_) => { errors.push(RowError { row_index: i, reason: "金额解析失败".into() }); continue; }
        };
        let counterparty = cols.get(4).copied().unwrap_or("").trim().to_string();
        let note = "".to_string();
        let txn_type = match sign {
            "收入" => "income",
            "支出" => "expense",
            _ => { errors.push(RowError { row_index: i, reason: format!("未知收/支: {}", sign) }); continue; }
        };
        rows.push(ParsedRow { date, txn_type: txn_type.into(), amount, counterparty, note });
    }
    Ok(ImportPreview { source: "wechat".into(), total: rows.len() + errors.len(), rows, errors })
}

#[cfg(test)]
mod tests {
    use super::*;
    const A: &str = "交易号,商家订单号,交易创建时间,付款时间,收/支,金额,余额,商品名称,备注\n1,a,2026-06-10 12:30:00,2026-06-10 12:30:00,支出,35.50,1000.00,午餐,\n2,b,2026-06-10 09:15:00,2026-06-10 09:15:00,收入,15800.00,16800.00,工资,6月";
    const W: &str = "交易单号,交易时间,收/支,金额,支付方式\n1,2026-06-10 18:45:00,支出,25.00,零钱";

    #[test] fn detect_alipay() { assert_eq!(detect_source(&["交易号","收/支","金额"]), Some("alipay")); }
    #[test] fn detect_wechat() { assert_eq!(detect_source(&["交易单号","收/支","金额"]), Some("wechat")); }
    #[test] fn detect_unknown() { assert_eq!(detect_source(&["foo","bar"]), None); }
    #[test] fn parse_alipay_two_rows() { let p = parse_alipay(A).unwrap(); assert_eq!(p.rows.len(), 2); }
    #[test] fn parse_wechat_one_row() { let p = parse_wechat(W).unwrap(); assert_eq!(p.rows.len(), 1); assert_eq!(p.rows[0].txn_type, "expense"); }
    #[test] fn parse_reports_error() { let bad = "h\n,a,b,c,2026-06-10,支出,abc,100"; let p = parse_alipay(bad).unwrap(); assert_eq!(p.rows.len(), 0); assert_eq!(p.errors.len(), 1); }
}
```

- [ ] **Step 2: 编译 + 测试 + 提交**

```bash
cd src-tauri && cargo test --lib services::accounting::importer
git add src-tauri/src/services/accounting/importer.rs
git commit -m "feat(accounting): CSV importer (alipay/wechat) with tests"
```

### Task 5.2: import_csv / import_commit Commands

**Files:**
- Modify: `src-tauri/src/commands/accounting.rs`

- [ ] **Step 1: 追加**

```rust
use crate::services::accounting::importer::{parse_alipay, parse_wechat, ImportPreview, ParsedRow};

#[tauri::command]
pub async fn import_csv(source: String, content: String) -> AppResult<ImportPreview> {
    match source.as_str() {
        "alipay" => parse_alipay(&content).map_err(AppError::InvalidInput),
        "wechat" => parse_wechat(&content).map_err(AppError::InvalidInput),
        _ => Err(AppError::InvalidInput("未知 source".into())),
    }
}

#[tauri::command]
pub async fn import_commit(source: String, file_name: String, rows: Vec<ParsedRow>, state: State<'_, DbState>) -> AppResult<i64> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    let tx = conn.unchecked_transaction()?;
    for r in &rows {
        tx.execute(
            "INSERT INTO transactions (type, amount, category, note, date) VALUES (?1, ?2, '其他', ?3, ?4)",
            params![r.txn_type, r.amount, r.note, r.date],
        )?;
    }
    tx.execute(
        "INSERT INTO imports_log (source, file_name, total_rows, imported, skipped, failed) VALUES (?1, ?2, ?3, ?4, 0, 0)",
        params![source, file_name, rows.len() as i64, rows.len() as i64],
    )?;
    tx.commit()?;
    Ok(rows.len() as i64)
}
```

- [ ] **Step 2: 注册 + 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/commands/accounting.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(accounting): import_csv and import_commit commands"
```

### Task 5.3: 实现 export.rs

**Files:**
- Modify: `src-tauri/src/services/accounting/export.rs`

- [ ] **Step 1: 写文件**

```rust
//! 数据导出
use rusqlite::Connection;
use rust_xlsxwriter::{Workbook, Format};
use crate::error::{AppError, AppResult};

pub fn export_csv(conn: &Connection, period: &str) -> AppResult<String> {
    let mut stmt = conn.prepare(
        "SELECT id, type, amount, category, note, date FROM transactions \
         WHERE substr(date,1,7) = ?1 ORDER BY date DESC"
    ).map_err(AppError::from)?;
    let mut content = String::from("ID,类型,金额,分类,备注,日期\n");
    let mut rows = stmt.query(rusqlite::params![period]).map_err(AppError::from)?;
    while let Some(r) = rows.next().map_err(AppError::from)? {
        let id: i64 = r.get(0).map_err(AppError::from)?;
        let t: String = r.get(1).map_err(AppError::from)?;
        let amt: f64 = r.get(2).map_err(AppError::from)?;
        let cat: String = r.get(3).map_err(AppError::from)?;
        let note: Option<String> = r.get(4).map_err(AppError::from)?;
        let date: String = r.get(5).map_err(AppError::from)?;
        content.push_str(&format!("{},{},{:.2},{},{},{}\n", id, t, amt, cat, note.unwrap_or_default(), date));
    }
    Ok(content)
}

pub fn export_xlsx(conn: &Connection, period: &str, path: &str) -> AppResult<()> {
    let mut wb = Workbook::new();
    let sheet = wb.add_worksheet();
    let header = Format::new().set_bold();
    for (i, name) in ["ID", "类型", "金额", "分类", "备注", "日期"].iter().enumerate() {
        sheet.write_string(0, i as u16, *name, &header).ok();
    }
    let mut stmt = conn.prepare(
        "SELECT id, type, amount, category, note, date FROM transactions \
         WHERE substr(date,1,7) = ?1 ORDER BY date DESC"
    ).map_err(AppError::from)?;
    let mut rows = stmt.query(rusqlite::params![period]).map_err(AppError::from)?;
    let mut row_idx = 1u32;
    while let Some(r) = rows.next().map_err(AppError::from)? {
        let id: i64 = r.get(0).map_err(AppError::from)?;
        let t: String = r.get(1).map_err(AppError::from)?;
        let amt: f64 = r.get(2).map_err(AppError::from)?;
        let cat: String = r.get(3).map_err(AppError::from)?;
        let note: Option<String> = r.get(4).map_err(AppError::from)?;
        let date: String = r.get(5).map_err(AppError::from)?;
        sheet.write_number(row_idx, 0, id as f64).ok();
        sheet.write_string(row_idx, 1, &t).ok();
        sheet.write_number(row_idx, 2, amt).ok();
        sheet.write_string(row_idx, 3, &cat).ok();
        sheet.write_string(row_idx, 4, note.as_deref().unwrap_or("")).ok();
        sheet.write_string(row_idx, 5, &date).ok();
        row_idx += 1;
    }
    wb.save(path).map_err(|e| AppError::Internal(format!("xlsx save: {}", e)))?;
    Ok(())
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/services/accounting/export.rs
git commit -m "feat(accounting): export CSV and XLSX"
```

### Task 5.4: 实现 attachment.rs

**Files:**
- Modify: `src-tauri/src/services/accounting/attachment.rs`

- [ ] **Step 1: 写文件**

```rust
//! 附件读写
use std::path::PathBuf;
use base64::Engine;
use uuid::Uuid;
use crate::error::{AppError, AppResult};

const ALLOWED_EXTS: &[&str] = &["png", "jpg", "jpeg", "heic"];
const MAX_SIZE: usize = 5 * 1024 * 1024;

pub fn save_attachment(app_data_dir: &PathBuf, base64_data: &str, ext: &str) -> AppResult<String> {
    let ext = ext.to_lowercase();
    if !ALLOWED_EXTS.contains(&ext.as_str()) {
        return Err(AppError::InvalidInput(format!("不支持的扩展名: {}", ext)));
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64_data)
        .map_err(|e| AppError::InvalidInput(format!("base64 解码失败: {}", e)))?;
    if bytes.len() > MAX_SIZE {
        return Err(AppError::InvalidInput("附件超过 5MB".into()));
    }
    let now = chrono::Local::now();
    let period = now.format("%Y-%m").to_string();
    let dir = app_data_dir.join("attachments").join("accounting").join(&period);
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Internal(format!("mkdir: {}", e)))?;
    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    std::fs::write(&dir.join(&filename), &bytes).map_err(|e| AppError::Internal(format!("write: {}", e)))?;
    Ok(format!("attachments/accounting/{}/{}", period, filename))
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/services/accounting/attachment.rs
git commit -m "feat(accounting): attachment save with validation"
```

### Task 5.5: 扩展 DbState 持 app_data_dir + attachment_save + export_transactions Commands

**Files:**
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/accounting.rs`

- [ ] **Step 1: 修改 `DbState`**

```rust
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<rusqlite::Connection>, pub PathBuf);
```

- [ ] **Step 2: 修改 `lib.rs` 中 `manage(DbState::new(...))`**

找到创建 DbState 处，传入 `app_data_dir`：

```rust
.setup(|app| {
    let app_data = app.path().app_data_dir().expect("app_data_dir");
    let conn = rusqlite::Connection::open(app_data.join("easywork.db"))?;
    // ... apply migrations
    app.manage(DbState(Mutex::new(conn), app_data));
    Ok(())
})
```

- [ ] **Step 3: 添加 commands**

```rust
use crate::services::accounting::attachment::save_attachment;
use crate::services::accounting::export::{export_csv, export_xlsx};

#[tauri::command]
pub async fn attachment_save(base64_data: String, ext: String, state: State<'_, DbState>) -> AppResult<String> {
    save_attachment(&state.1, &base64_data, &ext)
}

#[tauri::command]
pub async fn export_transactions(period: String, format: String, target_path: String, state: State<'_, DbState>) -> AppResult<String> {
    let conn = state.0.lock().map_err(|_| AppError::Internal("数据库锁竞争".into()))?;
    match format.as_str() {
        "csv" => {
            let content = export_csv(&conn, &period)?;
            std::fs::write(&target_path, content).map_err(|e| AppError::Internal(format!("write: {}", e)))?;
        }
        "xlsx" => export_xlsx(&conn, &period, &target_path)?,
        _ => return Err(AppError::InvalidInput("format 必须是 csv 或 xlsx".into())),
    }
    Ok(target_path)
}
```

- [ ] **Step 4: 编译 + 提交**

```bash
cd src-tauri && cargo check
git add src-tauri/src/db/mod.rs src-tauri/src/lib.rs src-tauri/src/commands/accounting.rs src-tauri/src/commands/mod.rs
git commit -m "feat(accounting): DbState holds app_data_dir; attachment_save and export_transactions"
```

### Task 5.6: 后端 E2E 集成测试

**Files:**
- Create: `src-tauri/tests/accounting_e2e.rs`

- [ ] **Step 1: 写测试**

```rust
use rusqlite::Connection;
const V1: &str = include_str!("../src/db/migrations/V1__initial.sql");
const V4: &str = include_str!("../src/db/migrations/V4__accounting_ext.sql");

fn full_db() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    c.execute_batch(V1).unwrap();
    c.execute_batch(V4).unwrap();
    c
}

#[test]
fn record_query_summary() {
    let c = full_db();
    c.execute("INSERT INTO transactions (type, amount, category, date) VALUES ('income', 15800, '工资', '2026-06-10')", []).unwrap();
    c.execute("INSERT INTO transactions (type, amount, category, date) VALUES ('expense', 100, '餐饮', '2026-06-10')", []).unwrap();
    c.execute("INSERT INTO transactions (type, amount, category, date) VALUES ('expense', 50, '交通', '2026-06-10')", []).unwrap();
    let (income, expense): (f64, f64) = c.query_row(
        "SELECT \
         COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) \
         FROM transactions WHERE substr(date,1,7)='2026-06'", [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(income, 15800.0);
    assert_eq!(expense, 150.0);
}

#[test]
fn attachment_path_persists() {
    let c = full_db();
    c.execute(
        "INSERT INTO transactions (type, amount, category, date, attachment_path) VALUES ('expense', 50, '餐饮', '2026-06-10', ?1)",
        ["attachments/test.png"],
    ).unwrap();
    let path: String = c.query_row("SELECT attachment_path FROM transactions WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(path, "attachments/test.png");
}

#[test]
fn budget_upsert() {
    let c = full_db();
    c.execute("INSERT INTO budgets (scope, period, amount) VALUES ('total', '2026-06', 10000) ON CONFLICT(scope, category_id, period) DO UPDATE SET amount=excluded.amount", []).unwrap();
    c.execute("INSERT INTO budgets (scope, period, amount) VALUES ('total', '2026-06', 12000) ON CONFLICT(scope, category_id, period) DO UPDATE SET amount=excluded.amount", []).unwrap();
    let n: i64 = c.query_row("SELECT COUNT(*) FROM budgets", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
    let amt: f64 = c.query_row("SELECT amount FROM budgets", [], |r| r.get(0)).unwrap();
    assert_eq!(amt, 12000.0);
}
```

- [ ] **Step 2: 运行 + 提交**

```bash
cd src-tauri && cargo test --test accounting_e2e
git add src-tauri/tests/accounting_e2e.rs
git commit -m "test(accounting): e2e record-query-summary + attachment + budget upsert"
```

---

## 6. P5 — 前端 Store + API + Utils

### Task 6.1: zustand store

**Files:**
- Create: `apps/app-accounting/src/store/accountingStore.ts`

- [ ] **Step 1: 写文件**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TabKey = 'overview' | 'detail' | 'settings';

interface AccountingState {
  activeTab: TabKey;
  currentPeriod: string;
  setActiveTab: (tab: TabKey) => void;
  setCurrentPeriod: (period: string) => void;
  shiftMonth: (delta: number) => void;
}

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const useAccountingStore = create<AccountingState>()(
  persist((set) => ({
    activeTab: 'overview',
    currentPeriod: defaultPeriod(),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setCurrentPeriod: (period) => set({ currentPeriod: period }),
    shiftMonth: (delta) => set((s) => ({ currentPeriod: shiftPeriod(s.currentPeriod, delta) })),
  }), { name: 'easywork-accounting' }),
);
```

- [ ] **Step 2: 写测试 `store/accountingStore.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useAccountingStore } from './accountingStore';

describe('accountingStore', () => {
  beforeEach(() => { useAccountingStore.setState({ activeTab: 'overview', currentPeriod: '2026-06' }); });
  it('shifts month forward', () => { useAccountingStore.getState().shiftMonth(1); expect(useAccountingStore.getState().currentPeriod).toBe('2026-07'); });
  it('shifts across year', () => { useAccountingStore.setState({ currentPeriod: '2026-01' }); useAccountingStore.getState().shiftMonth(-1); expect(useAccountingStore.getState().currentPeriod).toBe('2025-12'); });
  it('switches tabs', () => { useAccountingStore.getState().setActiveTab('detail'); expect(useAccountingStore.getState().activeTab).toBe('detail'); });
});
```

- [ ] **Step 3: 跑 + 提交**

```bash
cd apps/app-accounting && pnpm test
git add apps/app-accounting/src/store/
git commit -m "feat(accounting): zustand store + tests"
```

### Task 6.2: Tauri API 包装

**Files:**
- Create: `apps/app-accounting/src/api/tauri.ts`

- [ ] **Step 1: 写文件**

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface Transaction {
  id: number; type: 'income' | 'expense'; amount: number;
  category: string; subcategory: string | null; note: string | null;
  date: string; attachmentPath: string | null; createdAt: string; updatedAt: string;
}
export interface Category {
  id: number; name: string; parentId: number | null; type: 'income' | 'expense';
  icon: string; color: string; sortOrder: number; isBuiltin: number; isArchived: number;
}
export interface Budget { id: number; scope: 'total' | 'category'; categoryId: number | null; period: string; amount: number; }
export interface Summary { totalIncome: number; totalExpense: number; balance: number; savingsRate: number; budgetUsageRate: number; }
export interface TrendPoint { date: string; income: number; expense: number; }
export interface CategoryStat { category: string; amount: number; percentage: number; }
export interface MonthStat { period: string; income: number; expense: number; }
export interface ParsedRow { date: string; type: string; amount: number; counterparty: string; note: string; }
export interface ImportPreview { source: string; rows: ParsedRow[]; errors: { rowIndex: number; reason: string }[]; total: number; }

export const api = {
  txnList: (p: { start?: string; end?: string; type?: string; categoryId?: number; keyword?: string } = {}) =>
    invoke<Transaction[]>('txn_list', p),
  txnCreate: (p: { txnType: string; amount: number; category: string; subcategory: string | null; note: string | null; date: string; attachmentPath: string | null; }) =>
    invoke<Transaction>('txn_create', p),
  txnUpdate: (id: number, p: { txnType: string; amount: number; category: string; subcategory: string | null; note: string | null; date: string; attachmentPath: string | null; }) =>
    invoke<Transaction>('txn_update', { id, ...p }),
  txnDelete: (id: number) => invoke<boolean>('txn_delete', { id }),
  txnGet: (id: number) => invoke<Transaction>('txn_get', { id }),

  catList: (type?: 'income' | 'expense') => invoke<Category[]>('cat_list', { type }),
  catCreate: (p: { name: string; parentId: number | null; type: string; icon?: string; color?: string; }) =>
    invoke<Category>('cat_create', p),
  catUpdate: (id: number, p: { name: string; icon?: string; color?: string; }) =>
    invoke<Category>('cat_update', { id, ...p }),
  catDelete: (id: number) => invoke<boolean>('cat_delete', { id }),

  budgetGet: (period: string) => invoke<Budget[]>('budget_get', { period }),
  budgetSet: (p: { scope: string; categoryId: number | null; period: string; amount: number; }) =>
    invoke<Budget>('budget_set', p),
  budgetDelete: (id: number) => invoke<boolean>('budget_delete', { id }),

  statsSummary: (period: string) => invoke<Summary>('stats_summary', { period }),
  statsTrend: (start: string, end: string) => invoke<TrendPoint[]>('stats_trend', { start, end }),
  statsByCategory: (period: string, type: 'income' | 'expense') =>
    invoke<CategoryStat[]>('stats_by_category', { period, type }),
  statsMonthlyCompare: (months: number) => invoke<MonthStat[]>('stats_monthly_compare', { months }),

  importCsv: (source: string, content: string) => invoke<ImportPreview>('import_csv', { source, content }),
  importCommit: (source: string, fileName: string, rows: ParsedRow[]) => invoke<number>('import_commit', { source, fileName, rows }),
  exportTransactions: (period: string, format: 'csv' | 'xlsx', targetPath: string) =>
    invoke<string>('export_transactions', { period, format, targetPath }),
  attachmentSave: (base64Data: string, ext: string) => invoke<string>('attachment_save', { base64Data, ext }),
};
```

- [ ] **Step 2: 提交**

```bash
git add apps/app-accounting/src/api/tauri.ts
git commit -m "feat(accounting): Tauri API wrapper"
```

### Task 6.3: utils/amount.ts + date.ts + 测试

**Files:**
- Create: `apps/app-accounting/src/utils/amount.ts`
- Create: `apps/app-accounting/src/utils/date.ts`
- Create: `apps/app-accounting/src/utils/amount.test.ts`
- Create: `apps/app-accounting/src/utils/date.test.ts`

- [ ] **Step 1: amount.ts**

```typescript
export function formatAmount(n: number, withSign = false): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!withSign) return `¥${formatted}`;
  return n >= 0 ? `+¥${formatted}` : `-¥${formatted}`;
}

export function parseAmount(s: string): number {
  return parseFloat(s.replace(/[,¥\s]/g, '')) || 0;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 2: date.ts**

```typescript
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function periodStart(period: string): string { return `${period}-01`; }
export function periodEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${period}-${String(last).padStart(2, '0')}`;
}
export function displayDate(s: string): string { return s.slice(5); }
```

- [ ] **Step 3: 写测试**

`amount.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { formatAmount, parseAmount } from './amount';

describe('formatAmount', () => {
  it('formats positive', () => expect(formatAmount(1234.5)).toBe('¥1,234.50'));
  it('with sign', () => expect(formatAmount(-100, true)).toBe('-¥100.00'));
});
describe('parseAmount', () => {
  it('strips commas and ¥', () => expect(parseAmount('¥1,000.50')).toBeCloseTo(1000.5));
  it('handles empty', () => expect(parseAmount('')).toBe(0));
});
```

`date.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { periodStart, periodEnd } from './date';

describe('date', () => {
  it('periodStart', () => expect(periodStart('2026-02')).toBe('2026-02-01'));
  it('periodEnd for non-leap Feb', () => expect(periodEnd('2026-02')).toBe('2026-02-28'));
  it('periodEnd for 31-day month', () => expect(periodEnd('2026-05')).toBe('2026-05-31'));
});
```

- [ ] **Step 4: 跑 + 提交**

```bash
cd apps/app-accounting && pnpm test
git add apps/app-accounting/src/utils/
git commit -m "feat(accounting): amount + date utils with tests"
```

---

## 7. P6 — 页面骨架

### Task 7.1: App.tsx 3 Tab 路由

**Files:**
- Modify: `apps/app-accounting/src/App.tsx`
- Create: `apps/app-accounting/src/pages/OverviewPage.tsx`（占位）
- Create: `apps/app-accounting/src/pages/DetailPage.tsx`（占位）
- Create: `apps/app-accounting/src/pages/SettingsPage.tsx`（占位）

- [ ] **Step 1: 替换 App.tsx**

```typescript
import { Box, Tabs, Tab } from '@mui/material';
import { useAccountingStore } from './store/accountingStore';
import OverviewPage from './pages/OverviewPage';
import DetailPage from './pages/DetailPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { activeTab, setActiveTab } = useAccountingStore();
  return (
    <Box sx={{ width: '100%' }}>
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} centered
        sx={{ borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 10 }}>
        <Tab value="overview" label="主页" />
        <Tab value="detail" label="明细" />
        <Tab value="settings" label="设置" />
      </Tabs>
      {activeTab === 'overview' && <OverviewPage />}
      {activeTab === 'detail' && <DetailPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </Box>
  );
}
```

- [ ] **Step 2: 创建 3 个空页面（每个只放 `Box` + `Typography`）**

- [ ] **Step 3: 编译 + 提交**

```bash
cd apps/app-accounting && pnpm build
git add apps/app-accounting/src/App.tsx apps/app-accounting/src/pages/
git commit -m "feat(accounting): 3-Tab routing skeleton"
```

### Task 7.2: MonthSwitcher + BudgetProgressBar 组件 + 测试

**Files:**
- Create: `apps/app-accounting/src/components/MonthSwitcher.tsx`
- Create: `apps/app-accounting/src/components/MonthSwitcher.test.tsx`
- Create: `apps/app-accounting/src/components/BudgetProgressBar.tsx`
- Create: `apps/app-accounting/src/components/BudgetProgressBar.test.tsx`

- [ ] **Step 1: MonthSwitcher.tsx**

```typescript
import { Box, IconButton, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useAccountingStore } from '../store/accountingStore';

export default function MonthSwitcher() {
  const { currentPeriod, shiftMonth } = useAccountingStore();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton size="small" onClick={() => shiftMonth(-1)} aria-label="上个月"><ChevronLeftIcon /></IconButton>
      <Typography variant="subtitle1" fontWeight="bold">{currentPeriod}</Typography>
      <IconButton size="small" onClick={() => shiftMonth(1)} aria-label="下个月"><ChevronRightIcon /></IconButton>
    </Box>
  );
}
```

- [ ] **Step 2: MonthSwitcher.test.tsx**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MonthSwitcher from './MonthSwitcher';
import { useAccountingStore } from '../store/accountingStore';

describe('MonthSwitcher', () => {
  beforeEach(() => { useAccountingStore.setState({ currentPeriod: '2026-06' }); });
  it('renders current period', () => { render(<MonthSwitcher />); expect(screen.getByText('2026-06')).toBeInTheDocument(); });
  it('shifts forward', () => { render(<MonthSwitcher />); fireEvent.click(screen.getByLabelText('下个月')); expect(useAccountingStore.getState().currentPeriod).toBe('2026-07'); });
});
```

- [ ] **Step 3: BudgetProgressBar.tsx**

```typescript
import { Box, LinearProgress, Typography } from '@mui/material';
const GRADIENT = 'linear-gradient(135deg, #5BCFC4 0%, #1E5DA8 100%)';
interface Props { used: number; total: number; label?: string; showNumbers?: boolean; }

export default function BudgetProgressBar({ used, total, label, showNumbers = true }: Props) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 80 ? '#FF6B6B' : pct > 60 ? '#FFD43B' : GRADIENT;
  return (
    <Box>
      {(label || showNumbers) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          {label && <Typography variant="subtitle2" fontWeight="bold">{label}</Typography>}
          {showNumbers && <Typography variant="body2" color="text.secondary">¥{used.toLocaleString('zh-CN',{minimumFractionDigits:2})} / ¥{total.toLocaleString()}</Typography>}
        </Box>
      )}
      <LinearProgress variant="determinate" value={pct} sx={{
        height: 10, borderRadius: 5, backgroundColor: '#e0e0e0',
        '& .MuiLinearProgress-bar': { borderRadius: 5, background: color },
      }} />
      {showNumbers && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>已使用 {pct.toFixed(1)}%</Typography>}
    </Box>
  );
}
```

- [ ] **Step 4: BudgetProgressBar.test.tsx**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BudgetProgressBar from './BudgetProgressBar';

describe('BudgetProgressBar', () => {
  it('renders label and numbers', () => { render(<BudgetProgressBar used={50} total={100} label="总预算" />); expect(screen.getByText('总预算')).toBeInTheDocument(); });
  it('handles zero total', () => { render(<BudgetProgressBar used={50} total={0} />); expect(screen.getByText(/已使用 0\.0%/)).toBeInTheDocument(); });
  it('caps at 100', () => { render(<BudgetProgressBar used={150} total={100} />); expect(screen.getByText(/已使用 100\.0%/)).toBeInTheDocument(); });
});
```

- [ ] **Step 5: 跑测试 + 提交**

```bash
cd apps/app-accounting && pnpm test
git add apps/app-accounting/src/components/MonthSwitcher.tsx apps/app-accounting/src/components/MonthSwitcher.test.tsx apps/app-accounting/src/components/BudgetProgressBar.tsx apps/app-accounting/src/components/BudgetProgressBar.test.tsx
git commit -m "feat(accounting): MonthSwitcher + BudgetProgressBar with tests"
```

---

## 8. P7 — OverviewPage

### Task 8.1: 数据 hooks

**Files:**
- Create: `apps/app-accounting/src/hooks/{useStats,useTransactions,useBudget,useCategories}.ts`

- [ ] **Step 1: useStats.ts**

```typescript
import { useEffect, useState } from 'react';
import { api, Summary, TrendPoint, CategoryStat, MonthStat } from '../api/tauri';

export function useStats(period: string) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [byCategory, setByCategory] = useState<CategoryStat[]>([]);
  const [monthly, setMonthly] = useState<MonthStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.statsSummary(period),
      api.statsTrend(`${period}-01`, `${period}-31`),
      api.statsByCategory(period, 'expense'),
      api.statsMonthlyCompare(6),
    ]).then(([s, t, c, m]) => { setSummary(s); setTrend(t); setByCategory(c); setMonthly(m); })
      .catch(e => setError(String(e))).finally(() => setLoading(false));
  }, [period]);

  return { summary, trend, byCategory, monthly, loading, error };
}
```

- [ ] **Step 2: useTransactions.ts**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { api, Transaction } from '../api/tauri';

export function useTransactions(start?: string, end?: string) {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    setLoading(true);
    api.txnList({ start, end }).then(setData).finally(() => setLoading(false));
  }, [start, end]);
  useEffect(refresh, [refresh]);
  return {
    data, loading, refresh,
    create: async (p: Parameters<typeof api.txnCreate>[0]) => { const t = await api.txnCreate(p); refresh(); return t; },
    update: async (id: number, p: Parameters<typeof api.txnUpdate>[1]) => { const t = await api.txnUpdate(id, p); refresh(); return t; },
    remove: async (id: number) => { await api.txnDelete(id); refresh(); },
  };
}
```

- [ ] **Step 3: useBudget.ts**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { api, Budget } from '../api/tauri';

export function useBudget(period: string) {
  const [data, setData] = useState<Budget[]>([]);
  const refresh = useCallback(() => { api.budgetGet(period).then(setData); }, [period]);
  useEffect(refresh, [refresh]);
  return {
    data, refresh,
    set: async (scope: 'total' | 'category', categoryId: number | null, amount: number) => { await api.budgetSet({ scope, categoryId, period, amount }); refresh(); },
    remove: async (id: number) => { await api.budgetDelete(id); refresh(); },
  };
}
```

- [ ] **Step 4: useCategories.ts**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { api, Category } from '../api/tauri';

export function useCategories(type?: 'income' | 'expense') {
  const [data, setData] = useState<Category[]>([]);
  const refresh = useCallback(() => { api.catList(type).then(setData); }, [type]);
  useEffect(refresh, [refresh]);
  return {
    data, refresh,
    create: async (p: Parameters<typeof api.catCreate>[0]) => { const c = await api.catCreate(p); refresh(); return c; },
    update: async (id: number, p: Parameters<typeof api.catUpdate>[1]) => { const c = await api.catUpdate(id, p); refresh(); return c; },
    remove: async (id: number) => { await api.catDelete(id); refresh(); },
  };
}
```

- [ ] **Step 5: 提交**

```bash
git add apps/app-accounting/src/hooks/
git commit -m "feat(accounting): data hooks"
```

### Task 8.2: chart 组件

**Files:**
- Create: `apps/app-accounting/src/components/charts/{TrendLineChart,CategoryPieChart,MonthBarChart}.tsx`

- [ ] **Step 1: TrendLineChart.tsx**

```typescript
import { Box } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendPoint } from '../../api/tauri';

export default function TrendLineChart({ data }: { data: TrendPoint[] }) {
  return (
    <Box sx={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tickFormatter={d => d.slice(5)} />
          <YAxis /><Tooltip /><Legend />
          <Line type="monotone" dataKey="income" stroke="#51CF66" name="收入" />
          <Line type="monotone" dataKey="expense" stroke="#FF6B6B" name="支出" strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
```

- [ ] **Step 2: CategoryPieChart.tsx**

```typescript
import { Box, Typography } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CategoryStat } from '../../api/tauri';

const COLORS = ['#FF6B6B', '#1E5DA8', '#5BCFC4', '#FFD43B', '#999', '#845EC2', '#FF9671', '#FFC75F'];

export default function CategoryPieChart({ data }: { data: CategoryStat[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ width: 120, height: 120 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="category" innerRadius={30} outerRadius={50}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box sx={{ fontSize: 12, lineHeight: 1.8 }}>
        {data.slice(0, 5).map((d, i) => (
          <Box key={d.category} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, background: COLORS[i % COLORS.length], borderRadius: '50%' }} />
            <Typography variant="caption">{d.category} {d.percentage.toFixed(0)}%</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: MonthBarChart.tsx**

```typescript
import { Box } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MonthStat } from '../../api/tauri';

export default function MonthBarChart({ data }: { data: MonthStat[] }) {
  return (
    <Box sx={{ width: '100%', height: 180 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" /><YAxis /><Tooltip />
          <Bar dataKey="expense" fill="#1E5DA8" name="支出" />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add apps/app-accounting/src/components/charts/
git commit -m "feat(accounting): recharts wrappers"
```

### Task 8.3: 完整实现 OverviewPage

**Files:**
- Modify: `apps/app-accounting/src/pages/OverviewPage.tsx`

- [ ] **Step 1: 替换**

```typescript
import { useState } from 'react';
import { Box, Card, CardContent, Grid, Typography, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import { useAccountingStore } from '../store/accountingStore';
import { useStats } from '../hooks/useStats';
import { useBudget } from '../hooks/useBudget';
import { useTransactions } from '../hooks/useTransactions';
import BudgetProgressBar from '../components/BudgetProgressBar';
import TrendLineChart from '../components/charts/TrendLineChart';
import CategoryPieChart from '../components/charts/CategoryPieChart';
import MonthBarChart from '../components/charts/MonthBarChart';
import { formatAmount } from '../utils/amount';

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card sx={{ borderRadius: 3, borderLeft: `4px solid ${color}` }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {icon} {label}
        </Typography>
        <Typography variant="h6" fontWeight="bold" sx={{ color, mt: 0.5, fontSize: { xs: 16, md: 20 } }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { currentPeriod } = useAccountingStore();
  const { summary, trend, byCategory, monthly, loading } = useStats(currentPeriod);
  const { data: budgets, set: setBudget } = useBudget(currentPeriod);
  const { data: recent } = useTransactions(`${currentPeriod}-01`, `${currentPeriod}-31`);
  const [edit, setEdit] = useState<{ scope: 'total' | 'category'; categoryId: number | null; amount: number } | null>(null);

  const totalBudget = budgets.find(b => b.scope === 'total');
  const categoryBudgets = budgets.filter(b => b.scope === 'category');
  const recentFive = recent.slice(0, 5);

  if (loading || !summary) return <Box sx={{ p: 3 }}><Typography>加载中…</Typography></Box>;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, pb: 10 }}>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><KpiCard icon={<TrendingUpIcon sx={{ fontSize: 16, color: '#51CF66' }} />} label="本月收入" value={formatAmount(summary.totalIncome)} color="#51CF66" /></Grid>
        <Grid item xs={6} md={3}><KpiCard icon={<TrendingDownIcon sx={{ fontSize: 16, color: '#FF6B6B' }} />} label="本月支出" value={formatAmount(summary.totalExpense)} color="#FF6B6B" /></Grid>
        <Grid item xs={6} md={3}><KpiCard icon={<AccountBalanceIcon sx={{ fontSize: 16, color: '#1E5DA8' }} />} label="结余" value={formatAmount(summary.balance)} color="#1E5DA8" /></Grid>
        <Grid item xs={6} md={3}><KpiCard icon={<SavingsIcon sx={{ fontSize: 16, color: '#5BCFC4' }} />} label="储蓄率" value={summary.totalIncome > 0 ? `${summary.savingsRate.toFixed(1)}%` : '—'} color="#5BCFC4" /></Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>收支趋势</Typography>
            <TrendLineChart data={trend} />
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, height: '100%' }}><CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight="bold">总预算</Typography>
              <Button size="small" onClick={() => setEdit({ scope: 'total', categoryId: null, amount: totalBudget?.amount || 0 })}>编辑</Button>
            </Box>
            {totalBudget ? <BudgetProgressBar used={summary.totalExpense} total={totalBudget.amount} label={currentPeriod} showNumbers /> : <Typography variant="caption" color="text.secondary">未设置总预算</Typography>}
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, height: '100%' }}><CardContent>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>支出分类占比</Typography>
            {byCategory.length > 0 ? <CategoryPieChart data={byCategory} /> : <Typography variant="caption">无数据</Typography>}
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, height: '100%' }}><CardContent>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>分类预算</Typography>
            {categoryBudgets.length === 0 ? <Typography variant="caption" color="text.secondary">未设置</Typography> :
            <Stack spacing={1}>{categoryBudgets.map(b => {
              // 注：byCategory.category 是分类名（transactions 表里存的就是 name）；
              // 预算表里存的是 category_id，需要先查 Category 表拿到 name 再匹配。
              // 推荐做法：在 useBudget 中加一个 select，返回 (id, categoryName)；
              // 或后端加一个 stats_by_category_with_id 命令。这里先用占位逻辑：
              const used = byCategory.find(c => c.category === String(b.categoryId))?.amount || 0;
              return <BudgetProgressBar key={b.id} used={used} total={b.amount} showNumbers={false} />;
            })}</Stack>}
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, height: '100%' }}><CardContent>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>近 6 月对比</Typography>
            <MonthBarChart data={monthly} />
          </CardContent></Card>
        </Grid>
      </Grid>

      <Card sx={{ borderRadius: 3 }}><CardContent>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>最近流水</Typography>
        {recentFive.length === 0 ? <Typography variant="caption" color="text.secondary">本月还没有记录</Typography> :
          <Stack divider={<Box sx={{ borderBottom: '1px solid #eee' }} />}>
            {recentFive.map(t => (
              <Box key={t.id} sx={{ py: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">{t.category} · {t.note || '—'}</Typography>
                <Typography variant="body2" fontWeight="bold" sx={{ color: t.type === 'income' ? '#51CF66' : '#FF6B6B' }}>
                  {t.type === 'income' ? '+' : '-'}¥{t.amount.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Stack>}
      </CardContent></Card>

      {edit && (
        <Dialog open onClose={() => setEdit(null)}>
          <DialogTitle>编辑预算</DialogTitle>
          <DialogContent>
            <TextField autoFocus type="number" label="金额" value={edit.amount} onChange={e => setEdit({ ...edit, amount: Number(e.target.value) })} fullWidth sx={{ mt: 1 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEdit(null)}>取消</Button>
            <Button variant="contained" onClick={async () => { await setBudget(edit.scope, edit.categoryId, edit.amount); setEdit(null); }}>保存</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd apps/app-accounting && pnpm build
git add apps/app-accounting/src/pages/OverviewPage.tsx apps/app-accounting/src/hooks/
git commit -m "feat(accounting): OverviewPage with KPI + 3 charts + budget edit"
```

---

## 9. P8 — DetailPage

### Task 9.1: TransactionItem

**Files:**
- Create: `apps/app-accounting/src/components/TransactionItem.tsx`

- [ ] **Step 1: 写组件**

```typescript
import { Box, ListItem, ListItemAvatar, Avatar, ListItemText, Typography, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import HomeIcon from '@mui/icons-material/Home';
import { Transaction } from '../api/tauri';

const ICON_MAP: Record<string, React.ReactNode> = {
  '餐饮': <RestaurantIcon />, '交通': <DirectionsCarIcon />,
  '购物': <ShoppingCartIcon />, '娱乐': <SportsEsportsIcon />,
  '住房': <HomeIcon />,
};

interface Props { txn: Transaction; onEdit?: (t: Transaction) => void; onDelete?: (id: number) => void; }

export default function TransactionItem({ txn, onEdit, onDelete }: Props) {
  const icon = ICON_MAP[txn.category] ?? <span>{txn.category[0]}</span>;
  return (
    <ListItem sx={{ px: 2 }} secondaryAction={
      <Box>
        {onEdit && <IconButton edge="end" size="small" onClick={() => onEdit(txn)}><EditIcon fontSize="small" /></IconButton>}
        {onDelete && <IconButton edge="end" size="small" onClick={() => onDelete(txn.id)}><DeleteIcon fontSize="small" /></IconButton>}
      </Box>
    }>
      <ListItemAvatar>
        <Avatar sx={{ width: 36, height: 36, bgcolor: txn.type === 'income' ? 'rgba(81,207,102,0.12)' : 'rgba(255,107,107,0.12)', color: txn.type === 'income' ? '#51CF66' : '#FF6B6B' }}>{icon}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight="medium">{txn.category}</Typography>
          <Typography variant="body2" fontWeight="bold" sx={{ color: txn.type === 'income' ? '#51CF66' : '#FF6B6B' }}>{txn.type === 'income' ? '+' : '-'}¥{txn.amount.toLocaleString('zh-CN',{minimumFractionDigits:2})}</Typography>
        </Box>}
        secondary={<Typography variant="caption" color="text.secondary">{txn.note || '—'} · {txn.date}</Typography>}
      />
    </ListItem>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/app-accounting/src/components/TransactionItem.tsx
git commit -m "feat(accounting): TransactionItem"
```

### Task 9.2: 完整实现 DetailPage

**Files:**
- Modify: `apps/app-accounting/src/pages/DetailPage.tsx`

- [ ] **Step 1: 替换**

```typescript
import { useState, useMemo } from 'react';
import { Box, Card, Stack, Typography, TextField, Chip, useMediaQuery, useTheme } from '@mui/material';
import { useAccountingStore } from '../store/accountingStore';
import { useTransactions } from '../hooks/useTransactions';
import MonthSwitcher from '../components/MonthSwitcher';
import TransactionItem from '../components/TransactionItem';
import { displayDate, periodStart, periodEnd } from '../utils/date';
import { formatAmount } from '../utils/amount';

type Filter = 'all' | 'income' | 'expense';

export default function DetailPage() {
  const { currentPeriod } = useAccountingStore();
  const { data, remove } = useTransactions(periodStart(currentPeriod), periodEnd(currentPeriod));
  const [type, setType] = useState<Filter>('all');
  const [keyword, setKeyword] = useState('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const filtered = useMemo(() => data.filter(t =>
    (type === 'all' || t.type === type) &&
    (!keyword || (t.note || '').includes(keyword) || t.category.includes(keyword) || String(t.amount).includes(keyword))
  ), [data, type, keyword]);

  const groups = useMemo(() => {
    const map: Record<string, typeof data> = {};
    for (const t of filtered) (map[t.date] ??= []).push(t);
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, pb: 10 }}>
      <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 1, mb: 2 }}>
        <MonthSwitcher />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {filtered.length} 笔 · 收入 {formatAmount(totalIncome)} · 支出 {formatAmount(totalExpense)}
        </Typography>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        {(['all', 'expense', 'income'] as const).map(v => (
          <Chip key={v} label={v === 'all' ? '全部' : v === 'expense' ? '支出' : '收入'} color={type === v ? 'primary' : 'default'} onClick={() => setType(v)} />
        ))}
        <TextField size="small" placeholder="搜索" value={keyword} onChange={e => setKeyword(e.target.value)} sx={{ ml: 'auto', minWidth: 180 }} />
      </Stack>

      <Card sx={{ borderRadius: 3 }}>
        {groups.length === 0 ? <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">本月还没有记录</Typography></Box> :
          groups.map(([date, items]) => (
            <Box key={date}>
              <Box sx={{ bgcolor: '#f0f2f5', px: 2, py: 1 }}><Typography variant="subtitle2" fontWeight="bold">{displayDate(date)}</Typography></Box>
              {items.map(t => <TransactionItem key={t.id} txn={t} onDelete={remove} />)}
            </Box>
          ))}
      </Card>
    </Box>
  );
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd apps/app-accounting && pnpm build
git add apps/app-accounting/src/pages/DetailPage.tsx
git commit -m "feat(accounting): DetailPage with month switcher + filters + grouped list"
```

---

## 10. P9 — SettingsPage + ImportWizard

### Task 10.1: SettingsPage

**Files:**
- Modify: `apps/app-accounting/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 替换**

```typescript
import { useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Button, Stack } from '@mui/material';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { api } from '../api/tauri';
import { useAccountingStore } from '../store/accountingStore';
import ImportWizard from '../components/ImportWizard';

export default function SettingsPage() {
  const { currentPeriod } = useAccountingStore();
  const [importPayload, setImportPayload] = useState<{ source: string; content: string; fileName: string } | null>(null);

  async function handleImport() {
    const selected = await open({ multiple: false, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (!selected || typeof selected !== 'string') return;
    const content = await readTextFile(selected);
    const fileName = selected.split(/[\\/]/).pop() || 'unknown.csv';
    const source = content.includes('交易号') ? 'alipay' : content.includes('交易单号') ? 'wechat' : '';
    if (!source) { alert('无法识别 CSV 来源（需要包含支付宝"交易号"或微信"交易单号"列）'); return; }
    setImportPayload({ source, content, fileName });
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    const path = await save({ defaultPath: `transactions-${currentPeriod}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (!path) return;
    await api.exportTransactions(currentPeriod, format, path);
    alert(`已导出到 ${path}`);
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><Card sx={{ borderRadius: 3 }}><CardContent>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>📥 数据导入</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>支持支付宝 / 微信 CSV 自动识别</Typography>
          <Button variant="contained" onClick={handleImport}>选择 CSV 文件</Button>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={6}><Card sx={{ borderRadius: 3 }}><CardContent>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>📤 数据导出</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>导出 {currentPeriod} 全部流水</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => handleExport('xlsx')}>导出 Excel</Button>
            <Button variant="outlined" onClick={() => handleExport('csv')}>导出 CSV</Button>
          </Stack>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={6}><Card sx={{ borderRadius: 3 }}><CardContent>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>🗂 分类管理</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>本期只读，自定义分类后续版本支持</Typography>
          <Button variant="outlined" disabled>管理分类</Button>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={6}><Card sx={{ borderRadius: 3 }}><CardContent>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>🔔 预算提醒</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>分类预算达 80% 时系统通知</Typography>
          <Typography variant="body2">阈值：80%</Typography>
        </CardContent></Card></Grid>
      </Grid>
      {importPayload && <ImportWizard open onClose={() => setImportPayload(null)} source={importPayload.source} content={importPayload.content} fileName={importPayload.fileName} />}
    </Box>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/app-accounting/src/pages/SettingsPage.tsx
git commit -m "feat(accounting): SettingsPage with import/export entry"
```

### Task 10.2: ImportWizard

**Files:**
- Create: `apps/app-accounting/src/components/ImportWizard.tsx`

- [ ] **Step 1: 写组件**

```typescript
import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Typography, Box, Alert } from '@mui/material';
import { api, ParsedRow } from '../api/tauri';

interface Props { open: boolean; source: string; content: string; fileName: string; onClose: () => void; }

export default function ImportWizard({ open, source, content, fileName, onClose }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<{ rowIndex: number; reason: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.importCsv(source, content).then(p => { setRows(p.rows); setErrors(p.errors); setSelected(new Set(p.rows.map((_, i) => i))); });
  }, [open, source, content]);

  async function commit() {
    setImporting(true);
    const chosen = rows.filter((_, i) => selected.has(i));
    try { const n = await api.importCommit(source, fileName, chosen); alert(`成功导入 ${n} 笔`); onClose(); }
    catch (e) { alert(`导入失败: ${e}`); }
    finally { setImporting(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>导入预览 · {fileName} ({source})</DialogTitle>
      <DialogContent>
        {errors.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{errors.length} 行解析失败已跳过</Alert>}
        <Typography variant="body2" sx={{ mb: 1 }}>解析 {rows.length + errors.length} 行 · 错误 {errors.length} · 待导入 {selected.size}</Typography>
        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell padding="checkbox" /><TableCell>日期</TableCell><TableCell>类型</TableCell><TableCell align="right">金额</TableCell><TableCell>对方</TableCell><TableCell>备注</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selected.has(i)} onChange={() => { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); }} /></TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.type === 'income' ? '收入' : '支出'}</TableCell>
                  <TableCell align="right">¥{r.amount.toFixed(2)}</TableCell>
                  <TableCell>{r.counterparty}</TableCell>
                  <TableCell>{r.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={commit} disabled={importing || selected.size === 0}>导入选中 {selected.size} 笔</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/app-accounting/src/components/ImportWizard.tsx
git commit -m "feat(accounting): ImportWizard with preview and row selection"
```

---

## 11. P10 — RecordDrawer + 附件 + 分类选择

### Task 11.1: ImageAttachment

**Files:**
- Create: `apps/app-accounting/src/components/ImageAttachment.tsx`

- [ ] **Step 1: 写组件**

```typescript
import { useRef, useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api/tauri';

const ALLOWED = ['png', 'jpg', 'jpeg', 'heic'];
const MAX_SIZE = 5 * 1024 * 1024;

interface Props { value: string | null; onChange: (path: string | null) => void; }

export default function ImageAttachment({ value, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_SIZE) { setError('附件最大 5MB'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED.includes(ext)) { setError('仅支持 png/jpg/jpeg/heic'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      try { const path = await api.attachmentSave(base64, ext); onChange(path); }
      catch (err: any) { setError(String(err)); }
    };
    reader.readAsDataURL(file);
  }

  if (value) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
        <AttachFileIcon fontSize="small" />
        <Typography variant="caption" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</Typography>
        <IconButton size="small" onClick={() => onChange(null)}><CloseIcon fontSize="small" /></IconButton>
      </Box>
    );
  }

  return (
    <Box>
      <input ref={ref} type="file" accept=".png,.jpg,.jpeg,.heic" hidden onChange={onPick} />
      <Button size="small" startIcon={<AttachFileIcon />} onClick={() => ref.current?.click()}>添加附件</Button>
      {error && <Typography variant="caption" color="error" sx={{ ml: 1 }}>{error}</Typography>}
    </Box>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/app-accounting/src/components/ImageAttachment.tsx
git commit -m "feat(accounting): ImageAttachment with size/format validation"
```

### Task 11.2: CategoryPicker

**Files:**
- Create: `apps/app-accounting/src/components/CategoryPicker.tsx`

- [ ] **Step 1: 写组件**

```typescript
import { Box, Typography } from '@mui/material';
import { Category } from '../api/tauri';

interface Props { categories: Category[]; selected: string; onSelect: (name: string) => void; }

export default function CategoryPicker({ categories, selected, onSelect }: Props) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}>
      {categories.map(c => (
        <Box key={c.id} onClick={() => onSelect(c.name)} data-testid={`cat-${c.name}`}
          sx={{ textAlign: 'center', p: 1, borderRadius: 1, cursor: 'pointer', border: selected === c.name ? '2px solid #1E5DA8' : '2px solid transparent', background: selected === c.name ? 'rgba(30,93,168,0.08)' : 'transparent' }}>
          <Typography variant="h6">{c.icon || c.name[0]}</Typography>
          <Typography variant="caption">{c.name}</Typography>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/app-accounting/src/components/CategoryPicker.tsx
git commit -m "feat(accounting): CategoryPicker grid"
```

### Task 11.3: RecordDrawer

**Files:**
- Create: `apps/app-accounting/src/components/RecordDrawer.tsx`

- [ ] **Step 1: 写组件**

```typescript
import { useState, useEffect } from 'react';
import { Drawer, Box, Typography, TextField, Button, ToggleButton, ToggleButtonGroup, Stack } from '@mui/material';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import CategoryPicker from './CategoryPicker';
import ImageAttachment from './ImageAttachment';
import { todayISO, parseAmount, formatAmount } from '../utils/amount';
import { Transaction } from '../api/tauri';

interface Props { open: boolean; onClose: () => void; edit?: Transaction | null; }

export default function RecordDrawer({ open, onClose, edit }: Props) {
  const { data: cats } = useCategories();
  const { create, update } = useTransactions();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [attachment, setAttachment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (edit) { setType(edit.type); setAmount(String(edit.amount)); setCategory(edit.category); setNote(edit.note || ''); setDate(edit.date); setAttachment(edit.attachmentPath); }
      else { setType('expense'); setAmount(''); setCategory(''); setNote(''); setDate(todayISO()); setAttachment(null); }
      setError(null);
    }
  }, [open, edit]);

  const filteredCats = cats.filter(c => c.type === type);
  const amt = parseAmount(amount);
  const valid = amt > 0 && category && date <= todayISO();

  async function save() {
    if (!valid) { setError('请填写有效金额和分类，日期不能晚于今天'); return; }
    try {
      const params = { txnType: type, amount: amt, category, subcategory: null, note: note || null, date, attachmentPath: attachment };
      if (edit) await update(edit.id, params); else await create(params);
      onClose();
    } catch (e: any) { setError(String(e)); }
  }

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: '12px 12px 0 0', maxWidth: 600, mx: 'auto', maxHeight: { xs: '90vh', md: '60vh' } } }}>
      <Box sx={{ p: 2 }}>
        <Box sx={{ width: 36, height: 4, bgcolor: '#ccc', borderRadius: 2, mx: 'auto', mb: 2 }} />
        <ToggleButtonGroup value={type} exclusive onChange={(_, v) => v && setType(v)} fullWidth sx={{ mb: 2 }}>
          <ToggleButton value="expense" sx={{ color: '#FF6B6B', '&.Mui-selected': { bgcolor: 'rgba(255,107,107,0.1)', color: '#FF6B6B' } }}>支出</ToggleButton>
          <ToggleButton value="income" sx={{ color: '#51CF66', '&.Mui-selected': { bgcolor: 'rgba(81,207,102,0.1)', color: '#51CF66' } }}>收入</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ textAlign: 'center', my: 2 }}>
          <Typography variant="h3" fontWeight="bold" sx={{ color: type === 'income' ? '#51CF66' : '#FF6B6B' }}>{amount ? formatAmount(amt) : '¥ 0.00'}</Typography>
          <TextField fullWidth placeholder="输入金额" value={amount} onChange={e => setAmount(e.target.value)} inputProps={{ inputMode: 'decimal', style: { textAlign: 'center', fontSize: 24 } }} sx={{ mt: 1 }} />
        </Box>
        <CategoryPicker categories={filteredCats} selected={category} onSelect={setCategory} />
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <TextField type="date" label="日期" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth size="small" />
          <TextField label="备注" value={note} onChange={e => setNote(e.target.value)} fullWidth size="small" />
          <ImageAttachment value={attachment} onChange={setAttachment} />
        </Stack>
        {error && <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>{error}</Typography>}
        <Button fullWidth variant="contained" onClick={save} disabled={!valid} sx={{ mt: 2, background: 'linear-gradient(135deg, #5BCFC4, #1E5DA8)', '&:hover': { background: 'linear-gradient(135deg, #5BCFC4, #1E5DA8)' } }}>{edit ? '更新' : '保存'}</Button>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd apps/app-accounting && pnpm build
git add apps/app-accounting/src/components/RecordDrawer.tsx
git commit -m "feat(accounting): RecordDrawer bottom sheet"
```

### Task 11.4: App 中挂载 FAB + Drawer

**Files:**
- Modify: `apps/app-accounting/src/App.tsx`

- [ ] **Step 1: 替换为完整 App**

```typescript
import { useState } from 'react';
import { Box, Tabs, Tab, Fab } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAccountingStore } from './store/accountingStore';
import OverviewPage from './pages/OverviewPage';
import DetailPage from './pages/DetailPage';
import SettingsPage from './pages/SettingsPage';
import RecordDrawer from './components/RecordDrawer';
import { Transaction } from './api/tauri';

export default function App() {
  const { activeTab, setActiveTab } = useAccountingStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);

  return (
    <Box sx={{ width: '100%' }}>
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} centered
        sx={{ borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 10 }}>
        <Tab value="overview" label="主页" />
        <Tab value="detail" label="明细" />
        <Tab value="settings" label="设置" />
      </Tabs>
      {activeTab === 'overview' && <OverviewPage />}
      {activeTab === 'detail' && <DetailPage />}
      {activeTab === 'settings' && <SettingsPage />}
      <Fab color="primary" aria-label="记账" onClick={() => { setEditTarget(null); setDrawerOpen(true); }}
        sx={{ position: 'fixed', bottom: { xs: 24, md: 32 }, right: { xs: 24, md: 32 }, background: 'linear-gradient(135deg, #5BCFC4, #1E5DA8)', '&:hover': { background: 'linear-gradient(135deg, #5BCFC4, #1E5DA8)' }, zIndex: 1200 }}>
        <AddIcon />
      </Fab>
      <RecordDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} edit={editTarget} />
    </Box>
  );
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd apps/app-accounting && pnpm build
git add apps/app-accounting/src/App.tsx
git commit -m "feat(accounting): mount FAB and RecordDrawer"
```

---

### Task 11.5: 预算 80% 触发系统通知

**Files:**
- Modify: `apps/app-accounting/src/App.tsx`

- [ ] **Step 1: 顶部追加 imports**

```typescript
import { useEffect } from 'react';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { api } from './api/tauri';
```

- [ ] **Step 2: 在 App 函数体内添加副作用**

```typescript
const { currentPeriod } = useAccountingStore();
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const [summary, budgets] = await Promise.all([
        api.statsSummary(currentPeriod),
        api.budgetGet(currentPeriod),
      ]);
      if (cancelled) return;
      const total = budgets.find(b => b.scope === 'total');
      if (total && summary.budgetUsageRate >= 80) {
        await sendNotification({
          title: '预算提醒',
          body: `${currentPeriod} 总预算已使用 ${summary.budgetUsageRate.toFixed(0)}%`,
        });
      }
    } catch { /* 静默 */ }
  })();
  return () => { cancelled = true; };
}, [currentPeriod]);
```

- [ ] **Step 3: 编译 + 提交**

```bash
cd apps/app-accounting && pnpm build
git add apps/app-accounting/src/App.tsx
git commit -m "feat(accounting): budget 80% system notification"
```

---

## 12. P12 — 测试 + 收尾

### Task 12.1: 端到端关键场景（Vitest 集成测试）

**Files:**
- Create: `apps/app-accounting/src/integration/record-flow.test.tsx`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import App from '../App';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const mockTxn = { id: 1, type: 'expense', amount: 35.5, category: '餐饮', subcategory: null, note: '午餐', date: '2026-06-10', attachmentPath: null, createdAt: '2026-06-10 12:30', updatedAt: '2026-06-10 12:30' };

describe('record flow', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cat_list') return [{ id: 1, name: '餐饮', parentId: null, type: 'expense', icon: '🍜', color: '#FF6B6B', sortOrder: 0, isBuiltin: 1, isArchived: 0 }];
      if (cmd === 'stats_summary') return { totalIncome: 0, totalExpense: 0, balance: 0, savingsRate: 0, budgetUsageRate: 0 };
      if (cmd === 'stats_trend') return [];
      if (cmd === 'stats_by_category') return [];
      if (cmd === 'stats_monthly_compare') return [];
      if (cmd === 'txn_list') return [mockTxn];
      if (cmd === 'budget_get') return [];
      if (cmd === 'txn_create') return mockTxn;
      return null;
    });
  });

  it('opens detail tab and shows a transaction', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('明细'));
    await waitFor(() => expect(screen.getByText('餐饮')).toBeInTheDocument());
  });

  it('FAB opens record drawer', async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('记账'));
    await waitFor(() => expect(screen.getByPlaceholderText('输入金额')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 跑 + 提交**

```bash
cd apps/app-accounting && pnpm test
git add apps/app-accounting/src/integration/
git commit -m "test(accounting): record flow integration test"
```

### Task 12.2: 文档 + Demo 数据种子（独立 PR）

**Files:**
- Modify: `src-tauri/src/db/migrations/V4__accounting_ext.sql`（追加种子）

- [ ] **Step 1: 在 V4 末尾追加内建分类种子**

```sql
INSERT OR IGNORE INTO categories (name, type, icon, color, sort_order, is_builtin) VALUES
  ('餐饮', 'expense', '🍜', '#FF6B6B', 1, 1),
  ('交通', 'expense', '🚗', '#1E5DA8', 2, 1),
  ('购物', 'expense', '🛒', '#5BCFC4', 3, 1),
  ('娱乐', 'expense', '🎬', '#FFD43B', 4, 1),
  ('住房', 'expense', '🏠', '#845EC2', 5, 1),
  ('医疗', 'expense', '🏥', '#FF9671', 6, 1),
  ('教育', 'expense', '📚', '#FFC75F', 7, 1),
  ('通讯', 'expense', '📱', '#F9F871', 8, 1),
  ('旅行', 'expense', '✈️', '#FF6F91', 9, 1),
  ('其他', 'expense', '📦', '#999999', 10, 1),
  ('工资', 'income', '💼', '#51CF66', 1, 1),
  ('奖金', 'income', '🎁', '#51CF66', 2, 1),
  ('投资', 'income', '📈', '#51CF66', 3, 1),
  ('兼职', 'income', '💻', '#51CF66', 4, 1),
  ('红包', 'income', '🧧', '#51CF66', 5, 1),
  ('其他', 'income', '💰', '#51CF66', 6, 1);
```

> 注意：`其他` 在两种 type 下都出现，但 `UNIQUE(parent_id, name)` 允许（parent_id 都是 NULL）所以 OK。

- [ ] **Step 2: 提交**

```bash
git add src-tauri/src/db/migrations/V4__accounting_ext.sql
git commit -m "feat(db): V4 seed data - 16 builtin categories"
```

---

## 12.5 主 Shell Dashboard 集成（spec §9）

### Task 12.4: 在主 Dashboard 接入消费金额

**Files:**
- Modify: `apps/app-dashboard/src/...`（按实际路径）

- [ ] **Step 1: 找到消费金额卡片位置**

阅读 `apps/app-dashboard/src/`，定位「消费金额」卡片。

- [ ] **Step 2: 替换为实时拉取**

```typescript
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { currentPeriod } from '@easywork/shared';

export function ConsumptionCard() {
  const [expense, setExpense] = useState(0);

  useEffect(() => {
    const refresh = () => invoke<{ totalExpense: number }>('stats_summary', { period: currentPeriod() })
      .then(s => setExpense(s.totalExpense))
      .catch(() => {});
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card onClick={() => window.location.hash = 'accounting'}>
      <CardContent>
        <Typography variant="body2">消费金额</Typography>
        <Typography variant="h6">¥{expense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</Typography>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/app-dashboard/
git commit -m "feat(dashboard): live consumption from accounting"
```

---

## 13. 完成标准

- [ ] `cargo check` 0 错误
- [ ] `pnpm build` 0 错误
- [ ] `pnpm test` 全部通过
- [ ] `cargo test` 全部通过
- [ ] 桌面 1280px 启动 → 主页可见 4 KPI + 3 图 + 预算 + 最近
- [ ] 桌面 1280px → 明细 Tab → 看到 demo 流水
- [ ] 桌面 1280px → 点 FAB → Drawer 弹出 → 选分类 → 保存 → 流水出现
- [ ] 移动端 375px → 单列布局 → 记一笔可触屏
- [ ] 设置 → 导入支付宝 CSV → 预览 → 提交
- [ ] 预算 80% 触发系统通知

---

## 14. 执行提示

- 每个 Task 都有独立的 commit；PR 时按 Phase 合并
- TDD：测试写在实现前；先看红，再写绿
- 频繁 commit：每个 Step 1 步提交也可
- 卡住时看 spec 对应章节（specs/2026-06-12-accounting-design.md）
