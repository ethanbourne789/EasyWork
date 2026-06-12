- 38 个 Rust warnings（unused imports/variables 等，不影响运行）
- 无 bundle，跳过 NSIS 安装器生成

## 邮箱问题排查与修复
- 日志分析：`sunyi@jasolar.com` 添加邮箱时 IMAP 登录用 `sunyi`（缺域名）被拒
- 发现 commit `96032c2` 已修复（改用完整 email 登录）
- 优化首次同步：新增 `fetch_messages_headers_batch`（header-only IMAP fetch）+ `parse_header_only`，首次同步跳过正文/附件

## 邮件列表分页
- 后端：`fetch_messages` 返回 `FetchMessagesResult { messages, total, page, page_size }`
- 前端：页大小 30，新增页码导航（首页/上一页/页码/下一页/末页）
- 切换文件夹/同步后重置到第 1 页

## 大附件懒加载（>5MB）
- 同步时：附件 >5MB 仅入库元数据（local_path 为空），不写磁盘
- 新增 `fetch_message_raw_by_uid`（imap.rs）、`extract_attachment_by_name`（parser.rs）
- 新增 `update_attachment_path`（ops.rs）、`download_attachment` 命令（commands/mail.rs）
- 前端：未下载附件显示琥珀色下载按钮，点击触发 IMAP 拉取→保存→打开，下载中显示旋转动画

## 邮箱 sunyi@jasolar.com 添加阻塞分析
- 读取 easywork.log，分析 sunyi@jasolar.com 添加邮箱账户时流程阻塞原因
- 结论：TLS 握手 (Step 2/3) 连接到 imaphz.qiye.163.com:993 挂起不完成
  - TCP 连接正常（~60ms 到 220.197.30.133:993）
  - 但 native-tls 握手无响应（超过 10 秒超时仍未完成）
  - 账号可保存到数据库（id=3），但连接测试和同步流程均卡死在 TLS 握手阶段
  - 昨天（06-11）连接有时正常有时失败，今天全部失败
  - 疑似服务器端 TLS 兼容性问题或临时网络故障

## 修复 TLS 后端配置
- 排查发现 `default = []` 导致 Windows 也在使用 Rustls（日志显示 `TLS handshake (rustls)`），但原意图是 Windows/macOS 用 native-tls（schannel），只有 Android 用 rustls
- 修复：`Cargo.toml` 中 `default = []` → `default = ["desktop-native-tls"]`
- 重新构建（增量 `cargo build` 耗时 ~2min，`npx tauri build --no-bundle` 耗时 ~1m48s）
- 产出：`src-tauri/target/release/app.exe`（19MB），已链接 `schannel-0.1.29` + `tokio-native-tls-0.3.1`
- 日志字符串确认已切换为 `"IMAP Step 2/3: TLS handshake (native-tls) with ..."`

## 修复首次同步正文缺失和日期排序
- 用户反馈：首次同步缺少邮件正文、>5MB 附件自动下载、邮件列表未按日期倒序
- **首次同步**：移除 headers-only 分支，始终使用 `fetch_messages_raw_batch` + `parse_raw_message`，确保正文、has_attachment 标记正确
- **大附件处理**：全量正文路径已有 >5MB 附件的跳过逻辑（记录元数据、local_path 留空），首次同步现在也享受此保护
- **日期排序根因**：`normalize_date()` 无法解析 `normalize_rfc2822_date()` 输出的 `YYYY-MM-DD HH:MM:SS` 格式，导致 `date_sort` 全部为空，`ORDER BY date_sort DESC` 失效。前端二次排序但分页内仅 30 条，跨页排序错乱
- **修复**：`normalize_date()` 添加预判逻辑——输入已匹配 `YYYY-MM-DD HH:MM:SS` 则直接返回
- 已编译验证（`cargo check` 通过，0 error）并推送 GitHub（commit `bc07180`）

