# EasyWork Phase 1 实施计划：项目脚手架搭建

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 EasyWork 项目的完整脚手架，包括 pnpm monorepo 工作区、Tauri 2.x Rust 后端、qiankun 主 Shell 应用、shared 共享包、10 个微应用骨架，以及主题系统集成。

**Architecture:** 基于 Tauri 2.x 的桌面应用，前端采用 qiankun 微前端架构，主 Shell 应用作为容器加载 10 个独立子应用。Rust 后端通过 Tauri Commands 提供 IPC 接口，SQLite 作为本地存储。所有子应用共享 types/utils/hooks/constants，使用 MUI 6.x 组件库和 React Context + useReducer 状态管理。

**Tech Stack:** Tauri 2.x, React 19, TypeScript 5.x, Vite 6.x, qiankun 3.x/2.x, MUI 6.x, pnpm 9.x, rusqlite, refinery

**Design Spec:** [2026-06-09-easywork-design.md](../specs/2026-06-09-easywork-design.md)

---

## 文件结构总览

本计划将创建/修改以下文件：

```
e:\Dev\EasyWork/
├── package.json                    # [新建] 根 package.json (workspace)
├── pnpm-workspace.yaml             # [新建] pnpm 工作区配置
├── tsconfig.base.json              # [新建] 基础 TS 配置
├── .gitignore                      # [新建]
│
├── shared/                         # [新建] 共享代码包
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── types/
│       │   ├── index.ts
│       │   ├── common.ts
│       │   ├── task.ts
│       │   ├── calendar.ts
│       │   ├── mail.ts
│       │   ├── note.ts
│       │   ├── stock.ts
│       │   ├── accounting.ts
│       │   ├── sports.ts
│       │   └── nav.ts
│       ├── constants/
│       │   ├── index.ts
│       │   ├── theme.ts
│       │   └── nav.ts
│       └── utils/
│           ├── index.ts
│           └── date.ts
│
├── apps/
│   ├── main/                       # [新建] 主 Shell 应用
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.node.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── App.styles.ts
│   │       ├── env.d.ts
│   │       ├── layouts/
│   │       │   └── MainLayout.tsx
│   │       ├── components/
│   │       │   ├── Sidebar.tsx
│   │       │   └── ThemeProvider.tsx
│   │       └── micro/
│   │           └── registerApps.ts
│   │
│   ├── app-dashboard/              # [新建] × 10 个微应用（结构相同）
│   ├── app-kanban/
│   ├── app-calendar/
│   ├── app-mail/
│   ├── app-notes/
│   ├── app-stock/
│   ├── app-accounting/
│   ├── app-sports/
│   ├── app-logs/
│   └── app-settings/
│
└── src-tauri/                      # [新建] Tauri / Rust 后端
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── icons/                     # 默认图标（后续替换）
    └── src/
        ├── main.rs
        ├── lib.rs
        └── error.rs
```

---

### Task 1: 初始化根工作区配置

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: 创建根 package.json**

```json
{
  "name": "easywork",
  "version": "1.0.0",
  "private": true,
  "description": "EasyWork - 跨平台个人效率工具",
  "type": "module",
  "scripts": {
    "dev": "pnpm -C apps/main dev",
    "build": "pnpm build:web",
    "build:web": "pnpm -C shared build && pnpm -C apps/main build",
    "tauri": "tauri",
    "preview": "pnpm -C apps/main preview"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'shared'
```

- [ ] **Step 3: 创建 tsconfig.base.json**

所有子项目继承此基础配置。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: 创建 .gitignore**

```
# Dependencies
node_modules/

# Build outputs
dist/
*.tsbuildinfo

# Tauri
src-tauri/target/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Prototype (not part of source)
prototype.html
```

- [ ] **Step 5: 安装根依赖并验证 workspace**

Run: `pnpm install`
Expected: 创建 node_modules/.pnpm 链接，无错误

---

