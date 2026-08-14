# EasyWork local-first 方向审阅报告

> 审阅日期：2026-08-14
> 审阅范围：全项目（src/、src-tauri/、supabase/、配置文件、测试）
> 审阅目标：确认 local-first 落地情况，盘点 Supabase 平台残留，评估"后期可选 Supabase/Aiven/Render 同步"的接入就绪度

---

## 一、总体结论

**方向正确，主体架构已彻底 local-first；Supabase 已从"唯一数据源"降级为"可选能力"，残留属于可控范围，无功能性错误。**

- 业务数据（任务/笔记/记账/日历）与认证 **100% 本地化**：CRUD 全部走 Tauri IPC → 本地 SQLite，认证走本地 users 表（argon2），运行时**零 Supabase 依赖**。
- 绿色版（无 `.env`）可完整启动并正常使用全部本地功能（已验证：env 缺失不再 throw，realtime 自动停用）。
- **同步层基础设施已提前就位**：Rust 端已有完整的 PostgreSQL 直连同步引擎（`sync/`），前端设置页已提供 **Supabase / Aiven / Render / 自定义** 四类 provider 选择——与"后期再选平台"的规划完全吻合。
- 残留集中在：**CSP 硬编码域名、supabase/ 目录（旧部署单元）、Supabase 生成类型文件、一次性迁移工具、过时测试 mock**，均为可安全清理或归档的项。

---

## 二、架构现状核对（local-first 落地验证）

| 模块 | 现状 | 判定 |
| --- | --- | --- |
| 业务 CRUD（任务/笔记/记账/日历） | `business.rs` 全部读写本地 SQLite，无 Supabase 调用 | ✅ 已落地 |
| 认证 | `authStore` 本地 users 表 + argon2；`useAuth.ts` 明确"不再依赖 Supabase Auth" | ✅ 已落地 |
| 数据备份 | `data_export_all` / `data_import_all` / `data_clear_all` | ✅ 已落地 |
| 邮件 | 独立本地库 `easywork-mail.db`，凭据存 keyring，IMAP/SMTP 走 Rust | ✅ 已落地 |
| 日历订阅同步 | Rust 后端直拉 ICS/CalDAV 写本地，不再依赖 Edge Function（useCalendar.ts 注释确认） | ✅ 已落地 |
| 实时同步（可选） | `useRealtimeSync.ts` 订阅 Supabase Realtime，**无 .env 时自动停用** | ⏸️ 有意保留的可选能力 |
| 云端同步（可选） | `sync/` 全套引擎 + 设置页 UI | ⏸️ 有意保留，将来启用 |

**关键验证结论**：搜索全 `src/`，业务代码中 `supabase.from` / `supabase.auth` / `supabase.storage` 的调用**已全部消失**，仅剩 `supabase.channel`（realtime 订阅）一处 API 使用。Rust 端无 Supabase 专有 SDK，同步走的是通用 `tokio-postgres`。

---

## 三、Supabase 残留清单（分级）

### P0 —— 建议尽快处理

| # | 位置 | 残留内容 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | `src-tauri/tauri.conf.json` (L25) | CSP 硬编码 `https://nbcsywzqvvputqitmpla.supabase.co` + `wss://...` | ① 向产物体内暴露真实 Supabase 项目 URL（隐私残留）；② 前端已不再直连 Supabase API，业务全走 IPC；③ Rust 直连 Postgres 走 TCP，**不受 CSP 约束**——此白名单已无实际作用 | 改为 `connect-src 'self' https: wss:`（若想保留前端 realtime 能力）或收紧为 `connect-src 'self'`（若不需要前端 realtime） |
| 2 | `supabase/` 目录（config.toml + migrations + functions + seed.sql） | 旧 Supabase 平台部署单元，config.toml 含 project_id、redirect URL 等真实标识 | ① 描述的 schema 是**旧架构**（user_id、amount、initial_balance 等），与本地 v4 schema 及 `sync/schema.rs` 云端 schema 已脱节；② 将来若选 Supabase provider，云端表由 App 运行时 `init_cloud_schema` 自动创建，**此目录的 migrations 并不参与**；③ 易误导后来者 | 整体移到 `docs/archive/supabase-legacy/` 归档并加 README 说明；或保留但顶部显著标注"历史存档，云端 schema 以 `src-tauri/src/sync/schema.rs` 为准" |
| 3 | `src/types/database.types.ts`（约 880 行） | Supabase CLI 生成的旧 schema 类型（`__InternalSupabase` 标记） | 描述旧列（user_id / amount / initial_balance），与真实 schema 脱节，**误导性残留**；仅被 `supabase.ts` 作为 `createClient` 泛型使用，realtime 订阅实际用字符串表名，不依赖它 | 删除该文件，`supabase.ts` 改用无泛型 `createClient`（或定义最小必要类型） |

