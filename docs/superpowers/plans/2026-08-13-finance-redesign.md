# 记账模块全面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use trae-remote-official:superpowers:subagent-driven-development (recommended) or trae-remote-official:superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面优化记账模块的 UI 设计令牌对齐、功能按钮精简、响应式布局适配、组件复用

**Architecture:** 在 `src/features/finance/` 下新增共享组件和常量文件，逐步替换 6 个 Tab 页面的硬编码值，统一使用设计令牌。最后通过浏览器工具在 5 个断点验证。

**Tech Stack:** React 19, Tailwind v4, shadcn/ui, lucide-react, recharts, date-fns

---

## File Structure

### New Files
- `src/features/finance/constants.ts` - 共享常量（图表颜色、账户类型图标映射）
- `src/features/finance/TransactionItem.tsx` - 交易卡片组件
- `src/features/finance/BudgetProgressBar.tsx` - 预算进度条组件
- `src/features/finance/EmptyState.tsx` - 统一空状态组件
- `src/features/finance/LoadingState.tsx` - 统一加载状态组件

### Modified Files
- `src/features/finance/Finance.tsx` - FAB 显示逻辑、Tab 导航
- `src/features/finance/FinanceOverview.tsx` - 设计令牌、组件替换、响应式
- `src/features/finance/TransactionList.tsx` - 组件替换、样式统一
- `src/features/finance/TransactionForm.tsx` - 样式优化
- `src/features/finance/AccountList.tsx` - 图标替换、圆角统一
- `src/features/finance/BudgetList.tsx` - 组件替换
- `src/features/finance/CategoryManager.tsx` - EmptyState 替换
- `src/features/finance/FinanceReport.tsx` - 图表颜色、响应式

---

### Task 1: 创建共享常量文件

**Files:**
- Create: `src/features/finance/constants.ts`

- [ ] **Step 1: 创建 constants.ts**

```ts
// src/features/finance/constants.ts
import { Banknote, Building2, CreditCard } from 'lucide-react';
import type { AccountType } from '@/types';

export const CHART_COLORS = [
  'oklch(56% 0.17 264)',  // brand-500
  'oklch(64% 0.15 150)',  // success
  'oklch(58% 0.21 25)',   // destructive
  'oklch(72% 0.15 55)',   // warning
  'oklch(74% 0.11 264)',  // brand-300
  'oklch(84% 0.07 264)',  // brand-200
  'oklch(49% 0.16 264)',  // brand-600
  'oklch(42% 0.14 264)',  // brand-700
];

export const INCOME_COLOR = 'oklch(64% 0.15 150)';   // success
export const EXPENSE_COLOR = 'oklch(58% 0.21 25)';   // destructive

export const ACCOUNT_TYPE_ICONS: Record<AccountType, typeof Banknote> = {
  cash: Banknote,
  bank: Building2,
  credit: CreditCard,
};

export const ACCOUNT_TYPE_TINT: Record<AccountType, string> = {
  cash: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  bank: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  credit: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
};
```

- [ ] **Step 2: 验证导入无报错**

运行 `npx tsc --noEmit --pretty` 确认类型正确

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/constants.ts
git commit -m "feat(finance): add shared constants for chart colors and account icons"
```

---

### Task 2: 创建 EmptyState 和 LoadingState 组件

**Files:**
- Create: `src/features/finance/EmptyState.tsx`
- Create: `src/features/finance/LoadingState.tsx`

- [ ] **Step 1: 创建 EmptyState.tsx**

```ts
// src/features/finance/EmptyState.tsx
import { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card py-12 text-muted-foreground">
      <Icon size={32} className="opacity-40" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 LoadingState.tsx**

```ts
// src/features/finance/LoadingState.tsx
export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border bg-card p-4 shadow-sm"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-1/4 rounded bg-muted" />
            </div>
            <div className="h-5 w-16 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

```bash
git add src/features/finance/EmptyState.tsx src/features/finance/LoadingState.tsx
git commit -m "feat(finance): add EmptyState and LoadingState shared components"
```

---

### Task 3: 创建 TransactionItem 组件

**Files:**
- Create: `src/features/finance/TransactionItem.tsx`

- [ ] **Step 1: 创建 TransactionItem.tsx**

```ts
// src/features/finance/TransactionItem.tsx
import { useState } from 'react';
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
  compact?: boolean;
}

