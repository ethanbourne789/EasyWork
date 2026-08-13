import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useTransactions, useCategories, useAccounts, useDeleteTransaction } from './useFinance';
import { TransactionForm } from './TransactionForm';
import { TransactionItem } from './TransactionItem';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, Receipt } from 'lucide-react';
import type { Transaction, TransactionType } from '@/types';
import { confirm } from '@/lib/confirm';

type FilterType = 'all' | TransactionType;

export function TransactionList() {
  const { t } = useTranslation();
  const { data: transactions = [], isLoading, isError, refetch } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const deleteTransaction = useDeleteTransaction();
  const [filter, setFilter] = useState<FilterType>('all');
  const [catFilter, setCatFilter] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const FILTERS: { value: FilterType; label: string }[] = [
    { value: 'all', label: t('finance.filter_all') },
    { value: 'income', label: t('finance.filter_income') },
    { value: 'expense', label: t('finance.filter_expense') },
    { value: 'transfer', label: t('finance.filter_transfer') },
  ];

  const { focus } = useSearch({ from: '/app/finance' });
  useEffect(() => {
    if (focus) {
      const tx = transactions.find((t) => t.id === focus);
      if (tx) setEditingTransaction(tx);
    }
  }, [focus, transactions]);

  const getCategory = useCallback(
    (id?: string) => categories.find((c) => c.id === id),
    [categories],
  );
  const getAccount = useCallback(
    (id: string) => accounts.find((a) => a.id === id),
    [accounts],
  );

  const filteredTransactions = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filter !== 'all' && tx.type !== filter) return false;
      if (catFilter && tx.category_id !== catFilter) return false;
      if (accountFilter && tx.account_id !== accountFilter && tx.to_account_id !== accountFilter) return false;
      if (kw) {
        const cat = getCategory(tx.category_id);
        const hay = `${tx.note ?? ''} ${cat?.name ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [transactions, filter, catFilter, accountFilter, search, getCategory]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    [...filteredTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((tx) => {
        const dateKey = format(new Date(tx.date), 'yyyy-MM-dd');
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(tx);
      });
    return groups;
  }, [filteredTransactions]);

  const handleDelete = async (tx: Transaction) => {
    const ok = await confirm({
      title: t('finance.deleteTransaction'),
      description: t('finance.deleteTransactionConfirm'),
      confirmText: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteTransaction.mutate(tx.id);
  };

  if (isLoading) return <LoadingState rows={5} />;
  if (isError)
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">{t('finance.transactionsLoadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
      </div>
    );

  return (
    <div className="space-y-3">
      {/* 分段筛选 */}
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-md py-1.5 text-sm font-medium transition-colors',
              filter === f.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 高级筛选 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('finance.searchNoteCategory')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-36"
        >
          <option value="">{t('finance.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-32"
        >
          <option value="">{t('finance.allAccounts')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* 时间线 */}
      {Object.entries(groupedByDate).map(([dateKey, txns]) => (
        <section key={dateKey} className="space-y-1.5">
          <div className="sticky top-0 z-10 bg-background/90 py-0.5 text-xs font-medium text-muted-foreground backdrop-blur">
            {format(new Date(dateKey), 'M月d日 EEEE', { locale: zhCN })}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {txns.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                getCategory={getCategory}
                getAccount={getAccount}
                onEdit={(tx2) => setEditingTransaction(tx2)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      ))}

      {filteredTransactions.length === 0 && (
        <EmptyState icon={Receipt} title={t('finance.noTransactions')} />
      )}

      {/* 编辑弹窗 */}
      <Dialog
        open={!!editingTransaction}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('finance.editTransaction')}</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <TransactionForm transaction={editingTransaction} onSuccess={() => setEditingTransaction(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