### P1 —— 建议处理

| # | 位置 | 残留内容 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| 4 | `src/features/mail/migrateFromSupabase.ts` + `Mail.tsx` (L28, L39) | 首启动从 Supabase 拉取邮箱账号的一次性迁移 | 老用户已迁移过（本地有账号即跳过）；新用户无 Supabase 数据可迁；绿色版无 .env 时安静失败（有 error 分支，不破坏功能） | 三选一：① 保留但注释标注"仅旧版 Supabase 数据抢救工具，新用户无效果"；② 若确定不再需要，删除文件及 Mail.tsx 中的调用；③ 将来接入同步层后，改为从云端同步表拉取 |
| 5 | `src/__tests__/TransactionForm.defaultAccount.test.tsx` (L13-17) | `vi.mock("@/lib/supabase")` 的 `storage.upload` mock | 业务代码已不再调用 `supabase.storage`，此 mock 是**死代码** | 删除该 mock（如测试因此失败，说明有其他隐藏引用，正好暴露） |
| 6 | `src/lib/authErrors.ts` + `src/__tests__/authErrors.test.ts` | Supabase 错误文案映射工具（业务已不引用，仅测试引用） | 函数本身通用（Error → 中文提示），但注释/措辞绑定 Supabase；本地认证与将来同步报错仍可复用 | 保留函数与测试，更新文件头注释为"通用错误文案工具（源自 Supabase 鉴权错误映射）"；或整体删除 |
| 7 | `src/features/tasks/TaskBoardView.tsx` (L47) | 任务自动分类关键词含 `"supabase"` | 过时的分类词，无害但已不贴合方向 | 将关键词改为 `"数据库", "同步", "迁移"` 等通用词 |
| 8 | `.env.example` / `src/vite-env.d.ts` | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | 仅被 realtime + 邮件迁移使用；语义偏"平台绑定" | 若保留 realtime 能力，可改名 `VITE_REALTIME_URL` / `VITE_REALTIME_ANON_KEY` 更中性（可选，非必须） |

### P2 —— 可选优化

| # | 位置 | 内容 | 建议 |
| --- | --- | --- | --- |
| 9 | `src-tauri/src/commands.rs` (L295) | 默认 `provider: "supabase"` | 改为 `"custom"` 更中性（仅默认值字符串，无功能影响） |
| 10 | `src/features/settings/SyncConfigForm.tsx` | 表单默认 provider 为 "supabase" | 保持不动亦可；如执行 #9 可同步调整 |

### ✅ 保留项（正确，不要动）

