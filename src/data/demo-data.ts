// ============================================================
// EasyWork 演示数据
// ============================================================

export interface KanbanTask {
  id: string
  title: string
  description: string
  priority: "urgent" | "high" | "medium" | "low"
  status: "todo" | "in_progress" | "review" | "done"
  assignee: string
  dueDate: string
  tags: string[]
}

export interface CalendarEvent {
  id: string
  title: string
  description: string
  date: string
  time: string
  type: "meeting" | "task" | "reminder" | "personal"
  duration: number // minutes
}

export interface Note {
  id: string
  title: string
  content: string
  folder: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

export interface Email {
  id: string
  from: string
  fromName: string
  subject: string
  preview: string
  date: string
  read: boolean
  starred: boolean
  labels: string[]
  hasAttachment: boolean
}

export interface Stock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: string
  sector: string
}

export interface AccountingRecord {
  id: string
  type: "income" | "expense"
  amount: number
  category: string
  description: string
  date: string
  account: string
}

export interface SportRecord {
  id: string
  type: string
  duration: number // minutes
  calories: number
  distance: number // km
  date: string
  notes: string
}

export interface LogEntry {
  id: string
  level: "info" | "warning" | "error" | "debug"
  module: string
  message: string
  timestamp: string
}

export interface DashboardStats {
  tasksCompleted: number
  tasksTotal: number
  calendarEvents: number
  unreadEmails: number
  weeklyFocus: number // hours
  monthlyIncome: number
  monthlyExpense: number
  sportMinutes: number
}

// ============================================================
// 看板演示数据
// ============================================================
export const demoKanbanTasks: KanbanTask[] = [
  {
    id: "KAN-001",
    title: "完成 EasyWork 仪表盘页面设计",
    description: "设计仪表盘的统计卡片、图表和今日概览组件，使用 shadcn/ui 组件库",
    priority: "urgent",
    status: "in_progress",
    assignee: "Ethan",
    dueDate: "2026-06-12",
    tags: ["UI", "前端"],
  },
  {
    id: "KAN-002",
    title: "实现看板拖拽功能",
    description: "使用 @dnd-kit 实现看板任务的拖拽排序和状态切换",
    priority: "high",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-06-15",
    tags: ["功能", "前端"],
  },
  {
    id: "KAN-003",
    title: "设置 Tauri SQLite 数据库",
    description: "在 Rust 端初始化 SQLite 数据库，创建所有模块的数据表结构",
    priority: "high",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-06-18",
    tags: ["后端", "数据库"],
  },
  {
    id: "KAN-004",
    title: "编写日历模块 CRUD 接口",
    description: "实现日历事件的创建、读取、更新、删除功能，支持重复事件",
    priority: "high",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-06-20",
    tags: ["后端", "API"],
  },
  {
    id: "KAN-005",
    title: "设计记账模块 UI 原型",
    description: "在 Figma 中完成记账模块的高保真原型设计，包含流水列表和统计图表",
    priority: "medium",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-06-22",
    tags: ["设计", "UI"],
  },
  {
    id: "KAN-006",
    title: "集成股票行情 API",
    description: "接入免费股票数据 API，实现实时行情展示和历史K线图",
    priority: "medium",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-06-25",
    tags: ["后端", "API"],
  },
  {
    id: "KAN-007",
    title: "实现主题切换功能",
    description: "支持浅色/深色/跟随系统三种主题模式，全局 CSS 变量驱动",
    priority: "medium",
    status: "review",
    assignee: "Ethan",
    dueDate: "2026-06-10",
    tags: ["UI", "前端"],
  },
  {
    id: "KAN-008",
    title: "编写邮箱模块 IMAP 集成",
    description: "通过 Rust 端实现 IMAP 协议连接，获取收件箱邮件列表",
    priority: "low",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-07-01",
    tags: ["后端", "API"],
  },
  {
    id: "KAN-009",
    title: "优化应用启动性能",
    description: "懒加载模块路由，优化首屏渲染时间到 1s 以内",
    priority: "low",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-07-05",
    tags: ["性能", "优化"],
  },
  {
    id: "KAN-010",
    title: "完成设置页面功能",
    description: "实现通用设置、数据管理、快捷键、关于等设置项",
    priority: "medium",
    status: "done",
    assignee: "Ethan",
    dueDate: "2026-06-08",
    tags: ["UI", "功能"],
  },
  {
    id: "KAN-011",
    title: "编写运动模块数据展示",
    description: "设计运动记录的周/月视图，卡路里消耗和运动时长统计",
    priority: "low",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-07-10",
    tags: ["UI", "前端"],
  },
  {
    id: "KAN-012",
    title: "添加全局搜索功能",
    description: "实现跨模块的全文搜索，支持快捷键唤起搜索框",
    priority: "medium",
    status: "todo",
    assignee: "Ethan",
    dueDate: "2026-06-28",
    tags: ["功能", "UX"],
  },
]

