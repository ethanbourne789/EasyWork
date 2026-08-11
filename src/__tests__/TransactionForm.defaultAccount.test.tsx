import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransactionForm } from "@/features/finance/TransactionForm";
import type { Account, Transaction, TransactionType } from "@/types";

const { mockAccounts, mockCreateMutate, mockUpdateMutate } = vi.hoisted(() => ({
  mockAccounts: [] as Account[],
  mockCreateMutate: vi.fn(),
  mockUpdateMutate: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        createSignedUrl: vi.fn(),
      })),
    },
  },
}));

vi.mock("@/features/finance/useFinance", () => ({
  useCreateTransaction: () => ({
    isPending: false,
    mutate: (payload: unknown, opts?: { onSuccess?: () => void }) => {
      mockCreateMutate(payload);
      opts?.onSuccess?.();
    },
  }),
  useUpdateTransaction: () => ({ isPending: false, mutate: mockUpdateMutate }),
  useCategories: () => ({ data: [] }),
  useAccounts: () => ({ data: mockAccounts }),
}));

function makeAccount(over: Partial<Account> & { id: string; name: string }): Account {
  return {
    user_id: "u1",
    type: "cash",
    initial_balance: 0,
    currency: "CNY",
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function makeTransaction(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    user_id: "u1",
    type: "expense",
    amount: 10,
    account_id: "",
    date: "2026-08-11",
    note: "",
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function renderForm(props: { transaction?: Transaction; defaultType?: TransactionType } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionForm {...props} />
    </QueryClientProvider>,
  );
}

async function getAccountSelect() {
  return await screen.findByRole("combobox") as HTMLSelectElement;
}

describe("TransactionForm 默认账户", () => {
  beforeEach(() => {
    mockAccounts.length = 0;
    mockCreateMutate.mockClear();
  });

  it("新建支出默认选中「现金钱包」", async () => {
    mockAccounts.push(makeAccount({ id: "cash-1", name: "现金钱包" }));
    mockAccounts.push(makeAccount({ id: "bank-1", name: "招商银行", type: "bank" }));
    renderForm();
    const select = await getAccountSelect();
    expect(select).toHaveValue("cash-1");
  });

  it("无「现金钱包」时回退到第一个现金账户", async () => {
    mockAccounts.push(makeAccount({ id: "cash-2", name: "钱包" }));
    mockAccounts.push(makeAccount({ id: "bank-1", name: "招商银行", type: "bank" }));
    renderForm();
    const select = await getAccountSelect();
    expect(select).toHaveValue("cash-2");
  });

  it("没有任何账户时保持空选", async () => {
    renderForm();
    const select = await getAccountSelect();
    expect(select).toHaveValue("");
  });

  it("编辑模式不覆盖已有账户", async () => {
    mockAccounts.push(makeAccount({ id: "cash-1", name: "现金钱包" }));
    mockAccounts.push(makeAccount({ id: "bank-1", name: "招商银行", type: "bank" }));
    renderForm({ transaction: makeTransaction({ id: "t1", account_id: "bank-1" }) });
    const select = await getAccountSelect();
    expect(select).toHaveValue("bank-1");
  });

  it("转账类型不做默认账户", async () => {
    mockAccounts.push(makeAccount({ id: "cash-1", name: "现金钱包" }));
    renderForm({ defaultType: "transfer" });
    const selects = await screen.findAllByRole("combobox");
    expect(selects[0]).toHaveValue("");
    expect(selects[1]).toHaveValue("");
  });

  it("保存成功后再次记账仍默认「现金钱包」", async () => {
    mockAccounts.push(makeAccount({ id: "cash-1", name: "现金钱包" }));
    renderForm();
    const select = await getAccountSelect();
    expect(select).toHaveValue("cash-1");

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    await waitFor(() => expect(select).toHaveValue("cash-1"));
  });
});
