# EasyWork 全面代码审阅报告

> 审阅日期：2026-08-14
> 审阅范围：前端 `src/`、Rust/Tauri 后端 `src-tauri/src/`（含新增 sync 模块）、Supabase 迁移与 Edge Functions、测试与工程配置
> 审阅方法：静态检查（`tsc -b` 0 错误 / `eslint .` 0 错误 2 警告）+ `cargo check` 通过 + `vitest run`（3 文件失败）+ 全量命令注册对照 + 逐模块源码核读 + 前端深度扫描
> 基线：对照 08-11 审阅（`docs/code-review-2026-08-11.md`、`docs/project-review-2026-08-11.md`），核实旧问题修复情况并定位新问题

---

## 0.1 P0 修复记录（2026-08-14 晚，已完成）

| 项 | 修复内容 | 验证 |
|---|---|---|
| C2 LWW 表别名 | `engine.rs` LWW 条件改用目标表名 `"<table>"."updated_at"` 而非未定义别名 `t.` | `cargo check` 通过 |
| C3 整数列 NULL | `upload_table` 按 `ValueRef` 存储类型读取（Integer/Real/Text/Blob），不再 `Option<String>` 吞掉数值 | 同上 |
| C4 复合主键 | 新增 `table_pk()`：`task_tags`/`note_tags` 用复合主键做 `ON CONFLICT`，其余表用 `id` | 同上 |
| C5 UPDATE 参数索引 | 下载侧 `set_parts` 参数索引递增（主键 ?1..?k + 列 ?k+1..），修复 `?{columns.len()+1}` 越界 | 同上 |
| C6 错误静默 | 上传/下载错误不再 `let _ =` 吞掉：单表失败收集、写入 `sync_log`(status=error)、`SyncResult.error` 上报、失败时不更新 `last_sync_at` | 同上 |
| 下载 NULL 过滤（新增） | 下载条件 `sync_device_id != $2` → `IS DISTINCT FROM $2`：云端 `sync_device_id` 为 NULL 时 `!=` 恒 NULL 会把所有行过滤掉，导致跨设备永远拉不到数据 | 同上 |
| M3 blocking_lock | async 上下文改用 `lock().await`（connect 失败分支重构为 match） | 同上 |
| H6 测试环境变量 | `vitest.config.ts` 增加 `test.env` 提供 VITE_SUPABASE_URL/ANON_KEY，supabase.ts import 不再 throw | `vitest` 10 文件 60 用例全过 |
| H7 i18n 未初始化 | `test-setup.ts` 顶部 `import "@/lib/i18n"`，`t('common.save')` 等返回中文文案 | 同上 |
| H1/H2 预算通知 | `notify.ts fireBudgetWarnings`：budgets 按 `year_month` 过滤、overall 预算用本月总支出比较、有效额度计入 `carry_over`；`notifications.ts` 同步计入 `carry_over` | `tsc`/`eslint` 通过 |

> ⚠️ 未修（架构决策，需用户拍板）：C1 数据源分裂——任务/笔记/记账/日历仍直连 Supabase，sync 引擎同步的本地业务表无数据来源；`taskApi/notesApi/financeApi/calendarApi` 死代码及其调用的 40 个 Rust 命令尚未实现/接线。

## 0.2 二轮修复记录（2026-08-14 晚，已完成）

