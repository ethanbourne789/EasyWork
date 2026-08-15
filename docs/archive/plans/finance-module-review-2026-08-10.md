# EasyWork 记账（Finance）模块全面审阅报告

> 审阅日期：2026-08-10
> 范围：`src/features/finance/**`、`src/lib/supabase.ts`、`src/features/auth/*`、`supabase/migrations/*`
> 结论先行：**Supabase 存储层已完整实现（表结构 + RLS + 增删改查），日常收支/转账、账户、预算、基础报表均已开发；但存在 1 个 P0 级「演示模式不可用」阻断性缺陷，以及若干功能缺口。模块并未达到"全功能"。**

---

## 一、已实现功能（盘点）

| 功能 | 状态 | 位置 |
|---|---|---|
| 交易记录（支出/收入/转账） | ✅ | `TransactionForm.tsx` / `useFinance.ts` |
| 交易列表 + 按类型筛选 + 展开详情 + 编辑/删除 | ✅ | `TransactionList.tsx` |
| 账户（现金/银行卡/信用卡）+ 派生余额 + 总资产 | ✅ | `AccountList.tsx` |
| 预算（按分类/按月） + 进度条 + 超支标记 | ✅ | `BudgetList.tsx` |
| 报表（月度收支柱图、支出分类饼图、近7天趋势线） | ✅ | `FinanceReport.tsx` |
| 快速记账、金额快捷按钮 | ✅ | `TransactionForm.tsx` |
| 预算超支本地通知（需用户开启） | ✅ | `lib/notify.ts` |
| Supabase 表结构 + RLS + 触发器 | ✅ | `supabase/migrations/0003_finance.sql` |
| 仪表盘"本月支出"卡片 | ✅ | `dashboard/OverviewCards.tsx` |

---

## 二、关键结论：是否"全功能 + Supabase 存储"

**Supabase 存储：架构层已完成，运行层存在阻断性缺陷。**

1. 数据库 schema 完整：`accounts / categories / transactions / budgets` 四表齐全，含外键、唯一约束 `(user_id, category_id, year_month)`、RLS 策略（`auth.uid() = user_id`）与 `updated_at` 触发器。
2. 前端 `useFinance.ts` 用 `@tanstack/react-query` + Supabase JS 实现了完整的 Query/Mutation，**但全部依赖真实登录会话的 RLS**。
3. **致命矛盾**：`getCurrentUserId()`（`authStore.ts:46`）返回硬编码 `DEMO_USER_ID`，而 `supabase.ts` 用 anon key 且**从未以该用户真实登录**。RLS 的 `auth.uid()` 在演示模式下为 `null` → 所有 select 返回空、所有 insert 被 `with check` 拒绝。
4. 原本用于离线/演示的 `mockStore.ts`（含 10 条分类、账户、交易、预算种子）**在运行期完全未被接入**（仅测试引用），形成"死代码"。

> 即：点「以演示账号进入」后，记账/任务等模块**看不到任何数据、也无法保存**。真实 Supabase 登录路径可用，但演示入口是断裂的。

---

## 三、Bug 清单（按严重度）

### P0 — 阻断性
- **演示账号模式与 RLS 不兼容（空数据 + 无法写入）**
  - 位置：`authStore.ts:46-48`、`lib/supabase.ts:11`、`supabase/migrations/0003_finance.sql:60-63` 等
  - 现象：演示模式进入后 finance 全模块空白，新建交易被拒。
  - 修复方向：演示模式应回退到 `mockStore`（双轨，已有现成代码）；或移除「演示账号」入口，强制真实登录。

