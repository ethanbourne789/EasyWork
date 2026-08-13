import { describe, it, expect } from "vitest";
import { computeAccountBalances } from "@/lib/finance";
import type { Account, Transaction } from "@/types";

function makeAccount(id: string, initial_balance = 0): Account {
  return {
    id,
    name: `账户${id}`,
    user_id: "u1",
    type: "bank",
    initial_balance,
    currency: "CNY",
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };
}

function makeTx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    user_id: "u1",
    type: "expense",
    amount: 10,
    account_id: "a1",
    date: "2026-08-11",
    note: "",
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("computeAccountBalances", () => {
  it("收入加、支出减、转账在转出扣减并在转入增加", () => {
    const accounts = [makeAccount("a1", 100), makeAccount("a2")];
    const transactions = [
      makeTx({ id: "t1", type: "income", amount: 50, account_id: "a1" }),
      makeTx({ id: "t2", type: "expense", amount: 30, account_id: "a1" }),
      makeTx({ id: "t3", type: "transfer", amount: 20, account_id: "a1", to_account_id: "a2" }),
    ];
    const balances = computeAccountBalances(accounts, transactions);
    expect(balances["a1"]).toBe(100);
    expect(balances["a2"]).toBe(20);
  });

  it("忽略账户已被删除的交易，不产生多余账户桶", () => {
    const accounts = [makeAccount("a1", 100)];
    const transactions = [
      makeTx({ id: "t1", type: "expense", amount: 30, account_id: "a1" }),
      makeTx({ id: "t2", type: "expense", amount: 50, account_id: "deleted" }),
    ];
    const balances = computeAccountBalances(accounts, transactions);
    expect(balances["a1"]).toBe(70);
    expect(Object.keys(balances)).toEqual(["a1"]);
    expect("null" in balances).toBe(false);
  });

  it("转账任一侧账户已删除时整笔不计入", () => {
    const accounts = [makeAccount("a1", 100)];
    const transactions = [
      makeTx({ id: "t1", type: "transfer", amount: 20, account_id: "a1", to_account_id: "deleted" }),
    ];
    const balances = computeAccountBalances(accounts, transactions);
    expect(balances["a1"]).toBe(100);
  });
});
