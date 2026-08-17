import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBudgets,
  useCategories,
  useTransactions,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from './useFinance';
import { fireBudgetWarnings } from '@/lib/notify';
import { getBudgetWarnedAt, setBudgetWarnedAt } from '@/lib/storage';
import { formatMoney, roundMoney } from '@/lib/money';
import { getCurrentUserId } from '@/features/auth/authStore';
import { MS_PER_DAY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirm } from '@/lib/confirm';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Repeat, PiggyBank, Target } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Budget } from '@/types';

const currentMonthStr = () => format(new Date(), 'yyyy-MM');
const prevMonthInfo = () => {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return {
    str: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
    ym: prev.getFullYear() * 100 + (prev.getMonth() + 1),
  };
};

export function BudgetList() {
  const { t } = useTranslation();
  const { data: budgets = [], isLoading, isError, refetch } = useBudgets();
  const { data: categories = [] } = useCategories();
  const { data: transactions = [] } = useTransactions();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();

  const [showCatDialog, setShowCatDialog] = useState(false);
  const [showOverallDialog, setShowOverallDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCatBudget, setNewCatBudget] = useState({ category_id: '', amount: 0 });
  const [overallAmount, setOverallAmount] = useState(0);

  const currentYearMonth = parseInt(format(new Date(), 'yyyyMM'));
  const curMonth = currentMonthStr();
  const prev = prevMonthInfo();
  const [rolling, setRolling] = useState(false);

  const currentCategoryBudgets = useMemo(
    () => budgets.filter((b) => b.scope === 'category' && b.year_month === currentYearMonth),
    [budgets, currentYearMonth],
  );
  const currentOverall = useMemo(
    () => budgets.find((b) => b.scope === 'overall' && b.year_month === currentYearMonth),
    [budgets, currentYearMonth],
  );

  const { catSpending, overallSpent } = useMemo(() => {
    const spendCents: Record<string, number> = {};
    let totalCents = 0;
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(curMonth))
      .forEach((t) => {
        const c = Math.round(t.amount * 100);
        if (t.category_id) spendCents[t.category_id] = (spendCents[t.category_id] || 0) + c;
        totalCents += c;
      });
    const spend: Record<string, number> = {};
    for (const k in spendCents) spend[k] = spendCents[k] / 100;
    return { catSpending: spend, overallSpent: totalCents / 100 };
  }, [transactions, curMonth]);

  const { prevCatSpending, prevOverallSpent, prevBudgets } = useMemo(() => {
    const spend: Record<string, number> = {};
    let total = 0;
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(prev.str))
      .forEach((t) => {
        if (t.category_id) spend[t.category_id] = (spend[t.category_id] || 0) + t.amount;
        total += t.amount;
      });
    return {
      prevCatSpending: spend,
      prevOverallSpent: total,
      prevBudgets: budgets.filter((b) => b.year_month === prev.ym),
    };
  }, [transactions, prev, budgets]);

  const getProgressColor = (spent: number, effective: number) => {
    if (effective <= 0) return 'bg-muted-foreground/40';
    const ratio = spent / effective;
    if (ratio >= 1) return 'bg-destructive';
    if (ratio >= 0.8) return 'bg-warning';
    return 'bg-success';
  };

  const getCategory = (id: string) => categories.find((c) => c.id === id);

  const openCreateCatDialog = () => {
    setEditingId(null);
    setNewCatBudget({ category_id: '', amount: 0 });
    setShowCatDialog(true);
  };

  const openEditCatDialog = (budget: Budget) => {
    setEditingId(budget.id);
    setNewCatBudget({ category_id: budget.category_id ?? '', amount: budget.amount });
    setShowCatDialog(true);
  };

  const openEditOverall = () => {
    setOverallAmount(currentOverall?.amount ?? 0);
    setShowOverallDialog(true);
  };

  const isSaving = createBudget.isPending || updateBudget.isPending;

  const handleSaveCatBudget = () => {
    if (!newCatBudget.category_id || newCatBudget.amount <= 0) return;
    if (editingId) {
      updateBudget.mutate({ id: editingId, data: { amount: newCatBudget.amount } }, { onSuccess: () => setShowCatDialog(false) });
      return;
    }
    createBudget.mutate(
      {
        user_id: getCurrentUserId(),
        category_id: newCatBudget.category_id,
        amount: newCatBudget.amount,
        year_month: currentYearMonth,
        scope: 'category',
        carry_over: 0,
      },
      { onSuccess: () => setShowCatDialog(false) },
    );
  };

  const handleSaveOverall = () => {
    if (overallAmount <= 0) return;
    createBudget.mutate(
      {
        user_id: getCurrentUserId(),
        category_id: null,
        amount: overallAmount,
        year_month: currentYearMonth,
        scope: 'overall',
        carry_over: 0,
      },
      { onSuccess: () => setShowOverallDialog(false) },
    );
  };

  const handleDeleteBudget = async (budget: Budget) => {
    const label = budget.scope === 'overall' ? t('finance.overallBudget') : getCategory(budget.category_id ?? '')?.name ?? t('finance.untitled');
    const ok = await confirm({
      title: t('finance.deleteBudget'),
      description: t('finance.deleteBudgetConfirm', { name: label }),
      confirmText: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteBudget.mutate(budget.id);
  };

  const applyRollover = async () => {
    setRolling(true);
    try {
      const overallPrev = prevBudgets.find((b) => b.scope === 'overall');
      const targets: Budget[] = currentOverall ? [currentOverall, ...currentCategoryBudgets] : [...currentCategoryBudgets];
      const buildCarry = (b: Budget): number => {
        if (b.scope === 'overall') {
          return overallPrev ? overallPrev.amount - prevOverallSpent : 0;
        }
        const prevCat = prevBudgets.find((p) => p.scope === 'category' && p.category_id === b.category_id);
        return prevCat ? prevCat.amount - (prevCatSpending[prevCat.category_id ?? ''] || 0) : 0;
      };
      const BATCH = 5;
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        await Promise.all(
          batch.map((b) =>
            updateBudget.mutateAsync({ id: b.id, data: { carry_over: buildCarry(b) } }),
          ),
        );
      }
    } finally {
      setRolling(false);
    }
  };

  const availableCategories = categories.filter(
    (c) => c.type === 'expense' && !currentCategoryBudgets.some((b) => b.category_id === c.id),
  );

  useEffect(() => {
    const lastWarned = getBudgetWarnedAt();
    const now = Date.now();
    if (!lastWarned || now - lastWarned > MS_PER_DAY) {
      fireBudgetWarnings();
      setBudgetWarnedAt(now);
    }
  }, []);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;
  if (isError)
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">{t('finance.budgetLoadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
      </div>
    );

  const BudgetCard = ({ budget, name, icon }: { budget: Budget; name: string; icon: string }) => {
    const spent = budget.scope === 'overall' ? overallSpent : catSpending[budget.category_id ?? ''] || 0;
    const effective = roundMoney(budget.amount + (budget.carry_over || 0));
    const percentage = effective > 0 ? Math.min((spent / effective) * 100, 100) : 0;
    const over = spent > effective;
    return (
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg">{icon}</span>
            <span className="truncate font-medium">{name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => (budget.scope === 'overall' ? openEditOverall() : openEditCatDialog(budget))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={t('finance.editBudget')}>
              <Pencil size={15} />
            </button>
            <button type="button" onClick={() => handleDeleteBudget(budget)} disabled={deleteBudget.isPending} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50" aria-label={t('finance.deleteBudget')}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {budget.carry_over ? (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {budget.carry_over > 0
              ? `${t('finance.carryOverSurplus')} ${formatMoney(budget.carry_over)}`
              : `${t('finance.carryOverDeficit')} ${formatMoney(Math.abs(budget.carry_over))}`}
          </div>
        ) : null}

        <div className="mt-3 flex items-end justify-between">
          <span className={cn('font-mono text-lg font-semibold', over && 'text-destructive')}>{formatMoney(spent)}</span>
          <span className="font-mono text-xs text-muted-foreground">/ {formatMoney(effective)}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all', getProgressColor(spent, effective))} style={{ width: `${percentage}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className="text-muted-foreground">{t('finance.used', { pct: percentage.toFixed(0) })}</span>
          {over ? (
            <span className="text-destructive">{t('finance.overBudget')} {formatMoney(spent - effective)}</span>
          ) : (
            <span className="text-muted-foreground">{t('finance.remaining')} {formatMoney(effective - spent)}</span>
          )}
        </div>
      </div>
    );
  };

  const monthLabel = format(new Date(), 'yyyy年M月');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{t('finance.budgetMonth', { month: monthLabel })}</h3>
        <Button variant="ghost" size="sm" onClick={applyRollover} disabled={rolling} className="gap-1">
          <Repeat size={14} />
          {rolling ? t('finance.rolling') : t('finance.rollOver')}
        </Button>
      </div>

      {/* 整体月度上限 */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Target size={15} className="text-brand-500" /> {t('finance.overallBudget')}
        </div>
        {currentOverall ? (
          <BudgetCard budget={currentOverall} name={t('finance.overallBudget')} icon="💰" />
        ) : (
          <button
            type="button"
            onClick={() => { setOverallAmount(0); setShowOverallDialog(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-5 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
          >
            <Plus size={16} /> {t('finance.setOverallBudget')}
          </button>
        )}
      </section>

      {/* 分类预算 */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <PiggyBank size={15} className="text-brand-500" /> {t('finance.categoryBudget')}
        </div>
        {currentCategoryBudgets.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card py-8 text-center text-sm text-muted-foreground">
            {t('finance.noCategoryBudget')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {currentCategoryBudgets.map((budget) => {
              const cat = getCategory(budget.category_id ?? '');
              return <BudgetCard key={budget.id} budget={budget} name={cat?.name || t('finance.untitled')} icon={cat?.icon || '📊'} />;
            })}
          </div>
        )}
        {availableCategories.length > 0 && (
          <Button onClick={openCreateCatDialog} variant="outline" className="w-full gap-2">
            <Plus size={16} /> {t('finance.addCategoryBudget')}
          </Button>
        )}
      </section>

      {/* 分类预算 Dialog */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? t('finance.editBudget') : t('finance.setBudget')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label htmlFor="budget-category" className="text-sm font-medium">{t('finance.category')}</label>
              {editingId ? (
                <Select id="budget-category" value={newCatBudget.category_id} disabled>
                  <option value={newCatBudget.category_id}>
                    {(() => { const c = getCategory(newCatBudget.category_id); return `${c?.icon} ${c?.name}`; })()}
                  </option>
                </Select>
              ) : (
                <Select id="budget-category" value={newCatBudget.category_id} onChange={(e) => setNewCatBudget({ ...newCatBudget, category_id: e.target.value })}>
                  <option value="">{t('finance.chooseCategory')}</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="budget-amount" className="text-sm font-medium">{t('finance.budgetAmount')}</label>
              <Input
                id="budget-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newCatBudget.amount || ''}
                onChange={(e) => setNewCatBudget({ ...newCatBudget, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveCatBudget} disabled={isSaving}>{isSaving ? t('finance.setting') : editingId ? t('common.save') : t('finance.set')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 整体预算 Dialog */}
      <Dialog open={showOverallDialog} onOpenChange={setShowOverallDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('finance.setOverallLimit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label htmlFor="overall-amount" className="text-sm font-medium">{t('finance.monthlyLimit')}</label>
              <Input
                id="overall-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={overallAmount || ''}
                onChange={(e) => setOverallAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverallDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveOverall} disabled={isSaving}>{isSaving ? t('finance.setting') : t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
