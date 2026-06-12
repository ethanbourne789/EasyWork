---
title: 记账模块设计
description: 轻量个人账本 — 交易、分类、预算、统计、导入导出
date: 2026-06-12
tags:
  - EasyWork
  - accounting
  - design
  - tauri
  - react
status: approved
---

# 记账模块设计（EasyWork · app-accounting）

> [!info] 一句话定位
> **轻量个人账本**：单一账户，按日记录收入/支出；总预算 + 分类预算；趋势 / 分类占比 / 月对比三种图表；支持支付宝 + 微信 CSV 导入与 Excel/CSV 导出；图片附件。
>
> 适配 **Windows 桌面 + Android 手机** 双端响应式布局。

---

## 一、目标与非目标

### 1.1 目标
- 提供"打开就能用"的个人记账体验：默认 10 个支出 + 5 个收入内建分类，开箱即用
- 桌面端单页信息密度高（3 Tab：主页 / 明细 / 设置），移动端单列流畅
- 离线优先；本地 SQLite 存储，导出/导入做数据迁移

### 1.2 非目标（v1 不做）
- 多账户/钱包、转账、应收应付
- 周期账单（房租/订阅自动生成）
- 多币种、汇率换算
- 多人协作、家庭账本
- 云同步、跨设备实时同步
- 银行账单识别（QFX/OFX）

---

## 二、决策摘要

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 定位 | 轻量个人账本 |
| 2 | 预算粒度 | 总预算 + 分类预算（按月） |
| 3 | 周期账单 | 不支持 |
| 4 | 导入来源 | 支付宝 + 微信 CSV |
| 5 | 统计图表 | 趋势折线 + 分类饼图 + 月对比柱状 |
| 6 | Tab 结构 | 主页 / 明细 / 设置（3 Tab，原 5 Tab 合并） |
| 7 | 记一笔交互 | 底部 Drawer 抽屉 |
| 8 | 时间切换 | 左右箭头 + 月份选择器 |
| 9 | 字段范围 | 基础 + 图片附件（无位置标签） |
| 10 | 数据模型 | 单一扁平 + 配置项（categories/budgets） |

---

## 三、架构与文件结构

### 3.1 新增/修改文件

```
apps/app-accounting/src/
├── App.tsx                              # 顶层 + 3 Tabs 路由（zustand activeTab）
├── pages/
│   ├── OverviewPage.tsx                 # 主页（合并：概览+统计+预算）
│   ├── DetailPage.tsx                   # 明细
│   └── SettingsPage.tsx                 # 设置
├── components/
│   ├── RecordDrawer.tsx                 # 记一笔底部抽屉
│   ├── TransactionItem.tsx              # 流水行
│   ├── BudgetProgressBar.tsx            # 通用预算进度条
│   ├── MonthSwitcher.tsx                # 左右箭头+月份选择器
│   ├── CategoryPicker.tsx               # 分类选择器（图标的网格）
│   ├── ImageAttachment.tsx              # 附件上传/预览
│   ├── ImportWizard.tsx                 # CSV 导入向导
│   └── charts/
│       ├── TrendLineChart.tsx
│       ├── CategoryPieChart.tsx
│       └── MonthBarChart.tsx
├── store/
│   └── accountingStore.ts               # zustand：activeTab、当前年月、筛选、缓存
├── hooks/
│   ├── useTransactions.ts
│   ├── useBudget.ts
│   ├── useCategories.ts
│   └── useStats.ts
└── utils/
    ├── csv-parser.ts                    # 支付宝/微信 CSV 解析
    ├── amount.ts                        # 千分位、颜色
    └── date.ts

src-tauri/src/commands/accounting.rs     # 扩展现有 Commands
src-tauri/src/db/migrations/V4__accounting_ext.sql
src-tauri/src/services/accounting/
    ├── mod.rs
    ├── importer.rs
    ├── stats.rs
    └── export.rs
```

### 3.2 数据库 Schema 变更（V4 迁移）

