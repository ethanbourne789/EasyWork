-- ============================================================================
-- 新用户注册时自动创建默认记账分类与现金账户
-- ============================================================================
-- 说明：
-- - 独立触发器 + 异常捕获：即便默认数据创建失败，也不会阻塞用户注册。
-- - 幂等：若该用户已存在任何分类或账户，则跳过对应插入。
-- ============================================================================

create or replace function public.handle_new_user_finance_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 默认支出/收入分类（仅在用户没有任何分类时创建）
  if not exists (select 1 from public.categories where user_id = new.id) then
    insert into public.categories (user_id, name, type, icon, sort_order) values
      (new.id, '餐饮',     'expense', '🍜', 10),
      (new.id, '交通',     'expense', '🚌', 20),
      (new.id, '购物',     'expense', '🛍️', 30),
      (new.id, '居住',     'expense', '🏠', 40),
      (new.id, '娱乐',     'expense', '🎮', 50),
      (new.id, '日用',     'expense', '🧴', 60),
      (new.id, '医疗',     'expense', '💊', 70),
      (new.id, '学习',     'expense', '📚', 80),
      (new.id, '工资',     'income',  '💼', 10),
      (new.id, '兼职',     'income',  '🧑‍💻', 20),
      (new.id, '理财',     'income',  '📈', 30),
      (new.id, '其他收入', 'income',  '💰', 40);
  end if;

  -- 默认现金账户（仅在用户没有任何账户时创建）
  if not exists (select 1 from public.accounts where user_id = new.id) then
    insert into public.accounts (user_id, name, type, currency, initial_balance, sort_order)
    values (new.id, '现金钱包', 'cash', 'CNY', 0, 10);
  end if;

  return new;
exception when others then
  raise notice 'Failed to create finance defaults for user %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_finance_defaults on auth.users;
create trigger on_auth_user_finance_defaults
  after insert on auth.users
  for each row execute function public.handle_new_user_finance_defaults();