| 位置 | 说明 |
| --- | --- |
| `src-tauri/src/sync/`（engine.rs / schema.rs / postgres.rs / config.rs / mod.rs） | **将来同步的核心引擎**：tokio_postgres 直连任意 PostgreSQL，增量上传（sync_modified_at + LWW 冲突解决）、增量下载（IS DISTINCT FROM 排除本设备）、云端自动建表 |
| `src/features/sync/` + `SyncSettings.tsx` / `SyncStatusCard.tsx` / `SyncLogViewer.tsx` / `SyncConfigForm.tsx` | 同步 UI 已支持 supabase / aiven / render / custom 四类 provider |
| `src/lib/supabase.ts` + `src/features/realtime/useRealtimeSync.ts` + `realtimeStore.ts` | 可选的 Realtime 订阅能力，无 .env 自动停用，不影响本地功能 |
| `src-tauri/Cargo.toml` | `tokio-postgres` / `tokio-postgres-rustls` / `rustls-platform-verifier` —— 平台无关的 PostgreSQL 驱动，正是"多平台可选"的技术基础 |
| 各处"不再依赖 Supabase"的注释（db.rs v5、business.rs 头部、useCalendar.ts、useEmailTemplates.ts、Settings.tsx） | 正确的方向叙事，保留 |

---

## 四、"后期可选 Supabase / Aiven / Render"接入就绪度评估

**结论：接入点已提前建好，未来启用同步时几乎零改动即可切任意平台。**

```
┌─────────────────────────────────────────────────────────────┐
│ 前端  SyncSettings / SyncConfigForm（provider 下拉）          │
│        supabase │ aiven │ render │ custom                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ Tauri IPC（sync_config_save 等）
┌───────────────────────────▼─────────────────────────────────┐
│ Rust  sync/config.rs（sync_config 表，存 connection_string） │
│        sync/engine.rs（增量双向同步 + LWW 冲突解决）            │
│        sync/postgres.rs（tokio_postgres + 平台 CA 的 TLS）     │
│        sync/schema.rs（云端自动建表，含 sync_modified_at/     │
│                        sync_device_id，与本地 v4 一致）        │
└───────────────────────────┬─────────────────────────────────┘
                            │ 标准 postgres:// 连接串
┌───────────────────────────▼─────────────────────────────────┐
│  平台：Supabase DB │ Aiven for PG │ Render Postgres │ 自建 PG │
└─────────────────────────────────────────────────────────────┘
```

- **平台无关性已验证**：三者均提供标准 `postgres://` 连接串；Rust 端无任何平台专有代码，`provider` 字段仅是 UI 标签。
- **开启方式**：设置页 → 同步面板 → 选择 provider → 粘贴连接串 → 测试连接 → 保存（自动触发首次全量同步）。
- **建议**：将来启用时，将 `sync_config.provider` 的默认值改为 `custom`（P2 #9），并考虑在文档中为三个平台各写一份"如何创建数据库并获取连接串"的指引。

---

## 五、建议行动项（按优先级）

1. **改 CSP**（tauri.conf.json）：去掉硬编码 Supabase 域名，改为 `connect-src 'self' https: wss:`（保留 realtime 可选能力）→ 重新跑 `npm run build:green` 验证。
2. **归档 supabase/ 目录**：整体移至 `docs/archive/supabase-legacy/`（或加显著标注），避免旧 schema 误导。
3. **删除 `src/types/database.types.ts`**，`supabase.ts` 去掉 `Database` 泛型。
4. **清理测试死代码**：TransactionForm 测试移除 `@/lib/supabase` 的 storage mock。
5. **邮件迁移工具**：加"历史抢救工具"注释（或按需删除）。
6. **顺手项**：TaskBoardView 关键词、"provider 默认值"、authErrors 注释。

> ⚠️ 注意：以上清理均为**非破坏性**（不动本地数据、不动同步引擎、不影响绿色版启动）。执行 1–3 后建议跑一遍 `pnpm test` 与 `pnpm run build:green` 回归。

---

