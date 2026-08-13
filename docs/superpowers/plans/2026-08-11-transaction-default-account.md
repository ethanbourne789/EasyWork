# 记账默认账户（现金钱包）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建支出/收入时，账户默认选中「现金钱包」，无此账户时回退到第一个现金账户。

**Architecture:** 仅在 `TransactionForm.tsx` 前端实现：`accounts` 加载后通过 `useEffect` + `setValue` 写入默认账户；保存成功后的 `reset()` 同样写入默认账户，保证连记多笔每笔都默认现金钱包。无数据库改动。

**Tech Stack:** React 19、react-hook-form、zod、TanStack Query、Vitest + Testing Library。

## Global Constraints

- 仅修改 `src/features/finance/TransactionForm.tsx` 与新增测试文件。
- 编辑模式（`transaction` 传入时）行为不变。
- 转账类型不做默认账户。
- 仅在 `account_id` 为空时写入默认值，不覆盖用户已选。
- 新用户注册已有默认「现金钱包」（migration 0020），数据库无需改动。

---

### Task 1: 编写 TransactionForm 默认账户组件测试（TDD 红）

**Files:**
- Create: `src/__tests__/TransactionForm.defaultAccount.test.tsx`

**Interfaces:**
- Consumes: `TransactionForm` 组件（props: `transaction?`, `onSuccess?`, `defaultType?`），`Account` 类型。
- Produces: 覆盖 5 个行为的测试用例（见下）。

- [ ] **Step 1: 创建测试文件**

创建 `src/__tests__/TransactionForm.defaultAccount.test.tsx`，内容：

```tsx
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/__tests__/TransactionForm.defaultAccount.test.tsx`
Expected: 用例 1、2、5、6 FAIL（`select` 实际为 `""`）；用例 3、4 已通过（空账户与编辑模式不受影响）。

- [ ] **Step 3: Commit 红测试**

```bash
git add src/__tests__/TransactionForm.defaultAccount.test.tsx
git commit -m "test(finance): add TransactionForm default account tests"
```

---

### Task 2: 实现默认账户逻辑（TDD 绿）

**Files:**
- Modify: `src/features/finance/TransactionForm.tsx`

**Interfaces:**
- Consumes: Task 1 的测试文件（5 个行为断言）。
- Produces: 无新导出；组件行为变更。

- [ ] **Step 1: 添加 `defaultAccountId` 与默认写入 effect**

在 `TransactionForm.tsx` 顶部 import 区，把 `import { useState, useMemo } from 'react';` 改为：

```tsx
import { useState, useMemo, useEffect } from 'react';
```

在组件内 `useForm` 之后、`const watchedAmount = watch('amount');` 之前，插入：

```tsx
const defaultAccountId = useMemo(() => {
  if (!accounts.length) return '';
  return (
    accounts.find((a) => a.name === '现金钱包') ??
    accounts.find((a) => a.type === 'cash')
  )?.id ?? '';
}, [accounts]);

useEffect(() => {
  if (isEdit || activeType === 'transfer' || !defaultAccountId) return;
  if (!getValues('account_id')) setValue('account_id', defaultAccountId);
}, [defaultAccountId, activeType, isEdit, setValue, getValues]);
```

从 `useForm` 解构中取出 `getValues`：

```tsx
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<TransactionFormData>({
```

- [ ] **Step 2: 保存成功后的 reset 默认账户**

把 `onSubmit` 中 `createTransaction.mutate` 的 `onSuccess` 里 `reset({...})` 的 `account_id: '',` 改为：

```tsx
          account_id: activeType === 'transfer' ? '' : defaultAccountId,
```

（`defaultAccountId` 在 `useMemo` 之后、`onSubmit` 之前，作用域可用。）

- [ ] **Step 3: 运行 Task 1 测试确认通过**

Run: `npx vitest run src/__tests__/TransactionForm.defaultAccount.test.tsx`
Expected: PASS — 全部 6 个用例通过。

- [ ] **Step 4: 全量回归验证**

Run: `npm test` — Expected: 所有测试通过。
Run: `npm run typecheck` — Expected: 无类型错误。
Run: `npm run lint` — Expected: 无 lint 错误。

- [ ] **Step 5: Commit**

```bash
git add src/features/finance/TransactionForm.tsx
git commit -m "feat(finance): default new transaction account to 现金钱包"
```