| 项 | 修复内容 | 验证 |
|---|---|---|
| H3 realtime 永久失效 | `useRealtimeSync`：超 MAX_RETRIES 后不再停止重试，改为每 60s 低频探测（`PROBE_DELAY_MS`），网络恢复自动重连并重置计数 | tsc/eslint/vitest 全过 |
| H9 监听泄漏 | `safeTauriListen().then` 回调检查 `isCleanedUp`：清理后 resolve 的 unlisten 立即注销，不再推入废弃数组 | 同上 |
| H5 NoteEditor 标签竞态 | 新增 `tagIdsReadyRef` 守卫：切换笔记后 `useNoteTagIds` 未就绪时忽略标签点击/新建，避免「空数组+单标签」覆盖真实标签 | 同上 |
| M5 logout 一致性 | `authStore.logout` 改为 async：先 `signOut()` 成功才清空本地会话，失败保留会话并 throw；`Settings` 登出按钮 await + 失败 toast（`settings.logoutFailed`） | 同上（新增失败保留用例） |
| M6 任务部分失败 | `useTasks` 创建任务：`task_tags` 插入失败降级为告警日志，不再整体抛错 → 避免重试创建重复任务 | 同上 |
| M1 迁移机制 | `db.rs` 重构：仅全新库（无业务表）执行 DROP+CREATE；旧库一律 ALTER-only 增量迁移（修复原实现"非最新版本即 DROP 全部业务表"的数据丢失隐患）；新增 `schema_version()` 守卫防误判 | cargo check 通过 |
| H4 周期任务 TOCTOU | `useUpdateTask` 完成时原子抢占（`update recurrence_next=null WHERE recurrence_next=nextDue`），并发只有首个请求生成下一期；标签复制移到标签变更后、使用新标签 | tsc/eslint/vitest 全过 |
| M7 导出无错误处理 | `Settings.handleExportData` 加 try/catch + 每表 error 检查 + 成功/失败 toast（`exportSuccess`/`exportFailed`） | 同上 |
| M8 预算文案 | `BudgetList` carry_over 展示修复：正值显示"含上月滚动 结余"，负值显示"含上月滚动 超支"，不再重复/矛盾 | 同上 |
| M9/M10 ESLint 依赖 | `SyncConfigForm` useEffect 补 `status?.device_name`；`GlobalSearch` useMemo 补 `t` → **eslint 0 警告** | 同上 |
| H8 邮件草稿入口 | `useSaveDraft`/`useUpdateDraft` 错误文案改为面向用户「功能开发中，暂不可用」（后端命令 P1 补齐） | 同上 |

> 本轮验证结果：`tsc -b` 0 错误 / `eslint .` 0 错误 0 警告（此前 2 警告已消除）/ `vitest` 10 文件 61 用例全过 / `cargo check` 通过。
> 仍待办（非本轮范围）：C1 架构决策、H8 草稿后端实现（mail_save_draft/mail_update_draft 命令）、e2e 业务覆盖与 CI 门禁。

---

## 0. 总体结论

**08-11 审阅发现的高危项大多已修复**：`withGlobalTauri` 已补、邮件密码已改 keyring 系统凭据库存储、IMAP/SMTP 改用 rustls + 平台 CA 校验（不再关闭 TLS 校验）、Supabase 邮件表已退役（`0031_drop_mail_tables`）、密码加密迁移（`0028`）、RLS 加固（`0026`）、通知铃铛/任务模板/新建文件夹等占位死链均已落地真实功能。

**但 08-14 新提交的「local-first PostgreSQL 增量同步」架构存在严重的半成品问题**，是本次审阅的核心发现：

1. **🔴 数据源分裂，云同步引擎实际空转**——邮件已迁到 Tauri 本地 SQLite，但任务/笔记/记账/日历仍全部直连 Supabase；sync 引擎同步的本地 SQLite 业务表**没有任何数据写入来源**，同步的是空表。唯一真正被同步的是 `email_accounts`（且同步到用户自托管的 PostgreSQL）。
2. **🔴 sync 引擎 Rust 代码存在多处确定性错误**（未定义表别名、整数列读成 NULL、参数索引越界、错误全被静默吞掉）——即便数据源接通，云同步也无法正确工作。
3. **🔴 4 个"迁移预备" api 文件（taskApi/notesApi/financeApi/calendarApi）是零引用死代码**，且它们调用的 40 个 Rust 命令在 Rust 端完全不存在——迁移只做了一半。
4. **🟠 3 个测试文件失败**（2 个因缺 Supabase 环境变量，1 个用例断言失败），当前 `npm test` 红。

---

## 一、🔴 严重问题（架构 / 数据正确性）