## Pebble-master 与本项目邮件功能对比分析
- **同步**：两者都实现了 IDLE+轮询，UID cursor 增量同步。本项目用 FTS5 索引，Pebble 用 Tantivy（支持 CJK 自定义分词器）
- **正文渲染**：本项目用 Shadow DOM + DOMParser 手动 sanitize；Pebble 用 Shadow DOM + 后端 ammonia + 前端 DOMPurify 双层过滤
- **业务逻辑**：本项目实现了 thread 检测（4策略）、FTS5 搜索、文件夹隔离；Pebble 额外有 Rules 引擎、Snooze、Pending Mail Ops 队列、WebDAV 自动备份
- **新邮件通知**：本项目仅显示"收到 N 封"的总计数；Pebble 有单独的 toast（含 sender+subject）、Tray 红点 attention 指示、点击跳转到邮件
- **未读跟踪**：本项目有 per-folder/per-account 计数但无 mark-all-read、无 tray badge；Pebble 有 batch mark-read + 30s 轮询 + tray red dot
- **多账户管理（本项目最大短板）**：
  - 12 预设但 iCloud/Yahoo/Proton/Fastmail/Yandex 等都缺失
  - 全部走密码/App Password，**无 OAuth**（Gmail 已强制 OAuth、Outlook 多租户禁 Basic）
  - **无 combined inbox / unified search**——只能单账户查看
  - **无 default account 标记**——取首个账户隐式默认
  - **无自动发现 IMAP**（Mozilla autoconfig / SRV record）
  - **无账户图标/颜色自定义**——所有账户显示同色首字母
  - 草稿仅 localStorage 存储，**不同步 IMAP Drafts**
  - 无 per-account 代理设置、无 per-account 通知静音
- 详细提升计划已记录（见下条）

## 邮件功能提升计划
| 优先级 | 目标 | 工作量 | 方案 |
|---|---|---|---|
| P0 | OAuth (Gmail + Outlook) | 3-5天 | 引入 `oauth2` crate + `pebble-oauth` 同款设计；PKCE + localhost:port/callback 回调；token 加密存储；access_token 过期前自动 refresh |
| P0 | Combined inbox（多账户统一收件箱） | 2-3天 | 后端 `fetch_messages` 接受 `account_ids: Option<Vec<i64>>`；前端 sidebar 添加 "所有账户" 入口；搜索时 `account_id` 改为可选 |
| P0 | 修复 12 预设 + iCloud + Yahoo + Fastmail + Yandex | 0.5天 | `PROVIDER_CONFIGS` 添加 6+ 条 |
| P0 | IMAP 自动发现（autoconfig XML） | 1-2天 | 输入邮箱后并行尝试 3 个 URL：`https://autoconfig.{domain}/mail/config-v1.1.xml`、`https://{domain}/.well-known/autoconfig/mail/config-v1.1.xml`、`https://autoconfig.{domain2}/...` (从 MX 推断 domain2) |
| P1 | mark-all-read（folder/account） | 1天 | `mark_folder_read`/`mark_account_read` IPC；store action；快捷键 `Shift+I` |
| P1 | 通知内容增强（sender+subject） | 0.5天 | 同步时为每条新消息构建 sender+subject，调用 `app_handle.notification()` per-message |
| P1 | 通知分组（按发件人/线程） | 1-2天 | 30s 内的相同 from/subject 折叠为 "5 封来自 X 的新邮件" |
| P1 | 通知点击 → 跳转到该邮件 | 0.5天 | tauri notification payload + frontend 事件监听 + `setActiveAccountId` + `selectMessage` |
| P1 | per-account 通知开关 / 静音 | 0.5天 | `mail_accounts.notifications_enabled` 字段 + 后端过滤 + 前端切换 |
| P1 | Default account 标记 | 0.5天 | `mail_accounts.is_default` 字段 + 切换时自动 set + 发送时优先使用 |
| P1 | 账户自定义颜色/图标 | 1天 | `mail_accounts.color` 字段 + 12色调色板（参照 Pebble `accountColors.ts`）；avatar 显示为色块 + 首字母 |
| P1 | IMAP Drafts 同步 | 1-2天 | 用 `INSERT` + `\Draft` flag 把本地草稿 push 到 IMAP；启动时从 IMAP Drafts 拉取 |
| P1 | 列表虚拟化 | 0.5天 | 引入 `@tanstack/react-virtual`，在 `MessageList` 使用 `useVirtualizer` |
| P2 | Rules 引擎 | 3-5天 | 移植 Pebble `pebble-rules`（条件：From/To/Subject/Body/HasAttachment × Contains/Equals/StartsWith × AND/OR；动作：MoveToFolder/MarkRead/Archive/AddLabel） |
| P2 | Snooze | 1-2天 | `mail_snoozed_messages` 表 + 后台 worker 30s 轮询到时回滚 + frontend SnoozePopover |
| P2 | tray attention 红点 | 0.5天 | 准备带红点 PNG，新邮件时切换；窗口 focus 时还原 |
| P2 | 引用收起（"..."） | 0.5天 | 在 ShadowDomEmail 检测最深 blockquote 深度，截断 5+ 层 |
| P2 | 智能文件夹（今日/本周/带附件） | 1天 | virtual folder ID + 复刻 Pebble `buildAllAccountsFolders` |
| P3 | 通知声音 | 0.5天 | audio tag + 短 wav；用户可上传自定义 |
| P3 | 静默时段 | 0.5天 | settings 增加 start/end 字段 + 后端过滤 |
| P3 | macOS dock badge / Windows taskbar overlay | 0.5天 | Tauri 2 API |
| P3 | PGP / S/MIME | 5-7天 | 大型特性 |
| P3 | 定时发送 | 1-2天 | 复用 snooze 表，cron-like scheduler |
| P3 | mbox/eml 导出 | 1-2天 | 设置页添加 export action |

