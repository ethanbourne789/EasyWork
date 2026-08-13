import { useState } from 'react';
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
import type { TransactionType } from '@/types';

type TabValue = 'overview' | 'transactions' | 'accounts' | 'budgets' | 'categories' | 'reports';

const TABS: { value: TabValue; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'overview', label: '总览', icon: LayoutGrid },
  { value: 'transactions', label: '交易', icon: ArrowUpDown },
  { value: 'accounts', label: '账户', icon: Wallet },
  { value: 'budgets', label: '预算', icon: PiggyBank },
  { value: 'categories', label: '分类', icon: Tags },
  { value: 'reports', label: '报表', icon: BarChart3 },
];

export function Finance() {
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
          <h1 className="font-display text-[28px] font-semibold leading-tight">记账</h1>
          <p className="mt-1 text-sm text-muted-foreground">收支概况，一眼掌握</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto pb-1 sm:justify-center">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5 whitespace-nowrap" aria-label={t.label}>
              <t.icon size={15} />
              <span className="text-sm">{t.label}</span>
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
        label="记一笔"
        actions={[
          { label: '记一笔支出', icon: TrendingDown, onClick: () => openForm('expense') },
          { label: '记一笔收入', icon: TrendingUp, onClick: () => openForm('income') },
          { label: '转账', icon: ArrowLeftRight, onClick: () => openForm('transfer') },
        ]}
      />

      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>记账</DialogTitle>
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
