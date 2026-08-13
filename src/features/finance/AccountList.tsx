import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useTransactions,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
} from './useFinance';
import { computeAccountBalances } from '@/lib/finance';
import { getCurrentUserId } from '@/features/auth/authStore';
import { Button } from '@/components/ui/button';
import { confirm } from '@/lib/confirm';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, PiggyBank, ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney, sumMoney } from '@/lib/money';
import type { Account, AccountType } from '@/types';
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_TINT } from './constants';

const emptyAccountForm = { name: '', type: 'bank' as AccountType, initial_balance: 0 };

export function AccountList() {
  const { t } = useTranslation();
  const { data: accounts = [], isLoading, isError, refetch } = useAccounts();
  const { data: transactions = [] } = useTransactions();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);

  const accountBalances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions],
  );
  const totalAssets = useMemo(() => sumMoney(Object.values(accountBalances)), [accountBalances]);

  const recentTxs = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [transactions]);

  const assetAllocation = useMemo(() => {
    if (totalAssets === 0) return [];
    return accounts
      .map((acc) => ({
        id: acc.id,
        name: acc.name,
        balance: accountBalances[acc.id] || 0,
        pct: Math.round(((accountBalances[acc.id] || 0) / Math.abs(totalAssets)) * 1000) / 10,
      }))
      .filter((a) => a.balance !== 0)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [accounts, accountBalances, totalAssets]);

  const openCreateDialog = () => {
    setEditingId(null);
    setAccountForm(emptyAccountForm);
    setShowDialog(true);
  };

  const openEditDialog = (account: Account) => {
    setEditingId(account.id);
    setAccountForm({ name: account.name, type: account.type, initial_balance: account.initial_balance });
    setShowDialog(true);
  };

  const isSaving = createAccount.isPending || updateAccount.isPending;

  const handleSaveAccount = () => {
    if (!accountForm.name.trim()) return;
    if (editingId) {
      updateAccount.mutate(
        { id: editingId, data: { name: accountForm.name, type: accountForm.type, initial_balance: accountForm.initial_balance } },
        { onSuccess: () => { setShowDialog(false); setEditingId(null); setAccountForm(emptyAccountForm); } },
      );
      return;
    }
    createAccount.mutate(
      {
        user_id: getCurrentUserId(),
        name: accountForm.name,
        type: accountForm.type,
        initial_balance: accountForm.initial_balance,
        currency: 'CNY',
        sort_order: Date.now(),
      },
      { onSuccess: () => { setShowDialog(false); setAccountForm(emptyAccountForm); } },
    );
  };

  const handleDeleteAccount = async (account: Account) => {
    const related = transactions.filter((tr) => tr.account_id === account.id || tr.to_account_id === account.id).length;
    const msg =
      related > 0
        ? t('finance.deleteAccountWithTransactions', { name: account.name, count: related })
        : t('finance.deleteAccountConfirm', { name: account.name });
    const ok = await confirm({
      title: t('finance.deleteAccount'),
      description: msg,
      confirmText: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteAccount.mutate(account.id);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;
  if (isError)
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">{t('finance.accountLoadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
      </div>
    );

  const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    cash: t('finance.cash'),
    bank: t('finance.bankCard'),
    credit: t('finance.creditCard'),
  };

  return (
    <div className="space-y-4">
      {/* 总资产 Hero */}
      <div className="rounded-lg bg-gradient-to-br from-primary to-brand-600 p-5 text-primary-foreground shadow-sm sm:p-6">
        <div className="text-sm opacity-90">{t('finance.totalAssets')}</div>
        <div className={cn('mt-1 break-words font-mono text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight', totalAssets < 0 && 'text-destructive-foreground')}>
          {formatMoney(totalAssets, true)}
        </div>
        <div className="mt-2 text-xs opacity-80">{t('finance.accountsCount', { count: accounts.length })}</div>
      </div>

      {/* 账户卡片网格 */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card py-12 text-muted-foreground">
          <PiggyBank size={32} className="opacity-40" />
          <p className="text-sm">{t('finance.noAccounts')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((acc) => {
              const bal = accountBalances[acc.id] || 0;
              const Icon = ACCOUNT_TYPE_ICONS[acc.type];
              const tint = ACCOUNT_TYPE_TINT[acc.type];
              return (
                <div
                  key={acc.id}
                  className="group relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tint)}>
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{acc.name}</div>
                      <div className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[acc.type]}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEditDialog(acc)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                        aria-label={t('finance.editAccount')}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(acc)}
                        disabled={deleteAccount.isPending}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        aria-label={t('finance.deleteAccount')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'mt-3 font-mono text-xl font-semibold',
                      bal >= 0 ? 'text-foreground' : 'text-destructive',
                    )}
                  >
                    {formatMoney(bal, true)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 资产分布 */}
          {assetAllocation.length > 0 && (
            <div className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('finance.assetAllocation')}</h3>
              <div className="space-y-2.5">
                {assetAllocation.map((item) => {
                  const barWidth = Math.min(Math.abs(item.pct), 100);
                  const isNeg = item.balance < 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="w-20 truncate text-sm text-foreground">{item.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            isNeg ? 'bg-destructive/70' : 'bg-primary',
                          )}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className={cn('w-24 text-right text-xs font-mono tabular-nums', isNeg ? 'text-destructive' : 'text-foreground')}>
                        {formatMoney(item.balance, true)} · {item.pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 近期动态 */}
          {recentTxs.length > 0 && (
            <div className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <ArrowRightLeft size={14} /> {t('finance.recentActivity')}
              </h3>
              <div className="divide-y divide-border">
                {recentTxs.map((tx) => {
                  const accName = accounts.find((a) => a.id === tx.account_id)?.name ?? t('finance.unknownAccount');
                  const isIncome = tx.type === 'income';
                  const isExpense = tx.type === 'expense';
                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-2">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        isIncome ? 'bg-success/10 text-success' : isExpense ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                      )}>
                        {isIncome ? <TrendingDown size={14} /> : isExpense ? <TrendingUp size={14} /> : <ArrowRightLeft size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{tx.note || t('finance.untitled')}</div>
                        <div className="text-xs text-muted-foreground">{accName} · {tx.date}</div>
                      </div>
                      <span className={cn('shrink-0 text-sm font-mono font-semibold tabular-nums',
                        isIncome ? 'text-success' : isExpense ? 'text-destructive' : 'text-foreground'
                      )}>
                        {isIncome ? '+' : ''}{formatMoney(tx.amount, true)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Button onClick={openCreateDialog} variant="outline" className="w-full gap-2">
        <Plus size={16} /> {t('finance.addAccountBtn')}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? t('finance.editAccount') : t('finance.addAccount')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('finance.accountName')}</label>
              <Input
                type="text"
                placeholder={t('finance.accountNamePlaceholder')}
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('finance.accountType')}</label>
              <Select
                value={accountForm.type}
                onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value as AccountType })}
              >
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('finance.initialBalance')}</label>
              <Input
                type="number"
                step="0.01"
                value={accountForm.initial_balance}
                onChange={(e) => setAccountForm({ ...accountForm, initial_balance: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveAccount} disabled={isSaving}>
              {isSaving ? t('finance.saving') : editingId ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
