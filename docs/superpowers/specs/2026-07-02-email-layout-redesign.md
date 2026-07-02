# Email 模块布局重构设计

## 概述

重构邮件模块主页面的布局，实现宽屏（桌面）四栏布局和窄屏（移动）两栏布局的响应式切换。

## 断点

- 使用 `MediaQuery.of(context).size.width > 600` 作为宽/窄屏切换阈值
- 复用 AppShell 已有断点逻辑

## 布局

### 宽屏 (>600px) — 四栏

```
┌─────────────────────────────────────────────────────────────────────┐
│  AppShell                                                           │
│  ┌──────────┬────────────────────┬────────────────────┬──────────┐  │
│  │ Col 1    │ Col 2             │ Col 3              │ Col 4    │  │
│  │ 导航栏   │ 邮件列表          │ 邮件正文            │ 工具栏   │  │
│  │ Fix 72px │ flex: 2           │ flex: 3            │ Fix 56px │  │
│  └──────────┴────────────────────┴────────────────────┴──────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

- Col 2 只显示邮件列表，不显示文件夹标签
- Col 3 自动选中第一封邮件，点击邮件列表条目切换
- Col 4 窄边工具栏，仿 NavigationRail 样式，图标 + 悬停文字提示

### 窄屏 (≤600px) — 两栏

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ ☰ 邮件                  ⋮   │    │ ← 返回   邮件正文           │
│ ───────────────────────────  │    │ ───────────────────────────  │
│ 邮件列表（默认收件箱）       │    │ 邮件详情                    │
│                              │    │                             │
│ Email 1            → push   │    │ From: XX                    │
│ Email 2                      │    │ Subject: ...                │
│ Email 3                      │    │ HTML Body                   │
└──────────────────────────────┘    └──────────────────────────────┘
    默认视图                         点击邮件后
```

- 左侧栏通过 AppShell 的 Drawer 访问（☰ 汉堡按钮）
- 右上角 ⋮ 弹出菜单包含全部工具栏功能
- 点击邮件 → `Navigator.push` 进入详情页，返回回到列表

## 组件拆分

| 组件 | 文件 | 职责 |
|------|------|------|
| `EmailListPage` | `email_list_page.dart` | 布局路由，根据断点切换宽/窄布局 |
| `_WideEmailLayout` | 同文件 | 宽屏 Row 容器：Col 2 + Col 3 + Col 4 |
| `_NarrowEmailLayout` | 同文件 | 窄屏：邮件列表 + push → 详情页 |
| `EmailListView` | 新文件 / 同文件 | 纯邮件列表，不含文件夹标签 |
| `EmailToolbar` | 新文件 / 同文件 | Col 4 工具栏 |
| `EmailDetailView` | 新文件 / 同文件 | Col 3 正文面板，复用 EmailDetailPage 内容 |

## 状态管理

使用 Riverpod 新增 provider：

```dart
final selectedEmailIdProvider = StateProvider<int?>((ref) => null);
final selectedFolderProvider = StateProvider<String>((ref) => 'INBOX');
```

- `selectedEmailIdProvider`：当前选中的邮件 ID
- `selectedFolderProvider`：当前选中的文件夹路径
- 宽屏首次加载时自动选中第一封邮件
- 切换文件夹时自动选中该文件夹第一封邮件

## 工具栏 (Col 4)

56px 宽窄边列表，仿 NavigationRail：

| 图标 | 提示 | 行为 |
|------|------|------|
| 📥 收件箱 | 收件箱 | 设置 `selectedFolderProvider` 为 INBOX |
| 📤 已发送 | 已发送 | 设置 `selectedFolderProvider` 为 Sent |
| 📝 草稿 | 草稿 | 设置 `selectedFolderProvider` 为 Drafts |
| ⚠️ 垃圾邮件 | 垃圾邮件 | 设置 `selectedFolderProvider` 为 Junk |
| 🗑 已删除 | 已删除 | 设置 `selectedFolderProvider` 为 Trash |
| — | 分隔线 | — |
| 🔄 刷新 | 刷新 | 触发同步，刷新列表 |
| ✏️ 写邮件 | 写邮件 | `Navigator.push → ComposePage` |
| ⚙️ 设置 | 账户设置 | `Navigator.push → EmailAccountsPage` |
| 👤 通讯录 | 通讯录 | `context.go('/contacts')` |

窄屏下这些入口移至 AppBar 的 `PopupMenuButton`（⋮）。

## 导航流程

### 宽屏

| 操作 | 行为 |
|------|------|
| 点击邮件列表条目 | Col 3 切换正文（列表不变） |
| 点击工具栏文件夹 | Col 2 切换文件夹，自动选中第一封 |
| 点击写邮件/设置 | `Navigator.push` 全屏打开，覆盖 AppShell |
| 点击通讯录 | `context.go('/contacts')` |
| 点击刷新 | `ref.invalidate(localEmailListProvider)` + 触发同步 |

### 窄屏

| 操作 | 行为 |
|------|------|
| 点击邮件 | `Navigator.push → EmailDetailPage` |
| 点击 ⋮ → 写邮件 | `Navigator.push → ComposePage` |
| 点击 ⋮ → 文件夹 | 切换列表文件夹 |
| 点击 ⋮ → 刷新 | 触发同步 |
| 点击 ⋮ → 设置 | `Navigator.push → EmailAccountsPage` |
| 点击 ⋮ → 通讯录 | `context.go('/contacts')` |
| FAB 写邮件 | `Navigator.push → ComposePage` |
| ☰ 汉堡菜单 | 显示 AppShell Drawer |

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `lib/presentation/pages/email/email_list_page.dart` | 重写：断点切换布局，组件拆分 |
| `lib/features/email/providers/email_providers.dart` | 新增 `selectedEmailIdProvider`、`selectedFolderProvider` |
| `lib/features/email/presentation/widgets/email_toolbar.dart` | **新建** — Col 4 工具栏组件 |
| `lib/features/email/presentation/widgets/email_list_view.dart` | **新建** — 纯邮件列表组件 |
| `lib/features/email/presentation/widgets/email_detail_view.dart` | **新建** — Col 3 正文面板（包装 EmailDetailPage） |
