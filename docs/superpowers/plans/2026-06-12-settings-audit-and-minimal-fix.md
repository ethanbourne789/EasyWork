# 设置页审计 + 最小修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 EasyWork 设置页 4 处明确问题（死代码清理 / 假通知开关 / 数据库路径 / 关闭行为 UI 互斥表达），不重做整体结构。

**Architecture:** 4 处独立改动分别落地为 4 个 commit，可单独回滚。Rust 端新增 1 个 system 命令 + 注册已存在的 settings KV 命令；前端删除 MUI/qiankun 死代码，settings.tsx 内部做 UI 改造 + i18n 调整。

**Tech Stack:** Rust (Tauri 2.x, tauri 1.x Manager path API), React 19, TypeScript 5.x, Tailwind 4.x, TanStack Router, i18next.

---

## File Structure

### 删除（11 个目录 + 0 个文件）
- `apps/main/`
- `apps/app-dashboard/`
- `apps/app-kanban/`
- `apps/app-calendar/`
- `apps/app-mail/`
- `apps/app-notes/`
- `apps/app-stock/`
- `apps/app-accounting/`
- `apps/app-sports/`
- `apps/app-logs/`
- `apps/app-settings/`

### 新增（3 个文件）
- `src-tauri/src/commands/system.rs` —— Tauri 命令 `get_app_data_dir`
- `src/lib/system-ipc.ts` —— 前端 IPC 封装
- `src/components/ui/radio-group.tsx` —— 通用 RadioGroup 组件（与现有 button.tsx 风格一致）

### 修改（6 个文件）
- `pnpm-workspace.yaml` —— 清理 `apps/*` glob
- `src-tauri/src/commands/mod.rs` —— 注册 `pub mod settings;` 和 `pub mod system;`
- `src-tauri/src/lib.rs` —— `invoke_handler!` 追加 4 个命令
- `src/routes/settings.tsx` —— 改动 B（删假通知）+ C（动态 DB 路径）+ D（RadioGroup 关闭行为）
- `src/locales/zh.json` —— 更新 `settings.notificationsDesc` + 新增 `settings.notificationsHint`
- `src/locales/en.json` —— 同步英文键

---

## Task 1: 改动 A — 清理 MUI/qiankun 死代码 + 注册 KV 命令

**Files:**
- Delete: `apps/main/`, `apps/app-dashboard/`, `apps/app-kanban/`, `apps/app-calendar/`, `apps/app-mail/`, `apps/app-notes/`, `apps/app-stock/`, `apps/app-accounting/`, `apps/app-sports/`, `apps/app-logs/`, `apps/app-settings/`
- Modify: `pnpm-workspace.yaml`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 反向验证 `apps/*` 没有任何引用**

```bash
cd e:/Dev/EasyWork
git grep -nE "from '@easywork/(main|app-(dashboard|kanban|calendar|mail|notes|stock|accounting|sports|logs|settings))'"
git grep -nE "import.*apps/(main|app-(dashboard|kanban|calendar|mail|notes|stock|accounting|sports|logs|settings))"
```

Expected: 两个命令都返回 0 行。如果有任何命中，停下来报告，不要继续。

- [ ] **Step 2: 删除 11 个 MUI/qiankun 子应用目录**

```bash
cd e:/Dev/EasyWork
git rm -r apps/main apps/app-dashboard apps/app-kanban apps/app-calendar apps/app-mail apps/app-notes apps/app-stock apps/app-accounting apps/app-sports apps/app-logs apps/app-settings
```

Expected: 11 个目录被 git 标记为删除（`D apps/...`）。

- [ ] **Step 3: 清理 `pnpm-workspace.yaml`**

修改 `pnpm-workspace.yaml`：

```yaml
packages:
  - 'shared'
allowBuilds:
  esbuild: true
  sharp: true
```

- [ ] **Step 4: 在 `src-tauri/src/commands/mod.rs` 注册 settings 模块**

修改 `src-tauri/src/commands/mod.rs`：

```rust
pub mod mail;
pub mod autoconfig;
pub mod notification_handler;
pub mod drafts;
pub mod settings;
pub mod system;
```