```sql
-- 1) 扩展 transactions：加图片附件
ALTER TABLE transactions ADD COLUMN attachment_path TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- 2) 分类表（二级）
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL CHECK(type IN ('income','expense')),
    icon        TEXT    DEFAULT '',
    color       TEXT    DEFAULT '#1E5DA8',
    sort_order  INTEGER DEFAULT 0,
    is_builtin  INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_type ON categories(type);

-- 3) 预算表（按月+作用域）
CREATE TABLE IF NOT EXISTS budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT    NOT NULL CHECK(scope IN ('total','category')),
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    period      TEXT    NOT NULL,         -- 'YYYY-MM'
    amount      REAL    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(scope, category_id, period)
);
CREATE INDEX idx_budgets_period ON budgets(period);

-- 4) 导入历史
CREATE TABLE IF NOT EXISTS imports_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT    NOT NULL,        -- 'alipay' | 'wechat'
    file_name    TEXT    NOT NULL,
    total_rows   INTEGER NOT NULL,
    imported     INTEGER NOT NULL,
    skipped      INTEGER NOT NULL,
    failed       INTEGER NOT NULL,
    imported_at  TEXT    DEFAULT (datetime('now'))
);
```

> 说明：现有 `transactions.subcategory` 字段（`TEXT DEFAULT ''`）保留作为冗余缓存；分类下钻时优先查 `categories.parent_id` 关联。

### 3.3 扩展的 Tauri Commands

| Command | 用途 |
|---|---|
| `txn_list(start,end,type,category_id,keyword,limit,offset)` | 流水查询（扩展筛选） |
| `txn_create(txn_type,amount,category,subcategory,note,date,attachment_path)` | 创建（位置参数，向后兼容；新增 `attachment_path`） |
| `txn_update(id,txn_type,amount,category,subcategory,note,date,attachment_path)` | 更新（位置参数） |
| `txn_delete(id)` / `txn_get(id)` | 删/查详情 |
| `cat_list(type)` / `cat_create` / `cat_update` / `cat_delete` | 分类 CRUD（`is_builtin` 不可删） |
| `budget_get(period)` / `budget_set(scope, category_id, period, amount)` / `budget_delete` | 预算 CRUD |
| `stats_summary(period)` | 单月摘要（收入/支出/余额/储蓄率/预算使用率） |
| `stats_trend(start,end,granularity)` | 趋势数据（按日/周聚合） |
| `stats_by_category(period, type)` | 分类占比 |
| `stats_monthly_compare(months)` | 近 N 月对比 |
| `import_csv(source, content)` | 解析 CSV 返回预览（不入库） |
| `import_commit(rows, source, file_name)` | 确认后批量写入 |
| `export_transactions(period, format)` | 导出 Excel/CSV |
| `attachment_save(base64, ext)` / `attachment_delete(path)` | 附件读写 |

---

## 四、字段约束与不变量

| 字段 | 规则 |
|---|---|
| `amount` | `> 0`，`≤ 1e9`；最多 2 位小数 |
| `type` | `'income'` / `'expense'` 二选一 |
| `date` | `YYYY-MM-DD`；不允许未来日期（> 今天报错） |
| `category` 名 | 必须在 `categories` 表中存在；`type` 必须匹配 |
| `attachment_path` | 相对路径 `attachments/accounting/{YYYY-MM}/{uuid}.{ext}`，仅 png/jpg/jpeg/heic；≤5MB |
| `period`（预算） | `YYYY-MM` |

### 4.1 内建分类（`is_builtin=1` 不可删、不可改 type）

```
expense: 餐饮 交通 购物 娱乐 住房 医疗 教育 通讯 旅行 其他
income:  工资 奖金 投资 兼职 红包 其他
```

---

## 五、关键 Service 流程

### 5.1 CSV 导入流程（`importer.rs`）

```
1. 读文件 -> encoding_rs 自动嗅探 UTF-8 / GBK
2. 嗅探 header:
     含 ["交易号","收/支","金额"] → alipay
     含 ["交易单号","收/支","金额"] → wechat
     其他 → 报错"无法识别来源"
3. 字段映射 → ParsedRow {date, type, amount, counterparty, note}
4. 校验:
     - date/amount 解析失败 → row 入 parse_errors
     - date 超过今天 → row 入 parse_errors (warn, 仍可导入)
5. 去重: 4-tuple (date, amount, counterparty, type) 在 transactions 查重
6. 返回 ImportPreview { rows, parse_errors, duplicates }
7. 前端 ImportWizard 显示预览，用户勾选要导入的行
8. import_commit 事务批量写入 + imports_log
```

