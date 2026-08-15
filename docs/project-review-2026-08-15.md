# EasyWork 全项目综合审阅报告（2026-08-15）

> 范围：技术债务、Bug、待完成功能、建议新增功能、响应式/多屏 UI、遮罩层级、按钮排布、Tab 信息密度、目录与文件结构精简、构建配置合理性。  
> 分级：P0 = 立即处理（正确性/安全/数据丢失风险）；P1 = 应尽快（影响功能或维护性）；P2 = 择机（优化与整洁）。  
> 审阅方式：三路并行代码探查（前端 src/、Rust 后端 src-tauri/、构建配置与目录），结论均附文件路径与行号。

---

## 一、总体评价

项目整体健康度良好：

- **架构清晰**：前端 `features/{auth,calendar,dashboard,finance,mail,notes,settings,sync,tasks}` 按领域划分，每模块 `Xxx.tsx + useXxx.ts + xxxApi.ts` 约定一致；后端 mail/、sync/ 模块拆分质量高。
- **无高危安全面**：SQL 全部参数绑定（表名/列名常量拼接且有白名单净化）、无 unsafe、命令层 panic 控制良好（全库仅 7 处 unwrap/expect，4 处在启动 setup 阶段）。
- **构建链路完整且可靠**：绿色版构建脚本、E2E 双通道（浏览器 Playwright + WebView2 CDP）均已跑通。
- **设计系统落地规范**：token 化程度高，组件复用 shadcn/ui。

主要问题集中在：**i18n 覆盖严重不足（P0）、云同步模块三个正确性缺陷（P1）、安全明文存储两处（P1）、日志全丢（P1）、响应式断点空档与移动端底 Tab 过载（P1）、以及目录历史遗留物（P1/P2）**。

---

## 二、Bug 与正确性问题（优先处理）

### P0

| # | 问题               | 位置                                               | 说明                                                                                                                                                                                                                                                                                  |
| - | ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | **i18n 覆盖率不足一半** | 84 个 TSX 中仅 42 个使用 `useTranslation`；59 个文件含硬编码中文 | Mail 模块几乎整体未国际化（`Mail.tsx` 仅 3 处 `t()`；`MailAccountTree.tsx` 708 行全中文、`ContactsPanel.tsx`、`MailComposer.tsx`、`MailReader.tsx`、`NoteSidebar.tsx`、`DayDetailDrawer.tsx`）。更严重的是 `lib/notifications.ts:99-137` 的运行时通知文案（"预算超支提醒"等）——en-US 用户会收到中文系统通知。zh-CN.json 已有 685 行词条，基建完善，欠的是执行。 |

### P1