（同时为下一个 task 加上 `system` 声明）

- [ ] **Step 5: 在 `src-tauri/src/lib.rs` 注册 3 个 settings 命令**

打开 `src-tauri/src/lib.rs`，定位到 `tauri::generate_handler![...]` 宏（约 L313–L399）。在 `// System` 注释块、`set_global_shortcut` 那行**之前**，追加：

```rust
            // Settings KV (基础设施，本轮不暴露前端 API)
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_get_all,
```

- [ ] **Step 6: 验证 pnpm + cargo 编译通过**

```bash
cd e:/Dev/EasyWork
pnpm install
pnpm build:web
cd src-tauri
cargo build
```

Expected:
- `pnpm install` 警告 / 错误信息中无 "apps/..." 相关
- `pnpm build:web` 退出码 0
- `cargo build` 退出码 0

- [ ] **Step 7: 验证 Rust 单元测试不挂**

```bash
cd e:/Dev/EasyWork/src-tauri
cargo test
```

Expected: 9 个现有 mail 单元测试全部通过，无回归。

- [ ] **Step 8: 提交**

```bash
cd e:/Dev/EasyWork
git add pnpm-workspace.yaml src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git add -u apps/
git commit -m "chore(cleanup): remove dead MUI/qiankun sub-apps and register settings KV commands

- Remove 11 apps/* directories (no frontend references)
- Clean pnpm-workspace.yaml
- Register settings_get/set/get_all in invoke_handler"
```

---

## Task 2: 改动 B — 删除假通知开关

**Files:**
- Modify: `src/routes/settings.tsx`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 删 zh.json 旧描述、加新 hint 键**

打开 `src/locales/zh.json`，定位到 `settings` 块（搜索 `"notificationsDesc"`）。

将：
```json
    "notificationsDesc": "消息提醒与推送设置",
```

改为：
```json
    "notificationsDesc": "通知系统正在迁移中",
    "notificationsHint": "迁移完成后将支持任务到期、股票预警等通知开关",
```

- [ ] **Step 2: 删 en.json 旧描述、加新 hint 键**

打开 `src/locales/en.json`，定位到 `settings` 块（搜索 `"notificationsDesc"`）。

将：
```json
    "notificationsDesc": "Message alerts and push settings",
```

改为：
```json
    "notificationsDesc": "Notification system is being migrated",
    "notificationsHint": "Task deadlines, stock alerts, and more will be available after migration",
```

- [ ] **Step 3: 删 settings.tsx 假通知 4 个 Switch**

打开 `src/routes/settings.tsx`，定位到 L297 附近（搜索字符串 `任务到期提醒`），删除整段：

```tsx
          {[
            { label: "任务到期提醒", enabled: true },
            { label: "日历事件提醒", enabled: true },
            { label: "股票价格预警", enabled: false },
            { label: "运动目标达成", enabled: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <span className="text-sm dark:text-surface-200">{item.label}</span>
              <div
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${
                  item.enabled ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-600"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    item.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </div>
            </div>
          ))}
```

- [ ] **Step 4: 在 CardContent 底部加 hint 行**

在删除假 Switch 之后，`<CardContent className="space-y-3">` 块的最末尾（`</CardContent>` 之前），加一行：

```tsx
          <p className="text-xs text-surface-400 dark:text-surface-500 pt-2 border-t border-surface-100 dark:border-surface-700">
            {t("settings.notificationsHint")}
          </p>
```

- [ ] **Step 5: 验证**

```bash
cd e:/Dev/EasyWork
pnpm build:web
git grep -n "任务到期提醒\|日历事件提醒\|股票价格预警\|运动目标达成" src/
```

Expected:
- `pnpm build:web` 退出码 0
- `git grep` 返回 0 行（前端再无硬编码假 UI）

- [ ] **Step 6: 提交**

```bash
cd e:/Dev/EasyWork
git add src/routes/settings.tsx src/locales/zh.json src/locales/en.json
git commit -m "fix(settings): remove hardcoded fake notification switches

The 4 Switch components (任务到期提醒, 日历事件提醒, 股票价格预警,
运动目标达成) were static Chinese labels with no state. They gave users
the illusion of configurable notification options that did nothing.

This commit removes them. The 'Show Remote Images' real switch is kept.
A migration hint is shown until the notification system is implemented."
```