### 5.2 统计计算（`stats.rs`）

- `stats_summary(period)`：单条聚合 SQL，按月过滤；返回 `{total_income, total_expense, balance, savings_rate, budget_usage_rate}`
- `stats_trend(start,end,granularity)`：`strftime('%Y-%m-%d', date)` 按日/周聚合；利用 `idx_transactions_date` 索引
- `stats_by_category`：JOIN `transactions.subcategory` → `categories` 聚合；二级分类时上卷到父类（递归 CTE）
- `stats_monthly_compare(months)`：用 `WITH RECURSIVE` 生成月份序列，LEFT JOIN 避免缺月空值

### 5.3 预算使用率

```
total:        min(expense_total / budget_total, 1.0)
category:     min(expense_in_category / category_budget, 1.0)
```

> 颜色阈值：>80% 红，60–80% 黄，<60% 蓝渐变

### 5.4 附件存储

- 物理路径：`{app_data_dir}/attachments/accounting/{YYYY-MM}/{uuid}.{ext}`
- 写入：`attachment_save(base64, ext)` → 写文件 → 返回相对路径
- 替换/删除：旧文件保留（`is_orphan=1` 标记）
- 启动清理：超过 30 天无引用的 orphan 文件由后台任务清理

---

## 六、UI 设计

### 6.1 三个 Tab 结构

| Tab | 桌面（≥1024px） | 移动端（<768px） |
|---|---|---|
| **主页** | 12 栅格：4 KPI + 趋势(8)+总预算(4) + 饼图(4)+分类预算(4)+月对比(4) + 最近10笔(8)+Top5(4) | 2×2 KPI 网格 + 单列堆叠：总预算 / 趋势 / 饼图 / 分类预算 / 月对比 / 最近流水 |
| **明细** | 左侧 240px 筛选面板 + 右侧流水列表 | 顶部 MonthSwitcher + 横向滚动 Chip 筛选 + 单列流水 |
| **设置** | 2×N 功能卡：导入 / 导出 / 分类管理 / 预算提醒 / 清空 | 5 行竖向列表 |

### 6.2 主页桌面布局（12 栅格）