| #  | 问题                        | 位置                                                                                            | 说明                                                                                                                                                    |
| -- | ------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2  | **Tauri 错误被静默吞掉**         | `Settings.tsx:116/138/170`、`ChangePasswordDialog.tsx:67`、`SyncConfigForm.tsx:82/97/115`       | Tauri invoke reject 的是 **String 而非 Error**，这些位置用 `err instanceof Error ? err.message : ""` 兜底 → 报错时 toast 只显示空串。正确范式见 `App.tsx:19`、`authErrors.ts:7`。 |
| 3  | **sync 触发器缺 5 张表**        | `db.rs:376-435`                                                                               | `budgets`、`task_tags`、`note_tags`、`note_tag_master`、`note_note_tags` 有 `sync_modified_at` 列但无 UPDATE 触发器 → 本地改预算后**云同步漏数据**。                          |
| 4  | **云同步无删除传播 &#x20;**       | `sync/engine.rs`                                                                              | 无 tombstone/软删除机制，本地 DELETE 的行在云端和其他设备永存，多端数据只增不减。                                                                                                    |
| 5  | **同步下载回环**                | `sync/engine.rs:176`                                                                          | 下载回写本地时会再次触发 UPDATE 触发器刷新 `sync_modified_at`，且上传查询未按 `sync_device_id` 排除 → 刚下载的行下轮又被当作本地变更上传。需回写时禁触发器或按 device_id 过滤。                                 |
| 6  | **部分表 LWW 无条件覆盖**         | `sync/engine.rs:237`                                                                          | `subtasks`/`tags`/`task_tags` 无 `updated_at` 列，冲突解决退化为纯后写赢。                                                                                           |
| 7  | **无 404 路由**              | `router.tsx:119`                                                                              | `createRouter` 未配 `notFoundRoute`，未知路径渲染空白页（此前仅有纯文本 "Not Found" 兜底）。                                                                                  |
| 8  | **路由守卫 loading 白屏**       | `router.tsx:36`                                                                               | `indexRoute` beforeLoad 在 loading 时直接 return，无 loading UI。                                                                                            |
| 9  | **playwr ight 端口配置错误**    | `playwright.config.ts:11,22`                                                                  | baseURL/webServer 用 `localhost:5173`，而 vite `server.port=1420`（strictPort）→ `pnpm test:e2e` 在当前配置下必失败。                                                |
| 10 | **未处理的 Promise**          | `Settings.tsx:71-74`（getAppVersion 无 catch）、`useMailEvents.ts:37/44`、`useSyncProgress.ts:150` | 事件监听 `.then` 无 catch，失败时静默丢监听。                                                                                                                        |
| 11 | **localStorage 双写疑似 bug** | `BudgetList.tsx:200/204`（key `"budget_warned_at"`）与 `lib/notify.ts:114`（`BUDGET_WARN_KEY`）    | 同一预算提醒状态疑似写两个 key，需核实是否一致；`LanguageSwitcher.tsx:14` 与 `i18n.ts:13` 重复管理 `language` key。应收敛到单一 storage 模块。                                             |
| 12 | **邮件同步长时间持锁**             | `mail/service.rs:104-177`                                                                     | 拉取窗口内对每封邮件 `db.lock().await` + 同步 rusqlite 调用跑在 async 上下文，大文件夹首拉阻塞所有邮件命令。应 `spawn_blocking` + 缩短临界区。                                                  |

### P2

- `mail/db.rs:93,101`：v2 迁移用 `.ok()` 吞错，迁移失败静默通过（v4 已是严谨幂等风格，不一致）。
- `db.rs:22,26`、`mail/db.rs:18`：`unwrap_or_else` 吞查询错误，掩盖 DB 损坏信号。
- `mail/service.rs:113`：用 `flags.contains("Seen")` 字符串匹配 flag，大小写/`\Recent` 前缀可能误判。
- `sync/engine.rs:290-296`：表名净化是黑名单式（删引号/分号），建议改白名单 `^[a-z_]+$`。
- `sync/engine.rs:185-201`：上传整行转 String 依赖 PG 隐式转换，`"NULL"` 哨兵字符串与真实字符串冲突。
- 日历事件提醒未实现：`calendar/EventFormDialog.tsx:226`（全项目唯一 TODO 标记）。
- 演示模式下整页 reload 触发重新播种，E2E 需规避（已知约束，建议文档化）。

---

## 三、安全问题

### P1

| # | 问题                           | 位置                                                 | 说明                                                                                                                         |
| - | ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1 | **PG 连接串明文存库**               | `sync/config.rs:11`                                | 含密码的 connection_string 明文存 `sync_config` 表，且会随 `data_export_all` 备份导出外泄。应存 keyring（mail 模块 `creds.rs` 已是现成范式），至少从备份导出中排除。  |
| 2 | **CalDAV 密码明文**              | `db.rs:311` `calendar_subscriptions.password TEXT` | 同上，应迁 keyring。                                                                                                             |
| 3 | **assetProtocol scope 形同虚设** | `tauri.conf.json:29-33`                            | scope 数组同时含精确路径和 `"**"` → 任意本地文件可经 asset 协议读取。删除 `"**"`。                                                                   |
| 4 | **tracing 日志全丢**             | 全库未调用 `tracing_subscriber::init()`                 | `engine.rs`、`service.rs` 等 7 个文件的 `tracing::info!/warn!/error!` 全部静默丢弃 → 线上同步/邮件问题无法排查。应初始化 subscriber（写文件日志到数据根目录 logs/）。 |

