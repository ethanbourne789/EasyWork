# Dashboard 骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 EasyWork 项目脚手架（Tauri 2 + Vite + React 19 + TS + Tailwind v4 + shadcn/ui），实现 Supabase 登录鉴权、响应式全局布局（图标侧边栏 + 移动端底部 Tab）、亮/暗主题，以及 Dashboard 仪表盘页面（概览卡片 + 图表 + 全局搜索）。

**Architecture:** Tauri 2 作为桌面/移动壳；前端 Vite + React 19 单页应用，TanStack Router 类型安全路由，TanStack Query + Zustand 管理状态；Supabase 提供Auth + Postgres（profiles 表 + RLS）。

**Tech Stack:** Tauri 2.x, Vite 7, React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui, TanStack Router v1, TanStack Query v5, Zustand v5, @supabase/supabase-js v2, Recharts v2, Vitest, React Testing Library, Playwright（Tauri WebDriver）。

**环境提示:** Windows + PowerShell。命令使用 `;` 分隔，不使用 `&&`。所有路径用反斜杠。

---

## File Structure

```
e:\Dev\EasyWork0807\
├─ .env.example                      # Supabase 环境变量模板
├─ .env                              # 本地环境变量（gitignore）
├─ .gitignore
├─ index.html                        # Vite 入口 HTML
├─ package.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vite.config.ts
├─ components.json                   # shadcn/ui 配置
├─ src\
│  ├─ main.tsx                       # 应用入口
│  ├─ App.tsx                        # 根组件（Provider 装配）
│  ├─ index.css                      # Tailwind 入口 + 主题变量
│  ├─ vite-env.d.ts
│  ├─ lib\
│  │  ├─ supabase.ts                 # Supabase 客户端单例
│  │  └─ utils.ts                    # cn() 工具（shadcn 需要）
│  ├─ router.tsx                     # TanStack Router 路由定义
│  ├─ components\
│  │  ├─ ui\                         # shadcn/ui 复制组件（button 等）
│  │  ├─ theme\
│  │  │  ├─ ThemeProvider.tsx        # 主题上下文
│  │  │  └─ ThemeToggle.tsx          # 亮/暗切换按钮
│  │  └─ layout\
│  │     ├─ AppLayout.tsx            # 主布局壳（侧栏 + 主区 + 移动 Tab）
│  │     ├─ Sidebar.tsx              # 桌面图标侧边栏
│  │     └─ MobileTabBar.tsx         # 移动端底部 Tab
│  ├─ features\
│  │  ├─ auth\
│  │  │  ├─ authStore.ts             # Zustand: 会话状态
│  │  │  ├─ useAuth.ts               # 订阅 Supabase auth 状态的 hook
│  │  │  ├─ Login.tsx                # 登录页（含魔法链接）
│  │  │  └─ Register.tsx             # 注册页
│  │  └─ dashboard\
│  │     ├─ Dashboard.tsx            # 仪表盘页面
│  │     ├─ OverviewCards.tsx        # 概览卡片
│  │     ├─ TaskTrendChart.tsx       # 任务趋势图
│  │     └─ GlobalSearch.tsx         # 全局搜索
│  └─ __tests__\
│     ├─ authStore.test.ts
│     ├─ useAuth.test.tsx
│     └─ ThemeProvider.test.tsx
├─ src-tauri\
│  ├─ Cargo.toml
│  ├─ build.rs
│  ├─ tauri.conf.json
│  ├─ capabilities\
│  │  └─ default.json
│  └─ src\
│     ├─ main.rs
│     └─ lib.rs
└─ supabase\
   └─ migrations\
      └─ 0001_init_profiles.sql      # profiles 表 + RLS
```

---

## Task 1: 初始化 npm 项目与基础配置

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src\vite-env.d.ts`

- [ ] **Step 1: 创建 package.json**

写入 `e:\Dev\EasyWork0807\package.json`：

```json
{
  "name": "easywork",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  }
}
```

- [ ] **Step 2: 创建 .gitignore**

写入 `e:\Dev\EasyWork0807\.gitignore`：

```
node_modules
dist
dist-ssr
*.local
.env
src-tauri/target
.vite
coverage
.DS_Store
```

- [ ] **Step 3: 创建 .env.example**

写入 `e:\Dev\EasyWork0807\.env.example`：

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: 创建 tsconfig.json**

写入 `e:\Dev\EasyWork0807\tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: 创建 tsconfig.node.json**