```
┌────────────────────────────────────────────────────────────────┐
│ KPI: ↑收入    │ KPI: ↓支出   │ KPI: 结余    │ KPI: 储蓄率     │
├──────────────────────────────────────┬─────────────────────────┤
│ 近 30 天收支趋势 (8 cols)             │ 总预算 (4 cols)         │
├──────────────────┬────────────────────┼─────────────────────────┤
│ 分类饼图 (4)     │ 分类预算 (4)       │ 月度对比 (4)            │
├──────────────────────────────────────┴─────────────────────────┤
│ 最近 10 笔 (8 cols)                          │ Top 5 (4 cols)  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 响应式断点

| 断点 | 布局 |
|---|---|
| Desktop ≥1024px | 12 栅格（KPI 1×4，趋势 8+预算 4，下方 4+4+4） |
| Tablet 768–1023px | 6 栅格（KPI 1×2，趋势整行，下方两行 2+2+2） |
| Mobile <768px | 1 列（KPI 2×2，其余单列堆叠） |

### 6.4 记一笔 Drawer

- 桌面：固定 60% 屏高
- 移动：默认 70%，可上滑到 90%
- 字段：类型切换（支出/收入）→ 分类网格（5×2 共 10 个）→ 金额（大字号）→ 日期 / 附件 / 备注 → 保存
- 数字输入 `inputmode="decimal"` 调起数字键盘
- 移动端监听 `resize` 自动上滑 Drawer 避免键盘遮挡

### 6.5 储蓄率展示规则

- 收入为 0：显示 `—`
- 0–50%：灰色
- 50–80%：蓝色
- >80%：绿色（"超额储蓄"）
- >100%：显示绝对值（如 `+5%` 表示"超额 5%"），蓝色

---

## 七、错误处理

| 触发场景 | 前端处理 | 后端处理 | UI 反馈 |
|---|---|---|---|
| 金额 ≤ 0 / 非数字 | 实时校验 | `InvalidInput` | 输入框红框 + 文案"请输入有效金额" |
| 金额 > 1e9 | `max` 限制 | 后端校验 | 提示"单笔上限 10 亿" |
| 未来日期 | picker 不允许选未来 | 后端校验 | 提示"日期不能晚于今天" |
| 分类已归档 | 隐藏该分类 | 查询过滤 | — |
| 分类 type 不匹配 | 切换类型时重置 | 写入校验 | 提示"该分类不支持当前类型" |
| 必填项缺失 | 保存按钮禁用 | `InvalidInput` | 字段红框 |
| 重复名分类 | 输入实时查 | `UNIQUE` 约束 | 输入框下方文案 |
| 删除有交易的分类 | — | `ON DELETE CASCADE` 把交易 subcategory 置 NULL | 弹确认"将同时清除 N 笔流水的分类" |
| 删除最后一笔总预算 | 前端确认 | — | 弹确认 |
| 附件超 5MB | 客户端 `File.size` 拦截 | 后端二次校验 | 提示"附件最大 5MB" |
| 附件格式不符 | 客户端扩展名校验 | 后端白名单 | 提示"仅支持 png/jpg/jpeg/heic" |
| SQLite 锁竞争 | 重试 + Toast | 错误冒泡 | "数据忙，请重试" |
| 网络/IO 错误 | 全局 ErrorBoundary | — | 错误页 + 重试按钮 |

---

## 八、边界与不变量（必覆盖测试）

| 边界 | 期望行为 |
|---|---|
| 跨年查询 (2025-12 ~ 2026-02) | 返回 3 个月合并结果，按 date 排序 |
| 同一秒内连续创建两笔 | 各自独立 `id`，`created_at` 可能相同 |
| 删除某分类后该分类的流水 | subcategory 保留历史值；新统计不计入该分类 |
| 导入 10000 行 CSV | 事务分批（每批 500），UI 显示进度条 |
| 附件图片 EXIF 旋转 | 写入前用 `image` crate 自动旋转 |
| 月末 23:59 创建，跨天后查看 | 按 `date` 字段归属，不按 `created_at` |
| 预算为 0 | 显示 0% 不报错 |
| 储蓄率 (收入为 0) | 显示 `—`（不显示 0% 或 Infinity） |
| 月度对比含未发生月份 | 柱状图为 0，柱子仍显示（高度 0） |
| 金额含千分位的输入 ("1,000") | 前端 `parseFloat` 自动剥离逗号 |

---

## 九、Dashboard 集成

- 主 Shell Dashboard 的「消费金额」卡片：取 `stats_summary(period='current_month')`
- 同步要求：每 30 秒拉取一次
- 跳转：主 Dashboard 点击消费金额卡 → 记账「主页」Tab，定位到当前月

---

## 十、依赖新增

| 用途 | 包 | 备注 |
|---|---|---|
| 图表 | `recharts` | 与 MUI 风格契合；API 直观 |
| CSV 解析 | `papaparse` | 浏览器侧 |
| 日期 | `date-fns` | 替代 dayjs（按团队倾向） |
| 文件对话框 | `@tauri-apps/plugin-dialog` | CSV 选择 |
| 通知 | `@tauri-apps/plugin-notification` | 预算预警 |
| 编码（Rust） | `encoding_rs` | GBK 兼容 |
| 图片旋转（Rust） | `image` crate | EXIF 校正 |
| Excel 导出（Rust） | `rust_xlsxwriter` | 后端生成 |

---

## 十一、测试策略

### 11.1 后端（Rust）

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元 | `cargo test` 内联 `#[cfg(test)]` | `importer.rs` 字段映射、`stats.rs` SQL 聚合、`csv-parser` 编码嗅探 |
| 集成 | `tests/accounting_e2e.rs` | 建库 → 导入 100 行 → 查 stats → 导出 → 比对 |
| Migration | `rusqlite::Connection::open_in_memory()` | V4 迁移在空库上跑通；幂等 |
| 性能 | `criterion` | 1 万行 `stats_trend` < 50ms |

