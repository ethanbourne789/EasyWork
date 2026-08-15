import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TransactionList } from './TransactionList';
import { TransactionForm } from './TransactionForm';
import { AccountList } from './AccountList';
import { BudgetList } from './BudgetList';
import { FinanceReport } from './FinanceReport';
import { CategoryManager } from './CategoryManager';
import { FinanceOverview } from './FinanceOverview';
import { Plus, ArrowLeftRight, TrendingUp, TrendingDown, LayoutGrid, ArrowUpDown, Wallet, PiggyBank, BarChart3, Tags } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ModuleFab } from '@/components/layout/ModuleFab';
import { Button } from '@/components/ui/button';
import type { TransactionType } from '@/types';

type TabValue = 'overview' | 'transactions' | 'accounts' | 'budgets' | 'categories' | 'reports';

const TABS: { value: TabValue; labelKey: string; icon: typeof LayoutGrid }[] = [
  { value: 'overview', labelKey: 'tab_overview', icon: LayoutGrid },
  { value: 'transactions', labelKey: 'tab_transactions', icon: ArrowUpDown },
  { value: 'accounts', labelKey: 'tab_accounts', icon: Wallet },
  { value: 'budgets', labelKey: 'tab_budgets', icon: PiggyBank },
  { value: 'categories', labelKey: 'tab_categories', icon: Tags },
  { value: 'reports', labelKey: 'tab_reports', icon: BarChart3 },
];

export function Finance() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [formType, setFormType] = useState<TransactionType>('expense');

  const openForm = (type: TransactionType) => {
    setFormType(type);
    setShowFormDialog(true);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">{t('finance.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('finance.subtitle')}</p>
        </div>
        {/* 桌面端新建交易按钮（移动端走 ModuleFab） */}
        <Button size="sm" onClick={() => openForm('expense')} className="hidden md:flex items-center gap-1">
          <Plus size={15} /> {t('finance.addTransaction')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto pb-1 sm:justify-center">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 whitespace-nowrap" aria-label={t(`finance.${tab.labelKey}`)}>
              <tab.icon size={15} />
              <span className="text-sm">{t(`finance.${tab.labelKey}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <FinanceOverview />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionList />
        </TabsContent>

        <TabsContent value="accounts">
          <AccountList />
        </TabsContent>

        <TabsContent value="budgets">
          <BudgetList />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryManager />
        </TabsContent>

        <TabsContent value="reports">
          <FinanceReport />
        </TabsContent>
      </Tabs>

      <ModuleFab
        mainIcon={Plus}
        label={t('finance.recordOne')}
        actions={[
          { label: t('finance.recordExpense'), icon: TrendingDown, onClick: () => openForm('expense') },
          { label: t('finance.recordIncome'), icon: TrendingUp, onClick: () => openForm('income') },
          { label: t('finance.recordTransfer'), icon: ArrowLeftRight, onClick: () => openForm('transfer') },
        ]}
      />

      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('finance.addTransaction')}</DialogTitle>
          </DialogHeader>
          <TransactionForm
            key={formType}
            defaultType={formType}
            onSuccess={() => setShowFormDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