export function TransactionItem({
  transaction: t,
  getCategory,
  getAccount,
  onEdit,
  onDelete,
  compact = false,
}: TransactionItemProps) {
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
            {t.note || category?.name || '未分类'}
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
            <TransactionDetail label="类型" value={t.type === 'income' ? '收入' : t.type === 'expense' ? '支出' : '转账'} />
            <TransactionDetail label="分类" value={category?.name || '无'} />
            <TransactionDetail label="账户" value={account?.name ?? '—'} />
            <TransactionDetail
              label="目标账户"
              value={t.to_account_id ? getAccount(t.to_account_id)?.name ?? '—' : '—'}
            />
            <TransactionDetail label="日期" value={format(new Date(t.date), 'yyyy-MM-dd')} />
            <TransactionDetail label="备注" value={t.note || '—'} />
          </div>
          <div className="mt-2 flex justify-end gap-2 border-t pt-2">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => onEdit(t)}>
              <Pencil size={14} /> 编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(t)}
            >
              <Trash2 size={14} /> 删除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}：</span>
      <span>{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/TransactionItem.tsx
git commit -m "feat(finance): extract TransactionItem shared component"
```

---

### Task 4: 创建 BudgetProgressBar 组件

**Files:**
- Create: `src/features/finance/BudgetProgressBar.tsx`

- [ ] **Step 1: 创建 BudgetProgressBar.tsx**

```ts
// src/features/finance/BudgetProgressBar.tsx
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

  const progressColor = getProgressColor(spent, effective);

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
          className={cn('h-full rounded-full transition-all', progressColor)}
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
```

- [ ] **Step 2: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/BudgetProgressBar.tsx
git commit -m "feat(finance): extract BudgetProgressBar shared component"
```

---

### Task 5: 改造 Finance.tsx（FAB + Tab 导航）

**Files:**
- Modify: `src/features/finance/Finance.tsx`

- [ ] **Step 1: 修改 FAB 显示逻辑和 Tab 导航**

修改点：
1. 移除 FAB 的条件显示逻辑，改为所有 Tab 页都显示
2. Tab 标签在移动端不再隐藏文字（移除 `hidden sm:inline`）
3. 使用 lucide-react 图标，保持现有图标选择

```ts
// 修改 TabsList 部分 - 移除 hidden sm:inline
<TabsTrigger key={t.value} value={t.value} className="gap-1.5 whitespace-nowrap" aria-label={t.label}>
  <t.icon size={15} />
  <span className="text-sm">{t.label}</span>
</TabsTrigger>

// 修改 FAB 部分 - 移除条件判断，始终显示
<ModuleFab
  mainIcon={Plus}
  label="记一笔"
  actions={[
    { label: '记一笔支出', icon: TrendingDown, onClick: () => openForm('expense') },
    { label: '记一笔收入', icon: TrendingUp, onClick: () => openForm('income') },
    { label: '转账', icon: ArrowLeftRight, onClick: () => openForm('transfer') },
  ]}
/>
```

- [ ] **Step 2: 验证页面正常渲染**

启动开发服务器 `npm run dev`，访问 `/finance` 确认所有 Tab 可切换

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/Finance.tsx
git commit -m "refactor(finance): show FAB on all tabs and always show tab labels"
```

---

### Task 6: 改造 FinanceOverview.tsx（总览页）

**Files:**
- Modify: `src/features/finance/FinanceOverview.tsx`

- [ ] **Step 1: 全面改造 FinanceOverview**

主要修改：
1. 导入并使用 `BudgetProgressBar`, `TransactionItem`, `EmptyState`, `LoadingState`
2. 导入 `CHART_COLORS`, `INCOME_COLOR`, `EXPENSE_COLOR` 常量
3. 移除「记一笔收入/支出」按钮（FAB 已覆盖）
4. 圆角 `rounded-2xl` → `rounded-lg`
5. Hero 卡片渐变使用设计令牌
6. 图表颜色使用常量
7. 图表高度响应式 `h-32 sm:h-44`
8. 加载状态使用 `LoadingState`
9. 预算部分替换为 `BudgetProgressBar`
10. 交易明细使用 `TransactionItem`

关键代码片段：

```tsx
// 加载状态替换
if (isLoading) return <LoadingState rows={4} />;

// Hero 卡片（响应式 + 设计令牌）
<div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-primary to-brand-600 p-4 text-white shadow-sm sm:p-5">
  <div className="text-sm opacity-90">月均消费</div>
  <div className="mt-1 font-mono text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
    {formatMoney(avgMonthlyExpense)}
  </div>
  {/* ... */}
</div>

// 移除「记一笔」按钮区域
// <div className="flex flex-wrap items-center gap-2">...</div>  <-- 删除

// 预算部分替换
<BudgetProgressBar
  name={cat?.name || '未分类'}
  icon={cat?.icon || '📊'}
  spent={spent}
  amount={b.amount}
  carryOver={b.carry_over || 0}
/>

// 图表颜色使用常量
<Bar dataKey="amount" radius={[6, 6, 0, 0]}>
  {monthlyData.map((_, i) => (
    <Cell key={i} fill={i === 0 ? INCOME_COLOR : EXPENSE_COLOR} />
  ))}
</Bar>

// 图表高度响应式
<div className="h-32 sm:h-44">
  <ResponsiveContainer width="100%" height="100%">
    {/* ... */}
  </ResponsiveContainer>
</div>

// 交易明细使用 TransactionItem
<TransactionItem
  transaction={t}
  getCategory={getCategory}
  getAccount={getAccount}
  onEdit={(tx) => setEditingTransaction(tx)}
  onDelete={handleDelete}
/>
```

- [ ] **Step 2: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/FinanceOverview.tsx
git commit -m "refactor(finance): align FinanceOverview with design tokens and shared components"
```

---

### Task 7: 改造 TransactionList.tsx

**Files:**
- Modify: `src/features/finance/TransactionList.tsx`

- [ ] **Step 1: 使用共享组件替换**

主要修改：
1. 使用 `TransactionItem` 替换内联交易卡片
2. 使用 `EmptyState` 替换空状态
3. 使用 `LoadingState` 替换加载状态
4. 搜索输入框使用 shadcn `Input` 组件
5. 分类/账户筛选器使用 shadcn `Select` 组件

```tsx
// 导入
import { TransactionItem } from './TransactionItem';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { Input } from '@/components/ui/input';

// 加载/错误状态
if (isLoading) return <LoadingState rows={5} />;

// 搜索框
<Input
  placeholder="搜索备注 / 分类"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="h-9"
/>

// 空状态
<EmptyState icon={Receipt} title="暂无交易记录" />

// 交易卡片（替换内联实现）
<TransactionItem
  transaction={t}
  getCategory={getCategory}
  getAccount={getAccount}
  onEdit={(tx) => setEditingTransaction(tx)}
  onDelete={handleDelete}
/>
```

- [ ] **Step 2: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/TransactionList.tsx
git commit -m "refactor(finance): use shared components in TransactionList"
```

---

### Task 8: 改造 TransactionForm.tsx

**Files:**
- Modify: `src/features/finance/TransactionForm.tsx`

- [ ] **Step 1: 样式优化**

主要修改：
1. 表单容器圆角 `rounded-lg` → `rounded-lg` (已是)
2. 分类 picker 选中态使用 `bg-brand-50 ring-1 ring-brand-300 text-brand-700`（保持）
3. 快速记账按钮使用设计令牌
4. 确保所有交互元素 ≥ 44px 触控区

- [ ] **Step 2: 验证编译和表单功能**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/TransactionForm.tsx
git commit -m "refactor(finance): polish TransactionForm styles"
```

---

### Task 9: 改造 AccountList.tsx

**Files:**
- Modify: `src/features/finance/AccountList.tsx`

- [ ] **Step 1: 图标和圆角统一**

主要修改：
1. 使用 `ACCOUNT_TYPE_ICONS` 和 `ACCOUNT_TYPE_TINT` 常量
2. 圆角 `rounded-2xl` → `rounded-lg`
3. 空状态使用 `EmptyState`
4. 移除 emoji 图标（`💵`/`🏦`/`💳`），改用 lucide-react

```tsx
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_TINT } from './constants';
import { EmptyState } from './EmptyState';

// 账户卡片
const Icon = ACCOUNT_TYPE_ICONS[acc.type];
const tint = ACCOUNT_TYPE_TINT[acc.type];

<span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tint)}>
  <Icon size={20} />
</span>

// 空状态
<EmptyState icon={PiggyBank} title="还没有账户" description="点击下方添加" actionLabel="添加账户" onAction={openCreateDialog} />

// Hero 卡片圆角
<div className="rounded-lg bg-gradient-to-br from-primary to-brand-600 p-5 text-primary-foreground shadow-sm sm:p-6">
```

- [ ] **Step 2: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/AccountList.tsx
git commit -m "refactor(finance): align AccountList with design tokens"
```

---

### Task 10: 改造 BudgetList.tsx

**Files:**
- Modify: `src/features/finance/BudgetList.tsx`

- [ ] **Step 1: 使用 BudgetProgressBar**

主要修改：
1. 使用 `BudgetProgressBar` 替换内联预算卡片
2. 圆角统一 `rounded-lg`
3. 保留创建/编辑/删除对话框逻辑

```tsx
import { BudgetProgressBar } from './BudgetProgressBar';

// 替换 BudgetCard 组件为 BudgetProgressBar
<BudgetProgressBar
  name={cat?.name || '未分类'}
  icon={cat?.icon || '📊'}
  spent={spent}
  amount={budget.amount}
  carryOver={budget.carry_over || 0}
/>
```

- [ ] **Step 2: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 3: Commit**

```bash
git add src/features/finance/BudgetList.tsx
git commit -m "refactor(finance): use BudgetProgressBar in BudgetList"
```

---

### Task 11: 改造 CategoryManager.tsx 和 FinanceReport.tsx

**Files:**
- Modify: `src/features/finance/CategoryManager.tsx`
- Modify: `src/features/finance/FinanceReport.tsx`

- [ ] **Step 1: CategoryManager - 空状态统一**

```tsx
import { EmptyState } from './EmptyState';

// 替换空状态
<EmptyState icon={Tags} title="暂无分类" description="点击「新建」添加" />
```

- [ ] **Step 2: FinanceReport - 图表颜色和响应式**

```tsx
import { CHART_COLORS, INCOME_COLOR, EXPENSE_COLOR } from './constants';

// 图表颜色使用常量
<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />

// 图表高度响应式
<div className="h-40 sm:h-52">
  <ResponsiveContainer width="100%" height="100%">
    {/* ... */}
  </ResponsiveContainer>
</div>

// 收入/支出线条使用语义色
<Line type="monotone" dataKey="income" stroke={INCOME_COLOR} strokeWidth={2} dot={{ r: 3 }} name="收入" />
<Line type="monotone" dataKey="expense" stroke={EXPENSE_COLOR} strokeWidth={2} dot={{ r: 3 }} name="支出" />
```

- [ ] **Step 3: 验证编译**

运行 `npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

```bash
git add src/features/finance/CategoryManager.tsx src/features/finance/FinanceReport.tsx
git commit -m "refactor(finance): align CategoryManager and FinanceReport with design tokens"
```

---

### Task 12: 运行测试

**Files:**
- Test: `src/__tests__/finance.test.ts`
- Test: `src/__tests__/money.test.ts`
- Test: `src/__tests__/TransactionForm.defaultAccount.test.tsx`

- [ ] **Step 1: 运行现有测试**

```bash
npx vitest run src/__tests__/finance.test.ts src/__tests__/money.test.ts src/__tests__/TransactionForm.defaultAccount.test.tsx
```

Expected: 所有测试通过

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit --pretty
```

Expected: 无类型错误

- [ ] **Step 3: Commit 如有修复**

```bash
git add -A
git commit -m "fix(finance): fix test failures from refactor"
```

---

### Task 13: 浏览器响应式测试

**Files:**
- 测试所有 6 个 Tab 页面在 5 个断点

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 使用浏览器工具在 5 个断点截图**

使用 `agent-browser` skill 或 Trae 内置浏览器：
1. 375px (iPhone SE) - 访问 `/finance`，切换到每个 Tab，截图
2. 768px (iPad 竖屏) - 同上
3. 1024px (iPad 横屏) - 同上
4. 1440px (标准桌面) - 同上
5. 1920px (大屏桌面) - 同上

- [ ] **Step 3: 分析截图并修复问题**

检查项：
- Tab 标签文字是否显示
- FAB 按钮是否在所有 Tab 可见
- 图表是否正常渲染
- 交易卡片是否合理布局
- 按钮触控区域是否 ≥ 44px

- [ ] **Step 4: Commit 修复**

```bash
git add -A
git commit -m "fix(finance): fix responsive layout issues found in browser testing"
```

---

## Self-Review

### Spec Coverage
| Spec 项 | 对应 Task |
|---------|-----------|
| 设计令牌对齐（颜色） | Task 1 (constants), Task 6, Task 8, Task 11 |
| 圆角统一 | Task 6, Task 9 |
| 图标统一（lucide-react） | Task 1, Task 9 |
| 功能按钮精简（FAB） | Task 5, Task 6 |
| 响应式 Tab 导航 | Task 5 |
| 响应式图表高度 | Task 6, Task 11 |
| 组件抽取（TransactionItem） | Task 3, Task 6, Task 7 |
| 组件抽取（BudgetProgressBar） | Task 4, Task 6, Task 10 |
| 组件抽取（EmptyState/LoadingState） | Task 2, Task 7, Task 9, Task 11 |
| 浏览器测试 | Task 13 |

### Placeholder Scan
- 无 TBD/TODO
- 所有代码片段完整可执行
- 所有文件路径明确

### Type Consistency
- `TransactionItem` 接口与 `Transaction` 类型一致
- `BudgetProgressBar` 使用 `roundMoney` 格式化
- `CHART_COLORS` 使用 OKLCH 格式与设计令牌一致
