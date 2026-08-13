# 记账默认账户：现金钱包 — 设计文档

日期：2026-08-11

## 背景

新建支出/收入时，`TransactionForm` 的账户默认值为空，用户必须手动选择账户。新用户注册时会通过 migration `0020_new_user_finance_defaults.sql` 自动创建名为「现金钱包」的现金账户，因此绝大多数用户天然拥有该账户。

期望：新建支出或收入时，账户自动默认选中「现金钱包」。

## 方案

仅修改 `src/features/finance/TransactionForm.tsx`，无数据库、类型、其他文件改动。

### 默认账户逻辑

在新建模式（非编辑）下，当 `accounts` 数据加载完成后，若当前 `account_id` 为空，自动选中：

1. 名称为「现金钱包」的账户（按 `name` 精确匹配）。
2. 找不到则回退到第一个 `type === 'cash'` 的账户。
3. 仍没有现金账户则保持空选，由用户手动选择。

### 实现要点

- 使用 `useEffect` 监听 `accounts` 变化，通过 `setValue('account_id', ...)` 设置默认值。
- 仅在新建模式（`!transaction`）生效；编辑模式不改变行为。
- 仅在 `account_id` 为空时写入默认值，不覆盖用户已有的选择。
- 保存成功后的 `reset()` 中，将 `account_id: ''` 改为同样应用默认账户逻辑，保证连记多笔时每笔都默认「现金钱包」。

### 范围排除

- 转账类型不做默认账户：需要用户分别选择转出/转入账户。
- 不添加任何数据库约束、触发器或迁移。

## 影响范围

- `src/features/finance/TransactionForm.tsx`（唯一改动文件）

## 测试

- 运行现有测试套件确认无回归（`npm test` / `npx vitest run`）。
- 类型检查（`tsc`）通过。