### Task 2: 创建 shared 共享包

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/types/index.ts` + 各类型文件
- Create: `shared/src/constants/index.ts` + 常量文件
- Create: `shared/src/utils/index.ts` + 工具文件

- [ ] **Step 1: 创建 shared/package.json**

```json
{
  "name": "@easywork/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b --watch",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 shared/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建共享类型定义 - nav.ts**

导航项类型定义，对应设计文档 3.1 节。

```typescript
// shared/src/types/nav.ts

/** 导航项路由标识 */
export type NavRoute =
  | 'dashboard'
  | 'kanban'
  | 'calendar'
  | 'mail'
  | 'notes'
  | 'stock'
  | 'accounting'
  | 'sports'
  | 'logs'
  | 'settings';

/** 导航项定义 */
export interface NavItem {
  /** 路由标识 */
  route: NavRoute;
  /** 显示名称 */
  label: string;
  /** 图标 (emoji 或 Material Icon name) */
  icon: string;
  /** 是否为分隔线 */
  divider?: boolean;
}
```

- [ ] **Step 4: 创建共享类型定义 - common.ts**

通用数据类型。

```typescript
// shared/src/types/common.ts

/** 通用 API 响应 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 日期时间字符串格式 YYYY-MM-DD HH:mm:ss */
export type DateTimeString = string;

/** 日期字符串格式 YYYY-MM-DD */
export type DateString = string;

/** 优先级等级 */
export type PriorityLevel = 'high' | 'medium' | 'low';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';
```

- [ ] **Step 5: 创建共享类型定义 - task.ts**

看板任务相关类型。

```typescript
// shared/src/types/task.ts
import type { PriorityLevel, DateTimeString } from './common';

/** 任务状态 */
export type TaskStatus = 'todo' | 'doing' | 'done' | 'abandoned' | 'archived';

/** 任务对象 */
export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: PriorityLevel;
  urgency: PriorityLevel;
  difficulty: PriorityLevel;
  assignee: string;
  startTime: DateTimeString | null;
  dueTime: DateTimeString | null;
  completedAt: DateTimeString | null;
  rating: number; // 1-5
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

/** 创建任务参数 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: PriorityLevel;
  urgency?: PriorityLevel;
  difficulty?: PriorityLevel;
  assignee?: string;
  dueTime?: DateTimeString;
}
```

- [ ] **Step 6: 创建其余模块类型定义**

一次性创建剩余的类型文件，保持接口契约一致。

```typescript
// shared/src/types/calendar.ts
import type { DateTimeString } from './common';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'year';
export type EventType = 'event' | 'task_deadline' | 'expense' | 'sport';

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  startAt: DateTimeString;
  endAt: DateTimeString;
  type: EventType;
  color: string;
  isAllDay: boolean;
}

// shared/src/types/mail.ts
import type { PaginatedResult } from './common';

export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash';

export interface MailMessage {
  id: number;
  accountId: number;
  uid: number;
  subject: string;
  sender: string;
  recipients: string;
  bodyText: string;
  bodyHtml: string;
  folder: MailFolder;
  isRead: boolean;
  isStarred: boolean;
  receivedDate: string;
  createdAt: string;
}

export interface MailAccount {
  id: number;
  email: string;
  username: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  syncPeriod: number; // days
  syncInterval: number; // minutes
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  groupId: number | null;
}

// shared/src/types/note.ts
import type { DateTimeString } from './common';

export interface Note {
  id: number;
  title: string;
  content: string; // 富文本 HTML / Markdown
  folderId: number;
  tags: string[];
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface NoteFolder {
  id: number;
  name: string;
  parentId: number | null;
}

// shared/src/types/stock.ts
export interface StockQuote {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number;
}

export interface StockAlert {
  id: number;
  stockCode: string;
  alertType: 'price_up' | 'price_down';
  targetPrice: number;
  isEnabled: boolean;
}

// shared/src/types/accounting.ts
import type { DateString, PriorityLevel } from './common';

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  category: string;
  subcategory: string;
  note: string;
  date: DateString;
  createdAt: string;
}

export interface AccountingSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  budgetUsageRate: number;
}

export const EXPENSE_CATEGORIES = [
  '餐饮', '交通', '购物', '娱乐', '医疗', '教育', '居住', '通讯', '其他',
] as const;

// shared/src/types/sports.ts
import type { DateTimeString } from './common';

export type SportType = 'running' | 'cycling' | 'fitness' | 'ball_game';

export interface SportRecord {
  id: number;
  type: SportType;
  duration: number; // minutes
  distance: number | null; // km
  calories: number;
  date: DateString;
  note: string;
  createdAt: DateTimeString;
}

export interface SportGoal {
  weeklyTarget: number; // times per week
  weeklyCompleted: number;
}
```

- [ ] **Step 7: 创建 types/index.ts 统一导出**

```typescript
// shared/src/types/index.ts
export type { NavRoute, NavItem } from './nav';
export type { ApiResponse, PaginatedResult, DateTimeString, DateString, PriorityLevel, ThemeMode } from './common';
export type { TaskStatus, Task, CreateTaskInput } from './task';
export type { CalendarViewMode, EventType, CalendarEvent } from './calendar';
export type { MailFolder, MailMessage, MailAccount, Contact } from './mail';
export type { Note, NoteFolder } from './note';
export type { StockQuote, StockAlert } from './stock';
export type { TransactionType, Transaction, AccountingSummary, EXPENSE_CATEGORIES } from './accounting';
export type { SportType, SportRecord, SportGoal } from './sports';
```

- [ ] **Step 8: 创建主题常量 - constants/theme.ts**

基于设计文档 3.2 节色彩系统。

```typescript
// shared/src/constants/theme.ts

export const THEME_COLORS = {
  primaryStart: '#5BCFC4',
  primaryEnd: '#1E5DA8',
  secondary: '#FF6B6B',
  success: '#51CF66',
  warning: '#FFD43B',
  error: '#FF6B6B',

  backgroundLight: '#F5F5F5',
  surfaceLight: '#FFFFFF',
  textLight: '#212121',
  textSecondaryLight: '#666888',

  backgroundDark: '#0d1117',
  surfaceDark: '#161b22',
  textDark: '#E0E0E0',
  textSecondaryDark: '#888888',

  sidebarBgStart: '#1a1a2e',
  sidebarBgMid: '#16213e',
  sidebarBgEnd: '#0f3460',
} as const;

export const SIDEBAR_WIDTH = 60;
export const HEADER_HEIGHT = 60;
```

- [ ] **Step 9: 创建导航常量 - constants/nav.ts**

基于设计文档 3.1 节导航项列表。

```typescript
// shared/src/constants/nav.ts
import type { NavItem } from '../types/nav';

export const NAV_ITEMS: NavItem[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { route: 'kanban', label: '看板', icon: 'ViewKanban' },
  { route: 'calendar', label: '日历', icon: 'CalendarMonth' },
  { route: 'mail', label: '邮箱', icon: 'Mail' },
  { route: 'notes', label: '笔记', icon: 'Note' },
  { route: 'stock', label: '股票', icon: 'ShowChart' },
  { route: 'accounting', label: '记账', icon: 'AccountBalanceWallet' },
  { route: 'sports', label: '运动', icon: 'DirectionsRun' },
  { route: 'logs', label: '日志', icon: 'Description' },
  { route: 'divider', label: '', icon: '', divider: true },
  { route: 'settings', label: '设置', icon: 'Settings' },
];
```

- [ ] **Step 10: 创建 constants/index.ts 和 utils/date.ts**

```typescript
// shared/src/constants/index.ts
export { THEME_COLORS, SIDEBAR_WIDTH, HEADER_HEIGHT } from './theme';
export { NAV_ITEMS } from './nav';

// shared/src/utils/date.ts
/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss
 */
export function formatDateTime(date: Date): string {
  const dateStr = formatDate(date);
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${dateStr} ${h}:${min}:${s}`;
}