### P2

- `tauri.conf.json:22`：`--remote-debugging-port=9222` 生产构建也携带，任何本地进程可 CDP 接管 WebView。建议 dev-only（用环境变量或独立 dev 配置文件）。
- CSP `img-src https:` 略宽；`style-src 'unsafe-inline'` 是 Tailwind/shadcn 的既定代价，可接受。
- capabilities 权限最小化良好；确认 autostart 插件权限未列但前端未直接调用（Rust 侧命令不受影响）。

---

## 四、技术债务

### P1

| # | 债务                          | 位置                          | 建议                                                                                                                                                                                                     |
| - | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | **business.rs 2051 行巨石**    | `src-tauri/src/business.rs` | 72 个 `#[tauri::command]` 混 7 个领域（任务 17-454、笔记 455-853、记账 854-1310、日历 1311-1602、备份 1604-1770、收据 1772-1834、认证 1836-2051）。按领域拆 `business/{tasks,notes,finance,calendar,backup,auth}.rs`——mail/ 的拆分已是现成范本。 |
| 2 | **移动端底 Tab 过载**             | `MobileTabBar.tsx:15-63`    | 7 个路由 + 搜索 = 8 个等宽按钮，375px 屏每项仅 ~47px，text-[10px] 标签必然挤压。日历/设置应移出底 Tab（放汉堡菜单或头像菜单），保持 5 项上限（符合既定设计原则）。                                                                                                 |
| 3 | **Mail 平板断点空档（768–1024px）** | `Mail.tsx:266/274`          | 账户树 `lg:block`、文件夹下拉 `md:hidden` → md-lg 区间两者皆无，只能靠抽屉按钮；且三栏布局在 1024px 下 reader 仅剩 ~480px。建议账户树改 `md:` 显示或平板用双栏。                                                                                        |

### P2

- **超大前端文件**：`MailAccountTree.tsx`（708 行含 3 个表单对话框）、`Settings.tsx`（624 行无 Tab 滚动长页）、`useMail.ts`（475 行）、`ContactsPanel.tsx`（470 行）建议拆分。
- **死代码**：`src/components/SyncStatusIcon.tsx` 全项目无引用；`vite.config.ts:24` `@supabase` vendor 死规则；`vitest.config.ts:16-21` 过期 Supabase 注释；`pnpm-workspace.yaml` `minimumReleaseAgeExclude` 残留 6 个 `@supabase/*` 包名。
- **硬编码颜色违反设计 token**：`text-red-500`（Login/Register/TaskForm/MailAccountTree）、`text-green-500/600`（SyncProgressIndicator:44/98）、`fill-yellow-400`（MailReader:189、MailList:278）、`text-blue-500`（GlobalSearch.tsx:96-100）——暗色模式不随主题，违反 AGENTS.md 强制准则。
- **z-index/遮罩三套并行**：ui 组件统一 z-50；toast 用 `z-[9999]`（toast.tsx:14）；`NoteSidebar.tsx:146-149`、`MailAccountTree.tsx:433` 手写 `fixed inset-0 z-40` 遮罩；`MailComposer.tsx:229` 手写 `fixed inset-0 z-50 bg-black/50` 不走 Dialog（**无焦点陷阱、无 ESC 关闭、无滚动锁**）。建议统一走 Dialog/Drawer 组件，文档化层级约定。
- **错误类型不统一**：邮件命令 `Result<_, MailError>`（带错误码，好）vs 业务命令 `Result<_, String>`，前端需双套处理。
- **小屏横滚无提示**：`TaskBoardView.tsx:210`（min-w-[260px]）、`TaskCalendarView.tsx:81`、`CalendarMonthView.tsx:74`（min-w-[560px]）小屏强制横滚，无视觉提示。
- **Notes 侧栏移动端堆叠风险**：`Notes.tsx:104` w-[200px] 无 `hidden md:` 隐藏逻辑。
- **Cargo release profile 未调优**：仅 `strip=true`，未开 `lto`/`codegen-units=1`/`opt-level="z"`，23MB 体积可再压。
- **重复入口**：Settings.tsx:371「邮箱账户」section 与 `MailAccountTree.tsx` 双账户管理（两处均可删账户）；Tasks 的 calendar 视图与顶层 Calendar 模块功能重叠。
- **localStorage 散落 5+ 处**，应收敛单一 storage 模块（key 常量化）。

