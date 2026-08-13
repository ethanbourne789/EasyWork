# 记账模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 EasyWork 骨架基础上实现完整记账模块：账户/分类/流水/预算四张表（含 RLS、触发器、账户余额视图、转账约束），TypeScript 类型与仓库层，TanStack Query hooks（含筛选与超支预警），账户/流水/预算/报表 UI 组件，票据照片 Storage 集成，Realtime 订阅与路由页面组装。

**Architecture:** 数据存 Supabase Postgres（RLS 按 `auth.uid()` 隔离）；前端按 `features/finance` 分层组织（types → repositories → hooks → components → page）；账户余额用 Postgres 视图 `account_balances` 聚合，超支预警前端计算；票据用 Storage bucket `receipt-photos`，路径 `user_id/transaction_id/filename`；Realtime 订阅四张表保持多设备同步。

**Tech Stack:** Tauri 2.x, Vite 7, React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui, TanStack Router v1, TanStack Query v5, Zustand v5, @supabase/supabase-js v2, Recharts v2, react-hook-form + zod, Vitest, React Testing Library。

**环境提示:** Windows + PowerShell。命令使用 `;` 分隔，不使用 `&&`。所有路径用反斜杠。本计划假设 Dashboard 骨架（Task 1-13）已完成，复用其 `src/lib/supabase.ts`、`src/lib/utils.ts`、`src/components/ui/*`、`src/router.tsx`、`src/features/auth/*`、`vitest.config.ts`、`src/test-setup.ts`。

**前置条件:**
- 骨架计划 `2026-08-06-dashboard-skeleton.md` 已完成，`/finance` 路由当前为占位组件。
- Supabase 项目已创建并执行 `0001_init_profiles.sql`。
- `.env` 中 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 已配置。

---

## File Structure

```
e:\Dev\EasyWork0807\
├─ supabase\
│  └─ migrations\
│     └─ 0003_finance.sql                      # 记账四表 + RLS + 触发器 + 视图
├─ src\
│  ├─ features\
│  │  └─ finance\
│  │     ├─ types.ts                           # Account/Category/Transaction/Budget 类型
│  │     ├─ repositories.ts                    # accountRepository/categoryRepository/transactionRepository/budgetRepository
│  │     ├─ useAccounts.ts                     # 账户列表 hook
│  │     ├─ useCategories.ts                   # 分类列表 hook
│  │     ├─ useTransactions.ts                 # 流水列表 hook（含筛选）
│  │     ├─ useBudgets.ts                      # 预算 hook + 超支预警计算
│  │     ├─ useReceiptUpload.ts                # 票据上传 hook
│  │     ├─ useFinanceRealtime.ts              # Realtime 订阅 hook
│  │     ├─ AccountCard.tsx                    # 单账户卡片
│  │     ├─ AccountList.tsx                    # 账户列表
│  │     ├─ TransactionForm.tsx                # 记账表单（收入/支出/转账切换）
│  │     ├─ TransactionList.tsx                # 流水列表（按日期分组）
│  │     ├─ BudgetProgress.tsx                 # 单预算进度条
│  │     ├─ BudgetList.tsx                     # 预算列表
│  │     ├─ FinanceReport.tsx                  # 报表（柱状/饼/折线）
│  │     └─ FinancePage.tsx                    # 记账页面组装
│  └─ __tests__\
│     └─ finance\
│        ├─ useAccounts.test.tsx
│        ├─ useCategories.test.tsx
│        ├─ useTransactions.test.tsx
│        └─ useBudgets.test.tsx
```

---

## Task 1: 数据库迁移 0003_finance.sql

**Files:**
- Create: `supabase/migrations/0003_finance.sql`

- [ ] **Step 1: 创建迁移文件头部与 accounts 表**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql
-- 记账模块迁移：账户、分类、流水、预算
-- 依赖 0001_init_profiles.sql（auth.users）

-- ============================================================
-- accounts 表：账户（现金/银行卡/信用卡）
-- ============================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'credit')),
  initial_balance numeric(12,2) not null default 0,
  currency text not null default 'CNY',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts(user_id);

alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
  on public.accounts for select
  using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own"
  on public.accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own"
  on public.accounts for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: 追加 categories 表**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- categories 表：分类（收入/支出，支持二级）
-- ============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_user_id_idx on public.categories(user_id);
create index if not exists categories_parent_id_idx on public.categories(parent_id);

alter table public.categories enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own"
  on public.categories for select
  using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own"
  on public.categories for insert
  with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own"
  on public.categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own"
  on public.categories for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 3: 追加 transactions 表**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- transactions 表：流水（收入/支出/转账）
-- ============================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(12,2) not null check (amount > 0),
  account_id uuid references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  date date not null,
  note text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_account_id_idx on public.transactions(account_id);
create index if not exists transactions_to_account_id_idx on public.transactions(to_account_id);
create index if not exists transactions_date_idx on public.transactions(date desc);

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 4: 追加 transfer 约束检查触发器**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- 转账约束触发器：transfer 时 to_account_id 非空且 category_id 为空；
-- income/expense 时 account_id 非空且 to_account_id 为空
-- ============================================================
create or replace function public.check_transaction_constraints()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'transfer' then
    if new.to_account_id is null then
      raise exception '转账必须指定 to_account_id';
    end if;
    if new.account_id is null then
      raise exception '转账必须指定 account_id（源账户）';
    end if;
    if new.account_id = new.to_account_id then
      raise exception '转账源账户与目标账户不能相同';
    end if;
    if new.category_id is not null then
      raise exception '转账不能指定分类';
    end if;
  else
    if new.account_id is null then
      raise exception '收入/支出必须指定 account_id';
    end if;
    if new.to_account_id is not null then
      raise exception '非转账类型不能指定 to_account_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_transactions on public.transactions;
create trigger trg_check_transactions
  before insert or update on public.transactions
  for each row execute function public.check_transaction_constraints();
```

- [ ] **Step 5: 追加 budgets 表**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- budgets 表：预算（按分类按月）
-- ============================================================
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  year_month int not null check (year_month >= 200001 and year_month <= 999912),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, year_month)
);

create index if not exists budgets_user_month_idx on public.budgets(user_id, year_month);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own"
  on public.budgets for select
  using (auth.uid() = user_id);

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own"
  on public.budgets for insert
  with check (auth.uid() = user_id);

drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own"
  on public.budgets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own"
  on public.budgets for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 6: 追加 updated_at 触发器（四表共用函数）**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- updated_at 自动更新触发器（四表共用）
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_budgets_updated_at on public.budgets;
create trigger trg_budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();
```

- [ ] **Step 7: 追加 account_balances 视图**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- account_balances 视图：账户实时余额
-- balance = initial_balance
--         + SUM(income.amount where account_id=this)
--         - SUM(expense.amount where account_id=this)
--         + SUM(transfer.amount where to_account_id=this)
--         - SUM(transfer.amount where account_id=this)
-- ============================================================
create or replace view public.account_balances as
select
  a.id as account_id,
  a.user_id,
  a.initial_balance
    + coalesce(inc.sum_amount, 0)
    - coalesce(exp.sum_amount, 0)
    + coalesce(tr_in.sum_amount, 0)
    - coalesce(tr_out.sum_amount, 0)
    as balance