### 11.2 前端

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 组件 | Vitest + @testing-library/react | `RecordDrawer` 校验、`BudgetProgressBar` 颜色切换 |
| Hooks | Vitest + mock tauri invoke | 缓存、筛选序列化 |
| 工具 | Vitest | `csv-parser.ts`、`amount.ts` |
| E2E | Playwright + Tauri | 见下方 7 个关键场景 |

### 11.3 端到端关键场景（必跑）

1. **核心循环**：新建 → 明细/主页出现 → 编辑 → 删除 → 列表恢复
2. **导入完整链路**：选支付宝 CSV → 预览 → 勾选 → 提交 → 历史可见
3. **预算预警**：分类预算 80% → Toast + 系统通知
4. **筛选组合**：日期 + 类型 + 分类 + 关键字 → 结果数与 SQL 一致
5. **响应式**：窗口 1280 / 800 / 375 切换布局无错位
6. **附件**：上传 1MB / 5MB+1KB / 非法格式 / 替换 / 删除
7. **离线**：断网后所有本地操作仍可用

---

## 十二、实施步骤

| Phase | 内容 | 估时 | 依赖 |
|---|---|---|---|
| P1 | DB V4 迁移 + 索引 | 0.5d | 无 |
| P2 | 后端 Commands：txn/cat/budget CRUD | 1.5d | P1 |
| P3 | 后端 stats.rs | 1d | P2 |
| P4 | 后端 importer.rs + export.rs | 1.5d | P2 |
| P5 | 前端 store + hooks | 0.5d | P2 |
| P6 | 页面骨架：3 Tab + MonthSwitcher + 断点 | 1d | P5 |
| P7 | OverviewPage（合并主页） | 1.5d | P5,P6 |
| P8 | DetailPage | 1d | P5,P6 |
| P9 | SettingsPage + ImportWizard + 导出 | 1d | P4,P6 |
| P10 | RecordDrawer 完整流程 | 1d | P2,P6 |
| P11 | 预算编辑/通知 | 0.5d | P2 |
| P12 | 测试：单元 + 集成 + E2E | 1.5d | P1–P11 |
| P13 | 主 Shell Dashboard 集成 | 0.5d | P3 |
| P14 | 文档 + Demo 数据校验 | 0.5d | P12 |

**总估时：~13 人天**

---

## 十三、风险与缓解

| 风险 | 缓解 |
|---|---|
| Tauri 通知在某些 Android 版本限制 | 兼容回退到应用内 Toast |
| 微信 CSV 格式版本变化 | 内置 2–3 种 header 模式匹配 + 未知时回退到向导式映射 |
| 大数据量下统计慢 | 加索引 + 缓存本月 stats 到 zustand，30s 过期 |
| 附件目录膨胀 | 30 天 orphan 清理 + 用户导出后建议清理 |
| 移动端键盘遮挡 Drawer | 监听 `resize` 自动上滑 |
| 储蓄率展示反直觉 | >100% 时显示"超额储蓄"+ 不同颜色 |

---

## 十四、与 EasyWork 整体的关系

- **不依赖** 其他模块（独立可运行）
- **被依赖**：
  - 主 Shell Dashboard（消费金额卡片）
  - 日历模块（月视图中显示当日支出汇总，未来扩展）
- **数据格式约束**：严格遵循 `docs/EasyWork手写设计文档.md` 中"个人财务管理"小节 + README 中的"账单导入"小节
- **Demo 数据**：保持与最终数据一致。`categories` / `budgets` / `imports_log` 三表的种子数据由 V4 迁移脚本追加（不在本设计交付范围；具体种子内容由数据初始化任务单独确定）。

---

## 十五、参考

- 设计文档：`docs/EasyWork手写设计文档.md` § 3.7
- 项目 README：`README.zh-CN.md` § 记账（财务管理）
- EasyWork 设计主文档：见 § 一
- 现状后端：`src-tauri/src/commands/accounting.rs`
- 现状前端：`apps/app-accounting/src/App.tsx`