---

## 五、待完成功能（已知清单 + 本次发现）

| 模块  | 功能                                                  | 状态/来源                                  |
| --- | --------------------------------------------------- | -------------------------------------- |
| 日历  | 事件提醒（通知）                                            | TODO 标记 `EventFormDialog.tsx:226`      |
| 记账  | 周期交易、批量操作、CSV 导入、报表 PDF 导出                          | 既定待办（finance-module-review-2026-08-10） |
| 记账  | 金额 decimal 精度（当前 REAL 浮点）                           | 既定待办                                   |
| 记账  | 多账本/家庭共享、智能记账                                       | 既定待办                                   |
| 邮件  | 历史回填分页（当前首拉窗口 200 封/文件夹）                            | `imap.rs:139`                          |
| 邮件  | IMAP 拉取优化（当前 RFC822 整封含附件字节，应 BODY.STRUCTURE 按需拉正文） | `imap.rs:66`                           |
| 任务  | 任务模板可配置（当前 4 个硬编码在 `Tasks.tsx:30-35`，无 i18n 不可编辑）   | 本次发现                                   |
| 云同步 | 删除传播（tombstone）、冲突解决策略 UI、同步状态可视化完善                 | 本次发现                                   |
| 全站  | i18n 补全（Mail/Notes/通知文案）                            | P0                                     |

## 六、建议新增功能（本次审阅提出）

1. **日志系统**（P1 前置）：初始化 tracing subscriber + 文件日志 + 设置页「导出诊断日志」按钮——当前线上问题零排查手段。
2. **备份加密**：data_export_all 含明文连接串风险（见安全节），导出备份可选密码加密。
3. **404 与错误边界**：notFoundRoute + React ErrorBoundary（当前渲染异常即白屏）。
4. **设置页 Tab 化**：624 行单页滚动 → 按 账户/外观/同步/备份/关于 分 Tab，与设计系统 Tabs 规范一致。
5. **命令面板补全**：⌘K 已存在，可补「跳转+动作」类命令（新建任务/记一笔/写邮件直达）。
6. **多端同步冲突提示**：同步模块修好回环与删除传播后，给用户的冲突提示入口。

---

## 七、目录与文件结构精简建议

### P0（误提交，立即删除）

- `docs/screenshot.png/` 与 `docs/screenshot2.png/` —— 实际是**目录**（各含一张 png），被 git 以 `screenshot.png/screenshot-1786592381440.png` 形式跟踪，命名畸形误提交。

### P1（移动/删除/修复）

| 对象                                                           | 动作                 | 说明                             |
| ------------------------------------------------------------ | ------------------ | ------------------------------ |
| `browser_commands.json`（根目录）                                 | 删除或移 scripts/      | 一次性 AI 浏览器会话遗留，已被 git 跟踪，无代码引用 |
| `package.json:40` `playwright`                               | 移至 devDependencies | 当前误放 dependencies，会进生产依赖树      |
| `scripts/test-fetch.mjs`、`test-fetch2.mjs`、`verify-demo.mjs` | 删除                 | Supabase 时代遗留                  |
| `playwright.config.ts` 端口                                    | 5173 → 1420        | 见 Bug #9                       |
| `vite.config.ts:24` supabase 死规则                             | 删除                 | —                              |

### P2（归档与整理）