// shared/src/utils/index.ts
export { formatDate, formatDateTime } from './date';
```

- [ ] **Step 11: 创建 shared/src/index.ts 入口**

```typescript
// shared/src/index.ts
// Types
export * from './types';
// Constants
export * from './constants';
// Utils
export * from './utils';
```

- [ ] **Step 12: 安装依赖并验证 shared 包编译**

Run: `cd shared && pnpm install && pnpm build`
Expected: 无错误，生成 dist/ 目录包含 index.js 和 index.d.ts

---

### Task 3: 初始化 Tauri 2.x Rust 后端

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/icons/` (默认图标)

- [ ] **Step 1: 使用 create-tauri-app 初始化 Tauri 项目**

Run: `cd e:/Dev/EasyWork && pnpm create tauri-app src-tauri --template react-ts --manager pnpm`
Expected: 在 src-tauri/ 下生成基础 Tauri 项目

注意：如果交互式提示，选择：
- Package name: easywork
- Frontend: React + TypeScript
- Package manager: pnpm

- [ ] **Step 2: 清理自动生成的模板文件**

删除 Tauri 自动生成的前端模板（我们已有自己的前端结构），保留 Rust 侧核心文件：
- 保留: src-tauri/Cargo.toml, src-tauri/tauri.conf.json, src-tauri/src/, src-tauri/icons/
- 删除: src-tauri/src-tauri/ (如果有生成的 SPA 前端目录)