写入 `e:\Dev\EasyWork0807\tsconfig.node.json`：

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: 创建 vite.config.ts**

写入 `e:\Dev\EasyWork0807\vite.config.ts`：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
```

- [ ] **Step 7: 创建 index.html**

写入 `e:\Dev\EasyWork0807\index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>EasyWork</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: 创建 src/vite-env.d.ts**

写入 `e:\Dev\EasyWork0807\src\vite-env.d.ts`：

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 9: 安装核心前端依赖**

Run:
```powershell
npm install react@^19 react-dom@^19 @supabase/supabase-js@^2 @tanstack/react-query@^5 @tanstack/react-router@^1 zustand@^5 recharts@^2 clsx tailwind-merge class-variance-authority lucide-react date-fns dayjs
```
Expected: 依赖安装成功，`node_modules` 出现。

- [ ] **Step 10: 安装开发依赖**

Run:
```powershell
npm install -D typescript@^5 vite@^7 @vitejs/plugin-react@^4 tailwindcss@^4 @tailwindcss/vite@^4 @types/react@^19 @types/react-dom@^19 @tauri-apps/cli@^2 vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25 @tanstack/router-devtools@^1
```
Expected: 开发依赖安装成功。

- [ ] **Step 11: 提交**

Run:
```powershell
git add .gitignore .env.example package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html src/vite-env.d.ts; git commit -m "chore: init npm project with vite + react + ts config"
```
Expected: commit 成功。

---

## Task 2: Tailwind v4 + shadcn/ui 基础

**Files:**
- Create: `src/index.css`
- Create: `src/lib/utils.ts`
- Create: `components.json`
- Create: `src/components/ui/button.tsx`

- [ ] **Step 1: 创建 index.css（Tailwind v4 + 主题变量）**

写入 `e:\Dev\EasyWork0807\src\index.css`：

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --ring: 240 10% 3.9%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --border: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-border: hsl(var(--border));
  --color-ring: hsl(var(--ring));
  --radius-lg: var(--radius);
}

html, body, #root {
  height: 100%;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

- [ ] **Step 2: 创建 lib/utils.ts**

写入 `e:\Dev\EasyWork0807\src\lib\utils.ts`：

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: 创建 components.json（shadcn/ui 配置）**

写入 `e:\Dev\EasyWork0807\components.json`：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: 手动创建 button 组件（避免 shadcn CLI 交互）**

写入 `e:\Dev\EasyWork0807\src\components\ui\button.tsx`：

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-muted text-muted-foreground hover:bg-muted/80",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 5: 安装 button 依赖**

Run:
```powershell
npm install @radix-ui/react-slot
```
Expected: 安装成功。

- [ ] **Step 6: 提交**

Run:
```powershell
git add src/index.css src/lib/utils.ts components.json src/components/ui/button.tsx package.json package-lock.json; git commit -m "feat: add tailwind v4 + shadcn/ui base and button component"
```
Expected: commit 成功。

---

## Task 3: Tauri 2 工程结构

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 Cargo.toml**

写入 `e:\Dev\EasyWork0807\src-tauri\Cargo.toml`：

```toml
[package]
name = "easywork"
version = "0.1.0"
edition = "2021"

[lib]
name = "easywork_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: 创建 build.rs**

写入 `e:\Dev\EasyWork0807\src-tauri\build.rs`：

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: 创建 tauri.conf.json**

写入 `e:\Dev\EasyWork0807\src-tauri\tauri.conf.json`：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "EasyWork",
  "version": "0.1.0",
  "identifier": "com.easywork.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "EasyWork",
        "width": 1200,
        "height": 800,
        "minWidth": 360
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

- [ ] **Step 4: 创建 capabilities/default.json**

写入 `e:\Dev\EasyWork0807\src-tauri\capabilities\default.json`：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "默认权限",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [ ] **Step 5: 创建 src/main.rs**

写入 `e:\Dev\EasyWork0807\src-tauri\src\main.rs`：

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    easywork_lib::run()
}
```