- `scripts/` 新建 `diag-archive/` 收纳一次性诊断脚本：`diag-emails.mjs`、`e2e-mail-sync-diag.mjs`、`e2e-tauri-diag.mjs`、`e2e-tauri-dump.mjs`、`e2e-tauri-import-diag.mjs`、`e2e-tauri-p1-diag.mjs`、`e2e-tauri-probe.mjs`；`e2e-tauri-mail.mjs`、`e2e-mail-sync-once.mjs`、`e2e-mail-timing.mjs`、`mail-e2e.mjs` 与 `e2e-tauri/` 下脚本功能重叠，建议合并去重；`repackage_apk_*.py` 可归档。
- `docs/` 约 12 份带日期前缀的已完成历史审阅/计划文档（CODE_REVIEW_FULL_2026-08-10、code-review-2026-08-11/08-14、PDCA_2026-08-07、project-review-2026-08-11 等）统一移入 `docs/archive/`；`docs/superpowers/{plans,specs}`（14 份）整体移 archive。
- `e2e-screenshots/`（78 个文件）已 gitignore 合规，建议本地清空一次历史产物（注意 `_import_test.db` 可能含真实邮件数据）。
- `.gitignore` 补 `playwright-report/`、`test-results/`。
- 设计文档双目录并存（`design/` 与 `docs/designs/`），建议约定唯一归属。
- `.gitignore` 中 `debug-*.mjs`/`test-*.mjs` 规则对应的根目录文件已不存在，可精简。

### 目录结构总评

- `src/` features 划分**不需要重构**，仅需大文件拆分与死代码清理。
- `dist/`、`release-green/` 均未被 git 跟踪，合规。
- `e2e/`（浏览器 ts spec）与 `e2e-tauri/`（CDP mjs）分工明确，**无重复**，保留双目录。

---

## 八、构建配置评估

| 配置                     | 评价                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `tauri.conf.json`      | 窗口 1200×800 / min 360×480 合理；CSP 严格（无 unsafe-eval）👍；**assetProtocol `**` 与调试端口需修**（见安全节）                                   |
| `vite.config.ts`       | vendor chunk 拆分（charts/editor/tanstack/icons/dnd/react）合理；别名一致；删 supabase 死规则即可                                             |
| `tsconfig*.json`       | 合理；node 配置 emitDeclarationOnly+outDir 到 node_modules/.tmp 规避 TS6310，是正确解法                                                   |
| `eslint.config.js`     | typescript-eslint recommended + react-hooks（rules-of-hooks=error）已配 👍；`no-unused-vars` 关闭与 tsconfig noUnusedLocals 双重兜底可接受 |
| `package.json scripts` | dev/build/test/test:e2e/lint/typecheck/build:green 齐全；建议加 `tauri:dev` 快捷脚本                                                  |
| Cargo profile.release  | 仅 strip=true，建议补 `lto = true`、`codegen-units = 1`                                                                           |
| pnpm-workspace.yaml    | allowBuilds 配置正确；清 supabase 残留即可                                                                                            |

---

## 九、优先级行动清单（建议执行顺序）

**第一批（正确性 + 安全，预计小改动）：**

1. sync 触发器补齐 5 表（db.rs 一条 migration）
2. tracing subscriber 初始化 + 文件日志
3. assetProtocol scope 删 `**`；PG 连接串/CalDAV 密码迁 keyring + 从备份导出排除
4. 修复 5 处 `instanceof Error` 空 toast；playwright 端口 5173→1420；删 vite 死规则；playwright 移 devDependencies
5. 删 docs 两个畸形截图目录、browser_commands.json、supabase 遗留脚本

**第二批（同步正确性 + UI 断点）：**  
6\. 同步下载回环修复（device_id 过滤/回写禁触发器）+ tombstone 删除传播设计  
7\. MobileTabBar 收敛到 5 项；Mail 平板断点修复；MailComposer 改走 Dialog 组件  
8\. 404 路由 + ErrorBoundary + 路由 loading UI

**第三批（i18n 与债务）：**  
9\. Mail/Notes 模块 i18n 补全 + 通知文案国际化  
10\. business.rs 按领域拆分；大文件拆分；localStorage 收敛  
11\. 硬编码颜色 token 化；z-index 体系统一文档化  
12\. docs/scripts 归档整理

---

*报告生成：2026-08-15，基于三路并行代码探查（前端/Rust 后端/构建配置），所有结论可溯源至文件路径与行号。*
