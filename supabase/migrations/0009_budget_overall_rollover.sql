-- 0009: 预算支持「整体月度上限」与跨月滚动
-- 1) category_id 改为可空：整体预算（scope='overall'）不需要分类
alter table public.budgets alter column category_id drop not null;

-- 2) 新增 scope（category=按分类预算, overall=整体月度上限）与 carry_over（跨月滚动带入金额）
alter table public.budgets add column if not exists scope text not null default 'category' check (scope in ('category', 'overall'));
alter table public.budgets add column if not exists carry_over numeric(12,2) not null default 0;

-- 3) 整体预算按月唯一（原 unique(user_id,category_id,year_month) 仅约束按分类预算，
--    Postgres 对 NULL 视为互异，不会阻止整体预算；这里补一个部分唯一索引）
drop index if exists budgets_overall_uniq;
create unique index if not exists budgets_overall_uniq
  on public.budgets (user_id, year_month)
  where scope = 'overall';