## 六、执行记录（2026-08-14 晚，已完成）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| P0-1 CSP | ✅ 已改 | `connect-src 'self' https: wss:`，去掉硬编码 Supabase 域名 |
| P0-2 归档 | ✅ 已归档 | `supabase/` → `docs/archive/supabase-legacy/`，新增 `ARCHIVE.md` 说明 |
| P0-3 类型文件 | ✅ 已删 | 删除 `src/types/database.types.ts`；`supabase.ts` 改用无泛型 `createClient` |
| P1-4 邮件迁移 | ✅ 已标注 | `migrateFromSupabase.ts` 头部加"历史抢救工具"注释 |
| P1-5 测试死 mock | ✅ 已删 | `TransactionForm.defaultAccount.test.tsx` 移除 `@/lib/supabase` storage mock（6 用例仍全过） |
| P1-6 authErrors | ✅ 已改 | 注释改为"通用错误文案工具" |
| P1-7 关键词 | ✅ 已改 | `TaskBoardView` 关键词 "supabase" → "数据库/同步/迁移" |
| P1-8 env 改名 | ✅ 已删除 | 用户决定删除 realtime，`.env.example` / `vite-env.d.ts` 中 `VITE_SUPABASE_*` / `VITE_DEMO_*` 全部移除 |
| P2-9 commands.rs | ✅ 已改 | 默认 `provider: "custom"` |
| P2-10 SyncConfigForm | ✅ 已改 | 表单默认 `provider: "custom"` |
| P2-11 config.rs | ✅ 已改 | `sync_config.provider` 列 DB 默认值 `'supabase'` → `'custom'` |
| 顺带修复 | ✅ 已修 | `seedDemoData.ts` 未使用变量 `nTravel`（TS6133） |
| 🔴 realtime 删除 | ✅ 已删 | 见下节「realtime 订阅移除」 |

**回归验证（全部通过）**：`tsc -b` ✅ ｜ `vitest run` 65/65 ✅ ｜ `eslint`（改动文件）✅ ｜ `cargo check` ✅ ｜ `pnpm install`（-8 包）✅

---

## 七、realtime 订阅移除（2026-08-14 晚，用户确认删除）

### 用处分析
`supabase.channel`（`useRealtimeSync.ts`）订阅 Supabase 云库的 `postgres_changes`（WebSocket），
收到云库变更事件后 `invalidateQueries` 刷新前端。设计意图是「其他设备改了云数据，本设备实时感知」。

**判定：当前价值≈0，故删除。** 三点理由：

1. **时序脱节**：`lib.rs` 已有每 60 秒自动云同步（上传+下载）。postgres_changes 事件到达时
   本地 SQLite 尚未被 60s 周期下载更新 → 前端刷新拿到旧数据（空转）；下载落地后 Rust 端
   又不 emit 事件（全项目仅 `mail://sync-progress`）→ 前端仍不刷新。
2. **平台绑定**：postgres_changes 是 Supabase 平台专有协议，Aiven / Render 无此能力，
   与「可选 Supabase/Aiven/Render」的通用同步架构冲突。
3. **依赖负担**：为它保留 `@supabase/supabase-js`（bundle 含 vendor chunk）、realtime 模块、
   邮件迁移工具、CSP 的 `https: wss:`、`.env` 配置。

### 移除清单（已全部执行）
- 前端：删除 `src/lib/supabase.ts`、`src/features/realtime/`（useRealtimeSync + realtimeStore）、
  `src/features/mail/migrateFromSupabase.ts`；`App.tsx` 移除 `useRealtimeSync` 调用；
  `AppLayout.tsx` 移除实时同步状态横幅；`Mail.tsx` 移除迁移调用与相关 import/queryClient；
  `useSyncProgress.ts` 注释去重；语言文件移除 `layout.realtime*` 键；设置页「关于」
  「数据存储」等旧 Supabase 文案更新为 local-first 描述（zh-CN / en-US）。
- 依赖：`package.json` 移除 `@supabase/supabase-js`（pnpm install -8 包）。
- 配置：`tauri.conf.json` CSP 收紧为 `connect-src 'self'`（前端已无任何外部 API 调用，
  已 grep 确认无 fetch/WebSocket/axios）；`.env.example`、`vite-env.d.ts` 清理。

### 替代方案（将来需要「跨设备实时刷新」时）
Rust 同步引擎下载完成后 emit 通用事件（如 `cloud://sync-complete`），前端监听后 invalidate——
邮件模块（`mail://sync-progress`）已是此模式：平台无关、时序正确（数据落地才通知）。
