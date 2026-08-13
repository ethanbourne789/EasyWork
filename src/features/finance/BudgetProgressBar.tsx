import { cn } from '@/lib/utils';
import { formatMoney, roundMoney } from '@/lib/money';

interface BudgetProgressBarProps {
  name: string;
  icon: string;
  spent: number;
  amount: number;
  carryOver?: number;
}

export function BudgetProgressBar({ name, icon, spent, amount, carryOver = 0 }: BudgetProgressBarProps) {
  const effective = roundMoney(amount + carryOver);
  const percentage = effective > 0 ? Math.min((spent / effective) * 100, 100) : 0;
  const over = spent > effective;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base">
            {icon}
          </span>
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1">
          <span className={cn('font-mono text-sm font-semibold', over && 'text-destructive')}>
            {formatMoney(spent)}
          </span>
          <span className="font-mono text-xs text-muted-foreground">/ {formatMoney(effective)}</span>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', getProgressColor(spent, effective))}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{percentage.toFixed(0)}% 已使用</span>
        {over ? (
          <span className="text-destructive">超支 {formatMoney(spent - effective)}</span>
        ) : (
          <span className="text-muted-foreground">剩 {formatMoney(effective - spent)}</span>
        )}
      </div>
    </div>
  );
}

function getProgressColor(spent: number, effective: number): string {
  if (effective <= 0) return 'bg-muted-foreground/40';
  const ratio = spent / effective;
  if (ratio >= 1) return 'bg-destructive';
  if (ratio >= 0.8) return 'bg-warning';
  return 'bg-success';
}