## 已实施的 5 项邮件功能提升 (commit e0d2ffe)
1. **Combined inbox** (跨账户) — 新增 `fetch_messages_multi` / `search_messages_multi` / `get_unread_count_multi` / `mark_folder_read` 后端命令，前端 `mail-ipc.ts` 暴露
2. **IMAP 自动发现** — `autodiscover_account` 尝试 3 个 Mozilla autoconfig URL，前端 `handleEmailBlur` 兜底
3. **通知点击跳转** — `route_notification_open` 发送 `notification-open` 事件，新增 `display_name/color/is_default/notifications_enabled` 字段
4. **IMAP Drafts 同步** — `push_draft_to_imap` (APPEND to Drafts) + `pull_drafts_from_imap` (UID SEARCH ALL + 解析) + `list_local_drafts`
5. **IDLE 智能策略 + 熔断器** — 智能轮询 (10s/30s/120s 按 APP_FOCUSED) + 5 次失败熔断 + 重连重试 + 首次同步 200 条限制 + UIDVALIDITY 变化检测
- 依赖新增 `reqwest` (rustls-tls) + `regex`

## 邮箱模块：标记未读邮件为已读
- 在 `apps/app-mail/src/App.tsx` 中增加两组按钮：
  1. **中栏（邮件列表）顶部**：「全部已读」按钮（outlined + MarkEmailReadIcon），当 `unreadCount > 0` 时启用，点击调 `markAllAsRead()` 把列表里所有邮件的 `read` 置为 `true`
  2. **右栏（阅读面板）发件人信息行右侧**：「标记为已读」按钮（仅当 `selectedMail.read === false` 时显示），点击调 `markAsRead(id)` 把当前邮件标为已读
- 新增函数 `markAsRead(id)`、`markAllAsRead()` 和派生量 `unreadCount`
- 抽出未读数量计算为 `unreadCount` 变量，避免在模板内重复 `filter`
- 添加 Tooltip 提示：全部已读按钮显示"将 N 封未读邮件标记为已读"或"没有未读邮件"
- TypeScript 编译通过（仅项目自带 baseUrl 弃用警告，与本次修改无关）