// ============================================================
// 日历演示数据
// ============================================================
export const demoCalendarEvents: CalendarEvent[] = [
  {
    id: "EVT-001",
    title: "EasyWork 项目评审",
    description: "与产品团队评审 EasyWork MVP 功能范围",
    date: "2026-06-11",
    time: "09:30",
    type: "meeting",
    duration: 60,
  },
  {
    id: "EVT-002",
    title: "完成前端框架搭建",
    description: "Tauri + React + Tailwind + TanStack Router 项目初始化",
    date: "2026-06-10",
    time: "14:00",
    type: "task",
    duration: 180,
  },
  {
    id: "EVT-003",
    title: "健身房 - 背部训练",
    description: "引体向上 4×10，划船 4×12，高位下拉 4×12",
    date: "2026-06-10",
    time: "18:30",
    type: "personal",
    duration: 60,
  },
  {
    id: "EVT-004",
    title: "周报提交截止",
    description: "提交本周工作周报到项目管理系统",
    date: "2026-06-13",
    time: "17:00",
    type: "reminder",
    duration: 15,
  },
  {
    id: "EVT-005",
    title: "Code Review - 看板模块",
    description: "审查看板模块的拖拽实现代码",
    date: "2026-06-14",
    time: "10:00",
    type: "meeting",
    duration: 45,
  },
  {
    id: "EVT-006",
    title: "技术分享 - Tauri 2.0 新特性",
    description: "内部分享 Tauri 2.0 移动端支持和插件系统",
    date: "2026-06-16",
    time: "15:00",
    type: "meeting",
    duration: 60,
  },
  {
    id: "EVT-007",
    title: "跑步 5km",
    description: "沿河慢跑，保持配速 6:00/km",
    date: "2026-06-12",
    time: "07:00",
    type: "personal",
    duration: 30,
  },
  {
    id: "EVT-008",
    title: "月度财务总结",
    description: "整理本月收支，更新记账数据",
    date: "2026-06-30",
    time: "20:00",
    type: "task",
    duration: 45,
  },
]