### P1 — 功能缺口 / 逻辑错误
- **分类无法管理**：`useFinance.ts` 无 `create/update/deleteCategory` 的 mutation，`TransactionForm.tsx` 只读取 `useCategories()`。用户只能使用种子 10 个固定分类，无法新增"打车/宠物"等；`Category.parent_id`（多级分类）schema 已定义但前端未用。
- **预算超支提醒时区不一致**：`notify.ts:61` 用 `new Date().toISOString().slice(0,7)`（UTC），`BudgetList.tsx:39` 用 `format(new Date(),'yyyy-MM')`（本地）。UTC+8 每月初/末数小时窗口内查错月份，漏报/误报超支。
- **删除账户后交易显示 `undefined`**：`TransactionList.tsx:110` 用 `{account?.name}` 直接渲染；账户被删后（FK `set null`）`account` 为 `undefined`，页面显示字符串 "undefined"。应回退为"已删除账户"。
- **无错误态处理**：`AccountList/BudgetList/TransactionList` 仅判断 `isLoading`，未处理 `isError`。Supabase 不可达或鉴权失败时静默显示空列表，无任何错误提示。

### P2 — 健壮 / 体验
- **预算唯一约束未优雅处理**：DB 有 `unique(user_id, category_id, year_month)`，但 `useCreateBudget` 未捕获唯一冲突，异常时直接抛错。
- **交易列表筛选太弱**：`TransactionList.tsx` 仅按类型筛选；缺分类、账户、日期区间、金额区间、关键词搜索（全局搜索仅 `?focus=` 深链）。
- **报表能力有限**：`FinanceReport.tsx` 仅月度柱图 + 支出饼图 + 近7天线图；缺导出(CSV/PDF)、收入结构拆解、净资产/结余曲线、多月对比、与预算对比、账户维度；趋势图固定近7天，不随顶部"选择月份"变化。
- **收据上传为死功能**：`receipt_url` 字段、`receipt-photos` 存储桶与 RLS 已建（`0006_storage_and_indexes.sql`），但前端无任何上传/查看入口。
- **金额用 JS number**：前端 `amount` 为浮点，存在 `0.1+0.2` 精度风险（DB 是 `numeric(12,2)` 精确）。建议以"分"整数或 decimal 库处理。
- **冗余 invalidate**：`useCreateTransaction/useUpdateTransaction` 的 `onSuccess` 多余地 invalidate `accounts`（余额是派生计算，不更新列），属无害冗余，可精简。

---

## 四、待实现 / 完善（需求层）

- [ ] 分类管理 UI（增删改、图标、支持多级 `parent_id`）
- [ ] 周期性/模板交易（工资、房租自动入账）
- [ ] 总预算（整体月度支出上限）+ 预算跨月滚动，当前仅支持"按分类"
- [ ] 报表导出（CSV/PDF）+ 更丰富图表（收入结构、结余曲线、同比环比、与预算对比）
- [ ] 交易批量操作（多选删除 / 改分类）
- [ ] 数据导入导出 CSV，并与真实 Supabase 打通（当前 `mockStore` 导入对 Supabase 不可见）
- [ ] 演示/离线模式回退到 `mockStore`（修复 P0）或移除演示入口

---

## 五、推荐新增（产品增强）

1. **资产净值趋势 + 多账户汇总图**：当前只有分类饼图，缺"净资产随时间变化"曲线。
2. **预算预警升级**：当前仅本地 `Notification` 且默认关闭；可加"邮件/系统通知"与"进入即弹窗提醒"，并在仪表盘显示月度预算执行率。
3. **智能记账**：常用金额/分类记忆、最近交易一键复记、桌面 Widget 快速记账。
4. **账单扫描 / 收据 OCR**：配合已有的 `receipt-photos` 桶，拍照自动识别金额与商家。
5. **多账本 / 家庭共享**：RLS 已按 `user_id` 隔离，可扩展 `group_id` 支持共享账本。
6. **跨模块联动**：如"还信用卡"任务到期自动生成支出交易；日历视图展示每日收支。
7. **多币种 / 汇率**：账户 `currency` 字段已存在但写死 CNY，可放开并做汇率换算。

---

## 六、优先修复建议（排序）

1. **P0：演示模式回退 mockStore 或移除演示入口**（否则新用户一进来就是空壳，体验归零）。
2. **P1：补充分类管理 UI**（记账类产品无自定义分类是不可接受的）。
3. **P1：修复通知时区 + 增加 isError 错误态**。
4. **P2：交易筛选增强 + 报表导出 + 收据上传落地**。
