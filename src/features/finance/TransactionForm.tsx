import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useCreateTransaction, useUpdateTransaction, useCategories, useAccounts } from './useFinance';
import { getCurrentUserId } from '@/features/auth/authStore';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import type { Transaction, TransactionType } from '@/types';

const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.number().min(0.01, '金额必须大于0'),
    account_id: z.string().min(1, '请选择账户'),
    to_account_id: z.string().optional(),
    category_id: z.string().optional(),
    date: z.string().min(1, '请选择日期'),
    note: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'transfer') {
      if (!data.to_account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '请选择转入账户',
          path: ['to_account_id'],
        });
      } else if (data.to_account_id === data.account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '转入账户不能与转出账户相同',
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
      accounts.find((a) => a.name === '现金钱包') ??
      accounts.find((a) => a.type === 'cash')
    )?.id ?? '';
  }, [accounts]);

  useEffect(() => {
    if (isEdit || activeType === 'transfer' || !defaultAccountId) return;
    if (!getValues('account_id')) setValue('account_id', defaultAccountId);
  }, [defaultAccountId, activeType, isEdit, setValue, getValues]);

  const watchedAmount = watch('amount');

  const filteredCategories = categories.filter((c) => c.type === activeType);

  // 多级分类的「父 / 子」完整路径标签
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

  // 收据上传（落到 receipt-photos 私有桶，按 <user_id>/ 前缀隔离；失败不影响保存）
  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setReceiptError(null);
    try {
      const userId = getCurrentUserId();
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('receipt-photos')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      setReceiptUrl(path);
    } catch (err: unknown) {
      setReceiptError(err instanceof Error ? err.message : '收据上传失败');
    } finally {
      setUploading(false);
    }
  };

  const viewReceipt = async () => {
    if (!receiptUrl) return;
    const { data } = await supabase.storage.from('receipt-photos').createSignedUrl(receiptUrl, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const handleQuickInput = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setValue('amount', num);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 border rounded-lg bg-card">
      <h3 className="font-semibold text-lg">{isEdit ? '编辑交易' : '记账'}</h3>

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
            {type === 'expense' ? '支出' : type === 'income' ? '收入' : '转账'}
          </button>
        ))}
      </div>

      {/* Amount Input */}
      <div className="space-y-1">
        <label className="text-sm font-medium">金额</label>
        <Input
          type="number"
          step="0.01"
          placeholder="0.00"
          {...register('amount', { valueAsNumber: true })}
          className="text-2xl font-bold"
        />
        {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
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
        {quickMode ? '关闭快速记账' : '开启快速记账'}
      </button>

      {/* Category Picker — icon grid for income/expense, supports hierarchy */}
      {activeType !== 'transfer' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">分类</label>
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
          {activeType === 'transfer' ? '转出账户' : '账户'}
        </label>
        <Select {...register('account_id')}>
          <option value="">选择账户</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '💳'} {a.name}
            </option>
          ))}
        </Select>
        {errors.account_id && <p className="text-xs text-destructive">{errors.account_id.message}</p>}
      </div>

      {/* To Account (for transfer) */}
      {activeType === 'transfer' && (
        <div className="space-y-1">
          <label className="text-sm font-medium">转入账户</label>
          <Select {...register('to_account_id')}>
            <option value="">选择目标账户</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '💳'} {a.name}
              </option>
            ))}
          </Select>
          {errors.to_account_id && (
            <p className="text-xs text-destructive">{errors.to_account_id.message}</p>
          )}
        </div>
      )}

      {/* Date */}
      <div className="space-y-1">
        <label className="text-sm font-medium">日期</label>
        <Input type="date" {...register('date')} />
      </div>

      {/* Note */}
      <div className="space-y-1">
        <label className="text-sm font-medium">备注</label>
        <Input type="text" placeholder="可选" {...register('note')} />
      </div>

      {/* Receipt */}
      <div className="space-y-1">
        <label className="text-sm font-medium">收据（可选）</label>
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
              查看
            </button>
          )}
        </div>
        {uploading && <p className="text-xs text-muted-foreground">上传中...</p>}
        {receiptError && <p className="text-xs text-destructive">{receiptError}</p>}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? '保存中...' : isEdit ? '更新' : '保存'}
      </Button>

      {watchedAmount > 0 && (
        <div className="text-center text-sm text-muted-foreground pt-2 border-t">
          当前金额：<span className="font-bold text-foreground">{formatMoney(watchedAmount)}</span>
        </div>
      )}
    </form>
  );
}