// ============================================================
// 笔记演示数据
// ============================================================
export const demoNotes: Note[] = [
  {
    id: "NOTE-001",
    title: "Tauri 2.0 学习笔记",
    content: "Tauri 2.0 支持移动端（iOS/Android），使用 Rust 作为后端，前端可用任意框架。核心概念：Command、Event、Plugin 系统。",
    folder: "技术",
    createdAt: "2026-06-05",
    updatedAt: "2026-06-09",
    tags: ["Tauri", "Rust", "前端"],
  },
  {
    id: "NOTE-002",
    title: "2026 年投资策略",
    content: "关注光伏行业反弹机会，晶澳科技技术面分析。高股息策略：长江电力、中国神华。控制仓位不超过 60%。",
    folder: "投资",
    createdAt: "2026-05-20",
    updatedAt: "2026-06-08",
    tags: ["股票", "投资", "光伏"],
  },
  {
    id: "NOTE-003",
    title: "React 性能优化清单",
    content: "1. React.memo 避免不必要渲染\n2. useMemo/useCallback 缓存计算\n3. 虚拟列表处理长列表\n4. 代码分割懒加载\n5. 图片懒加载和 WebP 格式",
    folder: "技术",
    createdAt: "2026-06-01",
    updatedAt: "2026-06-07",
    tags: ["React", "性能", "前端"],
  },
  {
    id: "NOTE-004",
    title: "每周食谱计划",
    content: "周一：鸡胸肉+西兰花+糙米饭\n周二：三文鱼+芦笋+藜麦\n周三：牛肉+彩椒+全麦面包\n周四：虾仁+菠菜+意面\n周五：自由餐",
    folder: "生活",
    createdAt: "2026-06-03",
    updatedAt: "2026-06-03",
    tags: ["饮食", "健身"],
  },
  {
    id: "NOTE-005",
    title: "SQLite 最佳实践",
    content: "1. 使用 WAL 模式提升并发\n2. 合理建立索引\n3. 批量事务减少写入开销\n4. 定期 VACUUM 清理碎片\n5. 外键约束保证数据完整性",
    folder: "技术",
    createdAt: "2026-06-06",
    updatedAt: "2026-06-06",
    tags: ["SQLite", "数据库"],
  },
  {
    id: "NOTE-006",
    title: "项目 IDEA 收集",
    content: "1. AI 照片整理工具\n2. 个人财务管理（多账户聚合）\n3. 自动化工作流引擎\n4. Markdown 知识库 + 双向链接",
    folder: "想法",
    createdAt: "2026-05-15",
    updatedAt: "2026-06-09",
    tags: ["项目", "想法"],
  },
]

// ============================================================
// 邮箱演示数据
// ============================================================
export const demoEmails: Email[] = [
  {
    id: "MAIL-001",
    from: "github@notifications.github.com",
    fromName: "GitHub",
    subject: "[EasyWork] Pull Request #42: feat: add kanban drag-and-drop",
    preview: "Hi @ethanbourne789, your PR has been reviewed. Please check the inline comments and address the review feedback before we can merge.",
    date: "2026-06-10T10:30:00",
    read: false,
    starred: true,
    labels: ["开发"],
    hasAttachment: false,
  },
  {
    id: "MAIL-002",
    from: "hr@company.com",
    fromName: "HR 部门",
    subject: "2026 年 Q2 绩效考核通知",
    preview: "各位同事，Q2 绩效考核将于 6 月 15 日开始，请提前准备好个人工作总结和目标完成情况。",
    date: "2026-06-09T14:00:00",
    read: true,
    starred: false,
    labels: ["工作"],
    hasAttachment: true,
  },
  {
    id: "MAIL-003",
    from: "newsletter@react.dev",
    fromName: "React Newsletter",
    subject: "React 19 新特性详解：Server Components 和 Actions",
    preview: "本期重点：React Server Components 在生产环境中的最佳实践，以及新的 use() hook 使用场景分析。",
    date: "2026-06-09T08:00:00",
    read: false,
    starred: false,
    labels: ["技术"],
    hasAttachment: false,
  },
  {
    id: "MAIL-004",
    from: "billing@vercel.com",
    fromName: "Vercel",
    subject: "您的月度账单已生成 - 2026年6月",
    preview: "您 6 月份的账单金额为 $22.50，主要包含 Pro 计划订阅和额外的带宽使用费。请在 7 月 1 日前完成支付。",
    date: "2026-06-08T16:00:00",
    read: true,
    starred: false,
    labels: ["账单"],
    hasAttachment: true,
  },
  {
    id: "MAIL-005",
    from: "invite@figma.com",
    fromName: "Figma",
    subject: "Ethan 邀请您协作编辑 'EasyWork UI Design'",
    preview: "Ethan 邀请您查看并编辑 Figma 设计文件。点击链接即可开始协作。",
    date: "2026-06-07T11:00:00",
    read: true,
    starred: false,
    labels: ["设计"],
    hasAttachment: false,
  },
  {
    id: "MAIL-006",
    from: "security@github.com",
    fromName: "GitHub Security",
    subject: "[重要] 检测到新的登录设备",
    preview: "我们检测到您的 GitHub 账号从新的设备登录。如果这是您本人操作，请忽略此邮件；否则请立即修改密码。",
    date: "2026-06-06T22:00:00",
    read: false,
    starred: false,
    labels: ["安全"],
    hasAttachment: false,
  },
]

