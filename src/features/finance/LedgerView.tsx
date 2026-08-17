import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import {
  useTransactions,
  useAccounts,
  useCategories,
  useBudgets,
  useDeleteTransaction,
} from './useFinance';
import { LedgerTable } from './LedgerTable';
import { TransactionForm } from './TransactionForm';
import { BudgetProgressBar } from './BudgetProgressBar';
import { LoadingState } from './LoadingState';
import { Drawer, DrawerHeader, DrawerTitle, DrawerClose, DrawerBody } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { confirm } from '@/lib/confirm';
import { computeAccountBalances } from '@/lib/finance';
import { formatMoney, sumMoney, roundMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  Search,
  CheckSquare,
  Target,
  Wallet,
  Activity,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Scale,
} from 'lucide-react';
import type { Transaction, TransactionType } from '@/types';

type FilterType = 'all' | TransactionType;

function KpiCard({
  label,
  value,
  sub,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1.5 font-mono text-2xl font-bold tabular-nums', valueClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export function LedgerView() {
  const { t } = useTranslation();
  const { data: transactions = [], isLoading, isError, refetch } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const deleteTransaction = useDeleteTransaction();

  const { focus } = useSearch({ from: '/app/finance' });

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [catFilter, setCatFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (focus) {
      const tx = transactions.find((tr) => tr.id === focus);
      if (tx) setEditingTx(tx);
    }
  }, [focus, transactions]);

  // ---- 筛选 ----
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        if (filterType !== 'all' && tx.type !== filterType) return false;
        if (catFilter && tx.category_id !== catFilter) return false;
        if (accountFilter && tx.account_id !== accountFilter && tx.to_account_id !== accountFilter) return false;
        if (kw) {
          const cat = categories.find((c) => c.id === tx.category_id);
          const hay = `${tx.note ?? ''} ${cat?.name ?? ''}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterType, catFilter, accountFilter, search, categories]);

  // ---- 当月统计 ----
  const curMonthStr = format(new Date(), 'yyyy-MM');
  const monthStats = useMemo(() => {
    const monthTx = transactions.filter((tr) => tr.date.startsWith(curMonthStr));
    const income = sumMoney(monthTx.filter((tr) => tr.type === 'income').map((tr) => tr.amount));
    const expense = sumMoney(monthTx.filter((tr) => tr.type === 'expense').map((tr) => tr.amount));
    return { income, expense, balance: roundMoney(income - expense) };
  }, [transactions, curMonthStr]);

  // ---- 净资产 ----
  const netWorth = useMemo(() => {
    const balances = computeAccountBalances(accounts, transactions);
    return sumMoney(Object.values(balances));
  }, [accounts, transactions]);

  // ---- 预算（当月） ----
  const currentYearMonth = parseInt(format(new Date(), 'yyyyMM'));
  const { currentOverall, overallSpent } = useMemo(() => {
    const overall = budgets.find((b) => b.scope === 'overall' && b.year_month === currentYearMonth);
    let total = 0;
    transactions
      .filter((tr) => tr.type === 'expense' && tr.date.startsWith(curMonthStr))
      .forEach((tr) => { total += tr.amount; });
    return { currentOverall: overall, overallSpent: total };
  }, [budgets, currentYearMonth, transactions, curMonthStr]);

  // ---- 近 7 日趋势 ----
  const trend7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayTx = transactions.filter((tr) => tr.date.startsWith(key));
      return {
        label: `${m + 1}/${day}`,
        income: sumMoney(dayTx.filter((tr) => tr.type === 'income').map((tr) => tr.amount)),
        expense: sumMoney(dayTx.filter((tr) => tr.type === 'expense').map((tr) => tr.amount)),
      };
    });
  }, [transactions]);
  const trendMax = Math.max(1, ...trend7.map((d) => Math.max(d.income, d.expense)));

  // ---- 支出分类饼图 ----
  const PIE_COLORS = [
    'oklch(56% 0.17 264)',   // brand-500
    'oklch(64% 0.15 150)',   // success
    'oklch(58% 0.21 25)',    // destructive
    'oklch(72% 0.15 55)',    // warning
    'oklch(65% 0.18 195)',   // sky
    'oklch(65% 0.15 31)',    // orange
    'oklch(68% 0.16 340)',   // pink
    'oklch(62% 0.14 170)',   // teal
    'oklch(60% 0.12 70)',    // amber
    'oklch(64% 0.13 230)',   // blue
  ];

  const expensePieData = useMemo(() => {
    const spend: Record<string, number> = {};
    transactions
      .filter((tr) => tr.type === 'expense' && tr.date.startsWith(curMonthStr))
      .forEach((tr) => {
        const catId = tr.category_id || '__uncategorized__';
        spend[catId] = (spend[catId] || 0) + tr.amount;
      });
    return Object.entries(spend)
      .map(([catId, value], i) => {
        const cat = categories.find((c) => c.id === catId);
        return {
          name: cat?.name || t('finance.untitled'),
          value,
          fill: PIE_COLORS[i % PIE_COLORS.length],
        };
      })
      .sort((a, b) => b.value - a.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- PIE_COLORS is a stable inline constant
  }, [transactions, curMonthStr, categories, t]);

  // ---- 选择 ----
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filtered.map((tx) => tx.id)) : new Set());
  };

  const handleEdit = (tx: Transaction) => {
    setDetailTx(null);
    setEditingTx(tx);
  };
  const handleDelete = async (tx: Transaction) => {
    const ok = await confirm({
      title: t('finance.deleteTransaction'),
      description: t('finance.deleteTransactionConfirm'),
      confirmText: t('common.delete'),
      destructive: true,
    });
    if (ok) {
      deleteTransaction.mutate(tx.id);
      setDetailTx(null);
    }
  };
  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: t('finance.bulkDelete'),
      description: t('finance.bulkDeleteConfirm', { count: selectedIds.size }),
      confirmText: t('common.delete'),
      destructive: true,
    });
    if (ok) {
      selectedIds.forEach((id) => deleteTransaction.mutate(id));
      setSelectedIds(new Set());
      setBatchMode(false);
    }
  };

  if (isLoading) return <LoadingState rows={6} />;
  if (isError) {
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">{t('finance.transactionsLoadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
      </div>
    );
  }

  const getCategory = (id?: string) => categories.find((c) => c.id === id);
  const detailAmt = detailTx
    ? detailTx.type === 'income'
      ? formatMoney(detailTx.amount, true)
      : detailTx.type === 'expense'
        ? formatMoney(-detailTx.amount)
        : formatMoney(detailTx.amount)
    : '';
  const detailAmtClass = detailTx?.type === 'income' ? 'text-success' : detailTx?.type === 'expense' ? 'text-destructive' : 'text-primary';

  return (
    <div className="space-y-4">
      {/* KPI 条 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t('finance.thisMonthIncome')} value={formatMoney(monthStats.income)} sub={t('finance.last90Days')} icon={<TrendingUp size={14} className="text-success" />} valueClass="text-success" />
        <KpiCard label={t('finance.thisMonthExpense')} value={formatMoney(monthStats.expense)} sub={t('finance.surplus') + ' ' + formatMoney(monthStats.balance)} icon={<TrendingDown size={14} className="text-destructive" />} valueClass="text-destructive" />
        <KpiCard label={t('finance.surplus')} value={formatMoney(monthStats.balance)} sub={t('finance.netWorth') + ' ' + formatMoney(netWorth)} icon={<Scale size={14} className="text-foreground" />} />
        <KpiCard label={t('finance.netWorth')} value={formatMoney(netWorth)} sub={`${accounts.length} ${t('finance.accounts')}`} icon={<Wallet size={14} className="text-brand-600" />} valueClass="text-brand-700" />
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('finance.searchNoteCategory')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg bg-muted p-1">
          {(['all', 'income', 'expense', 'transfer'] as FilterType[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterType(f)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filterType === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f === 'all' ? t('finance.filter_all') : f === 'income' ? t('finance.filter_income') : f === 'expense' ? t('finance.filter_expense') : t('finance.filter_transfer')}
            </button>
          ))}
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto">
          <option value="">{t('finance.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </Select>
        <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="w-auto">
          <option value="">{t('finance.allAccounts')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Button variant={batchMode ? 'default' : 'outline'} size="sm" onClick={() => { setBatchMode((v) => !v); setSelectedIds(new Set()); }} className="gap-1.5">
          <CheckSquare size={15} /> {t('finance.batch')}
        </Button>
      </div>

      {/* 批量操作条 */}
      {batchMode && (
        <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-700">{t('finance.selectedCount', { count: selectedIds.size })}</span>
          <Button variant="destructive" size="sm" disabled={selectedIds.size === 0} onClick={handleBulkDelete} className="gap-1.5">
            <Trash2 size={14} /> {t('finance.bulkDelete')}
          </Button>
        </div>
      )}

      {/* 明细 + 右栏 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <LedgerTable
          transactions={filtered}
          categories={categories}
          accounts={accounts}
          batchMode={batchMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenDetail={setDetailTx}
        />

        <aside className="space-y-4">
          {/* 本月预算 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Target size={16} className="text-brand-500" /> {t('finance.monthlyBudget')}
            </div>
            {currentOverall ? (
              <BudgetProgressBar name={t('finance.overallBudget')} icon="💰" spent={overallSpent} amount={currentOverall.amount} carryOver={currentOverall.carry_over || 0} />
            ) : (
              <div className="text-xs text-muted-foreground">{t('finance.noOverallBudgetSet')}</div>
            )}
          </div>

          {/* 支出分类占比 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Activity size={16} className="text-brand-500" /> {t('finance.expenseCategoriesChart')}
            </div>
            {expensePieData.length > 0 ? (
              <div className="flex flex-col items-center">
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensePieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {expensePieData.map((_, i) => (
                          <Cell key={`cell-${i}`} fill={expensePieData[i].fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatMoney(value)}
                        contentStyle={{ borderRadius: 8, fontSize: 13 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {expensePieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.fill }} />
                      <span className="truncate text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">{t('finance.noExpenseData')}</div>
            )}
          </div>

          {/* 近 7 日趋势 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Activity size={16} className="text-brand-500" /> {t('finance.trend7Days')}
            </div>
            <div className="flex h-16 items-end gap-1.5">
              {trend7.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                  <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                    <span className="w-1.5 rounded-sm bg-success" style={{ height: `${(d.income / trendMax) * 100}%`, minHeight: d.income > 0 ? 3 : 0 }} />
                    <span className="w-1.5 rounded-sm bg-destructive" style={{ height: `${(d.expense / trendMax) * 100}%`, minHeight: d.expense > 0 ? 3 : 0 }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* 手机端：交易详情底部抽屉 */}
      <Drawer open={!!detailTx} onOpenChange={(o) => !o && setDetailTx(null)} side="bottom" ariaLabel={t('finance.detail')}>
        {detailTx && (
          <>
            <DrawerHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-lg">
                  {detailTx.type === 'transfer' ? '🔁' : getCategory(detailTx.category_id)?.icon || '📌'}
                </span>
                <DrawerTitle className={cn('font-mono text-xl tabular-nums', detailAmtClass)}>{detailAmt}</DrawerTitle>
              </div>
              <DrawerClose onClose={() => setDetailTx(null)} />
            </DrawerHeader>
            <DrawerBody>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{t('finance.category')}</div>
                  <div className="text-sm font-semibold">{(getCategory(detailTx.category_id)?.name) || t('finance.untitled')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('finance.type')}</div>
                  <div className="text-sm font-semibold">
                    {detailTx.type === 'income' ? t('finance.income') : detailTx.type === 'expense' ? t('finance.expense') : t('finance.transfer')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('finance.account')}</div>
                  <div className="text-sm font-semibold">{accounts.find((a) => a.id === detailTx.account_id)?.name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('finance.date')}</div>
                  <div className="text-sm font-semibold">{format(new Date(detailTx.date), 'yyyy-MM-dd HH:mm')}</div>
                </div>
                {detailTx.to_account_id && (
                  <div>
                    <div className="text-xs text-muted-foreground">{t('finance.toAccount')}</div>
                    <div className="text-sm font-semibold">{accounts.find((a) => a.id === detailTx.to_account_id)?.name ?? '—'}</div>
                  </div>
                )}
                <div className={detailTx.to_account_id ? '' : 'col-span-2'}>
                  <div className="text-xs text-muted-foreground">{t('finance.note')}</div>
                  <div className="text-sm font-semibold">{detailTx.note || '—'}</div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => handleEdit(detailTx)}>
                  <Pencil size={15} /> {t('common.edit')}
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(detailTx)}>
                  <Trash2 size={15} /> {t('common.delete')}
                </Button>
              </div>
            </DrawerBody>
          </>
        )}
      </Drawer>

      {/* 编辑弹窗 */}
      <DialogEdit tx={editingTx} onClose={() => setEditingTx(null)} />
    </div>
  );
}

function DialogEdit({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!tx) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">{t('finance.editTransaction')}</h2>
          <button onClick={onClose} aria-label="close" className="rounded-sm opacity-70 hover:opacity-100">
            <span className="text-xl leading-none">×</span>
          </button>
        </div>
        <div className="p-4">
          <TransactionForm transaction={tx} onSuccess={onClose} />
        </div>
      </div>
    </div>
  );
}