## 手动同步邮箱按钮无法同步新邮件 - 排查
- 用户截图：左侧邮件列表最新一封是 `dtcpay 借记卡消费成功 2026-06-12 03:05:45`，但用户说 13:00 收到新邮件，点击右上角"同步"按钮后没拉到
- **三条同步路径并存，导致并发覆盖**（已查代码确认）：
  1. 前端 `src/routes/email.tsx:1098-1123` `handleSync` → `mailIpc.syncAccount` → `commands::mail::sync_account` (Tauri command) → `sync_account_impl`
  2. 后台 `src-tauri/src/lib.rs:221-250` `auto_fetch_interval` 调度器（默认 5 分钟）→ **同一个** `sync_account_impl`
  3. 后台 `src-tauri/src/mail/sync.rs:23-64` `start_sync_worker` → `poll_all_accounts`（10s/30s/120s 智能轮询）→ `sync_inbox_with_cursor` / `sync_folder_with_cursor`（用 cursor UID>last_uid 策略）
- **关键 bug 1：`set_app_focused` 是孤儿函数** —— `src-tauri/src/mail/sync.rs:11-13` 定义了 `set_app_focused(focused)`，但**全代码库没有任何地方调用它**。结果是 `APP_FOCUSED` 永远为 `false`，后台 worker 永远以 `POLL_BACKGROUND_SECS = 120`（2 分钟）轮询，永远不进入 10s/30s 前台模式
- **关键 bug 2：`is_first_sync` 死代码** —— `commands/mail.rs:906` 计算 `is_first_sync` 后仅在第 939/956 行的日志消息里被读，从未改变控制流
- **关键 bug 3：`list_messages` 的 total 统计错误** —— `src-tauri/src/db/ops.rs:824-828` 在 `folder_id != None` 分支仍统计整个账户 `account_id` 的总数（缺 `JOIN mail_message_folders`），导致 `fetchMessages` 返回的 `total` 永远等于账户全量，与 `messages` 数组的 folder 过滤不一致
- **关键 bug 4：手动同步存在冗余 SELECT** —— `commands/mail.rs:919` 调 `select_folder`，紧接着 `fetch_uids_since` 内部 `imap.rs:395` 又 SELECT 一次（async_imap 容忍但不必要）
- **关键 bug 5：失败静默** —— `commands/mail.rs:919/924/951/960/1044-1046` 多处 `log::warn!` + `continue`，但 `SyncResult` 字段（mail.rs:1073-1078）只有 `folders_count/messages_new/messages_total/error`，`total_failed_parse/total_failed_insert` 计算了从未返回；前端 `handleSync`（email.tsx:1103）只看 `messages_new`，不告知失败
- **根本原因链**：用户点同步 → 触发 `sync_account_impl` → `IMAP SEARCH SINCE 13-May-2026`（默认 30 天窗口）→ 拿到 UIDs → `get_existing_remote_uids` 全局去重（`WHERE account_id=? AND remote_uid IN (...)`）→ 已被后台 worker 写入的 UID 被跳过 → `messages_new=0` → toast 显示"0 封新邮件"。**但若用户感知列表里没新邮件**，根因更可能是：后台 worker 每 120 秒跑一次，前 120 秒内的新邮件不在 cursor 区间内也不会被立刻拉
- **排查建议**：
  1. 让前端 `handleSync` 触发后强制 reload `mail_folders` 并跑一次"再读" (`fetchMessages` 拉第一页)
  2. 修复 `set_app_focused` 实际接上 window focus/blur 事件（注册 `WindowEvent::Focused`），让前台时 10s 轮询
  3. 给 `sync_account_impl` 加 per-account `Mutex<HashSet<i64>>` 防止三路并发
  4. `list_messages` 的 total 改为按 folder_id JOIN 统计
  5. `SyncResult` 加 `messages_failed_insert/parse/folders_skipped` 字段，toast 提示
