# EasyWork 个人效率工具 - 设计规格

- **日期**：2026-08-06
- **状态**：已批准，待实施计划
- **项目目录**：`e:\Dev\EasyWork0807`

## 1. 项目定位

云端优先的个人效率工具，Supabase 为唯一数据源，Tauri 2 作为桌面 + 移动富客户端。单用户多设备通过 Supabase Auth 登录 + Realtime 实时同步。

**架构方向决策**：放弃历史 local-first 偏好，全面采用 Supabase BaaS 架构。业务数据全部存于 Supabase Postgres，RLS 按 `auth.uid()` 隔离用户数据。

## 2. 目标平台

- 桌面：Windows / macOS / Linux
- 移动：Android / iOS
- 不做 Web 版（Tauri 2 移动端覆盖跨端需求）

## 3. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  Tauri 2 客户端 (桌面三平台 + Android/iOS)                │
│  ┌───────────────────────┐  ┌──────────────────────────┐ │
│  │ 前端 (Webview)         │  │ Rust 后端 (tauri commands)│ │
│  │ Vite+React19+TS+TWv4  │◄─►│ • IMAP/SMTP 收发邮件      │ │
│  │ shadcn/ui             │  │ • 系统密钥串存凭证        │ │
│  │ Zustand+TanStack Query│  │ • 本地通知/托盘           │ │
│  └──────────┬────────────┘  └─────────────┬────────────┘ │
│             │ supabase-js (HTTPS+Realtime WS)            │
└─────────────┼─────────────────────────────────┬──────────┘
              ▼                                 ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase 平台                          │
