import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useCreateTransaction, useUpdateTransaction, useCategories, useAccounts } from './useFinance';
import { getCurrentUserId } from '@/features/auth/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import type { Transaction, TransactionType } from '@/types';

const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.number().min(0.01),
    account_id: z.string().min(1),
    to_account_id: z.string().optional(),
    category_id: z.string().optional(),
    date: z.string().min(1),
    note: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'transfer') {
      if (!data.to_account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '',
          path: ['to_account_id'],
        });
      } else if (data.to_account_id === data.account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '',
          path: ['to_account_id'],
        });
      }
    }
  });

type TransactionFormData = z.infer<typeof transactionSchema>;

interface TransactionFormProps {
  transaction?: Transaction;
  onSuccess?: () => void;
  defaultType?: TransactionType;
}

export function TransactionForm({ transaction, onSuccess, defaultType = 'expense' }: TransactionFormProps) {
  const { t } = useTranslation();
  const isEdit = !!transaction;
  const [activeType, setActiveType] = useState<TransactionType>(transaction?.type ?? defaultType);
  const [quickMode, setQuickMode] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null | undefined>(transaction?.receipt_url);
  const [uploading, setUploading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: transaction
      ? {
          type: transaction.type,
          amount: transaction.amount,
          account_id: transaction.account_id,
          to_account_id: transaction.to_account_id ?? '',
          category_id: transaction.category_id ?? '',
          date: transaction.date,
          note: transaction.note ?? '',
        }
      : {
          type: defaultType,
          amount: 0,
          date: format(new Date(), 'yyyy-MM-dd'),
          note: '',
        },
  });

  const defaultAccountId = useMemo(() => {
    if (!accounts.length) return '';
    return (
      accounts.find((a) => a.name === t('finance.noCashWallet')) ??
      accounts.find((a) => a.type === 'cash')
    )?.id ?? '';
  }, [accounts, t]);

  useEffect(() => {
    if (isEdit || activeType === 'transfer' || !defaultAccountId) return;
    if (!getValues('account_id')) setValue('account_id', defaultAccountId);
  }, [defaultAccountId, activeType, isEdit, setValue, getValues]);

  const watchedAmount = watch('amount');

  const filteredCategories = categories.filter((c) => c.type === activeType);

  const categoriesById = useMemo(() => {
    const map: Record<string, (typeof categories)[number]> = {};
    categories.forEach((c) => (map[c.id] = c));
    return map;
  }, [categories]);

  const categoryLabel = (c: (typeof categories)[number]) => {
    const parts: string[] = [];
    let cur: (typeof categories)[number] | undefined = c;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? categoriesById[cur.parent_id] : undefined;
    }
    return parts.join(' / ');
  };

  const handleTypeChange = (type: TransactionType) => {
    setActiveType(type);
    setValue('type', type);
    if (type === 'transfer') {
      setValue('category_id', '');
    }
  };

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  const onSubmit = (data: TransactionFormData) => {
    const userId = getCurrentUserId();
    const payload: Partial<Transaction> = {
      type: data.type,
      amount: data.amount,
      account_id: data.account_id,
      date: data.date,
      note: data.note,
      user_id: userId,
      receipt_url: receiptUrl ?? null,
      category_id: data.type === 'transfer' ? undefined : data.category_id || undefined,
      to_account_id: data.type === 'transfer' ? data.to_account_id : undefined,
    };

    if (isEdit && transaction) {
      updateTransaction.mutate(
        { id: transaction.id, data: payload },
        { onSuccess: () => onSuccess?.() }
      );
      return;
    }

    createTransaction.mutate(payload, {
      onSuccess: () => {
        reset({
          type: activeType,
          amount: 0,
          date: format(new Date(), 'yyyy-MM-dd'),
          note: '',
          account_id: activeType === 'transfer' ? '' : defaultAccountId,
          to_account_id: '',
          category_id: '',
        });
        setReceiptUrl(undefined);
        onSuccess?.();
      },
    });
  };

  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setReceiptError(null);
    try {
      const { isTauri } = await import("@/lib/tauri");
      if (!isTauri()) throw new Error(t('sync.desktopOnly'));
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const dataUrl = String(reader.result ?? "");
          resolve(dataUrl.split(',')[1] ?? "");
        };
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsDataURL(file);
      });
      const ext = file.name.split('.').pop() ?? 'png';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { invoke } = await import("@tauri-apps/api/core");
      const saved = await invoke<string>("receipt_save", { dataBase64: base64, filename });
      setReceiptUrl(saved);
    } catch (err: unknown) {
      setReceiptError(err instanceof Error ? err.message : t('finance.receiptUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const viewReceipt = async () => {
    if (!receiptUrl) return;
    try {
      const { isTauri } = await import("@/lib/tauri");
      if (!isTauri()) throw new Error(t('sync.desktopOnly'));
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("receipt_open", { filename: receiptUrl });
    } catch (err: unknown) {
      setReceiptError(err instanceof Error ? err.message : t('finance.receiptUploadFailed'));
    }
  };

  const handleQuickInput = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setValue('amount', num);
    }
  };

  const getErrorMessage = (field: 'amount' | 'account_id' | 'to_account_id' | 'date') => {
    if (!errors[field]) return null;
    const msg = errors[field].message;
    if (!msg) {
      if (field === 'amount') return t('finance.amountMustBePositive');
      if (field === 'account_id') return t('finance.selectAccount');
      if (field === 'to_account_id') {
        const val = getValues('to_account_id');
        const src = getValues('account_id');
        if (!val) return t('finance.selectTargetAccount');
        if (val === src) return t('finance.targetAccountSameAsSource');
      }
      if (field === 'date') return t('finance.selectDate');
    }
    return msg;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 border rounded-lg bg-card">
      <h3 className="font-semibold text-lg">{isEdit ? t('finance.editTransaction') : t('finance.addTransaction')}</h3>

      {/* Type Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleTypeChange(type)}
            className={cn(
              'flex-1 py-2 text-sm rounded-md transition-colors',
              activeType === type
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {type === 'expense' ? t('finance.expense') : type === 'income' ? t('finance.income') : t('finance.transfer')}
          </button>
        ))}
      </div>

      {/* Amount Input */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('finance.amount')}</label>
        <Input
          type="number"
          step="0.01"
          placeholder="0.00"
          {...register('amount', { valueAsNumber: true })}
          className="text-2xl font-bold"
        />
        {errors.amount && <p className="text-xs text-destructive">{getErrorMessage('amount')}</p>}
      </div>

      {/* Quick Mode */}
      {quickMode && (
        <div className="grid grid-cols-3 gap-2">
          {['10', '20', '50', '100', '200', '500'].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => handleQuickInput(val)}
              className="py-3 border rounded-md hover:bg-muted transition-colors font-medium"
            >
              ¥{val}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setQuickMode(!quickMode)}
        className="text-xs text-primary hover:underline"
      >
        {quickMode ? t('finance.closeQuickEntry') : t('finance.openQuickEntry')}
      </button>

      {/* Category Picker */}
      {activeType !== 'transfer' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('finance.category')}</label>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 sm:gap-2">
            {filteredCategories.map((c) => {
              const selected = watch('category_id') === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setValue('category_id', c.id)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-lg p-1 transition-all text-center min-h-[52px] sm:min-h-[56px]',
                    selected
                      ? 'bg-brand-50 ring-1 ring-brand-300 text-brand-700'
                      : 'hover:bg-muted/70 text-muted-foreground'
                  )}
                >
                  <span className="text-lg leading-none">{c.icon ?? '📌'}</span>
                  <span className="text-[10px] sm:text-[11px] leading-tight line-clamp-2 w-full">{categoryLabel(c)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Account */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {activeType === 'transfer' ? t('finance.fromAccount') : t('finance.account')}
        </label>
        <Select {...register('account_id')}>
          <option value="">{t('finance.chooseAccount')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '💳'} {a.name}
            </option>
          ))}
        </Select>
        {errors.account_id && <p className="text-xs text-destructive">{getErrorMessage('account_id')}</p>}
      </div>

      {/* To Account (for transfer) */}
      {activeType === 'transfer' && (
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('finance.toAccount')}</label>
          <Select {...register('to_account_id')}>
            <option value="">{t('finance.chooseTargetAccount')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '💳'} {a.name}
              </option>
            ))}
          </Select>
          {errors.to_account_id && (
            <p className="text-xs text-destructive">{getErrorMessage('to_account_id')}</p>
          )}
        </div>
      )}

      {/* Date */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('finance.date')}</label>
        <Input type="date" {...register('date')} />
        {errors.date && <p className="text-xs text-destructive">{getErrorMessage('date')}</p>}
      </div>

      {/* Note */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('finance.note')}</label>
        <Input type="text" placeholder={t('common.optional')} {...register('note')} />
      </div>

      {/* Receipt */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('finance.receipt')}</label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={handleReceipt}
            disabled={uploading}
            className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
          {receiptUrl && (
            <button
              type="button"
              onClick={viewReceipt}
              className="text-xs text-primary underline whitespace-nowrap"
            >
              {t('finance.viewReceipt')}
            </button>
          )}
        </div>
        {uploading && <p className="text-xs text-muted-foreground">{t('finance.uploading')}</p>}
        {receiptError && <p className="text-xs text-destructive">{receiptError}</p>}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('finance.saving') : isEdit ? t('common.update') : t('common.save')}
      </Button>

      {watchedAmount > 0 && (
        <div className="text-center text-sm text-muted-foreground pt-2 border-t">
          {t('finance.currentAmount')}：<span className="font-bold text-foreground">{formatMoney(watchedAmount)}</span>
        </div>
      )}
    </form>
  );
}