from public.accounts a
left join (
  select account_id, sum(amount) as sum_amount
  from public.transactions
  where type = 'income'
  group by account_id
) inc on inc.account_id = a.id
left join (
  select account_id, sum(amount) as sum_amount
  from public.transactions
  where type = 'expense'
  group by account_id
) exp on exp.account_id = a.id
left join (
  select to_account_id, sum(amount) as sum_amount
  from public.transactions
  where type = 'transfer'
  group by to_account_id
) tr_in on tr_in.to_account_id = a.id
left join (
  select account_id, sum(amount) as sum_amount
  from public.transactions
  where type = 'transfer'
  group by account_id
) tr_out on tr_out.account_id = a.id;

-- 视图继承 RLS（基于底层表的 RLS），无需额外策略
grant select on public.account_balances to authenticated;
```

- [ ] **Step 8: 启用 Realtime publication**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0003_finance.sql`：

```sql

-- ============================================================
-- 启用 Realtime（多设备实时同步）
-- ============================================================
alter publication supabase_realtime add table public.accounts;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.budgets;
```

- [ ] **Step 9: 部署迁移到 Supabase**

说明：在 Supabase Dashboard 的 SQL Editor 中执行 `0003_finance.sql` 全文，或用 Supabase CLI：

Run:
```powershell
npx supabase db push
```
Expected: 迁移成功，四张表与视图创建完成。若未配置 Supabase CLI，可在 Dashboard SQL Editor 手动粘贴执行。

- [ ] **Step 10: 验证表结构（可选，在 Supabase Table Editor 检查）**

说明：登录 Supabase Dashboard → Table Editor，确认 `accounts`、`categories`、`transactions`、`budgets` 四表存在，`account_balances` 视图存在，每表 RLS 已启用（表名旁有盾牌图标）。

- [ ] **Step 11: 提交**

Run:
```powershell
git add supabase/migrations/0003_finance.sql; git commit -m "feat(finance): add 0003 migration with accounts/categories/transactions/budgets, rls, triggers, balance view, realtime"
```
Expected: commit 成功。

---

## Task 2: TypeScript 类型定义

**Files:**
- Create: `src/features/finance/types.ts`

- [ ] **Step 1: 创建类型文件**

写入 `e:\Dev\EasyWork0807\src\features\finance\types.ts`：

```ts
// 记账模块类型定义

// 账户类型
export type AccountType = "cash" | "bank" | "credit";

// 分类类型（收入/支出）
export type CategoryType = "income" | "expense";

// 流水类型
export type TransactionType = "income" | "expense" | "transfer";

// 账户
export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  currency: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 账户带实时余额（来自 account_balances 视图 join）
export interface AccountWithBalance extends Account {
  balance: number;
}

// 分类
export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 流水
export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  date: string; // ISO date 'YYYY-MM-DD'
  note: string | null;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
}

// 流水带关联名称（列表展示用）
export interface TransactionWithRelations extends Transaction {
  account_name?: string | null;
  to_account_name?: string | null;
  category_name?: string | null;
  category_icon?: string | null;
}

// 预算
export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  year_month: number; // 如 202608
  created_at: string;
  updated_at: string;
}

// 预算带关联与本月支出（用于超支预警）
export interface BudgetWithSpent extends Budget {
  category_name: string;
  category_icon: string | null;
  spent: number; // 本月该分类支出合计
  remaining: number; // amount - spent
  percent: number; // spent / amount * 100，上限 999 防止 Infinity
  overspent: boolean; // spent > amount
}

// 流水筛选条件
export interface TransactionFilter {
  account_id?: string | null;
  category_id?: string | null;
  type?: TransactionType | null;
  start_date?: string | null; // 'YYYY-MM-DD'
  end_date?: string | null;
}

// 记账表单输入（来自 react-hook-form）
export interface TransactionFormInput {
  type: TransactionType;
  amount: number;
  account_id: string;
  to_account_id?: string | null;
  category_id?: string | null;
  date: string;
  note?: string;
  receipt_url?: string | null;
}

// 预算表单输入
export interface BudgetFormInput {
  category_id: string;
  amount: number;
  year_month: number;
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误（若其它骨架文件已有错误可忽略，仅确认本文件无新错误）。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/finance/types.ts; git commit -m "feat(finance): add typescript types for account/category/transaction/budget"
```
Expected: commit 成功。

---

## Task 3: Supabase 数据访问层（repositories）

**Files:**
- Create: `src/features/finance/repositories.ts`

- [ ] **Step 1: 创建仓库层**

写入 `e:\Dev\EasyWork0807\src\features\finance\repositories.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type {
  Account,
  AccountWithBalance,
  Budget,
  BudgetFormInput,
  Category,
  Transaction,
  TransactionFilter,
  TransactionFormInput,
} from "@/features/finance/types";

// ============================================================
// 账户仓库
// ============================================================
export const accountRepository = {
  // 列表（带实时余额，通过 account_balances 视图 join）
  async list(): Promise<AccountWithBalance[]> {
    const { data, error } = await supabase
      .from("accounts")
      .select(
        "id, user_id, name, type, initial_balance, currency, sort_order, created_at, updated_at, account_balances(balance)"
      )
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...row,
      balance: row.account_balances?.balance ?? row.initial_balance,
      account_balances: undefined,
    }));
  },

  async create(input: Pick<Account, "name" | "type" | "initial_balance" | "currency" | "sort_order">): Promise<Account> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const { data, error } = await supabase
      .from("accounts")
      .insert({ ...input, user_id: userData.user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<Pick<Account, "name" | "type" | "initial_balance" | "sort_order">>): Promise<Account> {
    const { data, error } = await supabase.from("accounts").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============================================================
// 分类仓库
// ============================================================
export const categoryRepository = {
  async list(): Promise<Category[]> {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async create(input: Pick<Category, "name" | "type" | "icon" | "parent_id" | "sort_order">): Promise<Category> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const { data, error } = await supabase
      .from("categories")
      .insert({ ...input, user_id: userData.user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<Pick<Category, "name" | "icon" | "sort_order">>): Promise<Category> {
    const { data, error } = await supabase.from("categories").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============================================================
// 流水仓库
// ============================================================
export const transactionRepository = {
  // 列表（带筛选 + 关联名称）
  async list(filter: TransactionFilter = {}): Promise<Transaction[]> {
    let query = supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filter.account_id) {
      // 按账户筛选：源账户或目标账户（转账）
      query = query.or(`account_id.eq.${filter.account_id},to_account_id.eq.${filter.account_id}`);
    }
    if (filter.category_id) query = query.eq("category_id", filter.category_id);
    if (filter.type) query = query.eq("type", filter.type);
    if (filter.start_date) query = query.gte("date", filter.start_date);
    if (filter.end_date) query = query.lte("date", filter.end_date);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(input: TransactionFormInput): Promise<Transaction> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const { data, error } = await supabase
      .from("transactions")
      .insert({ ...input, user_id: userData.user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<TransactionFormInput>): Promise<Transaction> {
    const { data, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============================================================
// 预算仓库
// ============================================================
export const budgetRepository = {
  async listByMonth(year_month: number): Promise<Budget[]> {
    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("year_month", year_month)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async upsert(input: BudgetFormInput): Promise<Budget> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const { data, error } = await supabase
      .from("budgets")
      .upsert({ ...input, user_id: userData.user.id }, { onConflict: "user_id,category_id,year_month" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============================================================
// 报表聚合查询（前端按需调用）
// ============================================================
export const reportRepository = {
  // 月度收支汇总（指定年月，返回 {income, expense, transfer}）
  async monthlySummary(year_month: number): Promise<{ income: number; expense: number; transfer: number }> {
    const year = Math.floor(year_month / 100);
    const month = year_month % 100;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const { data, error } = await supabase
      .from("transactions")
      .select("type, amount")
      .gte("date", start)
      .lt("date", end);
    if (error) throw error;
    const summary = { income: 0, expense: 0, transfer: 0 };
    for (const t of data ?? []) {
      summary[t.type as keyof typeof summary] += Number(t.amount);
    }
    return summary;
  },

  // 按分类汇总支出（指定年月）
  async expenseByCategory(year_month: number): Promise<{ category_id: string; category_name: string; total: number }[]> {
    const year = Math.floor(year_month / 100);
    const month = year_month % 100;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, category_id, categories(name)")
      .eq("type", "expense")
      .gte("date", start)
      .lt("date", end);
    if (error) throw error;
    const map = new Map<string, { category_name: string; total: number }>();
    for (const t of data ?? []) {
      const cid = t.category_id as string;
      const name = (t.categories as any)?.name ?? "未分类";
      if (!map.has(cid)) map.set(cid, { category_name: name, total: 0 });
      map.get(cid)!.total += Number(t.amount);
    }
    return Array.from(map.entries()).map(([category_id, v]) => ({ category_id, ...v }));
  },

  // 近 N 月趋势（收入/支出）
  async trend(months: number): Promise<{ month: string; income: number; expense: number }[]> {
    const now = new Date();
    const result: { month: string; income: number; expense: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year_month = d.getFullYear() * 100 + (d.getMonth() + 1);
      const summary = await this.monthlySummary(year_month);
      result.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, income: summary.income, expense: summary.expense });
    }
    return result;
  },
};
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/finance/repositories.ts; git commit -m "feat(finance): add supabase repositories for account/category/transaction/budget/report"
```
Expected: commit 成功。

