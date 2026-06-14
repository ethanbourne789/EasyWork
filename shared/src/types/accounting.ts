import type { DateString } from './common';

export type TransactionType = 'income' | 'expense' | 'investment' | 'transfer';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  category: string;
  subcategory: string;
  note: string;
  date: DateString;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  parentId: number;
  sortOrder: number;
  createdAt: string;
}

export interface Budget {
  id: number;
  category: string;
  amount: number;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  budgetUsageRate: number;
}