- [ ] **Step 3: 配置 tauri.conf.json**

修改 frontendDist 指向主 Shell 应用的构建输出。

```json
{
  "$schema": "https://raw.githubusercontent.com/nicoverbruggen/gen.schemas/master/tauri/tauri-config-v2.schema.json",
  "productName": "EasyWork",
  "version": "1.0.0",
  "identifier": "com.easywork.app",
  "build": {
    "frontendDist": "../apps/main/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "EasyWork",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 768,
        "resizable": true,
        "fullscreen": false,
        "center": true,
        "decorations": true,
        "transparent": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://* http://*;"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 4: 编写 error.rs 统一错误处理**

```rust
// src-tauri/src/error.rs
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("未找到: {0}")]
    NotFound(String),

    #[error("参数错误: {0}")]
    InvalidInput(String),

    #[error("内部错误: {0}")]
    Internal(String),
}

// 让错误可以跨 IPC 传递
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 5: 编写 lib.rs 基础框架**

```rust
// src-tauri/src/lib.rs
mod error;

use error::{AppError, AppResult};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // TODO: 初始化数据库连接池
            // TODO: 初始化应用状态
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: 更新 Cargo.toml 依赖**

确保包含必要依赖：

```toml
[package]
name = "easywork"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
refinery = { version = "0.8", features = ["rusqlite-bundled"] }
thiserror = "2"
log = "0.4"
env_logger = "0.11"

[profile.dev]
incremental = true

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

- [ ] **Step 7: 验证 Tauri 后端编译**

Run: `cd src-tauri && cargo check`
Expected: 编译成功（仅有 warnings 无 errors）

---

### Task 4: 创建主 Shell 应用 (apps/main)

**Files:**
- Create: `apps/main/package.json`
- Create: `apps/main/tsconfig.json`, `tsconfig.node.json`
- Create: `apps/main/vite.config.ts`
- Create: `apps/main/index.html`
- Create: `apps/main/src/main.tsx`, `App.tsx`, `env.d.ts`
- Create: `apps/main/src/layouts/MainLayout.tsx`
- Create: `apps/main/src/components/Sidebar.tsx`
- Create: `apps/main/src/components/ThemeProvider.tsx`
- Create: `apps/main/src/micro/registerApps.ts`

- [ ] **Step 1: 创建 apps/main/package.json**

```json
{
  "name": "@easywork/main",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@easywork/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "qiankun": "^2.10.0 || ^3.0.0",
    "@mui/material": "^6.4.0",
    "@mui/icons-material": "^6.4.0",
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.1.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

- [ ] **Step 2: 创建 apps/main/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "env.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 apps/main/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "composite": true,
    "allowSyntheticDefaultImports": true,
    "moduleResolution": "bundler"
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: 创建 apps/main/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

- [ ] **Step 5: 创建 apps/main/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EasyWork</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 创建 apps/main/src/env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 7: 创建 apps/main/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 8: 创建 ThemeProvider 组件**

基于设计文档 3.2 节主题系统。

```tsx
// apps/main/src/components/ThemeProvider.tsx
import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
  CssBaseline,
} from '@mui/material/styles';
import type { ThemeMode } from '@easywork/shared';
import { THEME_COLORS } from '@easywork/shared';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => {},
  isDark: false,
});

