import type { RecurrenceRule, TiptapJSON } from "@/types";
import { taskApi } from "@/features/tasks/taskApi";
import { notesApi } from "@/features/notes/notesApi";
import { financeApi } from "@/features/finance/financeApi";
import { calendarApi } from "@/features/calendar/calendarApi";
import { systemApi } from "@/lib/systemApi";

/**
 * 演示数据播种。
 *
 * 机制：每次「以演示账号进入」或演示会话重新打开时调用——
 * 先清空全部业务表，再用相对 `now()` 的日期重新生成，
 * 因此演示数据永远是「近 1 个月」、每次打开都是最新。
 *
 * 覆盖：任务（标签/子任务/周期/优先级/逾期与即将到期）、
 * 笔记（多级文件夹/笔记标签/置顶）、记账（多账户/多级分类/收入支出转账/预算）、
 * 日历（过去与未来事件/提醒/订阅）。
 */

// ---------------------------------------------------------------------------
// 日期工具：全部相对本地"今天"，保证数据常新
// ---------------------------------------------------------------------------
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/** 返回相对今天 ±days 天的 YYYY-MM-DD（本地）。 */
function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}
/** 返回相对今天 ±days 天、指定本地时刻的 ISO 时间戳。 */
function datetimeOffset(days: number, hour: number, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}
/** 当前年月整数 YYYYMM（预算用）。 */
function yearMonthNow(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

// ---------------------------------------------------------------------------
// Tiptap 笔记内容构造助手
// ---------------------------------------------------------------------------
const doc = (...content: TiptapJSON[]): TiptapJSON => ({ type: "doc", content });
const h = (text: string, level = 2): TiptapJSON => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const p = (text: string): TiptapJSON => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const pBold = (text: string, bold: string): TiptapJSON => ({
  type: "paragraph",
  content: [
    { type: "text", text },
    { type: "text", marks: [{ type: "bold" }], text: bold },
  ],
});
const bullet = (items: string[]): TiptapJSON => ({
  type: "bulletList",
  content: items.map((i) => ({
    type: "listItem",
    content: [p(i)],
  })),
});
const code = (text: string): TiptapJSON => ({
  type: "codeBlock",
  content: [{ type: "text", text }],
});
const quote = (text: string): TiptapJSON => ({
  type: "blockquote",
  content: [p(text)],
});

export async function seedDemoData(): Promise<void> {
  // 清场：清空全部业务表，随后重新播种
  await systemApi.clearAllData();

  // =========================================================================
  // 1) 任务模块
  // =========================================================================
  const tagWork = await taskApi.createTag({ name: "工作", color: "#6366f1" });
  const tagLife = await taskApi.createTag({ name: "生活", color: "#22c55e" });
  const tagUrgent = await taskApi.createTag({ name: "紧急", color: "#ef4444" });
  const tagStudy = await taskApi.createTag({ name: "学习", color: "#8b5cf6" });

  const tPlanning = await taskApi.createTask({
    title: "完成 Q3 产品规划文档",
    description: "梳理下季度目标、关键功能与排期，周五前提交评审。",
    status: "in_progress",
    priority: "high",
    due_date: dateOffset(2),
    tag_ids: [tagWork.id],
  });
  await taskApi.createSubtask({ task_id: tPlanning.id, title: "调研竞品" });
  await taskApi.createSubtask({ task_id: tPlanning.id, title: "整理需求清单" });

  const weeklyRule: RecurrenceRule = { frequency: "weekly", interval: 1 };
  await taskApi.createTask({
    title: "周报撰写",
    description: "汇总本周进展与下周计划，每周五下午提交。",
    status: "todo",
    priority: "medium",
    due_date: dateOffset(5),
    recurrence_rule: weeklyRule,
    tag_ids: [tagWork.id],
  });

  await taskApi.createTask({
    title: "健身打卡",
    description: "每周三次力量训练，保持节奏。",
    status: "todo",
    priority: "low",
    due_date: dateOffset(1),
    recurrence_rule: weeklyRule,
    tag_ids: [tagLife.id],
  });

  await taskApi.createTask({
    title: "审阅设计稿",
    description: "新版仪表盘视觉稿，重点确认配色与间距规范。",
    status: "todo",
    priority: "urgent",
    due_date: dateOffset(-1), // 已逾期，演示逾期态
    tag_ids: [tagWork.id, tagUrgent.id],
  });

  await taskApi.createTask({
    title: "阅读《深入理解计算机系统》第 3 章",
    description: "程序的机器级表示，配合课后习题。",
    status: "in_progress",
    priority: "medium",
    due_date: dateOffset(7),
    tag_ids: [tagStudy.id],
  });

  await taskApi.createTask({
    title: "整理本月账单",
    description: "导出记账数据，核对信用卡账单。",
    status: "todo",
    priority: "medium",
    due_date: dateOffset(3),
    tag_ids: [tagLife.id],
  });

  await taskApi.createTask({
    title: "给客户回邮件",
    description: "已发送报价方案，等待确认。",
    status: "done",
    priority: "high",
    due_date: dateOffset(-3),
    tag_ids: [tagWork.id],
  });

  await taskApi.createTask({
    title: "预订机票",
    status: "cancelled",
    priority: "medium",
    due_date: dateOffset(-5),
  });

  await taskApi.createTask({
    title: "团队周会",
    status: "done",
    priority: "medium",
    due_date: dateOffset(-2),
    tag_ids: [tagWork.id],
  });

  const tSlide = await taskApi.createTask({
    title: "准备产品演示文稿",
    description: "面向客户的功能演示，突出核心场景。",
    status: "todo",
    priority: "urgent",
    due_date: dateOffset(4),
    tag_ids: [tagWork.id, tagUrgent.id],
  });
  await taskApi.createSubtask({ task_id: tSlide.id, title: "收集演示素材" });
  await taskApi.createSubtask({ task_id: tSlide.id, title: "撰写大纲" });
  const slideDone = await taskApi.createSubtask({ task_id: tSlide.id, title: "制作幻灯片" });
  await taskApi.updateSubtask({ id: slideDone.id, task_id: tSlide.id, done: true });

  // =========================================================================
  // 2) 笔记模块（多级文件夹 + 笔记标签 + 置顶）
  // =========================================================================
  const folderWork = await notesApi.createFolder({ name: "工作", sort_order: 1 });
  const folderLife = await notesApi.createFolder({ name: "生活", sort_order: 2 });
  const folderReading = await notesApi.createFolder({ name: "读书", parent_id: folderLife.id, sort_order: 1 });

  const noteTagImportant = await notesApi.createTag({ name: "重要", color: "#ef4444" });
  const noteTagTodo = await notesApi.createTag({ name: "待办", color: "#3b82f6" });
  const noteTagIdea = await notesApi.createTag({ name: "灵感", color: "#f59e0b" });

  const nMeeting = await notesApi.createNote({
    title: "产品会议纪要",
    folder_id: folderWork.id,
    is_pinned: true,
    content_text: "本周评审结论：优先打磨仪表盘与记账体验，演示账号进入功能排期下迭代。",
    content: doc(
      h("产品会议纪要"),
      pBold("时间：", "本周三 14:00"),
      pBold("参与：", "产品、设计、前端"),
      bullet([
        "优先打磨仪表盘与记账体验",
        "「以演示账号进入」功能排期下迭代",
        "回收用户反馈，补充空状态引导",
      ]),
      quote("演示数据要能体现软件的全部能力，而非寥寥几条。"),
    ),
  });
  await notesApi.setNoteTags({ note_id: nMeeting.id, tag_ids: [noteTagImportant.id] });

  const nWeekPlan = await notesApi.createNote({
    title: "本周计划",
    folder_id: folderWork.id,
    content_text: "1. 完成 Q3 规划 2. 周报 3. 准备演示文稿 4. 阅读 CSAPP 第3章",
    content: doc(
      h("本周计划", 2),
      bullet([
        "完成 Q3 产品规划文档",
        "撰写周报",
        "准备产品演示文稿",
        "阅读《深入理解计算机系统》第 3 章",
      ]),
    ),
  });
  await notesApi.setNoteTags({ note_id: nWeekPlan.id, tag_ids: [noteTagTodo.id] });

  const nReading = await notesApi.createNote({
    title: "读书笔记：《深入理解计算机系统》",
    folder_id: folderReading.id,
    content_text: "信息的表示：无符号与补码、整数运算的溢出、浮点数的 IEEE 754 表示。",
    content: doc(
      h("第 3 章 · 程序的机器级表示", 2),
      p("关键概念："),
      bullet([
        "无符号与补码（two's complement）的编码方式",
        "整数运算的溢出与截断",
        "浮点数的 IEEE 754 表示与舍入",
      ]),
      code("int x = 0xFFFFFFFF;  // 作为补码解释为 -1\nfloat f = 1.0 / 3.0; // 近似表示"),
      quote("理解底层，才能写出更可靠的代码。"),
    ),
  });
  await notesApi.setNoteTags({ note_id: nReading.id, tag_ids: [noteTagIdea.id] });

  await notesApi.createNote({
    title: "旅行清单",
    folder_id: folderLife.id,
    content_text: "证件、充电器、常用药品、相机、离线地图。",
    content: doc(
      h("出行准备", 2),
      bullet(["身份证 / 护照", "充电器与移动电源", "常用药品", "相机与存储卡", "离线地图"]),
    ),
  });

  const nIdea = await notesApi.createNote({
    title: "灵感收集",
    folder_id: folderLife.id,
    content_text: "想法：本地优先 + 演示模式，让新用户零门槛体验全部功能。",
    content: doc(
      h("灵感", 2),
      p("本地优先架构 + 一键演示，让新用户无需注册即可体验全部功能。"),
      bullet(["登录页增加「以演示账号进入」", "演示数据每次打开自动刷新", "覆盖任务/笔记/记账/日历"]),
    ),
  });
  await notesApi.setNoteTags({ note_id: nIdea.id, tag_ids: [noteTagIdea.id] });

  const nRetro = await notesApi.createNote({
    title: "项目复盘",
    folder_id: folderWork.id,
    content_text: "做得好的：本地优先落地；待改进：首屏加载与空状态引导。",
    content: doc(
      h("项目复盘", 2),
      pBold("做得好：", "local-first 数据架构顺利落地，离线可用。"),
      pBold("待改进：", "首屏加载速度、空状态引导文案。"),
      bullet(["补充骨架屏", "为空模块增加引导操作"]),
    ),
  });
  await notesApi.setNoteTags({ note_id: nRetro.id, tag_ids: [noteTagImportant.id] });

  // =========================================================================
  // 3) 记账模块（多账户 / 多级分类 / 收入支出转账 / 预算）
  // =========================================================================
  const accBank = await financeApi.createAccount({ name: "招商银行", type: "bank", initial_balance: 12800, currency: "CNY" });
  const accAlipay = await financeApi.createAccount({ name: "支付宝", type: "cash", initial_balance: 3200, currency: "CNY" });
  const accCash = await financeApi.createAccount({ name: "现金钱包", type: "cash", initial_balance: 500, currency: "CNY" });
  const accCredit = await financeApi.createAccount({ name: "信用卡", type: "credit", initial_balance: -1800, currency: "CNY" });

  const cDining = await financeApi.createCategory({ name: "餐饮", type: "expense", icon: "🍜" });
  const cBreakfast = await financeApi.createCategory({ name: "早餐", type: "expense", icon: "🥐", parent_id: cDining.id });
  const cLunch = await financeApi.createCategory({ name: "午餐", type: "expense", icon: "🍱", parent_id: cDining.id });
  const cDinner = await financeApi.createCategory({ name: "晚餐", type: "expense", icon: "🍲", parent_id: cDining.id });

  const cTransit = await financeApi.createCategory({ name: "交通", type: "expense", icon: "🚌" });
  const cMetro = await financeApi.createCategory({ name: "地铁", type: "expense", icon: "🚇", parent_id: cTransit.id });
  const cTaxi = await financeApi.createCategory({ name: "打车", type: "expense", icon: "🚕", parent_id: cTransit.id });

  const cShopping = await financeApi.createCategory({ name: "购物", type: "expense", icon: "🛍️" });
  const cCloth = await financeApi.createCategory({ name: "服饰", type: "expense", icon: "👕", parent_id: cShopping.id });
  const cDaily = await financeApi.createCategory({ name: "日用", type: "expense", icon: "🧴", parent_id: cShopping.id });

  const cHousing = await financeApi.createCategory({ name: "居住", type: "expense", icon: "🏠" });
  const cRent = await financeApi.createCategory({ name: "房租", type: "expense", icon: "💸", parent_id: cHousing.id });

  const cFun = await financeApi.createCategory({ name: "娱乐", type: "expense", icon: "🎮" });

  const cIncome = await financeApi.createCategory({ name: "收入", type: "income", icon: "💰" });
  const cSalary = await financeApi.createCategory({ name: "工资", type: "income", icon: "💼", parent_id: cIncome.id });
  const cPart = await financeApi.createCategory({ name: "兼职", type: "income", icon: "🧑‍💻", parent_id: cIncome.id });
  const cInvest = await financeApi.createCategory({ name: "理财", type: "income", icon: "📈", parent_id: cIncome.id });

  // 收入（近 1 个月）
  await financeApi.createTransaction({ type: "income", amount: 18000, account_id: accBank.id, category_id: cSalary.id, date: dateOffset(-23), note: "月度工资" });
  await financeApi.createTransaction({ type: "income", amount: 1200, account_id: accAlipay.id, category_id: cPart.id, date: dateOffset(-16), note: "周末兼职" });
  await financeApi.createTransaction({ type: "income", amount: 350, account_id: accAlipay.id, category_id: cInvest.id, date: dateOffset(-6), note: "基金分红" });

  // 支出（近 1 个月）
  await financeApi.createTransaction({ type: "expense", amount: 4500, account_id: accBank.id, category_id: cRent.id, date: dateOffset(-27), note: "房租" });
  await financeApi.createTransaction({ type: "expense", amount: 28, account_id: accCash.id, category_id: cBreakfast.id, date: dateOffset(-20), note: "早餐" });
  await financeApi.createTransaction({ type: "expense", amount: 35, account_id: accCash.id, category_id: cLunch.id, date: dateOffset(-19), note: "午餐" });
  await financeApi.createTransaction({ type: "expense", amount: 42, account_id: accCash.id, category_id: cDinner.id, date: dateOffset(-19), note: "晚餐" });
  await financeApi.createTransaction({ type: "expense", amount: 28, account_id: accCash.id, category_id: cBreakfast.id, date: dateOffset(-15), note: "早餐" });
  await financeApi.createTransaction({ type: "expense", amount: 32, account_id: accAlipay.id, category_id: cBreakfast.id, date: dateOffset(-7), note: "咖啡" });
  await financeApi.createTransaction({ type: "expense", amount: 120, account_id: accCash.id, category_id: cMetro.id, date: dateOffset(-22), note: "地铁充值" });
  await financeApi.createTransaction({ type: "expense", amount: 88, account_id: accAlipay.id, category_id: cTaxi.id, date: dateOffset(-12), note: "打车" });
  await financeApi.createTransaction({ type: "expense", amount: 260, account_id: accCash.id, category_id: cDaily.id, date: dateOffset(-10), note: "超市采购" });
  await financeApi.createTransaction({ type: "expense", amount: 399, account_id: accAlipay.id, category_id: cCloth.id, date: dateOffset(-8), note: "新衣服" });
  await financeApi.createTransaction({ type: "expense", amount: 68, account_id: accAlipay.id, category_id: cFun.id, date: dateOffset(-5), note: "游戏充值" });
  await financeApi.createTransaction({ type: "expense", amount: 150, account_id: accAlipay.id, category_id: cFun.id, date: dateOffset(-3), note: "电影" });
  await financeApi.createTransaction({ type: "expense", amount: 45, account_id: accAlipay.id, category_id: cDinner.id, date: dateOffset(-2), note: "外卖" });
  await financeApi.createTransaction({ type: "expense", amount: 36, account_id: accCash.id, category_id: cDaily.id, date: dateOffset(-4), note: "水果" });
  await financeApi.createTransaction({ type: "expense", amount: 520, account_id: accAlipay.id, category_id: cDaily.id, date: dateOffset(-1), note: "综合购物" });

  // 转账
  await financeApi.createTransaction({ type: "transfer", amount: 2000, account_id: accBank.id, to_account_id: accCredit.id, date: dateOffset(-9), note: "还信用卡" });

  // 预算（当前月）
  const ym = yearMonthNow();
  await financeApi.createBudget({ category_id: undefined, amount: 8000, year_month: ym, scope: "overall", carry_over: 0 });
  await financeApi.createBudget({ category_id: cDining.id, amount: 2000, year_month: ym, scope: "category", carry_over: 0 });
  await financeApi.createBudget({ category_id: cTransit.id, amount: 600, year_month: ym, scope: "category", carry_over: 0 });
  await financeApi.createBudget({ category_id: cShopping.id, amount: 1000, year_month: ym, scope: "category", carry_over: 0 });
  await financeApi.createBudget({ category_id: cFun.id, amount: 500, year_month: ym, scope: "category", carry_over: 0 });
  await financeApi.createBudget({ category_id: cHousing.id, amount: 4500, year_month: ym, scope: "category", carry_over: 0 });

  // =========================================================================
  // 4) 日历模块（过去 + 未来事件 / 提醒 / 订阅）
  // =========================================================================
  await calendarApi.createEvent({
    title: "团队周会",
    description: "同步本周进展与阻塞",
    location: "会议室 A",
    start_at: datetimeOffset(-9, 10, 0),
    end_at: datetimeOffset(-9, 11, 0),
    color: "#6366f1",
    source: "local",
  });
  await calendarApi.createEvent({
    title: "牙医预约",
    description: "常规复查",
    location: "口腔医院",
    start_at: datetimeOffset(-6, 15, 0),
    end_at: datetimeOffset(-6, 15, 30),
    color: "#ef4444",
    source: "local",
  });
  await calendarApi.createEvent({
    title: "项目评审",
    location: "线上会议",
    start_at: datetimeOffset(-3, 14, 0),
    end_at: datetimeOffset(-3, 15, 30),
    color: "#6366f1",
    source: "local",
  });
  await calendarApi.createEvent({
    title: "朋友聚餐",
    location: "海底捞",
    start_at: datetimeOffset(-1, 19, 0),
    end_at: datetimeOffset(-1, 21, 0),
    color: "#22c55e",
    source: "local",
  });

  await calendarApi.createEvent({
    title: "健身课",
    location: "健身房",
    start_at: datetimeOffset(1, 18, 30),
    end_at: datetimeOffset(1, 19, 30),
    color: "#22c55e",
    reminder_minutes: 60,
    source: "local",
  });
  await calendarApi.createEvent({
    title: "产品演示",
    description: "面向客户的核心功能演示",
    location: "客户会议室",
    start_at: datetimeOffset(2, 10, 0),
    end_at: datetimeOffset(2, 11, 0),
    color: "#6366f1",
    reminder_minutes: 30,
    source: "local",
  });
  await calendarApi.createEvent({
    title: "小明生日聚会",
    location: "阳光餐厅",
    start_at: datetimeOffset(4, 0, 0),
    end_at: datetimeOffset(5, 0, 0),
    all_day: true,
    color: "#ec4899",
    source: "local",
  });
  await calendarApi.createEvent({
    title: "机票行程",
    description: "前往目的地",
    location: "首都机场 T3",
    start_at: datetimeOffset(6, 8, 0),
    end_at: datetimeOffset(6, 12, 0),
    color: "#f59e0b",
    reminder_minutes: 120,
    source: "local",
  });
  await calendarApi.createEvent({
    title: "读书会",
    location: "书店",
    start_at: datetimeOffset(8, 19, 0),
    end_at: datetimeOffset(8, 20, 30),
    color: "#8b5cf6",
    source: "local",
  });
  await calendarApi.createEvent({
    title: "月度总结",
    start_at: datetimeOffset(11, 16, 0),
    end_at: datetimeOffset(11, 17, 0),
    color: "#6366f1",
    source: "local",
  });
  await calendarApi.createEvent({
    title: "周末出游",
    start_at: datetimeOffset(9, 0, 0),
    end_at: datetimeOffset(10, 0, 0),
    all_day: true,
    color: "#22c55e",
    source: "local",
  });

  // 订阅（禁用，仅用于演示订阅管理 UI，不会真正同步）
  await calendarApi.createSubscription({
    name: "工作日历",
    provider: "ics",
    url: "https://example.com/cal/work.ics",
    color: "#6366f1",
    enabled: false,
  });
}
