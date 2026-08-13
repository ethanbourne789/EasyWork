import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { Transaction } from '@/types';

interface TransactionItemProps {
  transaction: Transaction;
  getCategory: (id?: string) => { name?: string; icon?: string } | undefined;
  getAccount: (id: string) => { name?: string } | undefined;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}

export function TransactionItem({
  transaction: t,
  getCategory,
  getAccount,
  onEdit,
  onDelete,
}: TransactionItemProps) {
  const { t: translate } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const category = getCategory(t.category_id);
  const account = getAccount(t.account_id);

  const amountClass =
    t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-destructive' : 'text-primary';
  const amountSign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm transition-colors hover:bg-accent/40">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 p-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base">
          {category?.icon || '📌'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">
            {t.note || category?.name || translate('finance.untitled')}
          </div>
          <div className="truncate text-xs text-muted-foreground leading-tight">
            {account?.name ?? '—'}
            {t.to_account_id ? ` → ${getAccount(t.to_account_id)?.name ?? ''}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('font-mono text-xs font-semibold tabular-nums', amountClass)}>
            {amountSign}{formatMoney(t.amount)}
          </span>
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/30 p-2.5 text-xs">
          <div className="grid grid-cols-2 gap-y-1.5">
            <TxDetail label={translate('finance.type')} value={t.type === 'income' ? translate('finance.income') : t.type === 'expense' ? translate('finance.expense') : translate('finance.transfer')} />
            <TxDetail label={translate('finance.category')} value={category?.name || translate('finance.noCategory')} />
            <TxDetail label={translate('finance.account')} value={account?.name ?? '—'} />
            <TxDetail
              label={translate('finance.toAccount')}
              value={t.to_account_id ? getAccount(t.to_account_id)?.name ?? '—' : '—'}
            />
            <TxDetail label={translate('finance.date')} value={format(new Date(t.date), 'yyyy-MM-dd')} />
            <TxDetail label={translate('finance.note')} value={t.note || '—'} />
          </div>
          <div className="mt-2 flex justify-end gap-2 border-t pt-2">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => onEdit(t)}>
              <Pencil size={14} /> {translate('common.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(t)}
            >
              <Trash2 size={14} /> {translate('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TxDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}：</span>
      <span>{value}</span>
    </div>
  );
}
