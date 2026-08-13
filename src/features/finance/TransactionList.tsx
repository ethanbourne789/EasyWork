import { useState, useMemo, useEffect, useCallback } from 'react';
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

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
  { value: 'transfer', label: '转账' },
];

export function TransactionList() {
  const { data: transactions = [], isLoading, isError, refetch } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const deleteTransaction = useDeleteTransaction();
  const [filter, setFilter] = useState<FilterType>('all');
  const [catFilter, setCatFilter] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

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
    return transactions.filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (catFilter && t.category_id !== catFilter) return false;
      if (accountFilter && t.account_id !== accountFilter && t.to_account_id !== accountFilter) return false;
      if (kw) {
        const cat = getCategory(t.category_id);
        const hay = `${t.note ?? ''} ${cat?.name ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [transactions, filter, catFilter, accountFilter, search, getCategory]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    [...filteredTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((t) => {
        const dateKey = format(new Date(t.date), 'yyyy-MM-dd');
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(t);
      });
    return groups;
  }, [filteredTransactions]);

  const handleDelete = async (t: Transaction) => {
    const ok = await confirm({
      title: "删除交易记录",
      description: "确定要删除这条交易记录吗？",
      confirmText: "删除",
      destructive: true,
    });
    if (ok) deleteTransaction.mutate(t.id);
  };

  if (isLoading) return <LoadingState rows={5} />;
  if (isError)
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">交易加载失败，请检查网络或登录状态</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>重试</Button>
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
            placeholder="搜索备注 / 分类"
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
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-32"
        >
          <option value="">全部账户</option>
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
            {txns.map((t) => (
              <TransactionItem
                key={t.id}
                transaction={t}
                getCategory={getCategory}
                getAccount={getAccount}
                onEdit={(tx) => setEditingTransaction(tx)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      ))}

      {filteredTransactions.length === 0 && (
        <EmptyState icon={Receipt} title="暂无交易记录" />
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
            <DialogTitle>编辑交易</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <TransactionForm transaction={editingTransaction} onSuccess={() => setEditingTransaction(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
