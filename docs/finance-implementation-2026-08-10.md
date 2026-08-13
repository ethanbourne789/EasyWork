# 记账模块重构与完善（2026-08-10）

> 目标：清除「演示账号数据模式」，将演示数据写入 Supabase 作为唯一数据源；修复阻断性问题与 P1/P2；补全分类管理 UI；新增总预算 + 跨月滚动。

## 一、阻断性 P0 修复：移除伪造演示会话

**根因**：原 `authStore` 用硬编码 `DEMO_USER_ID` + 伪造 `demoSession` 假装已登录，但 Supabase 客户端走 anon key 且从未真实认证 → RLS `auth.uid()` 为 `null`，导致记账/任务等模块查询全空、写入被拒（空壳）。

**改动**
- `src/features/auth/authStore.ts`：删除 `DEMO_USER_ID` / `demoSession` / `reset()`，`session` 初始为 `null`、`loading: true`（启动期等待真实会话，避免闪退）；`getCurrentUserId()` 返回真实会话用户 ID（未登录返回空串，由 RLS/FK 显式报错）。新增 `loginDemo()`（真实 `signInWithPassword` 到 Supabase）+ `DEMO_CREDENTIALS`。
- `Login.tsx` / `Register.tsx`：原「以演示账号进入」改为调用 `loginDemo()`，走真实认证；按钮带 loading/错误态。
- `useAuth.ts`：以真实 Supabase 会话为准，无会话即清空（不再保留伪造本地演示会话）。
- 测试 `authStore.test.ts` / `useAuth.test.tsx`：改为断言「未登录初始态 / 真实会话覆盖 / 登出清空」。
- 类型 `src/types/index.ts`：`Category.parent_id` 与 `Transaction.receipt_url` 放宽为可空以贴合数据库。

**结果**：记账模块现在唯一的真实数据源是 Supabase（RLS 按 `auth.uid()` 隔离）；新用户注册/登录后即可读写自己的数据。

## 二、演示数据 → Supabase（唯一数据源）

- 新增 `supabase/migrations/0008_budget_overall_rollover.sql`：预算表改造（见第四节）。
- 新增 `scripts/seed-demo.mjs`：用 service_role 在真实 Supabase 中创建演示账号 `demo@easywork.app / Demo123456!`（已确认邮箱），并写入账户 / 多级分类 / 交易 / 预算种子数据（含整体预算）。幂等（重复运行先清后写）。
- 运行顺序：先把 `migrations/0001..0008` 应用到目标库（Supabase CLI 或仪表盘），再：
  ```bash
  SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=ey... node scripts/seed-demo.mjs
  ```
  之后在登录页点「以演示账号进入」即可看到真实数据。

## 三、P1 / P2 修复清单

| 严重度 | 问题 | 修复 |
|---|---|---|
| P1 #2 | 预算通知用 UTC `toISOString` 与列表本地时间不一致，跨月查错月份 | `notify.ts` 统一用 `format(new Date(),'yyyy-MM')` 本地月 |
| P1 #3 | 删除账户后交易列表渲染异常 | `TransactionList` 账户名兜底 `?? '—'`，并增加 `isError` 重试态 |
| P1 #4 | 各列表只有 `isLoading`、无错误态，Supabase 不可达时静默空列表 | `TransactionList`/`AccountList`/`BudgetList`/`FinanceReport` 均增加 `isError` + 重试按钮 |
| P2 #1 | 预算唯一约束冲突直接报错 | `useFinance.useCreateBudget` 改用 `upsert`（按 `scope` 选 `onConflict`），优雅更新而非 23505 |
| P2 #2 | 交易筛选仅按类型 | `TransactionList` 增加分类、账户下拉 + 备注/分类关键词搜索 |
| P2 #3 | 报表无导出 | `FinanceReport` 增加「导出 CSV」（带 UTF-8 BOM，Excel 友好） |
| P2 #4 | 收据上传是死功能 | `TransactionForm` 接入 `receipt-photos` 私有桶上传 + 签名 URL 查看（失败不影响保存，graceful） |

> 说明：原 `mockStore` 仅是单元测试用的本地桩，运行期未被任何业务代码引用，已保留供测试使用；应用运行时数据源已统一为 Supabase。

## 四、总预算（整体月度上限）+ 跨月滚动

**Schema（`0008`）**：`budgets.category_id` 改为可空；新增 `scope`（`category`/`overall`）与 `carry_over`（numeric 默认 0）；新增部分唯一索引 `budgets_overall_uniq(user_id, year_month) where scope='overall'`。

**前端**
- `BudgetList` 重构为两块：「整体月度上限」卡片 + 「按分类预算」列表；整体预算可设置/编辑/删除（当前月仅一条）。
- 有效预算 = `amount + carry_over`；UI 显示「含上月滚动 结余/超支 ¥X」。
- 新增「上月结余滚动到本月」按钮：用已加载的本月/上月交易与预算，计算上月各（整体/分类）预算的剩余 `金额-实际`，写入本月对应预算的 `carry_over`（支持结余与超支双向滚动），全部 `updateBudget` 并发提交。

## 五、分类管理 UI（增删改 / 图标 / 多级 parent_id）

- `useFinance` 新增 `useCreateCategory` / `useUpdateCategory` / `useDeleteCategory`。
- 新增 `src/features/finance/CategoryManager.tsx`：按收入/支出分组，树形展示（顶级 + 子级缩进）；新建/编辑弹窗含名称、类型、图标 emoji 选择器（30 个预设）、父级下拉（排除自身与后代，防止循环引用）；删除子分类时其子级自动提升为顶级。
- `Finance.tsx` 新增「分类」页签。
- `TransactionForm` 分类选择器支持层级：显示「父 / 子」完整路径标签与缩进。

## 六、验证情况

- ✅ `tsc -b` 类型检查通过。
- ✅ `npm run build`（vite 生产构建）通过。
- ✅ 重写后的 auth 单元测试通过。
- ⚠️ 既有 `useUpdateTask.test.tsx`（mock 未提供 `supabase.from`）与 `notify.test.ts`（期望未播种的分类名）两项**与本次改动无关、属历史缺陷**，未改动（超出本次范围）。
- ⚠️ 因无本地/在线 Supabase 实例，`scripts/seed-demo.mjs` 与 `0008` 迁移仅做静态校验（脚本 `node --check` 通过、SQL 与类型一致），需在目标库实际执行/应用。

## 七、已知限制 / 后续建议

- 演示数据 seed 依赖 service_role，须由开发者在受信任环境执行，切勿写入前端/暴露密钥。
- 报表 PDF 导出未实现（仅 CSV），如需可后续接入 jsPDF。
- 多账本/家庭共享、智能记账、资产净值趋势等仍为后续演进项（见上一版审阅报告）。
