# 邮件模块梳理 / 重构 / 全流程打通报告（2026-08-15）

## 背景

邮件模块存在「IMAP 无法正确同步」的核心痛点，且联系人、邮件模板、草稿等功能缺失或为占位实现。
本次完成：同步链路修复、联系人模块从零落地、模板/草稿/已发送补全、响应式 UI 梳理，并用真实 QQ 账号
（imap.qq.com:993 / smtp.qq.com:465，授权码认证）端到端验证全部流程。

## 一、IMAP 同步修复（核心）

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | 同步返回 `fetched:0/folders:0/error:null` | 后台 300s 定时同步与手动同步锁冲突，且 `mail_sync` 聚合时**丢弃子账号 error** | 锁冲突/文件夹级错误全部聚合透传到 `SyncResult.error`，前端 toast 提示 |
| 2 | 锁永久卡死风险 | `do_sync` panic 时锁标志不复位 | 改 RAII `SyncGuard`（std Mutex + HashSet，Drop 自动释放） |
| 3 | 单封坏邮件中断整轮同步 | `parse_message(&body)?` 直接传播 | 解析失败只跳过该封并 warn 日志 |
| 4 | 邮件列表时间排序全错 | `received_at` 用同步时刻而非邮件 Date 头 | mail-parser 解析 Date 头，缺失才回退当前时间 |
| 5 | 文件夹未读数永远为 0 | 读的是从不更新的 `email_folders.unread_count` 列 | 改为从 emails 表实时 COUNT |
| 6 | 文件夹失败被静默吞掉 | select/fetch 失败仅写调试文件 | 聚合成「文件夹: 错误」列表透出；fetch 流全败时返回真实底层错误 |
| 7 | 预览泄露原始 HTML | body_text 缺失时直接截断 body_html | `html_to_text` 去标签 + 压缩空白 |
| 8 | 重同步不刷新已读/标星 | upsert ON CONFLICT 不含标志位 | 冲突时同步刷新 is_read/is_starred/received_at |

同时清理了 service.rs/imap.rs 中硬编码 `E:\Dev\...` 的调试文件写入（改 tracing 日志）。

## 二、新增联系人模块

- **后端**（schema v3 迁移）：`contacts` / `contact_groups` / `contact_group_members` 三表；
  命令：`contact_list`（分组筛选+模糊搜索）、`contact_save`（upsert+分组全量替换）、`contact_delete`、
  `contact_group_list/save/delete`、`contact_export_vcf`、`contact_import_vcf`。
- **VCF**：vCard 3.0，支持 FN/N/EMAIL/TEL/ORG/TITLE/NOTE、折行展开、反斜杠转义；
  导出自动转义 `; , \ 换行`。（已知限制：不解析 quoted-printable 编码值）
- **前端**：`ContactsPanel`（邮箱页内「邮件/联系人」视图切换）——分组侧栏（增删改、成员计数）、
  联系人列表、新建/编辑对话框（多邮箱/多电话动态行、公司/职位/备注、分组勾选）、VCF 导入（文件选择）
  /导出（Blob 下载）；移动端分组改为横向 chips。
- **写信联想**：收件人/抄送输入框接入联系人 datalist 候选（值=纯地址，通过格式校验）。

## 三、补全缺失后端

- 邮件模板：`mail_list/save/delete_template`（前端对话框原为抛错占位，已接通真实命令）。
- 草稿：`mail_save_draft` —— lettre 构建 MIME → 最佳努力 IMAP APPEND 到草稿箱 + 本地落库；
  前端「保存草稿」「编辑草稿」（删旧存新）接通。
- 已发送：`mail_send` 成功后把原始 MIME APPEND 到 IMAP 已发送文件夹（失败仅告警不影响发送）。

## 四、验证（E2E，27/27 通过）

脚本：`e2e-tauri/mail-full-flow.mjs`（Playwright + WebView2 CDP，`window.__TAURI__.core.invoke` 直调数据层 + UI 渲染断言）。

关键结果：
- IMAP 同步：**5 个文件夹、261 封邮件、error=null**（修复前为 0/0/null）
- 文件夹识别：收件箱/已发送/草稿箱/垃圾邮件/Deleted Messages 类型推断正确
- 统一收件箱聚合、正文读取、Date 头时间、标星/已读、未读数实时计算
- SMTP 真实发信（发给自己）成功
- 联系人 CRUD/分组/VCF 导出（字段完整）/VCF 导入（2 卡，含折行转义）
- 桌面三栏 + 移动端（375×667）单栏/汉堡菜单/底部 Tab 截图验证
- 全程 0 前端 JS 错误

产物：`release-green/EasyWork.exe`（22.91 MB）已重建包含全部修复。

## 五、遗留事项（后续迭代）

1. 首次同步窗口 WINDOW=200（大邮箱只拉最近 200 封/文件夹），需做历史回填分页。
2. 附件实体未落盘（email_attachments 表空、has_attachments 仅标记），下载/预览待实现。
3. 已读/标星状态未回写 IMAP 服务端（sync_state=1 标记了但无 pushback）。
4. 联系人/模板/签名未纳入云端 PG 同步表。
5. 邮件全文搜索 FTS5 表无触发器，不会自动更新（当前搜索走前端过滤）。
6. QQ/163 等邮箱首次添加时的服务器预设可做成下拉引导（当前 UI 有域名推断，够用）。