- [ ] **Step 6: 创建 src/lib.rs**

写入 `e:\Dev\EasyWork0807\src-tauri\src\lib.rs`：

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 7: 创建图标目录占位（构建需要）**

Run:
```powershell
mkdir src-tauri/icons -Force
```
说明：图标文件需后续放入。首期开发用 `npm run dev`（Vite）调试前端，Tauri 打包阶段再补正式图标。

- [ ] **Step 8: 验证 Tauri 配置可加载**

Run:
```powershell
npx tauri info
```
Expected: 输出 Tauri 环境信息（若提示缺图标，记下，开发阶段不影响前端调试）。

- [ ] **Step 9: 提交**

Run:
```powershell
git add src-tauri; git commit -m "feat: add tauri 2 project structure"
```
Expected: commit 成功。

---

## Task 4: Supabase 客户端与 profiles 迁移

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `supabase/migrations/0001_init_profiles.sql`
- Create: `.env`（本地，gitignore）

- [ ] **Step 1: 创建 supabase.ts 单例**

写入 `e:\Dev\EasyWork0807\src\lib\supabase.ts`：

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("缺少 Supabase 环境变量，请检查 .env 文件");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

- [ ] **Step 2: 创建 .env（本地）**

写入 `e:\Dev\EasyWork0807\.env`（占位值，需替换为真实 Supabase 项目凭证）：

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: 创建 profiles 迁移 SQL**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0001_init_profiles.sql`：

```sql
-- profiles 表：扩展 auth.users 的用户资料
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS 启用
alter table public.profiles enable row level security;

-- 策略：用户只能读写自己的 profile
create policy "用户可读自己的 profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "用户可插入自己的 profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "用户可更新自己的 profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 新用户注册时自动创建 profile 的触发器
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: 部署迁移到 Supabase（手动说明）**

说明：需在 Supabase Dashboard 的 SQL Editor 中执行 `0001_init_profiles.sql`，或用 Supabase CLI `supabase db push`。此步骤依赖真实 Supabase 项目，执行前需准备项目 URL 与 anon key 并填入 `.env`。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/lib/supabase.ts supabase/migrations/0001_init_profiles.sql; git commit -m "feat: add supabase client and profiles migration with rls"
```
Expected: commit 成功（.env 已被 gitignore）。

---

## Task 5: 认证状态管理（TDD）

**Files:**
- Create: `src/features/auth/authStore.ts`
- Test: `src/__tests__/authStore.test.ts`

- [ ] **Step 1: 创建 vitest 配置**

写入 `e:\Dev\EasyWork0807\vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 2: 创建 test-setup.ts**

写入 `e:\Dev\EasyWork0807\src\test-setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\authStore.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/features/auth/authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it("初始状态为未加载且无会话", () => {
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.loading).toBe(true);
  });

  it("setSession 设置会话并清除 loading", () => {
    const session = { user: { id: "u1" } } as any;
    useAuthStore.getState().setSession(session);
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it("clearSession 清除会话并清除 loading", () => {
    useAuthStore.getState().setSession({ user: { id: "u1" } } as any);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });
});
```