---

## Task 4: useAccounts hook（TDD）

**Files:**
- Create: `src/features/finance/useAccounts.ts`
- Test: `src/__tests__/finance/useAccounts.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\finance\useAccounts.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useAccounts } from "@/features/finance/useAccounts";

vi.mock("@/lib/supabase", () => {
  const mockSelect = {
    order: vi.fn().mockReturnValue({
      then: (cb: any) => cb({ data: [{ id: "a1", name: "现金", account_balances: { balance: 100 } }], error: null }),
    }),
  };
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      from: vi.fn(() => ({ select: vi.fn(() => mockSelect), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useAccounts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回账户列表带余额", async () => {
    const { result } = renderHook(() => useAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.accounts[0].balance).toBe(100);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/finance/useAccounts.test.tsx
```
Expected: FAIL，找不到 `@/features/finance/useAccounts`。

- [ ] **Step 3: 实现 useAccounts**

写入 `e:\Dev\EasyWork0807\src\features\finance\useAccounts.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountRepository } from "@/features/finance/repositories";
import type { Account, AccountWithBalance } from "@/features/finance/types";

const KEY = ["finance", "accounts"];

export function useAccounts() {
  const qc = useQueryClient();

  const query = useQuery<AccountWithBalance[]>({
    queryKey: KEY,
    queryFn: () => accountRepository.list(),
  });

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof accountRepository.create>[0]) => accountRepository.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof accountRepository.update>[1] }) =>
      accountRepository.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountRepository.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    createAccount: createMutation.mutateAsync,
    updateAccount: updateMutation.mutateAsync,
    deleteAccount: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/finance/useAccounts.test.tsx
```
Expected: PASS。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/finance/useAccounts.ts src/__tests__/finance/useAccounts.test.tsx; git commit -m "feat(finance): add useAccounts hook with tdd"
```
Expected: commit 成功。

---

## Task 5: useCategories hook（TDD）

**Files:**
- Create: `src/features/finance/useCategories.ts`
- Test: `src/__tests__/finance/useCategories.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\finance\useCategories.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useCategories } from "@/features/finance/useCategories";

vi.mock("@/lib/supabase", () => {
  const mockSelectReturn = { data: [{ id: "c1", name: "餐饮", type: "expense" }], error: null };
  const mockSelect = { order: vi.fn().mockResolvedValue(mockSelectReturn) };
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      from: vi.fn(() => ({ select: vi.fn(() => mockSelect), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCategories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回分类列表", async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.categories).toHaveLength(1);
    expect(result.current.categories[0].name).toBe("餐饮");
  });

  it("expenseCategories 过滤支出分类", async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.expenseCategories.map((c) => c.type)).toEqual(["expense"]);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/finance/useCategories.test.tsx
```
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现 useCategories**

写入 `e:\Dev\EasyWork0807\src\features\finance\useCategories.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryRepository } from "@/features/finance/repositories";
import type { Category } from "@/features/finance/types";

const KEY = ["finance", "categories"];

export function useCategories() {
  const qc = useQueryClient();

  const query = useQuery<Category[]>({
    queryKey: KEY,
    queryFn: () => categoryRepository.list(),
  });

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof categoryRepository.create>[0]) => categoryRepository.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof categoryRepository.update>[1] }) =>
      categoryRepository.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoryRepository.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const categories = query.data ?? [];
  return {
    categories,
    expenseCategories: categories.filter((c) => c.type === "expense"),
    incomeCategories: categories.filter((c) => c.type === "income"),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deleteCategory: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/finance/useCategories.test.tsx
```
Expected: PASS（2 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/finance/useCategories.ts src/__tests__/finance/useCategories.test.tsx; git commit -m "feat(finance): add useCategories hook with tdd"
```
Expected: commit 成功。

---

## Task 6: useTransactions hook（含筛选，TDD）

**Files:**
- Create: `src/features/finance/useTransactions.ts`
- Test: `src/__tests__/finance/useTransactions.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\finance\useTransactions.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTransactions } from "@/features/finance/useTransactions";

vi.mock("@/lib/supabase", () => {
  // 记录每次调用的链式筛选，便于断言
  const calls: any[] = [];
  const chain = {
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data: [{ id: "t1", type: "expense", amount: 50 }], error: null }),
  };
  Object.assign(chain, { then: (resolve: any) => Promise.resolve(chain).then(() => resolve({ data: [{ id: "t1", type: "expense", amount: 50 }], error: null })) });
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      from: vi.fn((table: string) => {
        calls.push(table);
        return {
          select: vi.fn(() => chain),
          insert: vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "t1" }, error: null }) }) })),
          update: vi.fn(() => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "t1" }, error: null }) }) }) })),
          delete: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) })),
        };
      }),
      __calls: calls,
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useTransactions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回流水列表", async () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].amount).toBe(50);
  });

  it("setFilter 切换筛选并重新查询", async () => {
    const { result, rerender } = renderHook(({ filter }) => useTransactions(filter), {
      wrapper,
      initialProps: { filter: {} as any },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ filter: { type: "income" } as any });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.transactions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/finance/useTransactions.test.tsx
```
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现 useTransactions**

写入 `e:\Dev\EasyWork0807\src\features\finance\useTransactions.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionRepository } from "@/features/finance/repositories";
import type { Transaction, TransactionFilter, TransactionFormInput } from "@/features/finance/types";

export const transactionsKey = (filter: TransactionFilter) => ["finance", "transactions", filter] as const;

export function useTransactions(filter: TransactionFilter = {}) {
  const qc = useQueryClient();

  const query = useQuery<Transaction[]>({
    queryKey: transactionsKey(filter),
    queryFn: () => transactionRepository.list(filter),
  });

  const createMutation = useMutation({
    mutationFn: (input: TransactionFormInput) => transactionRepository.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TransactionFormInput> }) =>
      transactionRepository.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionRepository.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
  });

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    createTransaction: createMutation.mutateAsync,
    updateTransaction: updateMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/finance/useTransactions.test.tsx
```
Expected: PASS（2 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/finance/useTransactions.ts src/__tests__/finance/useTransactions.test.tsx; git commit -m "feat(finance): add useTransactions hook with filter support and tdd"
```
Expected: commit 成功。

---

## Task 7: useBudgets hook + 超支预警计算（TDD）

**Files:**
- Create: `src/features/finance/useBudgets.ts`
- Test: `src/__tests__/finance/useBudgets.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\finance\useBudgets.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useBudgets, computeBudgetWithSpent } from "@/features/finance/useBudgets";
import type { Budget, Category, Transaction } from "@/features/finance/types";

