-- 记账模块

-- accounts 表
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

alter table public.accounts enable row level security;
drop policy if exists "accounts_select" on public.accounts; create policy "accounts_select" on public.accounts for select using (auth.uid() = user_id);
drop policy if exists "accounts_insert" on public.accounts; create policy "accounts_insert" on public.accounts for insert with check (auth.uid() = user_id);
drop policy if exists "accounts_update" on public.accounts; create policy "accounts_update" on public.accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "accounts_delete" on public.accounts; create policy "accounts_delete" on public.accounts for delete using (auth.uid() = user_id);

drop trigger if exists update_accounts_updated_at on public.accounts;
create trigger update_accounts_updated_at before update on public.accounts for each row execute function public.update_updated_at();

-- categories 表
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
drop policy if exists "categories_select" on public.categories; create policy "categories_select" on public.categories for select using (auth.uid() = user_id);
drop policy if exists "categories_insert" on public.categories; create policy "categories_insert" on public.categories for insert with check (auth.uid() = user_id);
drop policy if exists "categories_update" on public.categories; create policy "categories_update" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "categories_delete" on public.categories; create policy "categories_delete" on public.categories for delete using (auth.uid() = user_id);

-- transactions 表
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(12,2) not null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  date date not null,
  note text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
drop policy if exists "transactions_select" on public.transactions; create policy "transactions_select" on public.transactions for select using (auth.uid() = user_id);
drop policy if exists "transactions_insert" on public.transactions; create policy "transactions_insert" on public.transactions for insert with check (auth.uid() = user_id);
drop policy if exists "transactions_update" on public.transactions; create policy "transactions_update" on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "transactions_delete" on public.transactions; create policy "transactions_delete" on public.transactions for delete using (auth.uid() = user_id);

drop trigger if exists update_transactions_updated_at on public.transactions;
create trigger update_transactions_updated_at before update on public.transactions for each row execute function public.update_updated_at();

-- budgets 表
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(12,2) not null,
  year_month int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, year_month)
);

alter table public.budgets enable row level security;
drop policy if exists "budgets_select" on public.budgets; create policy "budgets_select" on public.budgets for select using (auth.uid() = user_id);
drop policy if exists "budgets_insert" on public.budgets; create policy "budgets_insert" on public.budgets for insert with check (auth.uid() = user_id);
drop policy if exists "budgets_update" on public.budgets; create policy "budgets_update" on public.budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budgets_delete" on public.budgets; create policy "budgets_delete" on public.budgets for delete using (auth.uid() = user_id);

drop trigger if exists update_budgets_updated_at on public.budgets;
create trigger update_budgets_updated_at before update on public.budgets for each row execute function public.update_updated_at();
