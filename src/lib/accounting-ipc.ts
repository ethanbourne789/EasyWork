import type { Transaction, Category, Budget, AccountingSummary } from "@easywork/shared"

// Tauri API 可用性检查
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri not available, command "${cmd}" skipped`)
    throw new Error("Tauri not available")
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(cmd, args)
}

// ==================== 交易记录 ====================

export interface TransactionFilters {
  startDate?: string
  endDate?: string
}

export interface TransactionInput {
  txnType: string
  amount: number
  category: string
  subcategory?: string
  note?: string
  date: string
}

export async function listTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  return tauriInvoke<Transaction[]>("txn_list", {
    startDate: filters?.startDate,
    endDate: filters?.endDate,
  })
}

export async function createTransaction(data: TransactionInput): Promise<Transaction> {
  return tauriInvoke<Transaction>("txn_create", {
    txnType: data.txnType,
    amount: data.amount,
    category: data.category,
    subcategory: data.subcategory,
    note: data.note,
    date: data.date,
  })
}

export async function updateTransaction(id: number, data: Partial<TransactionInput>): Promise<boolean> {
  return tauriInvoke<boolean>("txn_update", {
    id,
    txnType: data.txnType,
    amount: data.amount,
    category: data.category,
    subcategory: data.subcategory,
    note: data.note,
    date: data.date,
  })
}

export async function deleteTransaction(id: number): Promise<boolean> {
  return tauriInvoke<boolean>("txn_delete", { id })
}

// ==================== 分类 ====================

export interface CategoryInput {
  name: string
  type: string
  icon?: string
  color?: string
  parentId?: number
  sortOrder?: number
}

export async function listCategories(): Promise<Category[]> {
  return tauriInvoke<Category[]>("category_list")
}

export async function createCategory(data: CategoryInput): Promise<number> {
  return tauriInvoke<number>("category_create", {
    name: data.name,
    type: data.type,
    icon: data.icon,
    color: data.color,
    parentId: data.parentId,
    sortOrder: data.sortOrder,
  })
}

export async function updateCategory(id: number, data: Partial<CategoryInput>): Promise<boolean> {
  return tauriInvoke<boolean>("category_update", {
    id,
    name: data.name,
    type: data.type,
    icon: data.icon,
    color: data.color,
    parentId: data.parentId,
    sortOrder: data.sortOrder,
  })
}

export async function deleteCategory(id: number): Promise<boolean> {
  return tauriInvoke<boolean>("category_delete", { id })
}

// ==================== 预算 ====================

export interface BudgetInput {
  category: string
  amount: number
  year: number
  month: number
}

export async function listBudgets(year: number, month: number): Promise<Budget[]> {
  return tauriInvoke<Budget[]>("budget_list", { year, month })
}

export async function createBudget(data: BudgetInput): Promise<number> {
  return tauriInvoke<number>("budget_create", {
    category: data.category,
    amount: data.amount,
    year: data.year,
    month: data.month,
  })
}

export async function updateBudget(id: number, data: Partial<BudgetInput>): Promise<boolean> {
  return tauriInvoke<boolean>("budget_update", {
    id,
    category: data.category,
    amount: data.amount,
  })
}

export async function deleteBudget(id: number): Promise<boolean> {
  return tauriInvoke<boolean>("budget_delete", { id })
}

export interface BudgetItem {
  category: string
  amount: number
}

export async function saveAllBudgets(year: number, month: number, items: BudgetItem[]): Promise<boolean> {
  return tauriInvoke<boolean>("budget_save_all", { year, month, items })
}

// ==================== 统计 ====================

export async function getStats(): Promise<AccountingSummary> {
  return tauriInvoke<AccountingSummary>("stats_summary")
}

// ==================== CSV ====================

export interface ImportResult {
  totalCount: number
  successCount: number
  failCount: number
  errors: string[]
}

export async function importCsv(filePath: string): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("csv_import", { filePath })
}

export async function exportCsv(year: number, month: number): Promise<string> {
  return tauriInvoke<string>("csv_export", { year, month })
}
