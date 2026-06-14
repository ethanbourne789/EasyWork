# 记账模块布局重构

## 问题

记账模块页面顶部排列了 5 个操作按钮（导入 CSV、导出 CSV、预算管理、管理分类、记一笔），在小屏设备（Android 手机）上会溢出容器，导致按钮换行混乱或超出屏幕边界。

## 方案

### 1. 功能按钮 → 齿轮设置弹窗

将导入/导出/预算管理/管理分类 4 个功能按钮从页面顶部移除，合并到单个齿轮图标（Settings）按钮中。点击齿轮图标弹出设置弹窗：

- **弹窗形式**：居中浮层（Modal），白色卡片，圆角边框
- **布局**：垂直列表，每项含图标 + 文字说明
- **选项**：
  - 📥 导入 CSV → 触发文件选择器
  - 📤 导出 CSV → 生成文件并下载
  - 🎯 预算管理 → 打开 BudgetManager 弹窗
  - 🏷 管理分类 → 打开 CategoryManager 弹窗
- **关闭**：点击弹窗外区域或 × 按钮关闭

### 2. 记一笔 → 悬浮按钮（FAB）

将"记一笔"从顶部按钮行移到页面右下角的悬浮操作按钮：

- **位置**：`position: fixed; bottom: 24px; right: 24px`，始终可见
- **样式**：48×48px 圆形，primary-600 紫色背景，白色 + 图标
- **行为**：点击直接打开 TransactionForm 创建弹窗
- **不影响**：编辑交易记录的流程不变（仍通过点击列表项触发）

## 修改文件

`src/routes/accounting.tsx`
- 新增 `showSettings` 状态
- 替换按钮行为齿轮 + 设置弹窗 + FAB
- 总数：+56 行 / -18 行

## 未改动

- 所有现有 handler（handleImportCsv, handleExportCsv 等）不变
- TransactionForm / CategoryManager / BudgetManager 组件不变
- 账单列表、饼图、摘要卡片不变