---

## Task 3: 改动 C — 数据库路径动态化

**Files:**
- Create: `src-tauri/src/commands/system.rs`
- Modify: `src-tauri/src/commands/mod.rs` （已在 Task 1 中加 `pub mod system;`）
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/system-ipc.ts`
- Modify: `src/routes/settings.tsx`

- [ ] **Step 1: 新建 `src-tauri/src/commands/system.rs`**

文件内容：

```rust
//! 系统级只读命令（app 数据目录等）
use tauri::Manager;

/// 返回当前 Tauri app 的数据目录（跨平台）。
/// - Windows: `C:\Users\<User>\AppData\Roaming\com.easywork.desktop\`
/// - Android: `/data/data/com.easywork.desktop/files/`
#[tauri::command]
pub async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}
```

- [ ] **Step 2: 在 `lib.rs` 注册 `get_app_data_dir` 命令**

打开 `src-tauri/src/lib.rs`，定位到 `tauri::generate_handler![...]` 宏。在 Task 1 新增的 3 个 settings 命令**下方**追加：

```rust
            // System
            commands::system::get_app_data_dir,
```

- [ ] **Step 3: 写一个最小 Rust 单元测试**

打开 `src-tauri/src/commands/system.rs`，追加（紧跟现有函数后）：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_signature_compiles() {
        // 验证函数签名符合 Tauri 命令约定
        let _: fn(tauri::AppHandle) -> _ = get_app_data_dir;
    }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd e:/Dev/EasyWork/src-tauri
cargo test commands::system
```

Expected: 1 个测试通过，编译无 warning。

- [ ] **Step 5: 新建 `src/lib/system-ipc.ts`**

文件内容：

```ts
/**
 * 系统级 IPC（应用数据目录等只读信息）
 */

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri not available, command "${cmd}" skipped`)
    throw new Error("Tauri not available")
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(cmd, args)
}

/** 获取 Tauri app 的数据目录（不包含末尾分隔符） */
export async function getAppDataDir(): Promise<string> {
  return tauriInvoke<string>("get_app_data_dir")
}
```

- [ ] **Step 6: 在 settings.tsx 加 import**

打开 `src/routes/settings.tsx`，定位到 L8 附近的 import：

```ts
import * as mailIpc from "@/lib/mail-ipc"
```

在它**下方**追加：

```ts
import * as systemIpc from "@/lib/system-ipc"
```

- [ ] **Step 7: 在 settings.tsx 加 dbPath state + 加载逻辑**

定位到 L36 附近（`remoteImagesEnabled` state 行下），追加：

```tsx
  // App data dir (for displaying actual database path)
  const [dbPath, setDbPath] = useState("加载中…")
```

定位到 `useEffect` 内（`mailIpc.getRemoteImagesEnabled().then(setRemoteImagesEnabledState).catch(() => {})` 之后），追加：

```tsx
      systemIpc.getAppDataDir()
        .then((dir) => setDbPath(`${dir}${dir.endsWith("\\") || dir.endsWith("/") ? "" : "/"}${"data.db"}`))
        .catch(() => setDbPath("未知"))
```

- [ ] **Step 8: 替换硬编码的数据库路径展示**

定位到 L333 附近（搜索 `数据库位置`），将：

```tsx
            <div>
              <p className="text-sm font-medium dark:text-surface-200">数据库位置</p>
              <p className="text-xs text-surface-400">~/easywork/data.db</p>
            </div>
```

改为：

```tsx
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium dark:text-surface-200">数据库位置</p>
              <p className="text-xs text-surface-400 break-all">{dbPath}</p>
            </div>
```

- [ ] **Step 9: 验证**

```bash
cd e:/Dev/EasyWork
pnpm build:web
git grep -n "~/easywork/data.db" src/ 2>&1 || echo "OK: no hardcoded path"
```

Expected:
- `pnpm build:web` 退出码 0
- 第二个命令输出 `OK: no hardcoded path`（或 `git grep` 0 行）

- [ ] **Step 10: 提交**

```bash
cd e:/Dev/EasyWork
git add src-tauri/src/commands/system.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/system-ipc.ts src/routes/settings.tsx
git commit -m "feat(settings): show actual app data dir for database location