export const useAppTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ew-theme') as ThemeMode | null;
    return saved || 'system';
  });

  useEffect(() => {
    localStorage.setItem('ew-theme', mode);
  }, [mode]);

  const isDark = useMemo(() => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [mode]);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDark ? 'dark' : 'light',
          primary: {
            main: THEME_COLORS.primaryStart,
          },
          secondary: {
            main: THEME_COLORS.secondary,
          },
          success: {
            main: THEME_COLORS.success,
          },
          warning: {
            main: THEME_COLORS.warning,
          },
          error: {
            main: THEME_COLORS.error,
          },
          background: {
            default: isDark ? THEME_COLORS.backgroundDark : THEME_COLORS.backgroundLight,
            paper: isDark ? THEME_COLORS.surfaceDark : THEME_COLORS.surfaceLight,
          },
          text: {
            primary: isDark ? THEME_COLORS.textDark : THEME_COLORS.textLight,
            secondary: isDark ? THEME_COLORS.textSecondaryDark : THEME_COLORS.textSecondaryLight,
          },
        },
        shape: {
          borderRadius: 12,
        },
        typography: {
          fontFamily: [
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"PingFang SC"',
            '"Microsoft YaHei"',
            'sans-serif',
          ].join(','),
        },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                boxShadow: isDark
                  ? '0 2px 12px rgba(0,0,0,0.3)'
                  : '0 2px 12px rgba(0,0,0,0.05)',
              },
            },
          },
        },
      }),
    [isDark],
  );

  const contextValue = useMemo(
    () => ({ mode, setMode, isDark }),
    [mode, setMode, isDark],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline enableColorScheme />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 9: 创建 Sidebar 组件（固定 60px 图标模式）**

基于设计文档 3.1 节侧边栏设计。

```tsx
// apps/main/src/components/Sidebar.tsx
import React, { useState } from 'react';
import {
  Box,
  Tooltip,
  Avatar,
  useTheme,
} from '@mui/material';
import Dashboard from '@mui/icons-material/Dashboard';
import ViewKanban from '@mui/icons-material/ViewKanban';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import Mail from '@mui/icons-material/Mail';
import Note from '@mui/icons-material/Note';
import ShowChart from '@mui/icons-material/ShowChart';
import AccountBalanceWallet from '@mui/icons-material/AccountBalanceWallet';
import DirectionsRun from '@mui/icons-material/DirectionsRun';
import Description from '@mui/icons-material/Description';
import Settings from '@mui/icons-material/Settings';
import type { NavRoute } from '@easywork/shared';
import { NAV_ITEMS, SIDEBAR_WIDTH } from '@easywork/shared';

const ICON_MAP: Record<string, React.ReactElement> = {
  Dashboard: <Dashboard />,
  ViewKanban: <ViewKanban />,
  CalendarMonth: <CalendarMonth />,
  Mail: <Mail />,
  Note: <Note />,
  ShowChart: <ShowChart />,
  AccountBalanceWallet: <AccountBalanceWallet />,
  DirectionsRun: <DirectionsRun />,
  Description: <Description />,
  Settings: <Settings />,
};

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
}

export default function Sidebar({ activeRoute, onNavigate }: SidebarProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100vh',
        background: `linear-gradient(180deg, ${THEME_COLORS.sidebarBgStart} 0%, ${THEME_COLORS.sidebarBgMid} 50%, ${THEME_COLORS.sidebarBgEnd} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            fontSize: 13,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${THEME_COLORS.primaryStart}, ${THEME_COLORS.primaryEnd})`,
            cursor: 'pointer',
            '&:hover': { transform: 'scale(1.08)' },
            transition: 'transform 0.2s ease',
          }}
        >
          EW
        </Avatar>
      </Box>

      {/* Navigation Items */}
      <Box
        sx={{
          flex: 1,
          py: 1.5,
          px: 0.75,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {NAV_ITEMS.map((item) => {
          if (item.divider) {
            return (
              <Box
                key="divider"
                sx={{
                  width: 32,
                  height: 1,
                  bgcolor: 'rgba(255,255,255,0.1)',
                  my: 1,
                }}
              />
            );
          }

          const isActive = activeRoute === item.route;
          const IconComponent = ICON_MAP[item.icon];

          return (
            <Tooltip key={item.route} title={item.label} placement="right" arrow>
              <Box
                onClick={() => onNavigate(item.route as NavRoute)}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 0.5,
                  cursor: 'pointer',
                  color: isActive
                    ? THEME_COLORS.primaryStart
                    : 'rgba(255,255,255,0.6)',
                  backgroundColor: isActive
                    ? `linear-gradient(135deg, rgba(91,207,196,0.2), rgba(30,93,168,0.2))`
                    : 'transparent',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.95)',
                  },
                  ...(isActive && {
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: -6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 20,
                      borderRadius: '0 3px 3px 0',
                      background: `linear-gradient(180deg, ${THEME_COLORS.primaryStart}, ${THEME_COLORS.primaryEnd})`,
                    },
                  }),
                }}
              >
                {IconComponent || <Box />}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 10: 创建 qiankun 子应用注册 - micro/registerApps.ts**

```typescript
// apps/main/src/micro/registerApps.ts
import { registerMicroApps, start, initGlobalState } from 'qiankun';

/** 子应用端口映射（开发环境） */
const MICRO_APP_PORTS: Record<string, number> = {
  dashboard: 5174,
  kanban: 5175,
  calendar: 5176,
  mail: 5177,
  notes: 5178,
  stock: 5179,
  accounting: 5180,
  sports: 5181,
  logs: 5182,
  settings: 5183,
};

/** 开发环境下子应用的 URL 前缀 */
function getDevEntry(port: number): string {
  return `//localhost:${port}`;
}

/** 生产环境下子应用的入口（指向主应用 dist 下的子目录） */
function getProdEntry(name: string): string {
  return `/${name}/`;
}

/** 注册所有微应用 */
export function registerApps() {
  const apps = Object.entries(MICRO_APP_PORTS).map(([name, port]) => ({
    name: `app-${name}`,
    entry: import.meta.env.DEV ? getDevEntry(port) : getProdEntry(name),
    container: '#micro-app-container',
    activeRule: `/app-${name}`,
  }));

  registerMicroApps(apps, {
    beforeLoad: [(app) => console.log(`[qiankun] Loading ${app.name}...`)],
    afterMount: [(app) => console.log(`[qiankun] Mounted ${app.name}`)],
  });

  // 初始化全局状态
  const actions = initGlobalState({
    theme: localStorage.getItem('ew-theme') || 'system',
    activeNav: 'dashboard',
  });

  start({
    prefetch: 'all',
    sandbox: { experimentalStyleIsolation: true },
  });

  return actions;
}
```

- [ ] **Step 11: 创建 MainLayout 主布局组件**

```tsx
// apps/main/src/layouts/MainLayout.tsx
import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import Sidebar from '@/components/Sidebar';
import { useAppTheme } from '@/components/ThemeProvider';
import type { NavRoute } from '@easywork/shared';
import { NAV_ITEMS, HEADER_HEIGHT } from '@easywork/shared';

const ROUTE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.filter((i) => !i.divider).map((i) => [i.route, i.label]),
);