vi.mock("@/lib/supabase", () => {
  const chain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ id: "b1", category_id: "c1", amount: 1000, year_month: 202608 }], error: null }),
  };
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      from: vi.fn(() => ({
        select: vi.fn(() => chain),
        upsert: vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "b1" }, error: null }) }) })),
        delete: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) })),
      })),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("computeBudgetWithSpent", () => {
  it("正常计算 percent 与 remaining", () => {
    const budget: Budget = { id: "b1", user_id: "u1", category_id: "c1", amount: 1000, year_month: 202608, created_at: "", updated_at: "" };
    const cat: Category = { id: "c1", user_id: "u1", name: "餐饮", type: "expense", icon: null, parent_id: null, sort_order: 0, created_at: "", updated_at: "" };
    const txs: Transaction[] = [
      { id: "t1", user_id: "u1", type: "expense", amount: 300, account_id: "a1", to_account_id: null, category_id: "c1", date: "2026-08-01", note: null, receipt_url: null, created_at: "", updated_at: "" },
    ];
    const r = computeBudgetWithSpent(budget, cat, txs);
    expect(r.spent).toBe(300);
    expect(r.remaining).toBe(700);
    expect(r.percent).toBe(30);
    expect(r.overspent).toBe(false);
  });

  it("超支时 overspent=true 且 percent 封顶", () => {
    const budget: Budget = { id: "b1", user_id: "u1", category_id: "c1", amount: 100, year_month: 202608, created_at: "", updated_at: "" };
    const cat: Category = { id: "c1", user_id: "u1", name: "餐饮", type: "expense", icon: null, parent_id: null, sort_order: 0, created_at: "", updated_at: "" };
    const txs: Transaction[] = [
      { id: "t1", user_id: "u1", type: "expense", amount: 150, account_id: "a1", to_account_id: null, category_id: "c1", date: "2026-08-01", note: null, receipt_url: null, created_at: "", updated_at: "" },
    ];
    const r = computeBudgetWithSpent(budget, cat, txs);
    expect(r.spent).toBe(150);
    expect(r.overspent).toBe(true);
    expect(r.percent).toBeGreaterThan(100);
  });

  it("amount=0 时不产生 Infinity", () => {
    const budget: Budget = { id: "b1", user_id: "u1", category_id: "c1", amount: 0, year_month: 202608, created_at: "", updated_at: "" };
    const cat: Category = { id: "c1", user_id: "u1", name: "餐饮", type: "expense", icon: null, parent_id: null, sort_order: 0, created_at: "", updated_at: "" };
    const r = computeBudgetWithSpent(budget, cat, []);
    expect(Number.isFinite(r.percent)).toBe(true);
  });
});

