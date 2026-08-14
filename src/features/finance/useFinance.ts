import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeMutation } from '@/lib/mutation';
import { financeApi } from './financeApi';
import type { Transaction, Account, Category, Budget } from '@/types';

// Query Keys
export const financeKeys = {
  all: ['finance'] as const,
  transactions: () => [...financeKeys.all, 'transactions'] as const,
  accounts: () => [...financeKeys.all, 'accounts'] as const,
  categories: () => [...financeKeys.all, 'categories'] as const,
  budgets: () => [...financeKeys.all, 'budgets'] as const,
};

// Query Hooks
export function useTransactions() {
  return useQuery({
    queryKey: financeKeys.transactions(),
    queryFn: () => financeApi.listTransactions(),
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: financeKeys.accounts(),
    queryFn: () => financeApi.listAccounts(),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: financeKeys.categories(),
    queryFn: () => financeApi.listCategories(),
  });
}

// 分类增删改（支持 icon 与多级 parent_id）
export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: Partial<Category>) => {
      return financeApi.createCategory({
        name: data.name ?? "",
        type: (data.type ?? "expense") as "income" | "expense",
        icon: data.icon ?? undefined,
        parent_id: data.parent_id ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.categories() });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Category> }) => {
      return financeApi.updateCategory({
        id,
        name: data.name,
        type: data.type,
        icon: data.icon ?? undefined,
        parent_id: data.parent_id ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.categories() });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      await financeApi.deleteCategory(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.categories() });
    },
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: financeKeys.budgets(),
    queryFn: () => financeApi.listBudgets(),
  });
}

// Mutation Hooks
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (data: Partial<Transaction>) => {
      return financeApi.createTransaction({
        type: (data.type ?? "expense") as Transaction["type"],
        amount: data.amount ?? 0,
        account_id: data.account_id ?? "",
        to_account_id: data.to_account_id ?? undefined,
        category_id: data.category_id ?? undefined,
        date: data.date ?? new Date().toISOString().slice(0, 10),
        note: data.note,
        receipt_url: data.receipt_url ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.transactions() });
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts() });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Transaction> }) => {
      return financeApi.updateTransaction({
        id,
        type: data.type as Transaction["type"],
        amount: data.amount,
        account_id: data.account_id,
        to_account_id: data.to_account_id ?? undefined,
        category_id: data.category_id ?? undefined,
        date: data.date,
        note: data.note,
        receipt_url: data.receipt_url ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.transactions() });
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts() });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (id: string) => {
      await financeApi.deleteTransaction(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.transactions() });
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts() });
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (data: Partial<Account>) => {
      return financeApi.createAccount({
        name: data.name ?? "",
        type: (data.type ?? "cash") as Account["type"],
        initial_balance: data.initial_balance ?? 0,
        currency: data.currency || "CNY",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts() });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Account> }) => {
      return financeApi.updateAccount({
        id,
        name: data.name,
        type: data.type,
        initial_balance: data.initial_balance,
        currency: data.currency,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts() });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (id: string) => {
      await financeApi.deleteAccount(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: financeKeys.transactions() });
    },
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (data: Partial<Budget>) => {
      return financeApi.createBudget({
        category_id: data.category_id ?? undefined,
        amount: data.amount ?? 0,
        year_month: data.year_month ?? Number(String(new Date().getFullYear()) + String(new Date().getMonth() + 1).padStart(2, "0")),
        scope: (data.scope ?? "category") as "category" | "overall",
        carry_over: data.carry_over,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Budget> }) => {
      return financeApi.updateBudget({
        id,
        category_id: data.category_id ?? undefined,
        amount: data.amount,
        year_month: data.year_month,
        scope: data.scope,
        carry_over: data.carry_over,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (id: string) => {
      await financeApi.deleteBudget(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() });
    },
  });
}
