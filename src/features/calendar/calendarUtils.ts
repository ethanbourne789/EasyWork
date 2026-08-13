/**
 * 日历模块的纯函数工具：日期网格生成 + 按天聚合。
 *
 * 时区约定：数据库中的 start_at / due_date 为 timestamptz（UTC 存储），
 * 视图一律按「用户本地时区」分桶。因此禁止用 `iso.substring(0, 10)` 这种
 * 截字符串的写法 —— 那取的是 UTC 日期，在 UTC+8 下会把当地次日凌晨的日程
 * 错误地画到前一天。统一走 toDateKey(new Date(iso))。
 */

import type { CalendarEvent, Task, Transaction } from '@/types';
import { sumMoney } from '@/lib/money';

/** 本地时区下的 YYYY-MM-DD */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD → 当地 0 点的 Date */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/** 周一为一周起点（中文习惯） */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=周日
  return addDays(d, day === 0 ? -6 : 1 - day);
}

/** 某天所在周的 7 天 */
export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * 月视图网格：从「包含当月 1 号的那一周的周一」开始，输出整周数（35 或 42 天），
 * 保证网格完整且不会出现半行。
 */
export function getMonthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(first);
  const gridEnd = startOfWeek(last);
  // gridStart 到 gridEnd 之间的整周数（+1 是把最后一周本身算上）
  const weeks = Math.round((gridEnd.getTime() - gridStart.getTime()) / (7 * 86400000)) + 1;
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 事件跨越的所有本地日期 key。
 *
 * 全天事件：start_at ~ end_at 已按「含首含尾」存储，直接逐日展开。
 * 定时事件：若结束时间恰为次日 0 点（例如 22:00 → 次日 00:00），
 *          不应把次日也点亮，故回退一天。
 */
export function getEventDateKeys(event: CalendarEvent): string[] {
  const start = new Date(event.start_at);
  let end = new Date(event.end_at);
  if (Number.isNaN(start.getTime())) return [];
  if (Number.isNaN(end.getTime()) || end < start) end = start;

  if (!event.all_day) {
    const endsAtMidnight =
      end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
    if (endsAtMidnight && end.getTime() > start.getTime()) {
      end = new Date(end.getTime() - 1);
    }
  }

  const keys: string[] = [];
  let cursor = startOfDay(start);
  const lastKey = toDateKey(end);
  // 上限 366 天，防御脏数据（如误存 9999 年结束时间）导致的死循环
  for (let i = 0; i < 366; i++) {
    const key = toDateKey(cursor);
    keys.push(key);
    if (key === lastKey) break;
    cursor = addDays(cursor, 1);
  }
  return keys;
}

/** 事件时间展示：全天 →「全天」；同日 → 「09:00 - 10:30」；跨日 → 带月日 */
export function formatEventTime(event: CalendarEvent): string {
  if (event.all_day) return '全天';
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const hm = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (isSameDay(start, end)) return `${hm(start)} - ${hm(end)}`;
  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md(start)} ${hm(start)} - ${md(end)} ${hm(end)}`;
}

/** 仅开始时刻，用于紧凑的月视图 chip */
export function formatEventStartTime(event: CalendarEvent): string {
  if (event.all_day) return '';
  const d = new Date(event.start_at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 某天的聚合结果 */
export interface DayBucket {
  events: CalendarEvent[];
  tasks: Task[];
  income: number;
  expense: number;
  /** 未完成任务数（todo + in_progress），用于角标 */
  openTaskCount: number;
  doneTaskCount: number;
}

export function emptyBucket(): DayBucket {
  return { events: [], tasks: [], income: 0, expense: 0, openTaskCount: 0, doneTaskCount: 0 };
}

/**
 * 把日程、任务、收支聚合成 dateKey → DayBucket 的索引。
 * 一次遍历建索引，视图侧 O(1) 取用，避免每个格子都 filter 全量数组。
 */
export function buildDayMap(input: {
  events: CalendarEvent[];
  tasks: Task[];
  transactions: Transaction[];
}): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  const bucket = (key: string): DayBucket => {
    let b = map.get(key);
    if (!b) {
      b = emptyBucket();
      map.set(key, b);
    }
    return b;
  };

  for (const event of input.events) {
    for (const key of getEventDateKeys(event)) {
      bucket(key).events.push(event);
    }
  }

  for (const task of input.tasks) {
    if (!task.due_date) continue;
    const due = new Date(task.due_date);
    if (Number.isNaN(due.getTime())) continue;
    const b = bucket(toDateKey(due));
    b.tasks.push(task);
    if (task.status === 'done') b.doneTaskCount++;
    else if (task.status !== 'cancelled') b.openTaskCount++;
  }

  // 交易按「分」累加，规避浮点漂移（与记账模块口径一致）
  const incomeCents = new Map<string, number>();
  const expenseCents = new Map<string, number>();
  for (const t of input.transactions) {
    if (!t.date) continue;
    const key = t.date.slice(0, 10); // date 列本身即本地纯日期，无时区歧义
    if (t.type === 'income') {
      incomeCents.set(key, (incomeCents.get(key) ?? 0) + Math.round(t.amount * 100));
    } else if (t.type === 'expense') {
      expenseCents.set(key, (expenseCents.get(key) ?? 0) + Math.round(t.amount * 100));
    }
    // transfer 不计入收支
  }
  for (const [key, cents] of incomeCents) bucket(key).income = cents / 100;
  for (const [key, cents] of expenseCents) bucket(key).expense = cents / 100;

  // 同一天内：全天事件优先，其余按开始时间升序，保证视觉稳定
  for (const b of map.values()) {
    b.events.sort((a, c) => {
      if (a.all_day !== c.all_day) return a.all_day ? -1 : 1;
      return new Date(a.start_at).getTime() - new Date(c.start_at).getTime();
    });
  }

  return map;
}

/** 区间内的收支合计（用于周/月汇总条） */
export function sumRange(
  map: Map<string, DayBucket>,
  days: Date[],
): { income: number; expense: number; eventCount: number; taskCount: number } {
  const incomes: number[] = [];
  const expenses: number[] = [];
  let eventCount = 0;
  let taskCount = 0;
  for (const day of days) {
    const b = map.get(toDateKey(day));
    if (!b) continue;
    if (b.income) incomes.push(b.income);
    if (b.expense) expenses.push(b.expense);
    eventCount += b.events.length;
    taskCount += b.tasks.length;
  }
  return {
    income: sumMoney(incomes),
    expense: sumMoney(expenses),
    eventCount,
    taskCount,
  };
}

/** <input type="datetime-local"> 需要本地时间字符串，不能直接用 toISOString（那是 UTC） */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