// ============================================================
// 股票演示数据
// ============================================================
export const demoStocks: Stock[] = [
  {
    symbol: "002459",
    name: "晶澳科技",
    price: 15.82,
    change: 0.56,
    changePercent: 3.67,
    volume: 28560000,
    marketCap: "523.6亿",
    sector: "光伏",
  },
  {
    symbol: "600900",
    name: "长江电力",
    price: 28.45,
    change: -0.12,
    changePercent: -0.42,
    volume: 12340000,
    marketCap: "6780.2亿",
    sector: "电力",
  },
  {
    symbol: "601088",
    name: "中国神华",
    price: 42.30,
    change: 0.85,
    changePercent: 2.05,
    volume: 8900000,
    marketCap: "8403.1亿",
    sector: "煤炭",
  },
  {
    symbol: "000858",
    name: "五粮液",
    price: 148.60,
    change: -2.30,
    changePercent: -1.52,
    volume: 5670000,
    marketCap: "5768.3亿",
    sector: "白酒",
  },
  {
    symbol: "300750",
    name: "宁德时代",
    price: 205.40,
    change: 3.20,
    changePercent: 1.58,
    volume: 12340000,
    marketCap: "9032.5亿",
    sector: "电池",
  },
  {
    symbol: "688981",
    name: "中芯国际",
    price: 52.80,
    change: 1.15,
    changePercent: 2.23,
    volume: 3456000,
    marketCap: "4198.7亿",
    sector: "半导体",
  },
  {
    symbol: "002475",
    name: "立讯精密",
    price: 35.20,
    change: -0.45,
    changePercent: -1.26,
    volume: 7890000,
    marketCap: "2510.4亿",
    sector: "消费电子",
  },
  {
    symbol: "600519",
    name: "贵州茅台",
    price: 1680.00,
    change: 12.00,
    changePercent: 0.72,
    volume: 2100000,
    marketCap: "21105.6亿",
    sector: "白酒",
  },
]

// ============================================================
// 记账演示数据
// ============================================================
export const demoAccountingRecords: AccountingRecord[] = [
  { id: "ACC-001", type: "income", amount: 35000, category: "工资", description: "6月工资", date: "2026-06-01", account: "工资卡" },
  { id: "ACC-002", type: "expense", amount: 4500, category: "房租", description: "6月房租", date: "2026-06-01", account: "工资卡" },
  { id: "ACC-003", type: "expense", amount: 128.50, category: "餐饮", description: "超市购物", date: "2026-06-02", account: "信用卡" },
  { id: "ACC-004", type: "expense", amount: 89.90, category: "交通", description: "地铁月卡续费", date: "2026-06-03", account: "支付宝" },
  { id: "ACC-005", type: "expense", amount: 299.00, category: "购物", description: "蓝牙耳机", date: "2026-06-05", account: "信用卡" },
  { id: "ACC-006", type: "income", amount: 2000, category: "兼职", description: "技术咨询费", date: "2026-06-06", account: "支付宝" },
  { id: "ACC-007", type: "expense", amount: 56.00, category: "餐饮", description: "外卖午餐", date: "2026-06-07", account: "微信" },
  { id: "ACC-008", type: "expense", amount: 199.00, category: "娱乐", description: "Steam 游戏", date: "2026-06-08", account: "信用卡" },
  { id: "ACC-009", type: "expense", amount: 350.00, category: "餐饮", description: "朋友聚餐", date: "2026-06-09", account: "微信" },
  { id: "ACC-010", type: "income", amount: 500, category: "理财", description: "基金分红", date: "2026-06-10", account: "理财账户" },
]