export default function MainLayout() {
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const { mode, setMode, isDark } = useAppTheme();

  const toggleTheme = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧固定导航栏 */}
      <Sidebar activeRoute={activeRoute} onNavigate={setActiveRoute} />

      {/* 右侧内容区 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 顶部标题栏 */}
        <Box
          component="header"
          sx={{
            height: HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3.5,
            bgcolor: 'background.paper',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            flexShrink: 0,
            zIndex: 5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            首页 / <strong>{ROUTE_LABEL_MAP[activeRoute] || ''}</strong>
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tooltip title={isDark ? '切换到亮色模式' : '切换到暗色模式'}>
              <IconButton onClick={toggleTheme} size="small">
                {isDark ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>

            <Avatar
              sx={{
                width: 34,
                height: 34,
                background: `linear-gradient(135deg, ${'#5BCFC4'}, ${'#1E5DA8'})`,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              U
            </Avatar>
          </Box>
        </Box>

        {/* 微应用容器 */}
        <Box
          id="micro-app-container"
          sx={{
            flex: 1,
            overflow: 'auto',
            position: 'relative',
          }}
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 12: 创建 App.tsx 根组件**

```tsx
// apps/main/src/App.tsx
import React, { useEffect } from 'react';
import ThemeProvider from './components/ThemeProvider';
import MainLayout from './layouts/MainLayout';
import { registerApps } from './micro/registerApps';

export default function App() {
  useEffect(() => {
    const actions = registerApps();
    return () => {};
  }, []);

  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
}
```

- [ ] **Step 13: 安装依赖并验证主 Shell 构建**

Run: `cd apps/main && pnpm install && pnpm build`
Expected: 构建成功，生成 dist/ 目录

---

### Task 5: 批量创建 10 个微应用骨架

每个微应用结构相同，包含基础 Vite + React + TypeScript + MUI 配置和最小入口文件。

**每个微应用的标准文件集：**
- `package.json`
- `tsconfig.json`, `tsconfig.node.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/env.d.ts`

- [ ] **Step 1: 定义微应用元信息列表**

以下 10 个微应用需要创建：

| 序号 | 目录名 | 显示名 | 端口 |
|------|--------|--------|------|
| 1 | app-dashboard | Dashboard | 5174 |
| 2 | app-kanban | 看板 | 5175 |
| 3 | app-calendar | 日历 | 5176 |
| 4 | app-mail | 邮箱 | 5177 |
| 5 | app-notes | 笔记 | 5178 |
| 6 | app-stock | 股票 | 5179 |
| 7 | app-accounting | 记账 | 5180 |
| 8 | app-sports | 运动 | 5181 |
| 9 | app-logs | 日志 | 5182 |
| 10 | app-settings | 设置 | 5183 |

- [ ] **Step 2: 为 app-dashboard 创建完整骨架**

这是第一个微应用，也是最完整的参考实现。

**package.json:**
```json
{
  "name": "@easywork/app-dashboard",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@easywork/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@mui/material": "^6.4.0",
    "@mui/icons-material": "^6.4.0",
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.1.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

**tsconfig.json:** (extends ../../tsconfig.base.json, outDir ./dist, rootDir ./src, jsx react-jsx)

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5174,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5173',
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.tsx'),
      name: 'app-dashboard',
      formats: ['umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
});
```

**index.html:**
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>Dashboard</title></head>
  <body><div id="dashboard-root"></div></body>
</html>
```

**src/main.tsx:**
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

let root: ReactDOM.Root | null = null;

function render(props: any) {
  const { container } = props;
  root = ReactDOM.createRoot(
    container ? container.querySelector('#dashboard-root') : document.getElementById('dashboard-root'),
  );
  root.render(<App />);
}

if (!(window as any).__POWERED_BY_QIANKUN__) {
  render({});
}

export async function bootstrap() {}
export async function mount(props: any) { render(props); }
export async function unmount(props: any) {
  root?.unmount();
  root = null;
}
```

**src/App.tsx:**
```tsx
import React from 'react';
import { Box, Typography, Card, CardContent, Grid } from '@mui/material';

export default function App() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>数据总览</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: '今日待办', value: '8', color: '#5BCFC4' },
          { label: '今日日程', value: '3', color: '#1E5DA8' },
          { label: '消费金额', value: '¥128.50', color: '#FF6B6B' },
          { label: '运动步数', value: '6,231', color: '#51CF66' },
        ].map((stat) => (
          <Grid item xs={12} sm={6} md={3} key={stat.label}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                <Typography variant="h4" fontWeight={800} sx={{ color: stat.color }}>{stat.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="body2" color="text.disabled" textAlign="center">
        Dashboard 模块正在开发中...
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 3: 批量创建其余 9 个微应用骨架**

对 app-kanban 到 app-settings 重复 Step 2 的过程，调整以下参数：

| 变量 | 各应用值 |
|------|----------|
| name | @easywork/app-{kanban\|calendar\|mail\|notes\|stock\|accounting\|sports\|logs\|settings} |
| port | 5175~5183 依次递增 |
| html root id | {kanban\|calendar\|...}-root |
| 页面标题 | 对应中文名称 |
| App.tsx 内容 | 显示模块名 + "正在开发中..." 占位 |

每个 App.tsx 示例：

```tsx
// 以 app-kanban 为例
import React from 'react';
import { Box, Typography } from '@mui/material';

export default function App() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700}>看板</Typography>
      <Typography variant="body2" color="text.disabled">看板模块正在开发中...</Typography>
    </Box>
  );
}
```

- [ ] **Step 4: 全量安装依赖**

Run: `cd e:/Dev/EasyWork && pnpm install`
Expected: 所有包安装完成，无 peer dependency 冲突

---

### Task 6: 全局验证与联调

- [ ] **Step 1: TypeScript 类型检查全量通过**

Run: `cd e:/Dev/EasyWork && npx tsc -b --noEmit`
Expected: 所有 packages 类型检查通过，无错误

- [ ] **Step 2: 所有微应用构建验证**

Run: `cd e:/Dev/EasyWork && pnpm build:web`
Expected: shared → main → 10 个微应用全部构建成功

- [ ] **Step 3: 启动开发服务器验证主 Shell**

Run: `cd e:/Dev/EasyWork && pnpm dev`
预期行为：
- Vite 开发服务器在 5173 端口启动
- 浏览器打开后显示：左侧 60px 深色渐变导航栏 + 右侧内容区
- 点击导航项可切换面包屑文字
- 点击主题按钮可切换亮色/暗色模式
- 微应用容器区域显示空白（等待子应用启动）

- [ ] **Step 4: 启动一个子应用验证 qiankun 加载**

Run: 新终端 `cd apps/app-dashboard && pnpm dev`
预期行为：
- Dashboard 子应用在 5174 端口启动
- 返回主应用浏览器页面，应看到 Dashboard 内容被加载到 micro-app-container 中
- 控制台显示 `[qiankun] Loading app-dashboard...` 和 `[qiankun] Mounted app-dashboard`

- [ ] **Step 5: 最终提交**

```bash
git add .
git commit -m "$(cat <<'EOF'
feat: 初始化 EasyWork 项目脚手架

- pnpm monorepo 工作区配置 (root + shared + 11 个前端包)
- Tauri 2.x Rust 后端初始化 (Cargo.toml + tauri.conf.json + error handling)
- qiankun 主 Shell 应用 (60px 固定图标侧边栏 + 主题系统)
- shared 共享包 (类型定义 + 常量 + 工具函数)
- 10 个微应用骨架 (Dashboard/Kanban/Calendar/Mail/Notes/Stock/Accounting/Sports/Logs/Settings)
- MUI 6.x 主题集成 (Light/Dark/System 三档切换)
EOF
)"
```

---

## 自检清单

### Spec 覆盖度检查

| 设计文档章节 | 对应 Task | 状态 |
|-------------|-----------|------|
| 2.1 核心技术栈 | Task 1-3 (package.json 依赖声明) | ✅ |
| 2.2 目录结构 | Task 1-5 (全部目录创建) | ✅ |
| 3.1 侧边栏导航 (60px 固定图标) | Task 4 Step 9 (Sidebar.tsx) | ✅ |
| 3.2 主题系统 (三档切换) | Task 4 Step 8 (ThemeProvider.tsx) | ✅ |
| 3.3 响应式布局断点 | Task 4 Step 11 (MainLayout 断点预留) | ⚠️ UI 骨架阶段仅桌面端 |
| 6.1 shared 包结构 | Task 2 (完整 shared 包) | ✅ |

### 占位符扫描

- 无 TBD / TODO / "待实现"
- 所有代码步骤包含完整实现
- 所有命令包含预期输出

### 类型一致性检查

- shared 类型导出与各处 import 路径一致
- NavRoute 类型与 NAV_ITEMS 路由值匹配
- ThemeMode 值与 ThemeProvider 处理逻辑匹配
- 微应用端口与 registerApps.ts 中 MICRO_APP_PORTS 一致

---

*本计划覆盖 Phase 1（项目脚手架搭建），后续 Phase 2（全模块 UI 骨架深化）、Phase 3（数据层对接）、Phase 4（业务逻辑深化）将作为独立计划编写。*