- [ ] **Step 4: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/authStore.test.ts
```
Expected: FAIL，提示找不到 `@/features/auth/authStore` 模块。

- [ ] **Step 5: 实现 authStore**

写入 `e:\Dev\EasyWork0807\src\features\auth\authStore.ts`：

```ts
import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  clearSession: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,
  setSession: (session) => set({ session, loading: false }),
  clearSession: () => set({ session: null, loading: false }),
  reset: () => set({ session: null, loading: true }),
}));
```

- [ ] **Step 6: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/authStore.test.ts
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 7: 提交**

Run:
```powershell
git add vitest.config.ts src/test-setup.ts src/__tests__/authStore.test.ts src/features/auth/authStore.ts; git commit -m "feat: add auth store with tdd"
```
Expected: commit 成功。

---

## Task 6: useAuth hook —— 订阅 Supabase 会话（TDD）

**Files:**
- Create: `src/features/auth/useAuth.ts`
- Test: `src/__tests__/useAuth.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\useAuth.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/features/auth/useAuth";
import { useAuthStore } from "@/features/auth/authStore";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it("无会话时设置 loading=false 且 session=null", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/useAuth.test.tsx
```
Expected: FAIL，找不到 `@/features/auth/useAuth`。

- [ ] **Step 3: 实现 useAuth**

写入 `e:\Dev\EasyWork0807\src\features\auth\useAuth.ts`：

```ts
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";

export function useAuth() {
  const { session, loading, setSession, clearSession } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      } else {
        clearSession();
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
      } else {
        clearSession();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [setSession, clearSession]);

  return { session, loading };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/useAuth.test.tsx
```
Expected: PASS。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/auth/useAuth.ts src/__tests__/useAuth.test.tsx; git commit -m "feat: add useAuth hook subscribing to supabase session"
```
Expected: commit 成功。

---

## Task 7: 主题 Provider（TDD）

**Files:**
- Create: `src/components/theme/ThemeProvider.tsx`
- Create: `src/components/theme/ThemeToggle.tsx`
- Test: `src/__tests__/ThemeProvider.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\ThemeProvider.test.tsx`：

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function Probe() {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("默认为 light 主题", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("点击切换为 dark", () => {
    render(
      <ThemeProvider>
        <Probe />
        <ThemeToggle />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/ThemeProvider.test.tsx
```
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现 ThemeProvider**

写入 `e:\Dev\EasyWork0807\src\components\theme\ThemeProvider.tsx`：

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "easywork-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved ?? "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}
```

- [ ] **Step 4: 实现 ThemeToggle**

写入 `e:\Dev\EasyWork0807\src\components\theme\ThemeToggle.tsx`：

```tsx
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="切换主题">
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </Button>
  );
}
```

- [ ] **Step 5: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/ThemeProvider.test.tsx
```
Expected: PASS（2 个测试通过）。

- [ ] **Step 6: 提交**

Run:
```powershell
git add src/components/theme src/__tests__/ThemeProvider.test.tsx; git commit -m "feat: add theme provider with light/dark toggle"
```
Expected: commit 成功。

---

## Task 8: 全局布局（侧边栏 + 移动 Tab，响应式）

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/MobileTabBar.tsx`
- Create: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: 创建 Sidebar（桌面图标侧边栏，hover 显文字）**

写入 `e:\Dev\EasyWork0807\src\components\layout\Sidebar.tsx`：

```tsx
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Mail, NotebookText, Wallet, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/tasks", label: "任务", icon: ListChecks },
  { to: "/mail", label: "邮箱", icon: Mail },
  { to: "/notes", label: "笔记", icon: NotebookText },
  { to: "/finance", label: "记账", icon: Wallet },
  { to: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden md:flex flex-col items-center gap-1 w-14 py-4 border-r bg-card">
      {navItems.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon size={20} />
            <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs opacity-0 shadow group-hover:opacity-100 bg-background border">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: 创建 MobileTabBar**

写入 `e:\Dev\EasyWork0807\src\components\layout\MobileTabBar.tsx`：

```tsx
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Mail, NotebookText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/tasks", label: "任务", icon: ListChecks },
  { to: "/mail", label: "邮箱", icon: Mail },
  { to: "/notes", label: "笔记", icon: NotebookText },
  { to: "/finance", label: "记账", icon: Wallet },
];

export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="md:hidden flex items-center justify-around border-t bg-card h-14 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px]",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: 创建 AppLayout**

写入 `e:\Dev\EasyWork0807\src\components\layout\AppLayout.tsx`：

```tsx
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AppLayout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-12 items-center justify-end px-3 border-b">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 提交**

Run:
```powershell
git add src/components/layout; git commit -m "feat: add responsive app layout with sidebar and mobile tab bar"
```
Expected: commit 成功。

---

## Task 9: 路由定义（TanStack Router，受保护路由）

**Files:**
- Create: `src/router.tsx`

- [ ] **Step 1: 创建路由树**

写入 `e:\Dev\EasyWork0807\src\router.tsx`：

```tsx
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { Login } from "@/features/auth/Login";
import { Register } from "@/features/auth/Register";
import { useAuthStore } from "@/features/auth/authStore";

const rootRoute = createRootRouteWithContext()({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: Register,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
  beforeLoad: () => {
    const { session, loading } = useAuthStore.getState();
    if (!loading && !session) {
      throw redirect({ to: "/login" });
    }
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: Dashboard,
});

const tasksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/tasks",
  component: () => <div className="p-4">任务模块（待实现）</div>,
});

const mailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/mail",
  component: () => <div className="p-4">邮箱模块（待实现）</div>,
});

const notesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/notes",
  component: () => <div className="p-4">笔记模块（待实现）</div>,
});

