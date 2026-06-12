---
title: 设置页审计 + 最小修复
description: EasyWork · 设置页现状问题清单与最小修复方案（死代码清理 / 假通知开关 / 数据库路径 / 关闭行为 UI）
date: 2026-06-12
tags:
  - EasyWork
  - settings
  - design
  - audit
  - minimal-fix
status: in-progress
---

# 设置页审计 + 最小修复

> [!info] 一句话定位
> 对当前 `src/routes/settings.tsx` 实施"现状审计 + 最小修复"：**不动整体结构**（保留 TanStack Router + Tailwind + 单列卡片堆叠），只清理 4 处明确的问题点。
>
> 4 处改动互相独立、无相互依赖，可作为单个 PR 提交。

---

## 一、目标与非目标

### 1.1 目标（本轮）

- 清理 MUI/qiankun 时期的死代码（`apps/*` 11 个子应用）
- 修好 `src-tauri/src/commands/settings.rs` 中已实现但未注册的 3 个 KV 命令
- 删除通知卡里 4 个写死的"假 Switch"
- 修数据卡里硬编码的数据库路径（Windows 上显示真实路径）
- 把关闭行为卡里两个互斥 Switch 改 RadioGroup

### 1.2 非目标（本轮不做）

- **不重做设置页结构**（不顺手迁到左 220 侧栏、也不拆分子应用）
- **不把邮箱账号管理从邮箱模块迁到设置**（设计文档 3.10 的"账号"分组本轮仍由邮箱模块实现）
- **不补启动行为 / autostart 设置项**（autostart 命令虽存在但本轮不暴露）
- **不补 backup / restore / 清空数据 三个按钮的逻辑**（留占位）
- **不修字体大小行的"只展示不响应"**（留占位）
- **不修关于卡的硬编码版本号**（留占位）
- **不修自动备份 03:00 的硬编码**（留占位）
- **不重做 i18n 键名**

---

## 二、问题清单与决策

### 2.1 现状摘要

| # | 问题 | 类型 | 严重性 |
|---|------|------|--------|
| A | `apps/*` 11 个 MUI/qiankun 子应用目录全在但前端 0 引用 | 死代码 | 高（误导） |
| A | `commands::settings` 3 个 KV 命令未注册到 `lib.rs::invoke_handler` | 死代码 | 中（基础设施缺位） |
| B | 通知卡里 4 个 Switch 是写死的中文 + 静态 `enabled: true/false` | 假 UI | 高（欺骗用户） |
| C | 数据卡"数据库位置"硬编码 `~/easywork/data.db`，Windows 实际为 `%APPDATA%\com.easywork.desktop\data.db` | 错误信息 | 中 |
| D | 关闭行为卡里两个 Switch 互斥但 UI 上做成独立开关 | UI 语义错 | 中 |

### 2.2 决策摘要

| 维度 | 决策 | 理由 |
|------|------|------|
| 死代码范围 | 全删 `apps/*` 11 个子应用目录 | grep 确认 `src/` 无任何引用；`tauri.conf.json` 实际 `frontendDist: ../dist`；`project_memory.md` 里 `frontendDist: ../apps/main/dist` 是过时的 |
| KV 命令 | 保留 `commands/settings.rs`，补 3 个命令到 `invoke_handler!` | 基础设施；不暴露前端 API（留作后续设置扩展） |
| 假通知开关 | 全部删除 4 行；通知卡保留"显示远程图片"真开关 + 改描述为"通知系统迁移中" | 最稳的最小修复 |
| 数据库路径 | 新增 Tauri 命令 `get_app_data_dir`；前端动态拼接 `/data.db` | 准确且不引入新表 |
| 关闭行为 UI | 改 RadioGroup 互斥表达 | 用户已选 RadioGroup（决策于 brainstorming 03 屏） |
| 改动粒度 | 1 个 PR 4 个 commit | 互相独立，可单独回滚 |
| 测试 | 手工验证 4 项；Rust 现有单元测试必须不挂 | 不写新自动化测试（改动太小） |

---

## 三、详细改动

### 3.1 改动 A：清理 MUI/qiankun 死代码 + 注册 KV 命令