- 详细子智能体报告见 conversation log

## 邮箱模块：联系人管理增强 — 设计阶段
- 触发：用户希望完善 `app-mail` 模块中联系人管理（CRUD / VCF 导入导出 / 分组 / 正文邮箱点击交互）
- 使用 brainstorming 技能完成 5 轮澄清 + 一次性整体设计
- 关键决策：
  - **分组**：新建独立 `mail_contact_groups` 表，联系人改为 `group_id` 外键（非自由文本）
  - **VCF 解析**：纯前端 File API（不引入 Tauri 插件），自写 RFC 6350 解析器 ~80 行
  - **正文邮箱交互**：Hover 浮层 + 抽屉面板，事件通过 `data-ew-email` 属性 + CustomEvent 桥接 Shadow DOM 与 React
  - **导入去重**：同 account 下 email 重复则跳过（不覆盖）
  - **往来查询范围**：跨所有账户（用现有 `fetch_messages_multi` + 邮箱精确匹配）
- 现状调研发现：
  - 后端已有 `mail_contacts` 表（`group_name` 字符串）和 4 个 CRUD 命令 (`add_contact`/`list_contacts`/`update_contact`/`delete_contact`) 已注册
  - 前端 `src/stores/mail-store.ts` `MailContact` 类型 + `src/lib/mail-ipc.ts` 11 个 IPC 封装
  - 现有 `ContactsModal`（`src/routes/email.tsx:447-602`）已有 CRUD + CSV 导入导出（CSV 解析手写）但没有分组结构和 VCF 支持
  - `ShadowDomEmail` 已有完善的 DOMParser sanitize（`src/components/ShadowDomEmail.tsx:90+`）可在其基础上加 email 装饰
  - 后端无 `tauri-plugin-dialog`/`fs`，所有文件 IO 走前端
- 设计文档已写入 `docs/plans/2026-06-12-contacts-management-design.md`
- 5 个实施切片：
  1. 数据层（schema 迁移 v1→v2 + 11 个 Tauri 命令 + Rust 单测）
  2. VCF 工具 + 导入导出 UI
  3. 联系人 UI 重写（分组管理 + 多选）
  4. 正文邮箱交互（decorate + ContactCard + EmailContactLayer）
  5. 抽屉 + 跨账户搜索 + 抛光
- 实施尚未启动，待用户选 PR 起点

## 手动同步邮箱 bug 修复实施 (commit 待 push)
- 用户要求"立即修复所有问题"，已逐项落地，cargo check 通过 (0 error, 34 warnings 全为项目历史遗留)
- **Bug 1 修复** (`src-tauri/src/lib.rs:264-289`)：`on_window_event` 中新增 `WindowEvent::Focused(focused)` 分支，调 `mail::sync::set_app_focused(focused)`，让 `APP_FOCUSED` 真正反映窗口焦点
- **Bug 2 修复** (`src-tauri/src/commands/mail.rs:1-72`)：新增 `SyncLock` 结构 (`Arc<Mutex<HashSet<i64>>>` 管理 in-flight account_id) + `SyncLockGuard` RAII。新增 `sync_account_impl_with_lock` 接收可选 `SyncLock`；`#[tauri::command] sync_account` 改为同时拿 `pool` 和 `sync_lock` 两个 State；`start_sync_worker` 的 auto-fetch 循环同样用 `SyncLockGuard::acquire` 防撞
- **Bug 3 修复** (`src-tauri/src/db/ops.rs:824-849`)：`list_messages` 的 `total` 统计改为按 `folder_id` 走对应分支（folder 分支补 `JOIN mail_message_folders`），与返回的 `messages` 数组一致
- **Bug 4 修复** (`src-tauri/src/commands/mail.rs:12-19, 1073-1078`)：`SyncResult` 扩字段 `folders_skipped / messages_failed_parse / messages_failed_insert`，三者都填到返回体；前端 `handleSync` (`src/routes/email.tsx:1098-1146`) 拼接更丰富的 toast，失败时显示"X 个跳过/解析失败/入库失败"
- **Bug 5 修复** (`src-tauri/src/commands/mail.rs:990-1006`)：去掉 `sync_account_impl` 中 `mail::imap::select_folder` 的冗余调用（`fetch_uids_since` 内部已 SELECT）；`folders_skipped` 现在计入 `fetch_uids_since` 失败
- **Bug 6 修复** (`src/routes/email.tsx:1131-1145`)：手动同步遇到"账户已在同步中"错误时，不再弹红 `error` toast，而是友好 info 提示"该账户正在同步中"
- 顺手清理：`sync_account_impl` 中的 `is_first_sync` 死分支移除（仅剩日志），`total_parsed` 死变量移除
- 编译：`cargo check` 3.88s 通过，0 error
- 编译产物：未做 `npx tauri build`，留给用户确认是否发布新版本

