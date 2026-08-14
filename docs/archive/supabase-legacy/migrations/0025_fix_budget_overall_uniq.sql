-- 0025: 修复整体预算 upsert 失败（42P10）
-- 原因：PostgREST 的 on_conflict 无法携带部分唯一索引的谓词（WHERE scope='overall'），
--       ON CONFLICT (user_id, year_month) 推断不到该索引，导致保存整体预算时报
--       "there is no unique or exclusion constraint matching the ON CONFLICT specification"。
-- 方案：用生成列把「仅整体预算参与唯一性」转成普通唯一索引：
--       整体预算行 overall_uniq_month = year_month，分类预算行为 NULL（NULL 互异，不受约束）。

drop index if exists budgets_overall_uniq;

alter table public.budgets
  add column if not exists overall_uniq_month int generated always as (
    case when scope = 'overall' then year_month else null end
  ) stored;

create unique index if not exists budgets_overall_uniq
  on public.budgets (user_id, overall_uniq_month);
