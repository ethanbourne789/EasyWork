# 记账模块全面优化设计

> 日期：2026-08-13
> 状态：Approved
> 范围：`src/features/finance/` 全部 6 个 Tab 页面 + 共享组件

---

## 1. 问题清单

### 1.1 设计系统违规

| # | 问题 | 位置 | 严重程度 |
|---|------|------|----------|
| D1 | 图表使用硬编码色值 `#6366f1`, `#10b981`, `#ef4444` | FinanceOverview, FinanceReport, 多处 | 高 |
| D2 | 圆角 `rounded-2xl` 过度使用，设计系统规定卡片用 `rounded-lg` | 所有 finance 页面 | 中 |
| D3 | Emoji 图标与 lucide-react 混用，违反「唯一图标源」原则 | AccountList, FinanceOverview, CategoryManager, TransactionForm | 高 |
| D4 | 预算进度条颜色硬编码，未用 `--success`/`--warning`/`--destructive` | FinanceOverview, BudgetList | 高 |
| D5 | 缺少 `prefers-reduced-motion` 支持 | 所有动画/过渡 | 中 |

### 1.2 功能按钮问题

| # | 问题 | 位置 |
|---|------|------|
| F1 | 总览页有「记一笔收入/支出」按钮 + FAB 浮动按钮，功能重复 | FinanceOverview + Finance |
| F2 | FAB 只在「总览」和「交易」页显示，其他页面无法快速记账 | Finance |
| F3 | 编辑/删除操作藏在展开详情内，操作步骤过多 | FinanceOverview, TransactionList |

### 1.3 响应式问题

| # | 问题 | 位置 |
|---|------|------|
| R1 | 移动端 Tab 标签文字被 `hidden`，只有图标，可访问性差 | Finance |
| R2 | 图表高度固定 `h-44`/`h-52`，不随屏幕变化 | FinanceOverview, FinanceReport |
| R3 | 交易列表多列布局虽已实现，但信息密度仍可提升 | TransactionList |
| R4 | 总览页 Hero 卡片在移动端过大 | FinanceOverview |

### 1.4 代码结构问题

| # | 问题 | 位置 |
|---|------|------|
| C1 | `Detail` 组件重复定义 | FinanceOverview, TransactionList |
| C2 | 预算进度条逻辑重复 | FinanceOverview, BudgetList |
| C3 | 加载/错误/空状态实现不统一 | 所有 finance 子页面 |
| C4 | 颜色常量 `COLORS` 数组重复 | FinanceOverview, FinanceReport |

---

## 2. 设计方案

### 2.1 设计令牌对齐

**图表颜色系统**：定义基于设计令牌的图表配色，使用 CSS 变量引用：

```ts
// src/features/finance/constants.ts
export const CHART_COLORS = [
  'var(--brand-500)',   // 主色
  'var(--success)',      // 收入/成功
  'var(--destructive)',  // 支出/警告
  'var(--warning)',      // 警告
  'var(--brand-300)',    // 次级
  'var(--brand-200)',    // 辅助
];
```

**圆角统一**：
- 卡片/容器：`rounded-lg` (14px, `--radius`)
- 按钮/输入框：`rounded-md` (10px)
- 小控件/徽章：`rounded-full` / `rounded-sm`

**图标全面替换为 lucide-react**：
- `💰` → `Wallet` / `PiggyBank`
- `💵` → `Banknote`
- `🏦` → `Building2`
- `💳` → `CreditCard`
- 分类 emoji 保留（用户自定义数据），UI 图标统一用 lucide

### 2.2 功能按钮精简

**记账入口统一为 FAB**：
- 移除 FinanceOverview 中的「记一笔收入/支出」按钮
- FAB 在所有 6 个 Tab 页显示（不限于总览和交易）
- FAB 保持三个动作：支出、收入、转账

**交易操作简化**：
- 桌面端：交易卡片右侧直接显示编辑/删除图标按钮（hover 显示）
- 移动端：滑动或长按菜单（简化为行内按钮）

### 2.3 响应式布局

**Tab 导航**：
- 桌面端（≥768px）：居中显示，图标+文字
- 平板端（768-1023px）：横向滚动，图标+文字
- 移动端（<768px）：横向滚动，图标+文字（不再隐藏文字）

**图表响应式高度**：
- `h-32 sm:h-44 md:h-52 lg:h-64` 阶梯式高度

**交易列表布局**：
- 移动端：单列卡片
- 平板端：2 列
- 桌面端：3 列
- 大屏（≥1536px）：4 列
- 桌面端卡片显示更多信息（类型、分类），减少展开需求