## 第二次 Windows 无 Bundle 编译 (含 sync 修复)
- 第一次 build 失败：tsc 报 11 个类型错误
  - `src/lib/mail-ipc.ts:SyncResult` 没扩字段
  - `email.tsx:Toast` 和 `toast` state 没接受 `"info"` 类型
- 修复：
  - `src/lib/mail-ipc.ts:36-46` 扩 `SyncResult` 加 `folders_skipped/messages_failed_parse/messages_failed_insert` 三个 number 字段
  - `email.tsx:142/887` Toast 组件和 toast state 类型改为 `"success" | "error" | "info"`
  - `email.tsx:148-155` Toast 渲染加 info 蓝色分支 (bg-sky-600)
- 重新 `npx tauri build --no-bundle`：
  - 前端 Vite build：1.59s
  - Rust 编译：1m 16s（增量）
  - 产出：`E:\Dev\EasyWork\src-tauri\target\release\app.exe` (21MB, 13:24 更新)
  - 34 warnings（全部为项目历史遗留的 unused imports/functions/Stream）
- 0 error，0 新增 warning

## 已读标记回退 bug 修复
- **用户截图复现**：红色框选 `ethanbourne789 hi` 邮件，蓝色未读圆点可见。右侧已展开（已读状态）。右下角计数"6 封新邮件"。用户报告：点开阅读后未读消失，再点同步又出现
- **根因** (`src-tauri/src/db/ops.rs:233-340`)：`insert_message` 三层去重（UID / Message-ID / content hash）都**无条件 UPDATE 把新构造的 `MailMessage.is_read=false, is_starred=false` 覆盖回 DB**。但 sync 路径 (`commands/mail.rs:1073-1074` 和 `mail/sync.rs:318`) 永远构造 `is_read: false, is_starred: false` 的 msg
  - 时序：sync 拉到 UIDs → `get_existing_remote_uids` 命中 → `insert_message` Dedup Layer 1 命中 → UPDATE 把本地 `is_read=true` 改回 `is_read=false`
  - 用户感知：刚标已读，又被同步"洗回"未读
- **修复**：三层去重全部改为只刷新 server 控制的字段（subject/from/body/size/date/flags/folder），**保留** `is_read` / `is_starred` 的本地值
  - Layer 1 (UID)：SELECT 改成取 `id, is_read, is_starred` 三个字段，UPDATE 移除 `is_read=?8, is_starred=?9`
  - Layer 2 (Message-ID)：同样 SELECT 加 is_read/is_starred，UPDATE 移除覆盖
  - Layer 3 (content hash)：保留层最薄，同步保留
  - 所有三层日志都加 `preserved is_read={} is_starred={}` 字段方便诊断
