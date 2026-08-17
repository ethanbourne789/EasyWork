import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LedgerView } from './LedgerView';
import { FinanceReport } from './FinanceReport';
import { ManageView } from './ManageView';
import { TransactionForm } from './TransactionForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ModuleFab } from '@/components/layout/ModuleFab';
import { Button } from '@/components/ui/button';
import { Plus, Receipt, BarChart3, Settings2, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import type { TransactionType } from '@/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export function Finance() {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [activeTab, setActiveTab] = useState('ledger');
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
        {isDesktop && (
          <Button size="sm" onClick={() => openForm('expense')} className="items-center gap-1">
            <Plus size={15} /> {t('finance.addTransaction')}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto pb-1 sm:justify-center">
          <TabsTrigger value="ledger" className="gap-1.5 whitespace-nowrap" aria-label={t('finance.tab_ledger')}>
            <Receipt size={15} />
            <span className="text-sm">{t('finance.tab_ledger')}</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5 whitespace-nowrap" aria-label={t('finance.reports')}>
            <BarChart3 size={15} />
            <span className="text-sm">{t('finance.reports')}</span>
          </TabsTrigger>
          <TabsTrigger value="manage" className="gap-1.5 whitespace-nowrap" aria-label={t('finance.tab_manage')}>
            <Settings2 size={15} />
            <span className="text-sm">{t('finance.tab_manage')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <LedgerView />
        </TabsContent>
        <TabsContent value="reports">
          <FinanceReport />
        </TabsContent>
        <TabsContent value="manage">
          <ManageView />
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
