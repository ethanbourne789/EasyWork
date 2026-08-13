import type { Account, Transaction } from '@/types';

/**
 * 计算各账户当前余额（分单位累加，规避浮点漂移）。
 * 规则：收入加、支出减、转账从转出账户减并向转入账户加。
 * 供账户列表与总览页统一复用，避免逻辑重复。
 */
export function computeAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
): Record<string, number> {
  const validIds = new Set(accounts.map((a) => a.id));
  const cents: Record<string, number> = {};
  accounts.forEach((acc) => {
    cents[acc.id] = Math.round(acc.initial_balance * 100);
  });
  transactions.forEach((t) => {
    // 账户已被删除的交易不再计入任何余额（含总资产）
    if (!t.account_id || !validIds.has(t.account_id)) return;
    const c = Math.round(t.amount * 100);
    if (t.type === 'income') {
      cents[t.account_id] = (cents[t.account_id] || 0) + c;
    } else if (t.type === 'expense') {
      cents[t.account_id] = (cents[t.account_id] || 0) - c;
    } else if (t.type === 'transfer') {
      if (!t.to_account_id || !validIds.has(t.to_account_id)) return;
      cents[t.account_id] = (cents[t.account_id] || 0) - c;
      cents[t.to_account_id] = (cents[t.to_account_id] || 0) + c;
    }
  });
  const balances: Record<string, number> = {};
  for (const k in cents) balances[k] = cents[k] / 100;
  return balances;
}
