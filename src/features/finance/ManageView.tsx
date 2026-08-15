import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Target, Tags } from 'lucide-react';
import { AccountList } from './AccountList';
import { BudgetList } from './BudgetList';
import { CategoryManager } from './CategoryManager';
import { cn } from '@/lib/utils';

type ManageTab = 'accounts' | 'budgets' | 'categories';

export function ManageView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ManageTab>('accounts');

  const TABS: { value: ManageTab; label: string; icon: typeof Wallet; desc: string }[] = [
    { value: 'accounts', label: t('finance.accounts'), icon: Wallet, desc: t('finance.manageAccountsDesc') },
    { value: 'budgets', label: t('finance.budgets'), icon: Target, desc: t('finance.manageBudgetsDesc') },
    { value: 'categories', label: t('finance.categories'), icon: Tags, desc: t('finance.manageCategoriesDesc') },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-4 text-left shadow-sm transition-colors',
              tab === item.value
                ? 'border-brand-200 bg-brand-50'
                : 'bg-card hover:bg-secondary',
            )}
          >
            <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tab === item.value ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600')}>
              <item.icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {tab === 'accounts' && <AccountList />}
      {tab === 'budgets' && <BudgetList />}
      {tab === 'categories' && <CategoryManager />}
    </div>
  );
}