Previously the data card displayed the hardcoded '~/easywork/data.db'
which is wrong on Windows (real path is %APPDATA%\\com.easywork.desktop\\data.db).

This commit:
- Adds Rust command get_app_data_dir
- Adds src/lib/system-ipc.ts wrapper
- Settings page now shows the real path returned by Tauri"
```

---

## Task 4: 改动 D — 关闭行为改 RadioGroup

**Files:**
- Create: `src/components/ui/radio-group.tsx`
- Modify: `src/routes/settings.tsx`

- [ ] **Step 1: 新建 `src/components/ui/radio-group.tsx`**

文件内容（与现有 button.tsx / label.tsx 风格一致，纯 Tailwind + forwardRef，无 Radix 依赖）：

```tsx
import { cn } from "@/lib/utils"
import {
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  forwardRef,
  createContext,
  useContext,
  useId,
} from "react"

interface RadioGroupContextValue {
  name: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

interface RadioGroupProps {
  name?: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ name, value, onValueChange, disabled, className, children }, ref) => {
    const autoName = useId()
    return (
      <RadioGroupContext.Provider
        value={{ name: name ?? `radio-${autoName}`, value, onChange: onValueChange, disabled }}
      >
        <div ref={ref} className={cn("space-y-2", className)} role="radiogroup">
          {children}
        </div>
      </RadioGroupContext.Provider>
    )
  }
)
RadioGroup.displayName = "RadioGroup"

interface RadioItemProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type"> {
  value: string
  label: string
  description?: string
  labelClassName?: string
}

export const RadioItem = forwardRef<HTMLInputElement, RadioItemProps>(
  ({ value, label, description, labelClassName, className, ...props }, ref) => {
    const ctx = useContext(RadioGroupContext)
    if (!ctx) {
      throw new Error("RadioItem must be used inside <RadioGroup>")
    }
    const checked = ctx.value === value
    const inputId = `${ctx.name}-${value}`
    return (
      <label
        htmlFor={inputId}
        className={cn(
          "flex items-start gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors",
          checked
            ? "bg-primary-50 dark:bg-primary-900/30"
            : "hover:bg-surface-50 dark:hover:bg-surface-800/50",
          ctx.disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type="radio"
          name={ctx.name}
          value={value}
          checked={checked}
          disabled={ctx.disabled}
          onChange={(e) => ctx.onChange(e.target.value)}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 border-surface-300 text-primary-600",
            "focus:ring-2 focus:ring-primary-500 focus:ring-offset-1",
            "disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-medium text-surface-900 dark:text-surface-100", labelClassName)}>
            {label}
          </span>
          {description && (
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{description}</p>
          )}
        </div>
      </label>
    )
  }
)
RadioItem.displayName = "RadioItem"

// 兼容部分用法：导出一个独立的 Radio wrapper
export const Radio = RadioItem
```

- [ ] **Step 2: 在 settings.tsx 加 import**

打开 `src/routes/settings.tsx`，定位到 L4–L5：

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
```

在 `Button` import 行**下方**追加：

```tsx
import { RadioGroup, RadioItem } from "@/components/ui/radio-group"
```

- [ ] **Step 3: 重写"关闭行为"卡内容**

打开 `src/routes/settings.tsx`，定位到 L191 附近（搜索字符串 `{/* Close Behavior */}`），删除从该注释**开始**到下一个 `{/* Auto Fetch */}` 注释**之前**的整段 JSX（即整个 `<Card>...</Card>` 块，约 L191–L232）。

在相同位置用以下 JSX 替换：

