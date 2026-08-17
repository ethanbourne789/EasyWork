import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import type { Transaction, Account, Category } from '@/types';

interface LedgerTableProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  batchMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: boolean) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onOpenDetail: (tx: Transaction) => void;
}

function amountDisplay(tx: Transaction) {
  if (tx.type === 'income') return { text: formatMoney(tx.amount, true), cls: 'text-success' };
  if (tx.type === 'expense') return { text: formatMoney(-tx.amount), cls: 'text-destructive' };
  return { text: formatMoney(tx.amount), cls: 'text-primary' };
}

function typeDotClass(type: Transaction['type']) {
  if (type === 'income') return 'bg-success';
  if (type === 'expense') return 'bg-destructive';
  return 'bg-primary';
}

export function LedgerTable({
  transactions,
  categories,
  accounts,
  batchMode,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onEdit,
  onDelete,
  onOpenDetail,
}: LedgerTableProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const getCategory = (id?: string) => categories.find((c) => c.id === id);
  const getAccount = (id: string) => accounts.find((a) => a.id === id);

  const allSelected = transactions.length > 0 && transactions.every((tx) => selectedIds.has(tx.id));

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
        {t('finance.noResult')}
      </div>
    );
  }

  return (
    <>
      {/* 桌面：高密度表格 */}
      {isDesktop && (
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 z-10 bg-card">
              {batchMode && (
                <th className="w-10 border-b border-border p-2.5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => onToggleAll(Boolean(c))}
                    aria-label={t('finance.selectAll')}
                  />
                </th>
              )}
              <th className="border-b border-border p-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('finance.date')}</th>
              <th className="border-b border-border p-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('finance.category')}</th>
              <th className="border-b border-border p-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('finance.account')}</th>
              <th className="border-b border-border p-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('finance.note')}</th>
              <th className="border-b border-border p-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('finance.amount')}</th>
              <th className="border-b border-border p-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('finance.type')}</th>
              <th className="w-16 border-b border-border p-2.5" />
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const cat = getCategory(tx.category_id);
              const acc = getAccount(tx.account_id);
              const toAcc = tx.to_account_id ? getAccount(tx.to_account_id) : undefined;
              const amt = amountDisplay(tx);
              const icon = tx.type === 'transfer' ? '🔁' : cat?.icon || '📌';
              const note = tx.note || cat?.name || t('finance.untitled');
              const accountText = tx.type === 'transfer'
                ? `${acc?.name ?? '—'} → ${toAcc?.name ?? '—'}`
                : acc?.name ?? '—';
              return (
                <tr key={tx.id} className={cn('group border-b border-border last:border-0 hover:bg-secondary', selectedIds.has(tx.id) && 'bg-brand-50/60')}>
                  {batchMode && (
                    <td className="p-2.5">
                      <Checkbox checked={selectedIds.has(tx.id)} onCheckedChange={() => onToggleSelect(tx.id)} aria-label={note} />
                    </td>
                  )}
                  <td className="whitespace-nowrap p-2.5 font-mono text-xs text-muted-foreground">
                    {format(new Date(tx.date), 'M/d EEEE HH:mm', { locale: zhCN })}
                  </td>
                  <td className="p-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm">{icon}</span>
                      <span className="truncate font-medium">{cat?.name || t('finance.untitled')}</span>
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate p-2.5 text-muted-foreground">{accountText}</td>
                  <td className="max-w-[200px] truncate p-2.5 font-medium">{note}</td>
                  <td className={cn('whitespace-nowrap p-2.5 text-right font-mono font-semibold tabular-nums', amt.cls)}>{amt.text}</td>
                  <td className="p-2.5">
                    <span className={cn('inline-block h-2 w-2 rounded-full', typeDotClass(tx.type))} aria-hidden />
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEdit(tx)}
                        aria-label={t('common.edit')}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(tx)}
                        aria-label={t('common.delete')}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* 手机：紧凑列表 */}
      {!isDesktop && (
      <div className="divide-y divide-border rounded-lg border bg-card shadow-sm">
        {transactions.map((tx) => {
          const cat = getCategory(tx.category_id);
          const acc = getAccount(tx.account_id);
          const amt = amountDisplay(tx);
          const icon = tx.type === 'transfer' ? '🔁' : cat?.icon || '📌';
          const note = tx.note || cat?.name || t('finance.untitled');
          const accountText = tx.type === 'transfer'
            ? `${acc?.name ?? '—'}→${tx.to_account_id ? getAccount(tx.to_account_id)?.name ?? '—' : '—'}`
            : acc?.name ?? '—';
          return (
            <button
              key={tx.id}
              type="button"
              onClick={() => onOpenDetail(tx)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{note}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {format(new Date(tx.date), 'M/d EEEE', { locale: zhCN })} · {cat?.name || t('finance.untitled')} · {accountText}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn('font-mono text-sm font-semibold tabular-nums', amt.cls)}>{amt.text}</div>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                  <span className={cn('inline-block h-1.5 w-1.5 rounded-full', typeDotClass(tx.type))} />
                  {tx.type === 'income' ? t('finance.income') : tx.type === 'expense' ? t('finance.expense') : t('finance.transfer')}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      )}
    </>
  );
}
