import { useState, useMemo, useEffect } from 'react';
import { useSearch } from '@tanstack/react-router';
import {
  useTransactions,
  useAccounts,
  useCategories,
  useBudgets,
  useDeleteTransaction,
} from './useFinance';
import { TransactionForm } from './TransactionForm';
import { TransactionItem } from './TransactionItem';
import { BudgetProgressBar } from './BudgetProgressBar';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirm } from '@/lib/confirm';
import { formatMoney, sumMoney, roundMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  Wallet,
  Target,
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import type { Transaction } from '@/types';
import { CHART_COLORS, INCOME_COLOR, EXPENSE_COLOR } from './constants';

export function FinanceOverview() {
  const { data: transactions = [], isLoading, isError, refetch } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const deleteTransaction = useDeleteTransaction();

  const { focus } = useSearch({ from: '/app/finance' });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (focus) {
      const tx = transactions.find((t) => t.id === focus);
      if (tx) setEditingTransaction(tx);
    }
  }, [focus, transactions]);

  const { last90Expense, avgMonthlyExpense } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const sum = transactions
      .filter((t) => t.type === 'expense' && new Date(t.date) >= cutoff)
      .reduce((s, t) => s + t.amount, 0);
    return { last90Expense: sum, avgMonthlyExpense: sum / 3 };
  }, [transactions]);

  const curMonthStr = format(new Date(), 'yyyy-MM');
  const currentYearMonth = parseInt(format(new Date(), 'yyyyMM'));

  const monthStats = useMemo(() => {
    const monthTx = transactions.filter((t) => t.date.startsWith(curMonthStr));
    const income = sumMoney(monthTx.filter((t) => t.type === 'income').map((t) => t.amount));
    const expense = sumMoney(monthTx.filter((t) => t.type === 'expense').map((t) => t.amount));
    return { income, expense, balance: roundMoney(income - expense) };
  }, [transactions, curMonthStr]);

  const currentOverall = useMemo(
    () => budgets.find((b) => b.scope === 'overall' && b.year_month === currentYearMonth),
    [budgets, currentYearMonth]
  );
  const currentCategoryBudgets = useMemo(
    () => budgets.filter((b) => b.scope === 'category' && b.year_month === currentYearMonth),
    [budgets, currentYearMonth]
  );

  const { overallSpent, catSpending } = useMemo(() => {
    const spend: Record<string, number> = {};
    let total = 0;
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(curMonthStr))
      .forEach((t) => {
        const amount = t.amount;
        if (t.category_id) spend[t.category_id] = (spend[t.category_id] || 0) + amount;
        total += amount;
      });
    return { catSpending: spend, overallSpent: total };
  }, [transactions, curMonthStr]);

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.date.startsWith(curMonthStr)),
    [transactions, curMonthStr]
  );

  const monthlyData = useMemo(
    () => [
      { name: '收入', amount: monthStats.income },
      { name: '支出', amount: monthStats.expense },
    ],
    [monthStats]
  );

  const categoryData = useMemo(
    () =>
      categories
        .filter((c) => c.type === 'expense')
        .map((cat) => ({
          name: cat.name,
          value: sumMoney(
            monthTransactions.filter((t) => t.type === 'expense' && t.category_id === cat.id).map((t) => t.amount)
          ),
        }))
        .filter((d) => d.value > 0),
    [categories, monthTransactions]
  );

  const trendData = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const y = date.getFullYear();
        const m = date.getMonth();
        const d = date.getDate();
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTransactions = transactions.filter((t) => t.date === dateStr);
        return {
          date: `${m + 1}/${d}`,
          income: sumMoney(dayTransactions.filter((t) => t.type === 'income').map((t) => t.amount)),
          expense: sumMoney(dayTransactions.filter((t) => t.type === 'expense').map((t) => t.amount)),
        };
      }),
    [transactions]
  );

  const groupedByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    [...monthTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((t) => {
        const dateKey = t.date;
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(t);
      });
    return groups;
  }, [monthTransactions]);

  const getCategory = (id?: string) => categories.find((c) => c.id === id);
  const getAccount = (id: string) => accounts.find((a) => a.id === id);

  const handleDelete = async (t: Transaction) => {
    const ok = await confirm({
      title: "删除交易记录",
      description: "确定要删除这条交易记录吗？",
      confirmText: "删除",
      destructive: true,
    });
    if (ok) deleteTransaction.mutate(t.id);
  };

  if (isLoading) return <LoadingState rows={4} />;

  if (isError) {
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">数据加载失败</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero: 月均消费 + 当月收支 */}
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-primary to-brand-600 p-4 text-white shadow-sm sm:p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm opacity-90">月均消费</div>
            <div className="mt-1 font-mono text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              {formatMoney(avgMonthlyExpense)}
            </div>
            <div className="mt-2 text-xs font-medium text-white/90 sm:mt-3">
              近 90 天支出合计 {formatMoney(last90Expense)} ÷ 3
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-lg bg-white/10 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
              <div className="text-[10px] opacity-80 sm:text-xs">本月收入</div>
              <div className="font-mono text-sm font-semibold sm:text-lg">{formatMoney(monthStats.income)}</div>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
              <div className="text-[10px] opacity-80 sm:text-xs">本月支出</div>
              <div className="font-mono text-sm font-semibold sm:text-lg">{formatMoney(monthStats.expense)}</div>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
              <div className="text-[10px] opacity-80 sm:text-xs">结余</div>
              <div className={cn('font-mono text-sm font-semibold sm:text-lg', monthStats.balance >= 0 ? 'text-white' : 'text-white/90')}>
                {formatMoney(monthStats.balance)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 左右两栏布局 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 左栏：交易明细 */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <Wallet size={16} className="text-brand-500" />
                交易明细
              </div>
              <span className="text-xs text-muted-foreground">{format(new Date(), 'yyyy年M月')}</span>
            </div>
            {Object.keys(groupedByDate).length === 0 ? (
              <EmptyState icon={Wallet} title="本月还没有交易" description="点击右下角按钮记一笔吧" />
            ) : (
              <div className="max-h-[560px] overflow-y-auto pr-1">
                {Object.entries(groupedByDate).map(([dateKey, txns]) => (
                  <div key={dateKey} className="space-y-2 py-2">
                    <div className="sticky top-0 z-10 bg-card/95 py-1 text-sm font-medium text-muted-foreground backdrop-blur">
                      {format(new Date(dateKey), 'M月d日 EEEE', { locale: zhCN })}
                    </div>
                    <div className="space-y-2">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右栏：预算 + 报表 */}
        <div className="space-y-4">
          {/* 当月预算 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 font-medium">
              <Target size={16} className="text-brand-500" />
              当月预算
            </div>
            <div className="space-y-4">
              {currentOverall ? (
                <BudgetProgressBar
                  name="全部支出"
                  icon="💰"
                  spent={overallSpent}
                  amount={currentOverall.amount}
                  carryOver={currentOverall.carry_over || 0}
                />
              ) : (
                <div className="text-sm text-muted-foreground">尚未设置本月整体预算</div>
              )}
              {currentCategoryBudgets.length > 0 && (
                <div className="space-y-3">
                  {currentCategoryBudgets.map((b) => {
                    const cat = getCategory(b.category_id ?? '');
                    const spent = catSpending[b.category_id ?? ''] || 0;
                    return (
                      <BudgetProgressBar
                        key={b.id}
                        name={cat?.name || '未分类'}
                        icon={cat?.icon || '📊'}
                        spent={spent}
                        amount={b.amount}
                        carryOver={b.carry_over || 0}
                      />
                    );
                  })}
                </div>
              )}
              {currentCategoryBudgets.length === 0 && !currentOverall && (
                <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  暂无预算，可到「预算」标签管理
                </div>
              )}
            </div>
          </div>

          {/* 月度收支对比 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 font-medium">
              <BarChart3 size={16} className="text-brand-500" />
              月度收支
            </div>
            <div className="h-32 sm:h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => `¥${v.toFixed(2)}`}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                    <Cell fill={INCOME_COLOR} />
                    <Cell fill={EXPENSE_COLOR} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 支出分类占比 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 font-medium">
              <PieIcon size={16} className="text-brand-500" />
              支出分类
            </div>
            <div className="h-32 sm:h-44">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `¥${v.toFixed(2)}`}
                      contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  本月暂无支出数据
                </div>
              )}
            </div>
          </div>

          {/* 收支趋势 */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 font-medium">
              <TrendingUp size={16} className="text-brand-500" />
              近 7 天趋势
            </div>
            <div className="h-32 sm:h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="income" stroke={INCOME_COLOR} strokeWidth={2} dot={{ r: 3 }} name="收入" />
                  <Line type="monotone" dataKey="expense" stroke={EXPENSE_COLOR} strokeWidth={2} dot={{ r: 3 }} name="支出" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

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