| # | 位置 | 问题 |
|---|---|---|
| C1 | 全局架构（08-14 提交） | **云同步引擎同步的表没有任何数据**。前端业务 hooks（`useTasks`/`useFinance`/`useNotes`/`useCalendar`）全部直连 Supabase；本地 SQLite 业务表（`easywork.db` 的 tasks/notes/transactions 等）从未被前端写入。`sync_upload`/`sync_download` 的 `SYNC_TABLES_MAIN` 循环同步的全是空表，`records_uploaded` 恒为 0。**"local-first" 名不副实**——当前唯一被同步的数据是 `email_accounts`（邮件配置，不含密码）。 |
| C2 | `src-tauri/src/sync/engine.rs:162-175` | **LWW 更新 SQL 引用未定义表别名 `t`**：生成的 `ON CONFLICT ("id") DO UPDATE SET ... WHERE EXCLUDED."updated_at" > t."updated_at"` 中 `t` 不是任何表名/别名 → PostgreSQL 报 42P01 → 错误被 `let _ = pg.execute(...)`（191 行）静默吞掉。**所有含 `updated_at` 的表（tasks/accounts/transactions/notes/calendar_events/calendar_subscriptions/email_accounts）的云端行二次更新 100% 静默失败**。 |
| C3 | `src-tauri/src/sync/engine.rs:129-137` | **整数/浮点列全部上传为 NULL**：`row.get::<_, Option<String>>(i)` 对 SQLite 的 INTEGER/REAL 列返回 `InvalidColumnType` → `.ok()` 得 None → 值写成 `"NULL"`。`amount_cents`、`balance_cents`、`sort_order`、`done`、`is_pinned`、`rollover`、`imap_port`、`smtp_port`、`use_ssl` 等全部丢失。云端这些列多为 `NOT NULL` → 显式插入 NULL 违反约束 → **整条 INSERT 失败（同样被吞）→ 含整数 NOT NULL 列的表（含 tasks、transactions）整行无法上传**。 |
| C4 | `src-tauri/src/sync/engine.rs:168-175` + `schema.rs` | **复合主键表无法同步**：`task_tags`/`note_tags` 云端表没有 `id` 列（主键为 `(task_id, tag_id)` / `(note_id, tag_name)`），但上传 SQL 固定 `ON CONFLICT ("id")` → PG 报"column id does not exist" → 错误被吞 → **这两张关联表永远同步失败**。 |
| C5 | `src-tauri/src/sync/engine.rs:356-358` | **下载侧 UPDATE 参数索引错误**：`set_parts` 所有列写死 `?{columns.len()+1}`（同一索引），而参数列表只有 `columns.len()` 个 → `InvalidParameterIndex` → 本地已有行的 UPDATE 全部失败并中断整个 download（该错误未被吞）。 |
| C6 | `src-tauri/src/sync/engine.rs:191` | **上传错误全部静默吞掉**：`let _ = pg.execute(&full_sql, ...)` 忽略错误且 `count += 1` 照常累加 → 用户看到"同步成功 N 条"，实际云端一条没写、修改全部丢失。 |
| C7 | `src/features/sync/syncApi.ts` + `src-tauri/src/sync/config.rs` | **PostgreSQL 连接串（含数据库密码）明文存储**：本地 SQLite `sync_config.connection_string` 明文保存，且 `SyncConfigForm` 用普通 Input 明文回显，任何能看到界面的使用者/截屏/日志都可能泄漏云数据库凭据。 |

## 二、🟠 高危问题（功能缺陷 / 竞态 / 测试红）

| # | 位置 | 问题 |
|---|---|---|
| H1 | `src/lib/notify.ts:75-98` | `fireBudgetWarnings` 拉取 budgets **未按 `year_month` 过滤**（transactions 已按月过滤，budgets 全量拉）→ 历史月份预算参与本月超支判断，周期性误报；且 **overall 整体预算永不触发**：`category_id` 为 null → `spending[""]` 恒 0 → `0 > amount` 恒 false。 |
| H2 | `src/lib/notify.ts:97,122`、`src/lib/notifications.ts:94` | 超支判断**忽略 `carry_over`**，而 `BudgetList.tsx:219` 有效额度已用 `amount + carry_over` → 正结转预算被误报超支、负结转漏报，通知与 UI 结论不一致。 |
| H3 | `src/features/realtime/useRealtimeSync.ts:99-101,184-191` | channel 重试超过 `MAX_RETRIES=5` 后置 `unavailable` 且**不再安排任何重试** → 网络恢复后实时同步永久失效，只能重启应用/重新登录恢复。 |
| H4 | `src/features/tasks/useTasks.ts:111-198` | 周期任务"完成"存在 TOCTOU 竞态：先 `select` 后 `update`，多端并发时重复生成下一期实例；且标签复制（171-180）先于标签变更（212-238）执行，同一次"改标签+标完成"会把**旧标签**复制给新实例。 |
| H5 | `src/features/notes/NoteEditor.tsx:22,31-37` | 切换笔记后 `useNoteTagIds` 未就绪时 `selectedTagIds` 为 `[]`，此刻点击标签会用"空数组+单标签"整体覆盖新笔记真实标签（TaskForm 有 `initRef` 守卫，此处缺失）→ 切笔记后立即点标签会清掉原有标签。 |
| H6 | `src/__tests__/authStore.test.ts`、`notify.test.ts` | 缺 Supabase 环境变量（`src/lib/supabase.ts:8` 启动即 throw），测试基建未 mock → **全新 checkout 下 `npm test` 必然失败**。 |
| H7 | `src/__tests__/TransactionForm.defaultAccount.test.tsx:128` | 用例"保存成功后再次记账仍默认「现金钱包」"失败：`getByRole("button", {name:"保存"})` 找不到按钮（保存态/文案与断言不一致），测试与实现漂移。 |
| H8 | `src/features/mail/useMail.ts:248` | 邮件**草稿功能明确未实现**（注释自述"临时回退：直接抛错避免误用"）——`mail_send` 命令会真实发信，草稿保存按钮实际不可用。 |
| H9 | `src/features/realtime/useRealtimeSync.ts:211-222` | `safeTauriListen(...).then` 回调未检查 `isCleanedUp`，effect 清理后 resolve 的 unlisten 被推进已废弃数组永不注销 → Tauri 下每次重挂载累积事件监听（内存/事件泄漏）。 |