const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/finance",
  component: () => <div className="p-4">记账模块（待实现）</div>,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: () => <div className="p-4">设置（待实现）</div>,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    dashboardRoute,
    tasksRoute,
    mailRoute,
    notesRoute,
    financeRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 2: 提交**

Run:
```powershell
git add src/router.tsx; git commit -m "feat: add tanstack router with protected app routes"
```
Expected: commit 成功。

---

## Task 10: 登录与注册页

**Files:**
- Create: `src/features/auth/Login.tsx`
- Create: `src/features/auth/Register.tsx`

- [ ] **Step 1: 创建 Login 页（邮箱密码 + 魔法链接）**

写入 `e:\Dev\EasyWork0807\src\features\auth\Login.tsx`：

```tsx
import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setError(error.message);
      return;
    }
    setMagicSent(true);
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">登录 EasyWork</h1>

        <form onSubmit={handlePasswordLogin} className="space-y-3">
          <input
            type="email"
            required
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" className="w-full">登录</Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
          <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">或</span></div>
        </div>

        <form onSubmit={handleMagicLink} className="space-y-3">
          <Button type="submit" variant="outline" className="w-full">发送魔法链接</Button>
        </form>

        {magicSent && <p className="text-center text-sm text-muted-foreground">魔法链接已发送，请查收邮箱。</p>}
        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <p className="text-center text-sm text-muted-foreground">
          没有账号？<Link to="/register" className="text-primary underline">注册</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 Register 页**

写入 `e:\Dev\EasyWork0807\src\features\auth\Register.tsx`：

```tsx
import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">注册 EasyWork</h1>
        <form onSubmit={handleRegister} className="space-y-3">
          <input
            type="email"
            required
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" className="w-full">注册</Button>
        </form>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <p className="text-center text-sm text-muted-foreground">
          已有账号？<Link to="/login" className="text-primary underline">登录</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/auth/Login.tsx src/features/auth/Register.tsx; git commit -m "feat: add login and register pages with magic link"
```
Expected: commit 成功。

---

## Task 11: Dashboard 页面（概览卡片 + 图表 + 全局搜索）

**Files:**
- Create: `src/features/dashboard/Dashboard.tsx`
- Create: `src/features/dashboard/OverviewCards.tsx`
- Create: `src/features/dashboard/TaskTrendChart.tsx`
- Create: `src/features/dashboard/GlobalSearch.tsx`

- [ ] **Step 1: 创建 OverviewCards（占位数据，后续接 Supabase）**

写入 `e:\Dev\EasyWork0807\src\features\dashboard\OverviewCards.tsx`：

```tsx
import { ListChecks, Mail, Wallet, NotebookText } from "lucide-react";

const cards = [
  { label: "待办任务", value: "—", icon: ListChecks },
  { label: "未读邮件", value: "—", icon: Mail },
  { label: "本周支出", value: "¥—", icon: Wallet },
  { label: "最近笔记", value: "—", icon: NotebookText },
];

export function OverviewCards() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Icon size={16} className="text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 创建 TaskTrendChart（示例趋势图）**

写入 `e:\Dev\EasyWork0807\src\features\dashboard\TaskTrendChart.tsx`：

