import { Banknote, Building2, CreditCard } from 'lucide-react';
import type { AccountType } from '@/types';

export const CHART_COLORS = [
  'oklch(56% 0.17 264)',
  'oklch(64% 0.15 150)',
  'oklch(58% 0.21 25)',
  'oklch(72% 0.15 55)',
  'oklch(74% 0.11 264)',
  'oklch(84% 0.07 264)',
  'oklch(49% 0.16 264)',
  'oklch(42% 0.14 264)',
];

export const INCOME_COLOR = 'oklch(64% 0.15 150)';
export const EXPENSE_COLOR = 'oklch(58% 0.21 25)';

export const ACCOUNT_TYPE_ICONS: Record<AccountType, typeof Banknote> = {
  cash: Banknote,
  bank: Building2,
  credit: CreditCard,
};

export const ACCOUNT_TYPE_TINT: Record<AccountType, string> = {
  cash: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  bank: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  credit: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
};