## 三、🟡 中低问题

| # | 位置 | 问题 |
|---|---|---|
| M1 | `src-tauri/src/db.rs:14-33` | `migrate()` 硬编码 `if current < 3`：SCHEMA_VERSION 一旦升到 4，`current==0` 分支和 `<3` 分支都不执行，但版本号被写入 → **未来 schema 变更会静默跳过**；`current==0` 时无条件 DROP 全部业务表（数据全丢，当前本地库为空所以未暴露）。 |
| M2 | `src-tauri/src/commands.rs:11,126` | **同名 `SyncResult` 双定义**（`mail/types.rs` 旧字段 fetched/inserted/folders + `sync/mod.rs` 新字段 success/records_uploaded/records_downloaded），靠 glob 导入的遮蔽规则才编译通过，极易误用（08-14 构建曾因此失败）。 |
| M3 | `src-tauri/src/sync/engine.rs:62,241` | async 上下文中使用 `db.blocking_lock()`，可能阻塞 tokio worker 线程（正确做法 `lock().await`）。 |
| M4 | `src-tauri/src/lib.rs:110-128` | 60 秒后台循环在同步启用时**每分钟建立 PG 连接并全表扫描**，即便无变更；且 `trigger_cloud_sync` 在每次邮件账号增删改时触发，无节流。 |
| M5 | `src/features/auth/authStore.ts:23-26` | `logout` 中 `signOut().catch(()=>{})` 吞掉失败：网络异常时本地会话清空但服务端会话仍有效 → 重启后 `getSession` 恢复登录，登出状态不一致。 |
| M6 | `src/features/tasks/useTasks.ts:78-82` | 创建任务成功但 `task_tags` 插入失败时整体抛错、onSuccess 不触发、列表不刷新 → 用户重试产生**重复任务**（无部分失败补偿）。 |
| M7 | `src/features/settings/Settings.tsx:192-205` | `handleExportData` 无 try/catch、不检查每表 error → 单表查询失败时静默导出空数组。 |
| M8 | `src/features/finance/BudgetList.tsx:241` | carry_over 文案 key 写死 `carryOverSurplus`，负结转时显示"含上月滚动 结余 含上月滚动 超支 ¥100"（语义错误）。 |
| M9 | `src/features/settings/SyncConfigForm.tsx:54` | `useEffect` 依赖缺失 `status?.device_name`（ESLint 警告），device_name 变化不会重置表单。 |
| M10 | `src/features/dashboard/GlobalSearch.tsx:91` | `useMemo` 依赖缺失 `t`（ESLint 警告）。 |
| M11 | e2e | Playwright 仅 4 个认证页面冒烟测试，业务模块零覆盖；`webServer` 用 `npm run dev`（package.json 无该 script，实际可跑 vite 但易混淆）。 |
| M12 | 死代码 | `src/features/tasks/taskApi.ts`、`notesApi.ts`、`financeApi.ts`、`calendarApi.ts` 零引用（grep 确认），且其调用的 40 个命令（`task_list_all`、`transaction_list_all` 等）在 Rust 端**不存在**——迁移预备代码，应删除或补齐。 |