#### A.1 删除清单

**整目录删除**（11 个）：
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

#### A.2 注册 KV 命令

**文件**：`src-tauri/src/commands/mod.rs`

```rust
pub mod mail;
pub mod autoconfig;
pub mod notification_handler;
pub mod drafts;
pub mod settings;  // 新增
```

**文件**：`src-tauri/src/lib.rs`

在 `tauri::generate_handler![...]` 宏里追加：

```rust
// Settings KV (基础设施)
commands::settings::settings_get,
commands::settings::settings_set,
commands::settings::settings_get_all,
```

**保留文件**：`src-tauri/src/commands/settings.rs` 不删（3 个函数已经写好，注册即可用）。

#### A.3 验证 A

- `pnpm install`（可能需要 `--filter` 清掉残留）
- `pnpm build:web` 通过
- `cd src-tauri && cargo build` 通过
- `cd src-tauri && cargo test` 现有 9 个 mail 单元测试不挂

---

### 3.2 改动 B：删除假通知开关

**文件**：`src/routes/settings.tsx`

**位置**：L297–L317 的 `[任务到期提醒, 日历事件提醒, 股票价格预警, 运动目标达成]` 4 行假 Switch 全部删除。

**保留**：
- 通知卡标题 + 描述（`t("settings.notifications")` + `t("settings.notificationsDesc")`）
- "显示远程图片"真开关（接 `remoteImagesEnabled`，L281–L296）

**修改描述**：

`src/locales/zh.json` 的 `settings.notificationsDesc` 从 `"消息提醒与推送设置"` 改为 `"通知系统正在迁移中"`，并新增键 `settings.notificationsHint: "迁移完成后将支持任务到期、股票预警等通知开关"`，在卡片底部显示一行小字。

`src/locales/en.json` 同步。

#### 验证 B

手工打开 `/settings`，确认通知卡里只有 1 个真 Switch + 1 行提示，4 行假 UI 消失。

---

### 3.3 改动 C：数据库路径动态化

#### C.1 新增 Tauri 命令

**新增文件**：`src-tauri/src/commands/system.rs`

```rust
//! 系统级只读命令（app 数据目录等）
use tauri::Manager;

#[tauri::command]
pub async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}
```

**文件**：`src-tauri/src/commands/mod.rs` 加 `pub mod system;`

**文件**：`src-tauri/src/lib.rs::invoke_handler!` 加 `commands::system::get_app_data_dir,`

#### C.2 前端封装

**新增文件**：`src/lib/system-ipc.ts`

```ts
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export async function getAppDataDir(): Promise<string> {
  if (!isTauri) throw new Error("Tauri not available")
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("get_app_data_dir")
}
```

#### C.3 设置页消费

**文件**：`src/routes/settings.tsx`

- 加 `const [dbPath, setDbPath] = useState("加载中…")`
- 在 `useEffect` 里 `getAppDataDir().then(p => setDbPath(p + "/data.db")).catch(() => setDbPath("未知"))`
- 数据卡 L333–L335 改为：

```tsx
<p className="text-sm font-medium dark:text-surface-200">数据库位置</p>
<p className="text-xs text-surface-400 break-all">{dbPath}</p>
```

#### 验证 C

打开设置页，Windows 上显示形如 `C:\Users\<User>\AppData\Roaming\com.easywork.desktop\data.db`。

---

### 3.4 改动 D：关闭行为改 RadioGroup

**文件**：`src/routes/settings.tsx`

**位置**：L190–L232 整个"关闭行为"卡重写。

**实现要点**：
- 移除现有的 2 个 Switch（`minimizeToTray` 和 `exitOnClose`）
- 引入 `RadioGroup` 组件（从 `@/components/ui/` 取；若无，新建 `src/components/ui/radio-group.tsx` 复用 Radix 风格）
- 两个 Radio 选项：
  - `value="minimize"` → 中文 "最小化到系统托盘" + 副标 "点击关闭时隐藏到系统托盘，后台继续运行"
  - `value="exit"` → 中文 "直接关闭退出软件" + 副标 "点击关闭时直接退出程序"
