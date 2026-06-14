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
  type?: string
  category?: string
  keyword?: string
}

export interface TransactionInput {
  type: string
  amount: number
  category: string
  subcategory?: string
  note?: string
  date: string
}

export async function listTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  return tauriInvoke<Transaction[]>("accounting_transaction_list", { filters })
}

export async function createTransaction(data: TransactionInput): Promise<number> {
  return tauriInvoke<number>("accounting_transaction_create", { data })
}

export async function updateTransaction(id: number, data: Partial<TransactionInput>): Promise<void> {
  return tauriInvoke<void>("accounting_transaction_update", { id, data })
}

export async function deleteTransaction(id: number): Promise<void> {
  return tauriInvoke<void>("accounting_transaction_delete", { id })
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
  return tauriInvoke<Category[]>("accounting_category_list")
}

export async function createCategory(data: CategoryInput): Promise<number> {
  return tauriInvoke<number>("accounting_category_create", { data })
}

export async function updateCategory(id: number, data: Partial<CategoryInput>): Promise<void> {
  return tauriInvoke<void>("accounting_category_update", { id, data })
}

export async function deleteCategory(id: number): Promise<void> {
  return tauriInvoke<void>("accounting_category_delete", { id })
}

// ==================== 预算 ====================

export interface BudgetInput {
  category: string
  amount: number
  year: number
  month: number
}

export async function listBudgets(year: number, month: number): Promise<Budget[]> {
  return tauriInvoke<Budget[]>("accounting_budget_list", { year, month })
}

export async function createBudget(data: BudgetInput): Promise<number> {
  return tauriInvoke<number>("accounting_budget_create", { data })
}

export async function updateBudget(id: number, data: Partial<BudgetInput>): Promise<void> {
  return tauriInvoke<void>("accounting_budget_update", { id, data })
}

export async function deleteBudget(id: number): Promise<void> {
  return tauriInvoke<void>("accounting_budget_delete", { id })
}

// ==================== 统计 ====================

export async function getStats(year: number, month: number): Promise<AccountingSummary> {
  return tauriInvoke<AccountingSummary>("accounting_stats_get", { year, month })
}

// ==================== CSV ====================

export interface ImportResult {
  totalCount: number
  successCount: number
  failCount: number
  errors: string[]
}

export async function importCsv(filePath: string): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("accounting_csv_import", { filePath })
}

export async function exportCsv(year: number, month: number): Promise<string> {
  return tauriInvoke<string>("accounting_csv_export", { year, month })
}