## 四、✅ 已确认修复（08-11 审阅后）

| 项 | 状态 |
|---|---|
| `withGlobalTauri: true` 缺失（A1） | ✅ 已补（`tauri.conf.json:13`） |
| 邮箱密码明文落库（S1） | ✅ 改 keyring 系统凭据库 + `0028` pgp_sym_encrypt 迁移 |
| IMAP/SMTP 关闭 TLS 校验（S1 邮件） | ✅ 改 rustls + `with_platform_verifier()` 平台 CA 校验 |
| fetch-mail cron 匿名触发（S2） | ✅ Edge Function 已退役（邮件全迁本地） |
| `_diag` 调试表高危脚手架（S3） | ✅ 已 drop + `0027_security_cleanup` |
| 通知铃铛占位死链（H1） | ✅ 已接 NotificationCenter（items/dismiss/markAllRead 完整） |
| 任务"新建清单/从模板"占位（H2） | ✅ 内置任务模板已实现 |
| 邮件"新建文件夹"占位（H3） | ✅ `openFolderDialog` 已实现（IMAP 真实建目录） |
| 笔记"从模板"占位（H4） | ✅ 已实现真实模板 |
| `TodayFocus` `<a href>` 整页刷新（S3） | ✅ 已改 SPA 导航 |
| `database.types.ts` 与迁移漂移（S4） | ✅ 邮件表已从 Supabase 退役，漂移消失 |

## 五、待完善功能（结合代码与文档）

**本次新确认的缺口：**
1. **云同步迁移未完成**（🔴 优先）：任务/笔记/记账/日历数据需迁入本地 SQLite，补齐 40 个 Rust 命令（`task_*`/`note_*`/`transaction_*`/`budget_*`/`account_*`/`category_*`/`tag_*`/`subtask_*`/`calendar_*`），并修复 C2-C6 的引擎错误后接线前端。
2. **邮件草稿箱**：`useMail.ts:248` 明确未实现（保存草稿会误发信）。
3. **忘记密码 / 邮箱验证入口**：登录/注册页缺失。
4. **云同步安全**：连接串加密存储 + 前端密码输入框；本地 SQLite 文件加密（Windows DPAPI）。

**历史遗留（08-10/08-11 已列，仍未做）：**
5. 记账：CSV 导入、报表 PDF 导出、周期交易、批量操作、金额 decimal 精度、多账本/家庭共享、智能记账。
6. 任务周期规则：`RecurrenceRule` 已有部分逻辑但 UI/规则编辑不完整（看板/日历视图的重复任务生成待验证）。
7. 笔记标签：`NoteTag`/`NoteNoteTag` 表与编辑器中标签选择已部分存在，但侧栏筛选/管理 UI 未完成。
8. 邮件：群发、附件预览、邮件内搜索、文件夹拖拽管理。
9. 数据云备份：Settings 已有本地导入/导出，可加 Storage 桶备份实现跨设备恢复。
10. e2e 业务覆盖、CI 门禁（`typecheck + lint + test` 接入）。

## 六、修复优先级建议

| 优先级 | 动作 |
|---|---|
| P0（本周） | ① 决定云同步架构走向：若继续，先修 C2-C6 引擎错误（LWW 表别名、整数列类型化读取、复合主键冲突键、UPDATE 参数索引、错误上报），再决定数据源迁移；若暂缓，建议将 sync 入口 UI 置灰避免误导。② 修复 H6/H7 测试红。③ `fireBudgetWarnings` 按 `year_month` 过滤 + 支持 overall + 计入 carry_over。 |
| P1（本迭代） | ④ 删除或补齐 4 个死代码 api 文件。⑤ sync 连接串加密 + 前端密码框。⑥ realtime 重连恢复策略（H3）。⑦ NoteEditor 标签竞态守卫（H5）。⑧ 邮件草稿真实落地或 UI 置灰。 |
| P2（计划内） | ⑨ db.rs 迁移机制重构（版本化迁移数组）。⑩ logout 错误处理、任务创建补偿、realtime unlisten 泄漏、导出 try/catch。⑪ 补齐 e2e + CI。 |

---

## 0.3 架构迁移记录（2026-08-14 深夜，local-first 落地）

**决策**：任务/笔记/记账/日历全部迁入本地 SQLite（local-first），实现 40+ 个 Rust 命令。