- 选中即调 `handleCloseBehaviorChange`，数据流不变
- 保留 i18n 键 `settings.minimizeToTray` / `settings.exitOnClose`（标签复用）

#### 验证 D

1. 切到"最小化到托盘"→ 关窗口 → 不退出，托盘图标保留
2. 切到"直接关闭退出软件"→ 关窗口 → 程序退出
3. 重启后值仍然保留（走 `db::ops::get_config`）

---

## 四、范围外（显式不做）

按"最小修复"原则，本轮**不**顺手做的：

| # | 已知问题 | 留待 |
|---|----------|------|
| 1 | 字体大小行只展示不响应 | 设计文档 3.10 之外特性 |
| 2 | 关于卡硬编码版本号 | 后续接入构建时注入 |
| 3 | 启动行为 / autostart 未暴露 | `autostart` 命令已有，留作"通用设置扩展"轮次 |
| 4 | 邮箱账号管理应在设置里 | 跨模块大改，留作单独 spec |
| 5 | backup / restore / 清空数据 按钮无逻辑 | 需要先设计备份格式，留作"数据管理"轮次 |
| 6 | 自动备份 03:00 硬编码 | 同上 |
| 7 | i18n 键名体系优化 | 全局 i18n 重构轮次 |

---

## 五、测试计划

| 改动 | 验证方式 | 期望结果 |
|------|----------|----------|
| A | `pnpm build:web` + `cargo build` + `cargo test` | 全部通过；9 个现有 mail 单元测试不挂 |
| A | `git grep "from '@easywork/main'"` 等反向引用检查 | 0 结果 |
| B | 手工打开 `/settings` | 通知卡只剩 1 个真 Switch + 提示行 |
| C | 手工打开 `/settings`（Windows） | 路径形如 `C:\Users\<User>\AppData\Roaming\com.easywork.desktop\data.db` |
| D | 手工切换两个选项 + 关窗口 | 行为符合预期；重启后值保留 |

不写新自动化测试（4 处改动都是删 / 改 UI / 加单文件命令，性价比不匹配）。

---

## 六、风险与回滚

| 风险 | 可能性 | 缓解 |
|------|--------|------|
| A 删除 `apps/*` 误删有用的 workspace 依赖 | 低 | 先 `git grep "from '@easywork/"` 验证无引用 |
| A 删目录后 `pnpm-workspace.yaml` 仍指向空目录 | 中 | 改完删后跑 `pnpm install` 验证 |
| C `get_app_data_dir` 在 Android 上路径不同 | 中 | 本轮仅在 Windows 验证；Android 暂显示 Tauri 返回的原始路径，格式不统一但不会错 |
| D 改 RadioGroup 引入新 UI 组件 bug | 低 | 复用现有 `@/components/ui/` 风格；如缺组件就照 `button.tsx` 风格新增 |

每个改动都在单独 commit，任意一处回滚不影响其他 3 处。

---

## 七、文档与提交

- 本 spec 文件：`docs/superpowers/specs/2026-06-12-settings-audit-and-minimal-fix-design.md`
- 实现 plan：`docs/superpowers/plans/2026-06-12-settings-audit-and-minimal-fix.md`（由 writing-plans 生成）
- 提交粒度：1 个 PR / 4 个 commit（按 A → B → C → D 顺序）

---

## 八、参考

- 设计文档章节：[EasyWork手写设计文档 § 3.10 设置](file:///e:/Dev/EasyWork/docs/EasyWork手写设计文档.md)
- 当前线上版：[src/routes/settings.tsx](file:///e:/Dev/EasyWork/src/routes/settings.tsx)
- 历史 MUI 版（待删）：[apps/app-settings/src/App.tsx](file:///e:/Dev/EasyWork/apps/app-settings/src/App.tsx)
- 待注册命令：[src-tauri/src/commands/settings.rs](file:///e:/Dev/EasyWork/src-tauri/src/commands/settings.rs)
- invoke_handler 现状：[src-tauri/src/lib.rs#L313-L399](file:///e:/Dev/EasyWork/src-tauri/src/lib.rs#L313-L399)
