import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/features/auth/authStore';
import { useSafeMutation } from '@/lib/mutation';
import type { Transaction, Account, Category, Budget } from '@/types';
import type { Database } from '@/types/database.types';

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: financeKeys.accounts(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: financeKeys.categories(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

// 分类增删改（支持 icon 与多级 parent_id）
export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: Partial<Category>) => {
      const { data: row, error } = await supabase
        .from('categories')
        .insert({ ...data, user_id: getCurrentUserId() } as unknown as Database['public']['Tables']['categories']['Insert'])
        .select()
        .single();
      if (error) throw error;
      return row as Category;
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
      const { data: row, error } = await supabase
        .from('categories')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return row as Category;
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
      const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', getCurrentUserId());
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.categories() });
    },
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: financeKeys.budgets(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .order('year_month', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });
}

// Mutation Hooks
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (data: Partial<Transaction>) => {
      const { data: row, error } = await supabase
        .from('transactions')
        .insert({ ...data, user_id: getCurrentUserId() } as unknown as Database['public']['Tables']['transactions']['Insert'])
        .select()
        .single();
      if (error) throw error;
      return row as Transaction;
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
      const { data: row, error } = await supabase
        .from('transactions')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return row as Transaction;
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
      const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', getCurrentUserId());
      if (error) throw error;
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
      const { data: row, error } = await supabase
        .from('accounts')
        .insert({ ...data, user_id: getCurrentUserId() } as unknown as Database['public']['Tables']['accounts']['Insert'])
        .select()
        .single();
      if (error) throw error;
      return row as Account;
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
      const { data: row, error } = await supabase
        .from('accounts')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return row as Account;
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
      const { error } = await supabase.from('accounts').delete().eq('id', id).eq('user_id', getCurrentUserId());
      if (error) throw error;
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
      // 使用 upsert 优雅处理「同月同分类/整体」唯一约束冲突（避免 23505 报错）
      const isOverall = data.scope === 'overall';
      const { data: row, error } = await supabase
        .from('budgets')
        .upsert(
          { ...data, user_id: getCurrentUserId() } as unknown as Database['public']['Tables']['budgets']['Insert'],
          {
            onConflict: isOverall ? 'user_id,overall_uniq_month' : 'user_id,category_id,year_month',
          }
        )
        .select()
        .single();
      if (error) throw error;
      return row as Budget;
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
      const { data: row, error } = await supabase
        .from('budgets')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return row as Budget;
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
      const { error } = await supabase.from('budgets').delete().eq('id', id).eq('user_id', getCurrentUserId());
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.budgets() });
    },
  });
}