```tsx
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const data = [
  { day: "周一", done: 3 },
  { day: "周二", done: 5 },
  { day: "周三", done: 2 },
  { day: "周四", done: 7 },
  { day: "周五", done: 4 },
  { day: "周六", done: 1 },
  { day: "周日", done: 0 },
];

export function TaskTrendChart() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium">本周任务完成趋势</h2>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="done" fill="hsl(var(--primary))" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 GlobalSearch**

写入 `e:\Dev\EasyWork0807\src\features\dashboard\GlobalSearch.tsx`：

```tsx
import { useState } from "react";
import { Search } from "lucide-react";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索任务、笔记、记账…"
        className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 4: 创建 Dashboard 页面**

写入 `e:\Dev\EasyWork0807\src\features\dashboard\Dashboard.tsx`：

```tsx
import { OverviewCards } from "@/features/dashboard/OverviewCards";
import { TaskTrendChart } from "@/features/dashboard/TaskTrendChart";
import { GlobalSearch } from "@/features/dashboard/GlobalSearch";

export function Dashboard() {
  return (
    <div className="space-y-4 p-4">
      <GlobalSearch />
      <OverviewCards />
      <TaskTrendChart />
    </div>
  );
}
```

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/dashboard; git commit -m "feat: add dashboard page with overview cards, chart, and global search"
```
Expected: commit 成功。

---

## Task 12: 应用入口与 Provider 装配

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: 创建 App.tsx（Provider 装配 + useAuth）**

写入 `e:\Dev\EasyWork0807\src\App.tsx`：

```tsx
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { useAuth } from "@/features/auth/useAuth";
import { router } from "@/router";

const queryClient = new QueryClient();

function AuthedRouter() {
  useAuth();
  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthedRouter />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: 创建 main.tsx**

写入 `e:\Dev\EasyWork0807\src\main.tsx`：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/App.tsx src/main.tsx; git commit -m "feat: wire up app entry with providers and router"
```
Expected: commit 成功。

---

## Task 13: 全量测试与前端构建验证

**Files:** 无新增

- [ ] **Step 1: 运行全部单元测试**

Run:
```powershell
npm test
```
Expected: 所有测试通过（authStore 3 个、useAuth 1 个、ThemeProvider 2 个）。

- [ ] **Step 2: 类型检查 + 构建**

Run:
```powershell
npm run build
```
Expected: `tsc -b` 无类型错误，`vite build` 产出 `dist/`。

- [ ] **Step 3: 启动前端开发服务器验证**

Run:
```powershell
npm run dev
```
Expected: Vite 在 `http://localhost:1420` 启动，浏览器打开显示登录页（因无有效 Supabase 凭证会报错属正常，重点是页面渲染无 JS 错误）。验证后停止。

- [ ] **Step 4: 提交最终状态**

Run:
```powershell
git add -A; git commit -m "chore: verify build and tests pass for dashboard skeleton"
```
Expected: commit 成功（若有改动）。

---

## Self-Review

**1. Spec 覆盖：**
- 脚手架（Tauri2+Vite+React19+TS+TWv4+shadcn/ui）→ Task 1-3 ✓
- Supabase 接入 + Auth + RLS（profiles）→ Task 4-6, 10 ✓
- 全局响应式布局（图标侧栏 + 移动 Tab + 亮暗主题）→ Task 7-8 ✓
- 路由 + 受保护路由 → Task 9 ✓
- Dashboard（概览卡片 + 图表 + 全局搜索）→ Task 11 ✓
- 多设备同步基座：Supabase Auth + Realtime 客户端已就绪（Realtime 业务表在后续模块迁移中启用）✓

**2. 占位符扫描：** 无 TBD/TODO；各占位路由组件明确标注"待实现"属计划内范围控制，非占位符。✓

**3. 类型一致性：** `useAuthStore` 的 `setSession`/`clearSession`/`reset` 在 authStore、useAuth、useAuth.test 中签名一致；`ThemeProvider` 的 `useTheme`/`toggleTheme` 在 Provider、Toggle、测试中一致。✓

**范围说明：** 本计划仅覆盖 Dashboard 骨架子项目。任务/记账/笔记/邮箱四大业务模块的详细计划将在各自子项目中分别生成。