- **同时保护两条 sync 路径**：`commands::mail::sync_account_impl` (手动+定时器) 和 `mail::sync::sync_folder_with_cursor` (智能轮询 worker) 都共用 `insert_message`，一次修复同时生效
- **未改 reconcile.rs**：`compute_flag_diff` 已有 60s 宽限窗口保护本地写回竞争，且只比较 remote != local 时才更新，逻辑正确无需改
- **验证**：`cargo check` 0.58s 通过，0 error；`npx tauri build --no-bundle` 1m 21s 通过；产出 `app.exe` 21MB 13:33 更新
- 业务逻辑确认：✅ 同步时**只**刷服务器字段（subject/from/body/size/date/has_attachment/folder），不踩用户标记；用户已读/星标状态由独立的 `mark_read` / `set_starred` 命令维护

## 邮箱 v1.1：按群组批量群发 — 实施 PR1（前端）
- 用户要求：在 Compose/Reply/Forward 中展示联系人列表，支持按组批量选择
- 5 轮澄清：选择器=右侧可折叠面板；chip=结构化；策略=一封多收件人；模板=不做；空白=面板随用随选
- 设计文档增量已写入 `docs/plans/2026-06-12-contacts-management-design.md`（追加「按群组批量群发 v1.1」章节）
- 实施切片：PR1 仅前端（数据层等 PR1 数据切片的 Tauri 命令 + schema 迁移另行启动）
- 已完成 9 个子任务：
  1. **`src/lib/parseAddressList.ts`** — `MailRecipient` / `RecipientKind` / `isValidEmail` / `parseAddressList` / `renderRecipientList` / `splitPendingEmails` / `ContactPickerState`。28 个 smoke test 全过（tsc 单文件编译 + Node 跑 cjs）
  2. **`src/components/RecipientChip.tsx`** — 圆角胶囊 + 头像首字母 + `name <email>` 截断 + × 删除；附 `EmptyRecipientChip` 占位
  3. **`src/components/RecipientInputRow.tsx`** — chip + 受控输入行（`;`、`,`、空白、Enter 提交、Backspace 删最后一个、粘贴多地址自动提交）
  4. **`src/components/ContactPickerPanel.tsx`** — 320px 右栏：搜索 + 折叠/展开 + 分组列表（按 `MailContact.group_name` 虚拟分组，未分组在最后）+ 「+ 收件人/抄送/密送」三按钮 + 「清空选择」+ 已选提示
  5. **`src/stores/mail-store.ts`** — `ComposeData` 追加 `recipients?: MailRecipient[]` 字段
  6. **`src/hooks/useComposeDraft.ts`** — `DraftData` 追加 `recipients?: MailRecipient[]`；写入双轨（recipients + 字符串）
  7. **`src/routes/email.tsx`** — ComposeDialog 改造：3 个 string state → `recipients: MailRecipient[]`；3 个 `RecipientInputRow` + 右侧 `ContactPickerPanel`；发送时 `renderRecipientList` 派生 to/cc/bcc 字符串；空收件人时禁用发送按钮；群发时 footer 显示「群发 N 人」
  8. **i18n** — `zh.json` + `en.json` 补 13 个 key（picker.* + recipients.*）
  9. **编译验证** — `tsc -b` 0 error；`vite build` 2.52s 通过，email chunk 517 kB
- 关键设计决策：
  - 发送走现有「一封多收件人」逻辑，v1 不做逐封独立群发
  - 分组用 `group_name` 字符串虚拟聚合，迁移到 `mail_contact_groups` 表后 API 不变
  - 折叠态：右侧贴边 28×28 按钮 `position: fixed`（脱离卡片）
  - ContactAutocomplete 旧组件从 import 中移除（不再用）