```tsx
      {/* Close Behavior */}
      <Card className="dark:bg-surface-800 dark:border-surface-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <LogOut size={18} className="text-surface-500" />
            {t("settings.closeBehavior")}
          </CardTitle>
          <CardDescription className="dark:text-surface-400">
            {t("settings.closeBehaviorDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={closeBehavior}
            onValueChange={handleCloseBehaviorChange}
            disabled={!isTauri}
          >
            <RadioItem
              value="minimize"
              label={t("settings.minimizeToTray")}
              description={t("settings.minimizeToTrayHint")}
            />
            <RadioItem
              value="exit"
              label={t("settings.exitOnClose")}
              description={t("settings.exitOnCloseHint")}
            />
          </RadioGroup>
        </CardContent>
      </Card>
```

- [ ] **Step 4: 在 settings.tsx 顶部加 `isTauri` 常量**

打开 `src/routes/settings.tsx`，定位到 L38 附近 `useEffect` 内的：

```tsx
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      mailIpc.getCloseBehavior().then(...
```

将该 `isTauri` 局部声明**提升到组件顶部**（在所有 `useState` 之后、`useEffect` 之前）：

```tsx
  // 区分 Tauri 运行环境与浏览器开发模式
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

  useEffect(() => {
    if (isTauri) {
      mailIpc.getCloseBehavior().then(...
```

并**删除**原 useEffect 内的局部 `const isTauri = ...` 声明。`handleCloseBehaviorChange` / `handleAutoFetchChange` / `handleRemoteImagesToggle` 三个 handler 内部也各有 `const isTauri = ...`，同样**删除局部声明**、复用组件顶部的 `isTauri`。

- [ ] **Step 5: 验证**

```bash
cd e:/Dev/EasyWork
pnpm build:web
pnpm tsc --noEmit
```

Expected: 两个命令都退出码 0。

- [ ] **Step 6: 提交**

```bash
cd e:/Dev/EasyWork
git add src/components/ui/radio-group.tsx src/routes/settings.tsx
git commit -m "refactor(settings): use RadioGroup for exclusive close behavior

Previously the 'Close Behavior' card showed two independent Switch
components ('Minimize to Tray' and 'Exit on Close') that are
logically mutually exclusive (the close_behavior config is a single
enum: 'minimize' or 'exit'). The UI was confusing.

This commit:
- Adds a new RadioGroup/RadioItem UI primitive
- Replaces the two Switch components with a RadioGroup showing
  two mutually exclusive options with descriptions
- Lifts the local 'isTauri' constant in settings.tsx to the component
  scope so RadioGroup's disabled prop and IPC handlers share the check"
```

---

## Self-Review

### 1. Spec coverage
| Spec 章节 | 覆盖 Task |
|-----------|-----------|
| 3.1 A.1 删除清单 | Task 1 Step 2 |
| 3.1 A.2 注册 KV | Task 1 Step 4–5 |
| 3.1 A.3 验证 | Task 1 Step 6–7 |
| 3.2 删假通知 4 行 | Task 2 Step 3 |
| 3.2 改 zh/en 描述 + hint | Task 2 Step 1–2, 4 |
| 3.3 C.1 新增 system.rs | Task 3 Step 1 |
| 3.3 C.1 mod.rs + lib.rs | Task 1 Step 4 + Task 3 Step 2 |
| 3.3 C.2 新增 system-ipc.ts | Task 3 Step 5 |
| 3.3 C.3 settings.tsx 消费 | Task 3 Step 6–8 |
| 3.4 D 改 RadioGroup | Task 4 Step 1–3 |
| §5 测试计划 A | Task 1 Step 6–7 |
| §5 测试计划 B | Task 2 Step 5 |
| §5 测试计划 C | Task 3 Step 9 |
| §5 测试计划 D | Task 4 Step 5 |

无覆盖缺口。

### 2. Placeholder scan
- 全文无 "TBD" / "TODO" / "类似 Task N"
- 所有代码块都是完整可粘贴的
- 所有命令都带 expected 输出

### 3. Type consistency
- `get_app_data_dir` 在 system.rs 定义、在 lib.rs 注册、在 system-ipc.ts 包装、在 settings.tsx 调用，名字一致
- `RadioGroup` / `RadioItem` 导出名在 radio-group.tsx 定义、在 settings.tsx 导入，名字一致
- `isTauri` 提升到组件顶部后，所有 handler 内部用同一份声明，名字一致
- `dbPath` state 名在 Step 7 和 Step 8 一致
