import type { DateString } from './common';

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  category: string;
  subcategory: string;
  note: string;
  date: DateString;
  createdAt: string;
}

export interface AccountingSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  budgetUsageRate: number;
}