- Reply/Forward 入口改造（`composeData.recipients` 已支持）暂未对接 message.from_email/cc_list 解析 — 等数据层迁移后再补，避免在 schema 未变时硬编码
- 文件清单：
  - 新增 `src/lib/parseAddressList.ts`、`src/components/RecipientChip.tsx`、`src/components/RecipientInputRow.tsx`、`src/components/ContactPickerPanel.tsx`
  - 改 `src/stores/mail-store.ts`、`src/hooks/useComposeDraft.ts`、`src/routes/email.tsx`、`src/locales/{zh,en}.json`
  - 增量设计：`docs/plans/2026-06-12-contacts-management-design.md`

## 邮箱页头部按钮布局调整
- **用户要求** (截图标注)：
  - 1 号位置（顶部工具栏右侧）的「同步 / 写邮件 / 设置」挪到 3 号位置
  - 2 号位置（顶部中间空白）取消
  - 3 号位置（左侧 sidebar 底部）增加 4 个按钮：同步 / 写邮件 / 设置 / 侧边栏缩放
- **实现** (`src/routes/email.tsx:1373-1408, 1396-1398, 1496-1542`)：
  - 顶部 `<Toolbar>` 移除同步/写邮件/设置/桌面端 sidebar toggle，**只保留** mobile 端 sidebar toggle + 账户下拉
  - Sidebar 容器改为 `flex flex-col` 布局，让底部操作区能用 `mt-auto` 推到底部
  - 在 sidebar 末尾（contacts 区块之后）新增一个 `mt-auto pt-2 border-t` 的底部操作区，4 个按钮
  - 展开模式：每个按钮 `flex items-center gap-2 px-3 py-2 text-sm`，左侧图标 + 右侧文字（"同步"/"写邮件"/"设置"/"收起侧边栏"），写邮件按钮保留 `bg-primary-600 text-white` 强调
  - 收起模式：每个按钮 `flex items-center justify-center w-full p-2`，仅图标（18px），保持与已有 SidebarIconBtn 风格一致
  - "写邮件"按钮在两种模式下都保留高亮色
- **TypeScript 检查**：`npx tsc --noEmit` 通过，0 error
- **编译**：`npx tauri build --no-bundle` 1m 19s 通过；产出 `app.exe` 21MB 13:43 更新
- **业务逻辑**：纯 UI 布局调整，未影响任何 IPC / store / 同步逻辑

## 顶部 header 移除 + Sidebar 整合 ThemeToggle
- **用户要求** (截图标注)：
  - 红色框选区域（顶部 header：搜索框 + 暗色按钮 + 铃铛）**整体移除**
  - 亮色/暗色控制按钮挪到左侧导航栏**设置按钮**上
  - 铃铛按钮移除
  - 左侧导航栏设置按钮**靠下对齐**
- **实现**：
  - `src/routes/__root.tsx`：移除整个 header 块的搜索框 / ThemeToggle / Bell 红色点；仅保留 mobile 端汉堡菜单按钮（`md:hidden`）；删除 `useTranslation` / `Bell` / `Search` 三个未用 import
  - `src/components/Sidebar.tsx`：从 `navItems` 数组中**移除** settings 项（不再混在主导航里），新增 `footer` 区块用 `mt-auto` 推到底部
    - 展开模式 footer：`<ThemeToggle />`（小尺寸 16px 图标）+ `<Link to="/settings">` 设置按钮 + `<ChevronLeft />` 收起按钮，三者水平 flex 排列
    - 收起模式 footer：`<ThemeToggle iconOnly />` + 设置按钮（图标）+ `<ChevronRight />` 展开按钮，三者垂直 stack
  - `src/components/ThemeToggle.tsx`：扩 props `{ iconOnly?: boolean, className?: string }`，`iconOnly=true` 时用 `w-full p-2 justify-center` + 18px 图标（适配 sidebar 按钮风格）
- **TypeScript 检查**：`npx tsc --noEmit` 通过，0 error
- **编译**：`npx tauri build --no-bundle` 1m 18s 通过；产出 `app.exe` 21MB 13:53 更新
- **业务逻辑**：纯 UI 布局调整；ThemeToggle 仍走 `useThemeStore` 同一个 store，行为不变