**Rust 端（`src-tauri/src/business.rs`，~1800 行）**：
- 业务命令层：任务（task/subtask/tag/task_tag 15 个）、笔记（note/note_folder/note_tag/note_note_tags 17 个）、记账（transaction/account/category/budget 16 个）、日历（calendar_event/subscription/sync 11 个）
- 输出结构与前端 `src/types/index.ts` 一致：金额「元」浮点、bool、JSON 对象（content/recurrence_rule）、year_month number、carry_over（分→元）
- `null_fields` 参数解决 Tauri IPC 无法区分「未传/显式 null」的问题（task due_date/recurrence_rule 清除、note folder_id 清除等）
- 数据备份：`data_export_all` / `data_import_all`（白名单表 + 标识符净化）/ `data_clear_all`
- 收据本地化：`receipt_save`（base64→app data receipts/）/ `receipt_open`（系统默认程序打开）
- 日历订阅同步：`calendar_sync_subscription` 复用已有 `calendar_sync.rs`（ICS/CalDAV 本地拉取）
- db.rs v4 迁移：`budgets.carry_over_cents`、`notes.content_text/cover_url`、新建 `note_tag_master`/`note_note_tags`；schema.rs 云端表同步 + engine.rs 同步表清单更新

**前端**：
- `useTasks/useNotes/useFinance/useCalendar` 全部从 Supabase 切到 api 层（taskApi/notesApi/financeApi/calendarApi，此前为死代码，现已接线）
- 周期任务逻辑保留（本地单写者，去掉原子抢占依赖）；`fireBudgetWarnings` 数据源迁本地
- Settings 导出/导入/清空改为本地命令；TransactionForm 收据上传/查看本地化
- **前端 74 个 invoke 命令与 Rust 注册 100% 对齐**（对照脚本验证）

**验证**：`tsc -b` 0 错误 / `eslint .` 0 错误 / `vitest` 10 文件 61 用例全过 / `cargo check` 通过。

**遗留（后续迭代）**：认证仍走 Supabase（authStore/useProfile/profiles）；`useRealtimeSync` 的 Supabase postgres_changes 订阅保留但无数据源事件（本地变更由 mutation 失效刷新）；邮件模块保持既有本地实现。

---

## 0.4 认证本地化记录（2026-08-14 深夜，认证不再走 Supabase）

**决策**：认证（authStore/profiles/登录注册/改密/头像）全部本地化，与业务数据一致走 local-first。

**Rust 端**：
- db.rs v5 迁移：`users` 表（id/email UNIQUE/password_hash/display_name/avatar_data/created_at/updated_at + sync 列）
- 5 个认证命令（business.rs）：`auth_register`（argon2 哈希、邮箱唯一、成功即登录）、`auth_login`、`auth_get_user`（会话恢复）、`auth_update_profile`（display_name/avatar_data，`clear_avatar` 支持清除）、`auth_change_password`（校验当前密码）
- 密码哈希：argon2 0.5（`features = ["std","rand"]`），PHC 字符串格式

**前端**：
- `src/lib/authApi.ts` 新建（Tauri invoke 封装）
- `authStore` 重写：`session` → `user`（LocalUser），登录态持久化 localStorage（`easywork:user_id`）；`login/register/logout/refreshUser`
- `useAuth` 重写：启动时从 localStorage 恢复本地会话（替代 getSession/onAuthStateChange）
- `Login/Register`：去 Supabase + 演示账号入口，改调本地 authStore；注册成功即自动登录（无邮箱确认流程）
- `ChangePasswordDialog`：改调 `auth_change_password`（本地验证当前密码）
- `useProfile`：profiles 表 → users 表（display_name/avatar_data）；头像为 base64 data URL（CSP `img-src data:` 已允许）
- `Settings` 头像上传：Supabase storage → FileReader base64 → `auth_update_profile`
- 路由守卫（router.tsx/App.tsx/Sidebar/Dashboard）`session` → `user` 适配

**残留 Supabase 引用（有意保留）**：`realtime/useRealtimeSync.ts`（postgres_changes 订阅）、`mail/migrateFromSupabase.ts`（历史迁移工具）、`src/lib/supabase.ts`（供上述两处）；`authErrors.ts` 保留（测试仍覆盖，业务不再引用）。

**验证**：`tsc -b` 0 错误 / `eslint .` 0 错误 / `vitest` 10 文件 65 用例全过（authStore/useAuth 测试重写适配本地模式）/ `cargo check` 通过。
