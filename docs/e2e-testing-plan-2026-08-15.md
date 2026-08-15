# EasyWork E2E 测试规划（2026-08-15）

> 状态：环境已就绪，待并行 debug 任务确认演示登录流程后即可跑全量用例。

## 1. 目标

在**真实 Tauri 运行时**（WebView2 + Rust 后端 + 本地 SQLite）下验证全模块功能：
- 页面显示正常、路由跳转正常
- 数据写入 / 读取正确（真实 Tauri IPC + SQLite）
- 各功能逻辑正确、工作流不错误
- 全程 console / page error = 0
- 可回归、可进 CI

## 2. 环境架构（已配置完毕）

| 组件 | 版本 / 位置 | 状态 |
|---|---|---|
| EasyWork.exe（release，内置 CDP 9222） | `release-green/EasyWork.exe` | ✅ E2E 构建需用 `pnpm run build:e2e`（tauri-e2e.conf.json 含 additionalBrowserArgs）；生产 green 构建不再携带 CDP 端口 |
| Playwright + chromium | node_modules + `ms-playwright/chromium-1234` | ✅ |
| tauri-driver（官方备选） | `C:\Users\ethan\.cargo\bin\tauri-driver.exe` v2.0.6 | ✅ |
| msedgedriver | `C:\Users\ethan\bin\msedgedriver\msedgedriver.exe` v151.0.4129.78 | ✅ 与 WebView2 151.0.4129.78 匹配 |

### 路径选择

- **主路径：Playwright + WebView2 CDP**（`chromium.connectOverCDP('http://127.0.0.1:9222')`）
  - 已验证连通（真实 WebView2 + 真实 Tauri IPC）
  - 复用项目现有 Playwright；console/pageerror 监听、截图、断言能力完整
- **官方备选：tauri-driver + msedgedriver（WebDriver 协议）**
  - 工具链已装好备用；协议标准但测试需重写成 WebdriverIO API

### 应用启动要求

- E2E 构建使用 `src-tauri/tauri-e2e.conf.json`，为 windows[0] 附加 `"additionalBrowserArgs": "--remote-debugging-port=9222"`；生产 `tauri.conf.json` 不再携带该端口，避免本地任意进程通过 CDP 接管 WebView。
- ⚠️ **端口占用坑（已实测）**：旧实例残留的 `msedgewebview2.exe` 会占住 9222 → 新实例自动落到 9223。
  启动脚本必须先杀残留进程，或动态探测 9222/9223/9224。
- ⚠️ **CSP 坑（已修复）**：原 `connect-src 'self'` 未含 Tauri IPC 端点 → release 版所有命令被 CSP 拦截。
  已修为 `connect-src 'self' ipc: http://ipc.localhost`。

## 3. 测试矩阵（模块 × 用例）

### 3.1 认证（P0）
- [ ] 登录页渲染：h1「登录 EasyWork」+ 邮箱/密码输入 + 登录/演示按钮 + 注册链接
- [ ] 注册页渲染：邮箱/密码/确认密码 + 注册按钮
- [ ] 演示登录 → 跳转 /dashboard（依赖 demo_enter + seedDemoData，**当前阻塞项**）
- [ ] 路由守卫：未登录访问 /tasks 等 → 重定向 /login

### 3.2 仪表盘（P0）
- [ ] 导航侧边栏渲染：任务/邮件/笔记/记账/日历/设置
- [ ] 汇总卡片渲染（任务/交易/笔记计数，演示数据非 0）
- [ ] 图表渲染（recharts canvas 存在）

### 3.3 任务（P0）
- [ ] 任务列表加载（演示数据 > 0）
- [ ] 新建任务 → 列表出现（真实写入）
- [ ] 标记完成 → 状态变化（勾选/样式）
- [ ] 编辑任务标题 → 保存生效
- [ ] 删除任务 → 列表消失
- [ ] 筛选（全部/进行中/已完成）

### 3.4 笔记（P0）
- [ ] 笔记列表 + 文件夹 + 标签渲染
- [ ] 新建笔记 → 富文本编辑 → 保存 → 重开内容一致
- [ ] 移动文件夹 / 删除

### 3.5 记账（P0）
- [ ] 交易列表渲染（演示数据 + 金额 tabular 格式）
- [ ] 新建支出/收入 → 列表 + 分类 + 符号正确
- [ ] 分类管理：新增分类 → 出现在分类下拉
- [ ] 预算设置 → 保存 → 预算卡显示
- [ ] CSV 导出 → 文件存在且含数据
- [ ] 统计图表渲染

### 3.6 邮件（P1，无真实 IMAP）
- [ ] 账户配置页渲染
- [ ] 配置保存/读取（本地持久化）
- [ ] （可选）mailpit mock 真实收发

### 3.7 日历（P1）
- [ ] 月视图渲染
- [ ] 新建事件 → 月视图出现
- [ ] 视图切换（月/周/日）

### 3.8 设置（P1）
- [ ] 资料编辑（昵称/头像）→ 保存 → 读回
- [ ] 同步配置表单渲染
- [ ] 数据备份/恢复/清除（在演示数据下）

### 3.9 全局（P0）
- [ ] 全链路 console / pageerror = 0
- [ ] 404 兜底
- [ ] ⌘K 命令面板（若实现）

## 4. 执行流程

1. 清理残留进程（easywork/msedgewebview2）→ 启动 `release-green/EasyWork.exe`
2. 探测 CDP 端口（9222/9223…）→ Playwright connectOverCDP
3. 单进程串行跑用例（共享浏览器实例，避免多 worker 抢连接）
4. 每用例：执行 → 断言 → 截图 → 记录 console 错误
5. 输出 `e2e-screenshots/_report.json` + 截图

## 5. 数据策略

- 演示模式（demo@easywork.app / demo123456）播种近 1 个月数据 → 断言列表非空
- 写操作使用唯一命名（`E2E-${Date.now()}` 后缀）→ 断言出现，避免与既有数据冲突
- 演示模式每次启动重新播种（`data_clear_all`）→ 用例间天然隔离

## 6. 验收标准

- 全部 P0 用例通过；P1 用例记录结果（跳过项注明原因）
- console / pageerror = 0（生产构建）
- 写入的数据能读回（DB 一致性）
- 截图人工抽检 UI 渲染正常

## 7. CI 集成（建议，后续实施）

- Windows runner（原生最快）：装 WebView2 Runtime + msedgedriver + tauri-driver
- Linux runner：`xvfb-run` + `webkit2gtk-driver`（tauri-driver 路径）
- 缓存：cargo registry / pnpm store；构建绿色版后跑 E2E

## 8. 已知阻塞 / 风险

- 🔴 演示登录点击后 URL 未跳转 /dashboard（console 已无 CSP 错误，疑似 seedDemoData 或前端跳转逻辑问题）→ **并行 debug 任务处理中**
- 邮件真实收发需 mailpit mock
- WebView2 升级需重新下载匹配的 msedgedriver

## 9. 文件结构

```
scripts/e2e-tauri-probe.mjs     # 探索脚本（已验证 CDP + 演示登录行为）
scripts/e2e-tauri-diag.mjs      # 诊断脚本（dump localStorage/body/console）
scripts/e2e-tauri-smoke.mjs     # 主测试脚本（待并行任务确认后完成）
e2e-tauri/helpers.mjs           # CDP 连接/登录/导航/断言工具
e2e-screenshots/                # 截图 + _report.json 输出
docs/e2e-testing-plan-2026-08-15.md  # 本文档
```