│  Auth(多设备会话) │ Postgres+RLS(按user_id隔离)           │
│  Realtime(多端实时同步) │ Storage(邮件附件/笔记图片)       │
│  Edge Functions(邮件webhook/定时同步/报表聚合)            │
│  pgvector(笔记语义搜索-可选增强)                          │
└─────────────────────────────────────────────────────────┘
```

### 关键架构决策

- 所有业务数据存 Supabase Postgres，RLS 策略 `using (auth.uid() = user_id)` 隔离。
- 邮件凭证（IMAP/SMTP 密码、OAuth token）存系统密钥串（Tauri keychain 插件），不进数据库。
- 邮件正文/附件缓存进 Postgres + Storage。
- 离线时前端用 TanStack Query 缓存兜底，恢复联网后 Realtime 自动对齐（不追求复杂离线写入合并）。
- 邮件收件：Rust 端 IMAP 轮询（前台实时）+ Edge Function 定时拉取（后台兜底）两者结合。

## 4. 技术栈与依赖（2026 稳定版）

### 桌面/移动壳

- `Tauri 2.x`（Rust 核心 + 系统 WebView，桌面~10MB，移动原生壳）
- Rust crates：`tauri`、`lettre`（SMTP 发件）、`imap`（IMAP 收件）、`native-tls`、`tokio`、`serde`、`keyring`（凭证）

### 前端核心

- `React 19` + `TypeScript 5.x`
- `Vite 7`（构建，Tauri 官方推荐）
- `Tailwind CSS v4`（`@tailwindcss/vite` 插件，新引擎）
- `shadcn/ui`（基于 Radix + CVA，按需复制组件源码）

### 数据与状态

- `@supabase/supabase-js v2`（Auth + Postgres + Realtime + Storage 客户端）
- `TanStack Query v5`（服务端状态/缓存/乐观更新）
- `Zustand v5`（纯前端 UI 状态，如侧边栏折叠、视图切换）
- `react-hook-form` + `zod`（表单与校验）

### 路由

- `TanStack Router v1`（类型安全路由，文件式，适合多视图模块）

### 模块专属

- 笔记：`Tiptap v2`（富文本，扩展生态成熟，支持协同预留）
- 图表：`Recharts v2`（Dashboard/记账报表）
- 日期：`date-fns v3` + `dayjs`（日历视图）
- 拖拽：`@dnd-kit`（看板拖拽）

### Tauri 插件（移动端必备）

- `@tauri-apps/plugin-notification`（推送/本地通知）
- `@tauri-apps/plugin-store`（少量本地偏好设置）
- `@tauri-apps/plugin-keychain`/`stronghold`（凭证安全存储）
- `@tauri-apps/plugin-updater`（自动更新，桌面）

### 工程化

- `ESLint 9` + `Prettier 3` + `eslint-plugin-react-hooks`
- `Vitest`（单元）+ `Playwright`（E2E，Tauri WebDriver）

### 部署

- Supabase Cloud 托管（不自托管）

> 具体 patch 版本在脚手架阶段 `package.json` 与 `Cargo.toml` 锁定。

## 5. Supabase 能力使用映射

| Supabase 能力 | 本项目用途 |
|---|---|
| Auth | 邮箱密码 + 魔法链接登录，多设备会话管理，刷新 token |
| Postgres + RLS | 全部业务表，`policy` 全部 `using (auth.uid() = user_id)` |
| Realtime | 任务/笔记/记账的多设备实时同步；邮件新邮件推送 |
| Storage | 邮件附件、笔记内图片、记账票据照片 |
| Edge Functions | ① 邮件 IMAP 拉取定时任务（cron webhook）② 报表聚合 ③ 笔记全文/向量索引触发器 |
| pgvector | 笔记语义搜索（可选增强，非 MVP 必须） |
| Database Webhooks | 数据变更触发 Edge Function（如任务到期提醒邮件） |

## 6. 功能点梳理（按模块）

### 6.1 Dashboard 仪表盘

- 今日概览卡片：待办数、未读邮件、本周收支、最近笔记
- 本周任务完成趋势图、月度收支对比图
- 快捷入口 + 最近活动流
- 全局搜索（跨任务/笔记/记账）

### 6.2 任务管理

- 三视图切换：列表 / 看板（拖拽）/ 日历（周视图默认）
- 字段：标题、描述、优先级、状态、截止日、标签、子任务、重复规则
- 详情抽屉（drawer）
- 到期提醒（本地通知 + Edge Function 邮件提醒）
- MVP 支持简单重复规则：每日 / 每周 / 每月

### 6.3 邮箱

- 多账号管理（IMAP/SMTP 配置，凭证存 keychain）
- 文件夹树（收件箱/已发送/自定义）→ 列表 → 阅读区（三栏）
- 收件：Rust 端 IMAP 轮询（前台实时）+ Edge Function 定时拉取（后台兜底），新邮件 Realtime 推送
- 发件：SMTP（Rust），存已发送
- 附件上传/下载（Storage）
- 搜索（Postgres 全文检索）

### 6.4 笔记（富文本）

- 两栏：文件夹树 + 编辑器
- Tiptap 富文本：标题/列表/代码块/图片/表格/引用/任务清单
- 图片粘贴上传 Storage
- 全文搜索 + 可选语义搜索（pgvector，非 MVP）
- 标签 + 收藏

### 6.5 记账

- 单式流水账：收入/支出/转账，分类、账户、日期、备注、票据
- 预算：按分类设月度预算，超支预警
- 报表：月度收支、分类占比、趋势图
- 多账户（现金/银行卡/信用卡），账户余额汇总
- 单币种 CNY

### 6.6 全局

- 登录/注册/找回密码（邮箱密码 + 魔法链接，MVP 不加 OAuth）
- 设置：账号、邮件账号、主题（亮/暗）、通知偏好
- 自动更新（桌面）
- 数据导出：JSON/CSV（数据可移植性兜底）
- i18n：MVP 中文，预留 i18n 结构

## 7. 响应式多端 UI 策略

### 断点

- `< 640px`（sm 以下）：移动端 — 底部 Tab 栏 + 抽屉导航，单列堆叠
- `640–1024px`（平板）：可折叠侧栏
- `≥ 1024px`（桌面）：图标侧边栏（hover 展开文字）+ 主区

### 各模块布局适配

- **全局**：左侧图标侧边栏（最小化，hover 显文字），一次只显示一个主模块
- **任务**：桌面三视图切换 + 详情抽屉；移动端列表为主，看板横向滑动，日历缩为日程列表
- **邮箱**：桌面三栏（账号树+列表+阅读）；移动端两级导航（列表→阅读页）
- **笔记**：桌面两栏（文件夹树+编辑器）；移动端文件夹抽屉 + 编辑器全屏
- **记账**：桌面表单+报表并排；移动端表单底部抽屉，报表纵向堆叠
- **Dashboard**：卡片网格，移动端单列

### 主题

亮/暗双主题，shadcn/ui 原生支持。

## 8. 已确认的关键决策

| 事项 | 决策 |
|---|---|
| 数据架构 | Supabase 云端优先，放弃 local-first |
| 目标平台 | 桌面三平台 + 移动端（Android/iOS） |
| 前端框架 | Vite + React 19 + TypeScript |
| 路由库 | TanStack Router v1 |
| 富文本编辑器 | Tiptap v2 |
| 图表库 | Recharts v2 |
| 认证方式 | 邮箱密码 + 魔法链接（MVP 不加 OAuth） |
| 使用模型 | 单用户、多设备同步 |
| 邮件收发 | IMAP/SMTP（Rust 侧）+ Supabase 缓存 |
| 邮件收取 | Rust IMAP 轮询 + Edge Function 定时兜底 |
| 记账深度 | 单式流水账 + 预算 |
| 货币 | 单币种 CNY |
| 任务重复 | MVP 支持简单重复（每日/每周/每月） |
| pgvector | 笔记语义搜索列为可选增强，非 MVP |
| 数据备份 | 提供 JSON/CSV 导出 |
| Supabase 部署 | Cloud 托管 |
| i18n | MVP 中文，预留结构 |

## 9. 实施顺序

按子系统拆分，每个子系统独立走 spec → plan → 实现循环：

1. **Dashboard 骨架**（项目脚手架 + 全局布局 + 登录 + Dashboard）
2. **任务管理**
3. **记账**
4. **笔记**
5. **邮箱**（最复杂，放最后）

## 10. 范围说明

本规格覆盖整体地基与五个模块的功能边界。每个模块的详细实现计划由后续 `writing-plans` 阶段按实施顺序逐个生成，避免单一计划过大。