// ============================================================
// 运动演示数据
// ============================================================
export const demoSportRecords: SportRecord[] = [
  { id: "SPT-001", type: "跑步", duration: 30, calories: 320, distance: 5.2, date: "2026-06-10", notes: "晨跑，配速5:46" },
  { id: "SPT-002", type: "力量训练", duration: 60, calories: 450, distance: 0, date: "2026-06-09", notes: "背部+二头肌" },
  { id: "SPT-003", type: "跑步", duration: 40, calories: 420, distance: 6.8, date: "2026-06-08", notes: "间歇跑，心率区间2-4" },
  { id: "SPT-004", type: "游泳", duration: 45, calories: 380, distance: 1.5, date: "2026-06-07", notes: "自由泳+蛙泳交替" },
  { id: "SPT-005", type: "力量训练", duration: 55, calories: 400, distance: 0, date: "2026-06-06", notes: "胸部+三头肌" },
  { id: "SPT-006", type: "骑行", duration: 90, calories: 680, distance: 25.0, date: "2026-06-05", notes: "周末郊外骑行" },
  { id: "SPT-007", type: "瑜伽", duration: 60, calories: 200, distance: 0, date: "2026-06-04", notes: "流瑜伽，放松恢复" },
  { id: "SPT-008", type: "力量训练", duration: 60, calories: 430, distance: 0, date: "2026-06-03", notes: "腿部训练日" },
]

// ============================================================
// 日志演示数据
// ============================================================
export const demoLogs: LogEntry[] = [
  { id: "LOG-001", level: "info", module: "系统", message: "应用启动完成，版本 v0.1.0-alpha", timestamp: "2026-06-10T13:15:00" },
  { id: "LOG-002", level: "info", module: "数据库", message: "SQLite 数据库连接成功，路径: ~/easywork/data.db", timestamp: "2026-06-10T13:15:01" },
  { id: "LOG-003", level: "info", module: "路由", message: "TanStack Router 初始化完成，已注册 10 个模块路由", timestamp: "2026-06-10T13:15:02" },
  { id: "LOG-004", level: "info", module: "主题", message: "当前主题模式: system（自动跟随系统）", timestamp: "2026-06-10T13:15:03" },
  { id: "LOG-005", level: "warning", module: "邮箱", message: "IMAP 连接未配置，邮箱模块暂不可用", timestamp: "2026-06-10T13:15:04" },
  { id: "LOG-006", level: "info", module: "股票", message: "股票数据缓存已过期，下次打开模块时将刷新", timestamp: "2026-06-10T13:15:05" },
  { id: "LOG-007", level: "debug", module: "看板", message: "加载演示数据: 12 个任务卡片", timestamp: "2026-06-10T13:15:06" },
  { id: "LOG-008", level: "error", module: "同步", message: "云同步失败: 网络连接不可用，将使用本地数据", timestamp: "2026-06-10T13:15:07" },
  { id: "LOG-009", level: "info", module: "记账", message: "月初自动生成预算报告: 6月可用余额 ¥24,877.60", timestamp: "2026-06-10T13:15:08" },
  { id: "LOG-010", level: "info", module: "系统", message: "所有模块演示数据加载完毕，Ready!", timestamp: "2026-06-10T13:15:09" },
]

// ============================================================
// 仪表盘统计
// ============================================================
export const demoDashboardStats: DashboardStats = {
  tasksCompleted: 4,
  tasksTotal: 12,
  calendarEvents: 8,
  unreadEmails: 3,
  weeklyFocus: 32.5,
  monthlyIncome: 37500,
  monthlyExpense: 5622.40,
  sportMinutes: 440,
}

// ============================================================
// 图表数据
// ============================================================
export const demoWeeklyFocusData = [
  { day: "周一", hours: 6.5 },
  { day: "周二", hours: 7.2 },
  { day: "周三", hours: 5.8 },
  { day: "周四", hours: 8.0 },
  { day: "周五", hours: 5.0 },
  { day: "周六", hours: 0 },
  { day: "周日", hours: 0 },
]

export const demoMonthlyExpenseData = [
  { category: "房租", amount: 4500, color: "#3b82f6" },
  { category: "餐饮", amount: 2500, color: "#10b981" },
  { category: "交通", amount: 400, color: "#f59e0b" },
  { category: "购物", amount: 1200, color: "#8b5cf6" },
  { category: "娱乐", amount: 600, color: "#ec4899" },
  { category: "其他", amount: 300, color: "#6b7280" },
]
