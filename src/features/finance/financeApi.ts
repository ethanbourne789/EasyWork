import { isTauri } from "@/lib/tauri";
import type { Transaction, Account, Category, Budget, TransactionType, AccountType, CategoryType } from "@/types";

/**
 * 懒加载 Tauri invoke 函数。
 * 使用动态导入避免在浏览器环境下因 @tauri-apps/api/core 模块无法加载而崩溃。
 */
async function getInvoke() {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export const financeApi = {
  // ---------------------------------------------------------------------------
  // Transaction CRUD
  // ---------------------------------------------------------------------------
  listTransactions: async () => {
    const invoke = await getInvoke();
    return invoke<Transaction[]>("transaction_list_all");
  },
  getTransaction: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<Transaction>("transaction_get", { id });
  },
  createTransaction: async (data: {
    type: TransactionType;
    amount: number;
    account_id: string;
    to_account_id?: string;
    category_id?: string;
    date: string;
    note?: string;
    receipt_url?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Transaction>("transaction_create", {
      type: data.type,
      amountCents: Math.round(data.amount * 100),
      accountId: data.account_id,
      transferAccountId: data.to_account_id,
      categoryId: data.category_id,
      date: data.date,
      description: data.note,
      receiptPath: data.receipt_url,
    });
  },
  updateTransaction: async (data: {
    id: string;
    type?: TransactionType;
    amount?: number;
    account_id?: string;
    to_account_id?: string;
    category_id?: string;
    date?: string;
    note?: string;
    receipt_url?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Transaction>("transaction_update", {
      id: data.id,
      type: data.type,
      amountCents: data.amount != null ? Math.round(data.amount * 100) : undefined,
      accountId: data.account_id,
      transferAccountId: data.to_account_id,
      categoryId: data.category_id,
      date: data.date,
      description: data.note,
      receiptPath: data.receipt_url,
    });
  },
  deleteTransaction: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("transaction_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Account CRUD
  // ---------------------------------------------------------------------------
  listAccounts: async () => {
    const invoke = await getInvoke();
    return invoke<Account[]>("account_list_all");
  },
  getAccount: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<Account>("account_get", { id });
  },
  createAccount: async (data: {
    name: string;
    type: AccountType;
    initial_balance: number;
    currency: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Account>("account_create", {
      name: data.name,
      type: data.type,
      balanceCents: Math.round(data.initial_balance * 100),
      currency: data.currency,
    });
  },
  updateAccount: async (data: {
    id: string;
    name?: string;
    type?: AccountType;
    initial_balance?: number;
    currency?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Account>("account_update", {
      id: data.id,
      name: data.name,
      type: data.type,
      balanceCents: data.initial_balance != null ? Math.round(data.initial_balance * 100) : undefined,
      currency: data.currency,
    });
  },
  deleteAccount: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("account_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Category CRUD
  // ---------------------------------------------------------------------------
  listCategories: async () => {
    const invoke = await getInvoke();
    return invoke<Category[]>("category_list_all");
  },
  createCategory: async (data: {
    name: string;
    type: CategoryType;
    icon?: string;
    parent_id?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Category>("category_create", {
      name: data.name,
      type: data.type,
      icon: data.icon,
      parentId: data.parent_id,
    });
  },
  updateCategory: async (data: {
    id: string;
    name?: string;
    type?: CategoryType;
    icon?: string;
    parent_id?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Category>("category_update", {
      id: data.id,
      name: data.name,
      type: data.type,
      icon: data.icon,
      parentId: data.parent_id,
    });
  },
  deleteCategory: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("category_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Budget CRUD
  // ---------------------------------------------------------------------------
  listBudgets: async () => {
    const invoke = await getInvoke();
    return invoke<Budget[]>("budget_list_all");
  },
  createBudget: async (data: {
    category_id?: string;
    amount: number;
    year_month: number;
    scope: "category" | "overall";
    carry_over?: number;
    period?: string;
    period_start?: string;
    period_end?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Budget>("budget_create", {
      categoryId: data.category_id,
      amountCents: Math.round(data.amount * 100),
      yearMonth: String(data.year_month),
      scope: data.scope,
      carryOverCents: data.carry_over != null ? Math.round(data.carry_over * 100) : undefined,
      period: data.period,
      periodStart: data.period_start,
      periodEnd: data.period_end,
    });
  },
  updateBudget: async (data: {
    id: string;
    category_id?: string;
    amount?: number;
    year_month?: number;
    scope?: "category" | "overall";
    carry_over?: number;
    period?: string;
    period_start?: string;
    period_end?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Budget>("budget_update", {
      id: data.id,
      categoryId: data.category_id,
      amountCents: data.amount != null ? Math.round(data.amount * 100) : undefined,
      yearMonth: data.year_month != null ? String(data.year_month) : undefined,
      scope: data.scope,
      carryOverCents: data.carry_over != null ? Math.round(data.carry_over * 100) : undefined,
      period: data.period,
      periodStart: data.period_start,
      periodEnd: data.period_end,
    });
  },
  deleteBudget: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("budget_delete", { id });
  },
};