**总览页布局**：
- 移动端：Hero 卡片简化为紧凑统计行，纵向堆叠
- 平板端及以上：左右两栏（2:1）
- Hero 卡片字体响应式：`text-3xl sm:text-4xl lg:text-5xl`

### 2.4 组件抽取

**新增共享组件**（放在 `src/features/finance/` 下）：

1. `TransactionItem.tsx` - 交易卡片组件
   - Props: `transaction`, `onEdit`, `onDelete`, `compact?`
   - 包含：图标、备注/分类名、账户、金额、操作按钮

2. `BudgetProgressBar.tsx` - 预算进度条组件
   - Props: `name`, `icon`, `spent`, `effective`, `carryOver?`
   - 包含：名称、进度条、百分比、超支/剩余提示

3. `EmptyState.tsx` - 统一空状态
   - Props: `icon`, `title`, `description`, `action?`

4. `LoadingState.tsx` - 统一加载状态
   - 使用骨架屏替代文字

5. `constants.ts` - 共享常量
   - `CHART_COLORS`, `ACCOUNT_TYPE_ICONS`, 等

### 2.5 页面级改动

#### Finance.tsx（主入口）
- FAB 显示条件从 `overview | transactions` 改为始终显示
- Tab 导航移除 `hidden sm:inline`，改为始终显示文字
- 页面容器 `max-w-7xl` 保持不变

#### FinanceOverview.tsx（总览）
- 移除「记一笔收入/支出」按钮
- Hero 卡片改用设计令牌渐变（`from-primary to-brand-600`）
- 圆角 `rounded-2xl` → `rounded-lg`
- 图表颜色使用 `CHART_COLORS`
- 预算部分使用 `BudgetProgressBar` 组件
- 交易明细使用 `TransactionItem` 组件
- 图表高度响应式
- 移动端 Hero 紧凑化

#### TransactionList.tsx（交易列表）
- 使用 `TransactionItem` 组件
- 使用 `EmptyState` 组件
- 搜索框使用项目 `Input` 组件（样式统一）
- 分类/账户筛选器使用 shadcn `Select` 组件

#### TransactionForm.tsx（记账表单）
- 保持核心逻辑不变
- 分类 picker 图标保留 emoji（用户数据），边框/选中态用设计令牌
- 快速记账按钮样式优化
- 表单容器圆角统一

#### AccountList.tsx（账户管理）
- 账户类型图标改用 lucide-react（`Banknote`/`Building2`/`CreditCard`）
- Hero 卡片圆角 `rounded-lg`
- 资产分布/近期动态使用统一组件

#### BudgetList.tsx（预算管理）
- 使用 `BudgetProgressBar` 组件
- 圆角统一

#### CategoryManager.tsx（分类管理）
- 分类卡片使用 lucide-react 图标（UI 层面）
- 空状态使用 `EmptyState` 组件

#### FinanceReport.tsx（报表）
- 图表颜色使用 `CHART_COLORS`
- 图表高度响应式
- 月份选择器样式统一

---

## 3. 实施顺序

1. **Phase 1** - 基础设施：`constants.ts` + 共享组件
2. **Phase 2** - Finance.tsx + FinanceOverview.tsx（最高频页面）
3. **Phase 3** - TransactionList.tsx + TransactionForm.tsx
4. **Phase 4** - AccountList.tsx + BudgetList.tsx
5. **Phase 5** - CategoryManager.tsx + FinanceReport.tsx
6. **Phase 6** - 浏览器测试验证（5 个断点截图）

---

## 4. 验收标准

### 设计系统合规
- [ ] 无硬编码颜色值（`#xxx` 格式）
- [ ] 圆角符合规范（卡片 `rounded-lg`，按钮 `rounded-md`）
- [ ] UI 图标全部使用 lucide-react
- [ ] 颜色通过 CSS 变量 / Tailwind 工具类引用

### 功能完整性
- [ ] 6 个 Tab 均可正常访问
- [ ] 记账 FAB 在所有 Tab 可见
- [ ]  CRUD 操作（增删改查）全部正常
- [ ] 预算滚动、收据上传功能正常
- [ ] 导出 CSV 功能正常

### 响应式验证
- [ ] 375px（iPhone SE）所有页面可正常滚动和操作
- [ ] 768px（iPad 竖屏）布局合理
- [ ] 1024px（iPad 横屏）三列布局正常
- [ ] 1440px（桌面）四列布局正常
- [ ] 1920px（大屏）信息密度充足

### 无障碍
- [ ] 所有图标按钮有 `aria-label`
- [ ] Tab 导航键盘可访问
- [ ] 颜色不作为唯一信息载体

---

## 5. 不变项

- 数据库 schema 不变
- API 调用逻辑不变
- 数据模型不变
- 国际化 key 不变
- 路由结构不变