describe("useBudgets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回预算列表", async () => {
    const { result } = renderHook(() => useBudgets(202608), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.budgets).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/finance/useBudgets.test.tsx
```
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现 useBudgets（含超支预警计算）**

写入 `e:\Dev\EasyWork0807\src\features\finance\useBudgets.ts`：

```ts
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetRepository, transactionRepository } from "@/features/finance/repositories";
import type { Budget, BudgetFormInput, BudgetWithSpent, Category, Transaction } from "@/features/finance/types";

// 纯函数：计算单个预算的本月支出与超支状态（便于单元测试）
export function computeBudgetWithSpent(
  budget: Budget,
  category: Category,
  monthTransactions: Transaction[]
): BudgetWithSpent {
  const spent = monthTransactions
    .filter((t) => t.type === "expense" && t.category_id === budget.category_id)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const remaining = budget.amount - spent;
  const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : spent > 0 ? 999 : 0;
  return {
    ...budget,
    category_name: category.name,
    category_icon: category.icon,
    spent,
    remaining,
    percent,
    overspent: spent > budget.amount,
  };
}

export function useBudgets(year_month: number) {
  const qc = useQueryClient();

  const budgetsQuery = useQuery<Budget[]>({
    queryKey: ["finance", "budgets", year_month],
    queryFn: () => budgetRepository.listByMonth(year_month),
  });

  // 本月所有支出流水（用于超支计算）
  const monthTxsQuery = useQuery<Transaction[]>({
    queryKey: ["finance", "transactions", { year_month }],
    queryFn: async () => {
      const year = Math.floor(year_month / 100);
      const month = year_month % 100;
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      return transactionRepository.list({ type: "expense", start_date: start, end_date: end });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: (input: BudgetFormInput) => budgetRepository.upsert(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "budgets"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => budgetRepository.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "budgets"] }),
  });

  // 注：categories 由调用方注入以避免重复请求；这里用空数组兜底，实际在组件中用 useCategories 提供
  const budgetsWithSpent = useMemo<BudgetWithSpent[]>(() => {
    const budgets = budgetsQuery.data ?? [];
    if (budgets.length === 0) return [];
    // 这里仅返回基础结构，超支计算在组件层用 computeBudgetWithSpent + categories 完成
    return budgets.map((b) => ({
      ...b,
      category_name: "",
      category_icon: null,
      spent: 0,
      remaining: b.amount,
      percent: 0,
      overspent: false,
    }));
  }, [budgetsQuery.data]);

  return {
    budgets: budgetsQuery.data ?? [],
    budgetsWithSpent,
    monthTransactions: monthTxsQuery.data ?? [],
    isLoading: budgetsQuery.isLoading,
    isError: budgetsQuery.isError,
    error: budgetsQuery.error,
    upsertBudget: upsertMutation.mutateAsync,
    deleteBudget: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/finance/useBudgets.test.tsx
```
Expected: PASS（4 个测试通过：computeBudgetWithSpent 3 个 + useBudgets 1 个）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/finance/useBudgets.ts src/__tests__/finance/useBudgets.test.tsx; git commit -m "feat(finance): add useBudgets hook with overspend warning computation and tdd"
```
Expected: commit 成功。

---

## Task 8: AccountList / AccountCard 组件

**Files:**
- Create: `src/features/finance/AccountCard.tsx`
- Create: `src/features/finance/AccountList.tsx`

- [ ] **Step 1: 创建 AccountCard**

写入 `e:\Dev\EasyWork0807\src\features\finance\AccountCard.tsx`：

```tsx
import { Banknote, CreditCard, Wallet } from "lucide-react";
import type { AccountWithBalance } from "@/features/finance/types";
import { cn } from "@/lib/utils";

const typeMeta: Record<string, { label: string; icon: typeof Wallet }> = {
  cash: { label: "现金", icon: Wallet },
  bank: { label: "银行卡", icon: Banknote },
  credit: { label: "信用卡", icon: CreditCard },
};

export function AccountCard({ account }: { account: AccountWithBalance }) {
  const meta = typeMeta[account.type] ?? typeMeta.cash;
  const Icon = meta.icon;
  const isCredit = account.type === "credit";
  // 信用卡：余额为负表示欠款，红色显示
  const balanceClass = isCredit && account.balance < 0 ? "text-red-500" : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-muted-foreground" />
          <span className="text-sm font-medium">{account.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">{meta.label}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-semibold", balanceClass)}>
        ¥{Number(account.balance).toFixed(2)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 AccountList**

写入 `e:\Dev\EasyWork0807\src\features\finance\AccountList.tsx`：

```tsx
import { useAccounts } from "@/features/finance/useAccounts";
import { AccountCard } from "@/features/finance/AccountCard";

export function AccountList() {
  const { accounts, isLoading, isError } = useAccounts();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">加载账户中…</div>;
  if (isError) return <div className="p-4 text-sm text-red-500">账户加载失败</div>;
  if (accounts.length === 0)
    return <div className="p-4 text-sm text-muted-foreground">暂无账户，请先添加账户。</div>;

  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium">账户</h2>
        <span className="text-xs text-muted-foreground">合计 ¥{total.toFixed(2)}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <AccountCard key={a.id} account={a} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src/features/finance/AccountCard.tsx src/features/finance/AccountList.tsx; git commit -m "feat(finance): add AccountCard and AccountList components"
```
Expected: commit 成功。

---

## Task 9: TransactionForm 组件

**Files:**
- Create: `src/features/finance/TransactionForm.tsx`

- [ ] **Step 1: 安装表单依赖（若骨架未装）**

Run:
```powershell
npm install react-hook-form zod @hookform/resolvers
```
Expected: 安装成功（若已存在则跳过）。

- [ ] **Step 2: 创建 TransactionForm**

写入 `e:\Dev\EasyWork0807\src\features\finance\TransactionForm.tsx`：

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccounts } from "@/features/finance/useAccounts";
import { useCategories } from "@/features/finance/useCategories";
import { useTransactions } from "@/features/finance/useTransactions";
import { useReceiptUpload } from "@/features/finance/useReceiptUpload";
import { Button } from "@/components/ui/button";
import type { Transaction, TransactionFormInput, TransactionType } from "@/features/finance/types";

const schema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.coerce.number().positive("金额必须大于 0"),
    account_id: z.string().min(1, "请选择账户"),
    to_account_id: z.string().nullable().optional(),
    category_id: z.string().nullable().optional(),
    date: z.string().min(1, "请选择日期"),
    note: z.string().optional(),
    receipt_url: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "transfer") {
      if (!data.to_account_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to_account_id"], message: "转账需选择目标账户" });
      }
      if (data.to_account_id && data.to_account_id === data.account_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to_account_id"], message: "源账户与目标账户不能相同" });
      }
      if (data.category_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category_id"], message: "转账不能选择分类" });
      }
    } else {
      if (!data.category_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category_id"], message: "请选择分类" });
      }
    }
  });

interface Props {
  initial?: Transaction;
  onSubmitted?: () => void;
}

export function TransactionForm({ initial, onSubmitted }: Props) {
  const { accounts } = useAccounts();
  const { incomeCategories, expenseCategories } = useCategories();
  const { createTransaction, updateTransaction } = useTransactions();
  const { upload, uploading } = useReceiptUpload();

  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormInput>({
    resolver: zodResolver(schema) as any,
    defaultValues: initial
      ? {
          type: initial.type,
          amount: Number(initial.amount),
          account_id: initial.account_id ?? "",
          to_account_id: initial.to_account_id,
          category_id: initial.category_id,
          date: initial.date,
          note: initial.note ?? "",
          receipt_url: initial.receipt_url,
        }
      : {
          type: "expense",
          amount: 0,
          account_id: "",
          to_account_id: null,
          category_id: null,
          date: today,
          note: "",
          receipt_url: null,
        },
  });

  const type = watch("type");
  const categoryOptions = type === "income" ? incomeCategories : expenseCategories;

  const onUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) setValue("receipt_url", url);
  };

  const onSubmit = async (values: TransactionFormInput) => {
    const payload: TransactionFormInput = {
      ...values,
      to_account_id: values.type === "transfer" ? values.to_account_id : null,
      category_id: values.type === "transfer" ? null : values.category_id,
    };
    if (initial) {
      await updateTransaction({ id: initial.id, patch: payload });
    } else {
      await createTransaction(payload);
    }
    reset();
    onSubmitted?.();
  };

  const inputCls = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  const typeButtons: { value: TransactionType; label: string }[] = [
    { value: "expense", label: "支出" },
    { value: "income", label: "收入" },
    { value: "transfer", label: "转账" },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      {/* 类型切换 */}
      <div className="grid grid-cols-3 gap-2">
        {typeButtons.map((t) => (
          <Button
            key={t.value}
            type="button"
            variant={type === t.value ? "default" : "outline"}
            onClick={() => {
              setValue("type", t.value);
              if (t.value !== "transfer") setValue("to_account_id", null);
              else setValue("category_id", null);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* 金额 */}
      <div>
        <input
          type="number"
          step="0.01"
          placeholder="金额"
          {...register("amount")}
          className={inputCls}
        />
        {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
      </div>

      {/* 账户 */}
      <div>
        <select {...register("account_id")} className={inputCls}>
          <option value="">选择账户</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {errors.account_id && <p className="mt-1 text-xs text-red-500">{errors.account_id.message}</p>}
      </div>

      {/* 转账目标账户 */}
      {type === "transfer" && (
        <div>
          <select {...register("to_account_id")} className={inputCls}>
            <option value="">选择目标账户</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {errors.to_account_id && (
            <p className="mt-1 text-xs text-red-500">{errors.to_account_id.message}</p>
          )}
        </div>
      )}

      {/* 分类（非转账） */}
      {type !== "transfer" && (
        <div>
          <select {...register("category_id")} className={inputCls}>
            <option value="">选择分类</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.category_id && <p className="mt-1 text-xs text-red-500">{errors.category_id.message}</p>}
        </div>
      )}

      {/* 日期 */}
      <div>
        <input type="date" {...register("date")} className={inputCls} />
        {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date.message}</p>}
      </div>

      {/* 备注 */}
      <input placeholder="备注（可选）" {...register("note")} className={inputCls} />

      {/* 票据照片 */}
      <div className="space-y-1">
        <input type="file" accept="image/*" onChange={onUploadReceipt} className="text-xs" />
        {uploading && <p className="text-xs text-muted-foreground">上传中…</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {initial ? "保存" : "记一笔"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误（`useReceiptUpload` 在 Task 13 创建，本 Task 暂时若有"找不到模块"错误，可先创建 Task 13 的 hook 再验证；为保持 Task 顺序，此处允许暂存，Task 13 完成后统一验证）。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src/features/finance/TransactionForm.tsx; git commit -m "feat(finance): add TransactionForm with income/expense/transfer switching, zod validation, receipt upload"
```
Expected: commit 成功。

---

## Task 10: TransactionList 组件（按日期分组）

**Files:**
- Create: `src/features/finance/TransactionList.tsx`

- [ ] **Step 1: 创建 TransactionList**

写入 `e:\Dev\EasyWork0807\src\features\finance\TransactionList.tsx`：

```tsx
import { useMemo } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { useTransactions } from "@/features/finance/useTransactions";
import { useAccounts } from "@/features/finance/useAccounts";
import { useCategories } from "@/features/finance/useCategories";
import type { Transaction, TransactionFilter } from "@/features/finance/types";
import { Button } from "@/components/ui/button";

function formatAmount(type: string, amount: number): string {
  const sign = type === "income" ? "+" : type === "expense" ? "-" : "";
  return `${sign}¥${Number(amount).toFixed(2)}`;
}

function amountColor(type: string): string {
  return type === "income" ? "text-green-500" : type === "expense" ? "text-red-500" : "text-foreground";
}

interface Props {
  filter?: TransactionFilter;
  onEdit?: (tx: Transaction) => void;
}

export function TransactionList({ filter = {}, onEdit }: Props) {
  const { transactions, isLoading, isError, deleteTransaction } = useTransactions(filter);
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  // 按日期分组
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions]);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">加载流水…</div>;
  if (isError) return <div className="p-4 text-sm text-red-500">流水加载失败</div>;
  if (transactions.length === 0)
    return <div className="p-4 text-sm text-muted-foreground">暂无流水记录。</div>;

  const handleDelete = async (id: string) => {
    if (confirm("确定删除该流水？")) await deleteTransaction(id);
  };

  return (
    <div className="space-y-4">
      {grouped.map(([date, items]) => {
        const daySum = items.reduce((sum, t) => {
          if (t.type === "income") return sum + Number(t.amount);
          if (t.type === "expense") return sum - Number(t.amount);
          return sum; // 转账不计入日合计
        }, 0);
        return (
          <div key={date}>
            <div className="flex items-center justify-between px-1 py-1 text-xs text-muted-foreground">
              <span>{date}</span>
              <span>{daySum >= 0 ? "+" : ""}¥{daySum.toFixed(2)}</span>
            </div>
            <div className="divide-y rounded-lg border bg-card">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50"
                  onClick={() => onEdit?.(t)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {t.type === "transfer" ? (
                        <span className="flex items-center gap-1">
                          {accountMap.get(t.account_id ?? "") ?? "?"}
                          <ArrowRight size={12} className="text-muted-foreground" />
                          {accountMap.get(t.to_account_id ?? "") ?? "?"}
                        </span>
                      ) : (
                        <span>{categoryMap.get(t.category_id ?? "") ?? "未分类"}</span>
                      )}
                    </div>
                    {t.note && <div className="truncate text-xs text-muted-foreground">{t.note}</div>}
                    {t.type !== "transfer" && (
                      <div className="truncate text-xs text-muted-foreground">
                        {accountMap.get(t.account_id ?? "") ?? ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${amountColor(t.type)}`}>
                      {formatAmount(t.type, Number(t.amount))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(t.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/finance/TransactionList.tsx; git commit -m "feat(finance): add TransactionList grouped by date with edit/delete actions"
```
Expected: commit 成功。

---

## Task 11: BudgetList / BudgetProgress 组件

**Files:**
- Create: `src/features/finance/BudgetProgress.tsx`
- Create: `src/features/finance/BudgetList.tsx`

- [ ] **Step 1: 创建 BudgetProgress**

写入 `e:\Dev\EasyWork0807\src\features\finance\BudgetProgress.tsx`：

```tsx
import type { BudgetWithSpent } from "@/features/finance/types";
import { cn } from "@/lib/utils";

export function BudgetProgress({ budget }: { budget: BudgetWithSpent }) {
  const displayPercent = Math.min(budget.percent, 100);
  const barColor = budget.overspent
    ? "bg-red-500"
    : budget.percent >= 80
    ? "bg-amber-500"
    : "bg-green-500";

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{budget.category_name}</span>
        {budget.overspent && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-900/40 dark:text-red-300">
            超支
          </span>
        )}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", barColor)}
          style={{ width: `${displayPercent}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>已花 ¥{budget.spent.toFixed(2)}</span>
        <span>预算 ¥{budget.amount.toFixed(2)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {budget.overspent
          ? `超支 ¥${(budget.spent - budget.amount).toFixed(2)}`
          : `剩余 ¥${budget.remaining.toFixed(2)}`}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 BudgetList**

写入 `e:\Dev\EasyWork0807\src\features\finance\BudgetList.tsx`：

```tsx
import { useMemo } from "react";
import { useBudgets, computeBudgetWithSpent } from "@/features/finance/useBudgets";
import { useCategories } from "@/features/finance/useCategories";
import { BudgetProgress } from "@/features/finance/BudgetProgress";

export function BudgetList({ year_month }: { year_month: number }) {
  const { budgets, monthTransactions, isLoading, isError } = useBudgets(year_month);
  const { categories } = useCategories();

  const budgetsWithSpent = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    return budgets
      .map((b) => {
        const cat = catMap.get(b.category_id);
        if (!cat) return null;
        return computeBudgetWithSpent(b, cat, monthTransactions);
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [budgets, categories, monthTransactions]);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">加载预算…</div>;
  if (isError) return <div className="p-4 text-sm text-red-500">预算加载失败</div>;
  if (budgetsWithSpent.length === 0)
    return <div className="p-4 text-sm text-muted-foreground">本月暂无预算设置。</div>;

  return (
    <div className="space-y-3">
      <h2 className="px-1 text-sm font-medium">本月预算</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {budgetsWithSpent.map((b) => (
          <BudgetProgress key={b.id} budget={b} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src/features/finance/BudgetProgress.tsx src/features/finance/BudgetList.tsx; git commit -m "feat(finance): add BudgetProgress and BudgetList with overspend warning"
```
Expected: commit 成功。

---

## Task 12: FinanceReport 组件（Recharts）

**Files:**
- Create: `src/features/finance/FinanceReport.tsx`

- [ ] **Step 1: 创建 FinanceReport**

写入 `e:\Dev\EasyWork0807\src\features\finance\FinanceReport.tsx`：

```tsx
import { useEffect, useState } from "react";
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
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { reportRepository } from "@/features/finance/repositories";

const PIE_COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#8dd1e1", "#a4de6c", "#d0ed57", "#ffa1a1"];

function currentYearMonth(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

export function FinanceReport() {
  const [yearMonth, setYearMonth] = useState<number>(currentYearMonth());
  const [summary, setSummary] = useState<{ income: number; expense: number; transfer: number }>({
    income: 0,
    expense: 0,
    transfer: 0,
  });
  const [byCategory, setByCategory] = useState<{ category_name: string; total: number }[]>([]);
  const [trend, setTrend] = useState<{ month: string; income: number; expense: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      reportRepository.monthlySummary(yearMonth),
      reportRepository.expenseByCategory(yearMonth),
      reportRepository.trend(6),
    ])
      .then(([s, c, t]) => {
        if (!active) return;
        setSummary(s);
        setByCategory(c.map((x) => ({ category_name: x.category_name, total: x.total })));
        setTrend(t);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [yearMonth]);

  const monthLabel = `${Math.floor(yearMonth / 100)}年${yearMonth % 100}月`;
  const balance = summary.income - summary.expense;

  return (
    <div className="space-y-4">
      {/* 月份选择 */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">月份</label>
        <input
          type="month"
          value={`${Math.floor(yearMonth / 100)}-${String(yearMonth % 100).padStart(2, "0")}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-");
            setYearMonth(Number(y) * 100 + Number(m));
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>

      {loading ? (
        <div className="p-4 text-sm text-muted-foreground">加载报表…</div>
      ) : (
        <>
          {/* 月度收支概览 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">收入</div>
              <div className="text-lg font-semibold text-green-500">¥{summary.income.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">支出</div>
              <div className="text-lg font-semibold text-red-500">¥{summary.expense.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">结余</div>
              <div className="text-lg font-semibold">¥{balance.toFixed(2)}</div>
            </div>
          </div>

          {/* 月度收支柱状图 */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium">{monthLabel} 收支</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ name: "收入", value: summary.income }, { name: "支出", value: summary.expense }]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
                  <Bar dataKey="value" radius={4}>
                    <Cell fill="#22c55e" />
                    <Cell fill="#ef4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 分类占比饼图 */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium">{monthLabel} 支出分类占比</h3>
            {byCategory.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">本月无支出</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="total"
                      nameKey="category_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(e: any) => `${e.category_name}: ¥${Number(e.total).toFixed(0)}`}
                    >
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 近 6 月趋势折线图 */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium">近 6 月收支趋势</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="income" name="收入" stroke="#22c55e" strokeWidth={2} />
                  <Line type="monotone" dataKey="expense" name="支出" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/finance/FinanceReport.tsx; git commit -m "feat(finance): add FinanceReport with monthly bar chart, category pie, and trend line chart"
```
Expected: commit 成功。

---

## Task 13: 票据照片上传（Storage 集成）

**Files:**
- Create: `src/features/finance/useReceiptUpload.ts`
- Create: `supabase/migrations/0003b_receipt_storage.sql`

- [ ] **Step 1: 创建 Storage bucket 迁移**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0003b_receipt_storage.sql`：

```sql
-- 票据照片 Storage bucket 与策略
-- 路径约定：user_id/transaction_id/filename

insert into storage.buckets (id, name, public)
values ('receipt-photos', 'receipt-photos', true)
on conflict (id) do nothing;

-- 用户可读取自己路径下的票据（public bucket，所有人可读，此处仍按 user_id 隔离写）
drop policy if exists "receipt_select_own" on storage.objects;
create policy "receipt_select_own"
  on storage.objects for select
  using (bucket_id = 'receipt-photos');

-- 用户只能写入自己路径前缀（路径首段 = auth.uid()）
drop policy if exists "receipt_insert_own" on storage.objects;
create policy "receipt_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipt_update_own" on storage.objects;
create policy "receipt_update_own"
  on storage.objects for update
  using (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipt_delete_own" on storage.objects;
create policy "receipt_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: 部署 Storage 迁移**

说明：在 Supabase Dashboard SQL Editor 执行 `0003b_receipt_storage.sql`，或：

Run:
```powershell
npx supabase db push
```
Expected: bucket `receipt-photos` 创建成功，5 条 Storage policy 生效。

- [ ] **Step 3: 创建 useReceiptUpload hook**

写入 `e:\Dev\EasyWork0807\src\features\finance\useReceiptUpload.ts`：

```ts
import { useState } from "react";
import { supabase } from "@/lib/supabase";

// 票据照片上传：路径 user_id/transaction_id/filename
// 新建流水时无 transaction_id，用临时 'draft' 前缀；保存后可由后端重命名（MVP 接受 draft 路径）
export function useReceiptUpload() {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File, transactionId = "draft"): Promise<string | null> {
    setUploading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user.id;
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const path = `${userId}/${transactionId}/${fileName}`;

      const { error: upErr } = await supabase.storage.from("receipt-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("receipt-photos").getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error("票据上传失败", e);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function remove(publicUrl: string): Promise<void> {
    // 从 publicUrl 提取路径：.../receipt-photos/<userId>/<txId>/<file>
    try {
      const idx = publicUrl.indexOf("receipt-photos/");
      if (idx === -1) return;
      const path = publicUrl.slice(idx + "receipt-photos/".length);
      await supabase.storage.from("receipt-photos").remove([path]);
    } catch (e) {
      console.error("票据删除失败", e);
    }
  }

  return { upload, remove, uploading };
}
```

- [ ] **Step 4: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。此时 Task 9 的 `TransactionForm` 引用 `useReceiptUpload` 应可解析。

- [ ] **Step 5: 提交**

Run:
```powershell
git add supabase/migrations/0003b_receipt_storage.sql src/features/finance/useReceiptUpload.ts; git commit -m "feat(finance): add receipt photo storage bucket, policies, and useReceiptUpload hook"
```
Expected: commit 成功。

---

## Task 14: Realtime 订阅 + 路由集成 + 页面组装

**Files:**
- Create: `src/features/finance/useFinanceRealtime.ts`
- Create: `src/features/finance/FinancePage.tsx`
- Modify: `src/router.tsx`

- [ ] **Step 1: 创建 Realtime 订阅 hook**

写入 `e:\Dev\EasyWork0807\src\features\finance\useFinanceRealtime.ts`：

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// 订阅记账四表变更，自动失效相关查询缓存以保持多设备同步
export function useFinanceRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("finance-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts" },
        () => qc.invalidateQueries({ queryKey: ["finance", "accounts"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        () => qc.invalidateQueries({ queryKey: ["finance", "categories"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets" },
        () => qc.invalidateQueries({ queryKey: ["finance", "budgets"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
```

- [ ] **Step 2: 创建 FinancePage 页面组装**

写入 `e:\Dev\EasyWork0807\src\features\finance\FinancePage.tsx`：

```tsx
import { useState } from "react";
import { FinanceReport } from "@/features/finance/FinanceReport";
import { AccountList } from "@/features/finance/AccountList";
import { TransactionList } from "@/features/finance/TransactionList";
import { TransactionForm } from "@/features/finance/TransactionForm";
import { BudgetList } from "@/features/finance/BudgetList";
import { useFinanceRealtime } from "@/features/finance/useFinanceRealtime";
import type { Transaction } from "@/features/finance/types";
import { Button } from "@/components/ui/button";

function currentYearMonth(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

export function FinancePage() {
  // 启用 Realtime 订阅
  useFinanceRealtime();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>(undefined);
  const yearMonth = currentYearMonth();

  const openNewForm = () => {
    setEditing(undefined);
    setShowForm(true);
  };

  const openEditForm = (tx: Transaction) => {
    setEditing(tx);
    setShowForm(true);
  };

  return (
    <div className="space-y-4 p-4">
      {/* 顶部：标题 + 记账按钮 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">记账</h1>
        <Button onClick={openNewForm}>+ 记一笔</Button>
      </div>

      {/* 桌面：表单与列表并排；移动端表单为底部抽屉 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <AccountList />
          <TransactionList onEdit={openEditForm} />
          <BudgetList year_month={yearMonth} />
        </div>
        <div className="hidden lg:block">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">{editing ? "编辑流水" : "快速记账"}</h2>
            <TransactionForm
              initial={editing}
              onSubmitted={() => {
                setEditing(undefined);
                setShowForm(false);
              }}
            />
          </div>
        </div>
      </div>

      {/* 报表区 */}
      <FinanceReport />

      {/* 移动端底部抽屉表单 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowForm(false)}
          />
          <div className="relative w-full max-h-[80vh] overflow-auto rounded-t-xl bg-background p-4 pb-[env(safe-area-inset-bottom)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">{editing ? "编辑流水" : "记一笔"}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                关闭
              </Button>
            </div>
            <TransactionForm
              initial={editing}
              onSubmitted={() => {
                setEditing(undefined);
                setShowForm(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 修改 router.tsx 接入 FinancePage**

打开 `e:\Dev\EasyWork0807\src\router.tsx`，找到 financeRoute 定义：

```tsx
const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/finance",
  component: () => <div className="p-4">记账模块（待实现）</div>,
});
```

替换为：

```tsx
const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/finance",
  component: FinancePage,
});
```

并在文件顶部 import 区追加：

```tsx
import { FinancePage } from "@/features/finance/FinancePage";
```

- [ ] **Step 4: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无类型错误。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/finance/useFinanceRealtime.ts src/features/finance/FinancePage.tsx src/router.tsx; git commit -m "feat(finance): add realtime subscription, FinancePage assembly, and wire up /finance route"
```
Expected: commit 成功。

---

## Task 15: 全量测试构建验证

**Files:** 无新增

- [ ] **Step 1: 运行记账模块全部单元测试**

Run:
```powershell
npx vitest run src/__tests__/finance
```
Expected: 全部通过（useAccounts 1 个、useCategories 2 个、useTransactions 2 个、useBudgets 4 个，共 9 个测试）。

- [ ] **Step 2: 运行项目全部测试**

Run:
```powershell
npm test
```
Expected: 所有测试通过（含骨架的 authStore/useAuth/ThemeProvider 测试 + 记账模块 9 个测试）。

- [ ] **Step 3: 类型检查 + 构建**

Run:
```powershell
npm run build
```
Expected: `tsc -b` 无类型错误，`vite build` 产出 `dist/`。

- [ ] **Step 4: 启动开发服务器验证页面渲染**

Run:
```powershell
npm run dev
```
Expected: Vite 在 `http://localhost:1420` 启动。登录后访问 `/finance`，页面应渲染：账户区、流水列表、预算区、报表区，无 JS 错误（若无真实数据，各区域显示空态文案）。验证后停止。

- [ ] **Step 5: 提交最终状态**

Run:
```powershell
git add -A; git commit -m "chore(finance): verify build and tests pass for finance module"
```
Expected: commit 成功（若有改动）。

---

## Self-Review

**1. Spec 覆盖（对照 spec 第 7.2 节）：**
- accounts 表（cash/bank/credit，initial_balance，currency 默认 CNY，sort_order，RLS，updated_at 触发器）→ Task 1 Step 1, 6 ✓
- categories 表（income/expense，parent_id 二级，icon，sort_order，RLS）→ Task 1 Step 2 ✓
- transactions 表（income/expense/transfer，amount 正数，account_id/to_account_id/category_id，date，note，receipt_url，transfer 约束）→ Task 1 Step 3, 4 ✓
- budgets 表（category_id，amount，year_month，唯一约束 (user_id, category_id, year_month)，RLS）→ Task 1 Step 5 ✓
- 账户余额计算（Postgres 视图 account_balances 聚合 income/expense/transfer 四向）→ Task 1 Step 7 ✓
- 超支预警（前端 computeBudgetWithSpent 比较 spent vs amount）→ Task 7, 11 ✓
- 票据照片 Storage（bucket receipt-photos，路径 user_id/transaction_id/filename，Storage policy 按 auth.uid() 匹配路径首段）→ Task 13 ✓
- 组件拆分（TransactionList/TransactionForm/AccountList/AccountCard/BudgetList/BudgetProgress/FinanceReport + useTransactions/useAccounts/useBudgets/useCategories）→ Task 4-12 ✓
- 布局适配（桌面表单+报表并排，移动端表单底部抽屉，报表纵向堆叠，单币种 CNY）→ Task 14 ✓
- Realtime 多设备同步 → Task 1 Step 8, Task 14 ✓

**2. TDD 合规：**
- Task 4-7 严格遵循"失败测试 → 验证失败 → 实现 → 验证通过 → commit"循环 ✓
- 测试用 Vitest + React Testing Library，mock supabase（vi.mock("@/lib/supabase")）✓
- 共 9 个测试用例覆盖 hooks 与纯函数 ✓

**3. 占位符扫描：** 无 TODO/TBD/placeholder。所有代码块完整可直接复制。Task 9 中 useReceiptUpload 的"暂时找不到模块"是 Task 间顺序依赖，已在 Step 3 说明并在 Task 13 解决，非占位符。✓

**4. 类型一致性：**
- `TransactionFormInput` 在 types.ts、repositories.ts（create 入参）、useTransactions.ts（mutationFn）、TransactionForm.tsx（useForm 泛型）签名一致 ✓
- `BudgetWithSpent` 在 types.ts 定义，useBudgets.ts 的 `computeBudgetWithSpent` 返回，BudgetProgress.tsx 消费，字段（spent/remaining/percent/overspent/category_name）一致 ✓
- `AccountWithBalance.balance` 由 repositories.ts list 映射自 `account_balances(balance)`，AccountCard.tsx 消费 ✓
- `TransactionFilter` 在 types.ts、useTransactions.ts、TransactionList.tsx、repositories.ts list 入参一致 ✓

**5. 安全性：**
- 四表 RLS 全部 `using (auth.uid() = user_id)` + `with check (auth.uid() = user_id)`，delete 也加 policy ✓
- Storage policy 按 `storage.foldername(name)[1] = auth.uid()::text` 隔离写权限 ✓
- 无硬编码密钥，凭证走骨架的 supabase 单例 + .env ✓
- transfer 约束触发器在 DB 层强制（前端 zod + DB trigger 双层防御）✓

**6. 顺序依赖处理：**
- Task 9 TransactionForm 依赖 Task 13 useReceiptUpload → 已在 Task 9 Step 3 注明，Task 13 创建后统一验证，Task 15 全量 tsc 兜底 ✓
- Task 14 FinancePage 依赖 Task 8-12 所有组件 → 按 Task 编号顺序执行无冲突 ✓
- Task 14 修改 router.tsx → 提供 SEARCH/REPLACE 式精确替换指引 ✓

**7. 命令与环境：** 所有 PowerShell 命令用 `;` 分隔，路径用反斜杠，符合 Windows 环境。✓

**范围说明：** 本计划覆盖记账模块完整实现（DB → 类型 → 仓库 → hooks → 组件 → Storage → Realtime → 路由 → 验证）。任务/笔记/邮箱模块的详细计划将在各自子项目中分别生成。
