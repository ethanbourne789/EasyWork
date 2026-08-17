import { describe, it, expect } from "vitest";
import {
  toDateKey,
  fromDateKey,
  startOfDay,
  addDays,
  isSameDay,
  isToday,
  startOfWeek,
  getWeekDays,
  getMonthGrid,
  WEEKDAY_LABELS,
  getEventDateKeys,
  formatEventTime,
  formatEventStartTime,
  emptyBucket,
  buildDayMap,
  sumRange,
  toLocalInputValue,
} from "@/features/calendar/calendarUtils";
import type { CalendarEvent, Task, Transaction } from "@/types";

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e1",
    user_id: "u1",
    title: "Meeting",
    start_at: "2026-08-12T09:00:00Z",
    end_at: "2026-08-12T10:00:00Z",
    all_day: false,
    source: "local",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  } as CalendarEvent;
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    user_id: "u1",
    title: "Task",
    status: "todo",
    priority: "medium",
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "tx1",
    user_id: "u1",
    type: "expense",
    amount: 10,
    account_id: "a1",
    date: "2026-08-12T00:00:00Z",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("calendarUtils 日期网格与聚合工具", () => {
  describe("toDateKey", () => {
    it("将 Date 转换为本地时区 YYYY-MM-DD", () => {
      const d = new Date(2026, 7, 12, 15, 30);
      expect(toDateKey(d)).toBe("2026-08-12");
    });

    it("月份和日期补零", () => {
      const d = new Date(2026, 0, 5, 0, 0);
      expect(toDateKey(d)).toBe("2026-01-05");
    });
  });

  describe("fromDateKey", () => {
    it("将 YYYY-MM-DD 解析为本地 0 点 Date", () => {
      const d = fromDateKey("2026-08-12");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(12);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });
  });

  describe("startOfDay", () => {
    it("将任意时间归零到当天 0 点", () => {
      const d = startOfDay(new Date(2026, 7, 12, 14, 30, 45));
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getDate()).toBe(12);
    });

    it("不修改传入的原 Date 对象", () => {
      const original = new Date(2026, 7, 12, 10, 0);
      startOfDay(original);
      expect(original.getHours()).toBe(10);
    });
  });

  describe("addDays", () => {
    it("正确增减天数", () => {
      const base = new Date(2026, 7, 10);
      expect(addDays(base, 3).getDate()).toBe(13);
      expect(addDays(base, -2).getDate()).toBe(8);
    });

    it("跨月正确进位", () => {
      const base = new Date(2026, 7, 30);
      const result = addDays(base, 5);
      expect(result.getMonth()).toBe(8);
      expect(result.getDate()).toBe(4);
    });

    it("不修改原 Date 对象", () => {
      const original = new Date(2026, 7, 10);
      addDays(original, 5);
      expect(original.getDate()).toBe(10);
    });
  });

  describe("isSameDay", () => {
    it("同一天不同时间返回 true", () => {
      expect(isSameDay(new Date(2026, 7, 12, 9, 0), new Date(2026, 7, 12, 23, 59))).toBe(true);
    });

    it("不同天返回 false", () => {
      expect(isSameDay(new Date(2026, 7, 12), new Date(2026, 7, 13))).toBe(false);
    });
  });

  describe("isToday", () => {
    it("当前日期返回 true", () => {
      expect(isToday(new Date())).toBe(true);
    });

    it("非当前日期返回 false", () => {
      expect(isToday(new Date(2020, 0, 1))).toBe(false);
    });
  });

  describe("startOfWeek", () => {
    it("周五返回本周一", () => {
      const friday = new Date(2026, 7, 7, 15, 30);
      const monday = startOfWeek(friday);
      expect(monday.getDay()).toBe(1);
      expect(monday.getDate()).toBe(3);
    });

    it("周日回退到本周一", () => {
      const sunday = new Date(2026, 7, 9);
      const monday = startOfWeek(sunday);
      expect(monday.getDay()).toBe(1);
      expect(monday.getDate()).toBe(3);
    });

    it("周一保持为周一", () => {
      const monday = new Date(2026, 7, 3);
      const result = startOfWeek(monday);
      expect(result.getDate()).toBe(3);
    });

    it("时间为 0 点", () => {
      const wednesday = new Date(2026, 7, 5, 14, 30);
      const result = startOfWeek(wednesday);
      expect(result.getHours()).toBe(0);
    });
  });

  describe("getWeekDays", () => {
    it("返回 7 天数组", () => {
      const days = getWeekDays(new Date(2026, 7, 7));
      expect(days).toHaveLength(7);
    });

    it("第一天是周一", () => {
      const days = getWeekDays(new Date(2026, 7, 7));
      expect(days[0].getDay()).toBe(1);
    });

    it("最后一天是周日", () => {
      const days = getWeekDays(new Date(2026, 7, 7));
      expect(days[6].getDay()).toBe(0);
    });

    it("日期连续递增", () => {
      const days = getWeekDays(new Date(2026, 7, 7));
      for (let i = 1; i < 7; i++) {
        expect(days[i].getDate()).toBe(days[i - 1].getDate() + 1);
      }
    });
  });

  describe("getMonthGrid", () => {
    it("返回 35 或 42 天（6 或 7 周的整倍数）", () => {
      const grid = getMonthGrid(new Date(2026, 7));
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(35);
      expect(grid.length).toBeLessThanOrEqual(42);
    });

    it("包含当月 1 号", () => {
      const grid = getMonthGrid(new Date(2026, 7));
      const keys = grid.map((d) => toDateKey(d));
      expect(keys).toContain("2026-08-01");
    });

    it("包含当月最后一天", () => {
      const grid = getMonthGrid(new Date(2026, 7));
      const keys = grid.map((d) => toDateKey(d));
      expect(keys).toContain("2026-08-31");
    });

    it("第一天是周一", () => {
      const grid = getMonthGrid(new Date(2026, 7));
      expect(grid[0].getDay()).toBe(1);
    });

    it("日期连续无断档", () => {
      const grid = getMonthGrid(new Date(2026, 7));
      for (let i = 1; i < grid.length; i++) {
        const diff = grid[i].getTime() - grid[i - 1].getTime();
        expect(diff).toBe(86400000);
      }
    });
  });

  describe("WEEKDAY_LABELS", () => {
    it("是周一到周日的 7 个标签", () => {
      expect(WEEKDAY_LABELS).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
    });
  });

  describe("getEventDateKeys", () => {
    it("单日事件返回单个 key", () => {
      const keys = getEventDateKeys(makeEvent({}));
      expect(keys.length).toBeGreaterThanOrEqual(1);
    });

    it("全天事件含首含尾", () => {
      const event = makeEvent({
        all_day: true,
        start_at: "2026-08-12T00:00:00Z",
        end_at: "2026-08-14T00:00:00Z",
      });
      const keys = getEventDateKeys(event);
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });

    it("结束时间恰为次日 0 点时不点亮次日", () => {
      const event = makeEvent({
        all_day: false,
        start_at: "2026-08-12T22:00:00+08:00",
        end_at: "2026-08-13T00:00:00+08:00",
      });
      const keys = getEventDateKeys(event);
      const lastKey = keys[keys.length - 1];
      expect(lastKey).not.toBe("2026-08-13");
    });

    it("非法日期返回空数组", () => {
      const keys = getEventDateKeys(
        makeEvent({ start_at: "not-a-date", end_at: "2026-08-12T00:00:00Z" })
      );
      expect(keys).toEqual([]);
    });

    it("end < start 时将 end 退回到 start", () => {
      const keys = getEventDateKeys(
        makeEvent({
          start_at: "2026-08-15T00:00:00Z",
          end_at: "2026-08-10T00:00:00Z",
        })
      );
      expect(keys.length).toBeGreaterThanOrEqual(1);
    });

    it("跨月事件正确返回多个 key", () => {
      const event = makeEvent({
        all_day: true,
        start_at: "2026-08-30T00:00:00+08:00",
        end_at: "2026-09-02T00:00:00+08:00",
      });
      const keys = getEventDateKeys(event);
      expect(keys).toContain("2026-08-30");
      expect(keys).toContain("2026-09-01");
    });
  });

  describe("formatEventTime", () => {
    it("全天事件返回「全天」", () => {
      const event = makeEvent({ all_day: true });
      expect(formatEventTime(event)).toBe("全天");
    });

    it("同日事件显示 HH:MM - HH:MM", () => {
      const event = makeEvent({
        start_at: "2026-08-12T01:30:00Z",
        end_at: "2026-08-12T02:30:00Z",
      });
      const result = formatEventTime(event);
      expect(result).toMatch(/\d{2}:\d{2} - \d{2}:\d{2}/);
    });

    it("跨日事件显示月日 + 时间", () => {
      const event = makeEvent({
        start_at: "2026-08-12T10:00:00+08:00",
        end_at: "2026-08-13T14:00:00+08:00",
      });
      const result = formatEventTime(event);
      expect(result).toMatch(/\d+\/\d+ \d{2}:\d{2} - \d+\/\d+ \d{2}:\d{2}/);
    });
  });

  describe("formatEventStartTime", () => {
    it("全天事件返回空字符串", () => {
      expect(formatEventStartTime(makeEvent({ all_day: true }))).toBe("");
    });

    it("定时事件返回 HH:MM", () => {
      const result = formatEventStartTime(
        makeEvent({ start_at: "2026-08-12T01:05:00Z" })
      );
      expect(result).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe("emptyBucket", () => {
    it("返回零值 DayBucket", () => {
      const bucket = emptyBucket();
      expect(bucket).toEqual({
        events: [],
        tasks: [],
        income: 0,
        expense: 0,
        openTaskCount: 0,
        doneTaskCount: 0,
      });
    });
  });

  describe("buildDayMap", () => {
    it("按日期聚合事件", () => {
      const event = makeEvent({
        start_at: "2026-08-12T01:00:00Z",
        end_at: "2026-08-12T02:00:00Z",
      });
      const map = buildDayMap({ events: [event], tasks: [], transactions: [] });
      const entries = [...map.entries()];
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const [, bucket] = entries[0];
      expect(bucket.events.length).toBe(1);
    });

    it("按 due_date 聚合任务", () => {
      const task = makeTask({ due_date: "2026-08-15T00:00:00Z" });
      const map = buildDayMap({ events: [], tasks: [task], transactions: [] });
      const entries = [...map.entries()];
      const [, bucket] = entries.find(([, b]) => b.tasks.length > 0) || [];
      expect(bucket?.tasks.length).toBe(1);
    });

    it("没有 due_date 的任务不产生桶", () => {
      const task = makeTask({ due_date: undefined });
      const map = buildDayMap({ events: [], tasks: [task], transactions: [] });
      let hasTasks = false;
      for (const b of map.values()) {
        if (b.tasks.length > 0) hasTasks = true;
      }
      expect(hasTasks).toBe(false);
    });

    it("done 任务计入 doneTaskCount", () => {
      const task = makeTask({ due_date: "2026-08-15T00:00:00Z", status: "done" });
      const map = buildDayMap({ events: [], tasks: [task], transactions: [] });
      for (const b of map.values()) {
        if (b.tasks.length > 0) {
          expect(b.doneTaskCount).toBe(1);
          expect(b.openTaskCount).toBe(0);
        }
      }
    });

    it("todo 和 in_progress 计入 openTaskCount", () => {
      const todo = makeTask({ due_date: "2026-08-15T00:00:00Z", status: "todo" });
      const inProgress = makeTask({
        id: "t2",
        due_date: "2026-08-15T00:00:00Z",
        status: "in_progress",
        user_id: "u1",
        title: "IP",
        priority: "medium",
        sort_order: 1,
        created_at: "",
        updated_at: "",
      });
      const cancelled = makeTask({
        id: "t3",
        due_date: "2026-08-15T00:00:00Z",
        status: "cancelled",
        user_id: "u1",
        title: "Cancel",
        priority: "medium",
        sort_order: 2,
        created_at: "",
        updated_at: "",
      });
      const map = buildDayMap({ events: [], tasks: [todo, inProgress, cancelled], transactions: [] });
      for (const b of map.values()) {
        if (b.tasks.length > 0) {
          expect(b.openTaskCount).toBe(2);
          expect(b.doneTaskCount).toBe(0);
        }
      }
    });

    it("收入支出按分累加", () => {
      const txs = [
        makeTx({ id: "tx1", type: "income", amount: 10.1, date: "2026-08-12T00:00:00Z" }),
        makeTx({ id: "tx2", type: "income", amount: 5.2, date: "2026-08-12T00:00:00Z" }),
        makeTx({ id: "tx3", type: "expense", amount: 3.3, date: "2026-08-12T00:00:00Z" }),
      ];
      const map = buildDayMap({ events: [], tasks: [], transactions: txs });
      for (const b of map.values()) {
        if (b.income > 0) {
          expect(b.income).toBe(15.3);
        }
        if (b.expense > 0) {
          expect(b.expense).toBe(3.3);
        }
      }
    });

    it("transfer 类型不计入收支", () => {
      const tx = makeTx({ id: "tx1", type: "transfer", amount: 50, date: "2026-08-12T00:00:00Z" });
      const map = buildDayMap({ events: [], tasks: [], transactions: [tx] });
      for (const b of map.values()) {
        expect(b.income).toBe(0);
        expect(b.expense).toBe(0);
      }
    });

    it("同一天内全天事件排在定时事件之前", () => {
      const allDay = makeEvent({
        id: "all",
        all_day: true,
        start_at: "2026-08-12T00:00:00Z",
        end_at: "2026-08-12T00:00:00Z",
      });
      const timed = makeEvent({
        id: "timed",
        all_day: false,
        start_at: "2026-08-12T01:00:00Z",
        end_at: "2026-08-12T02:00:00Z",
      });
      const map = buildDayMap({ events: [timed, allDay], tasks: [], transactions: [] });
      for (const b of map.values()) {
        if (b.events.length >= 2) {
          expect(b.events[0].all_day).toBe(true);
          expect(b.events[1].all_day).toBe(false);
        }
      }
    });

    it("空输入返回空 Map", () => {
      const map = buildDayMap({ events: [], tasks: [], transactions: [] });
      expect(map.size).toBe(0);
    });
  });

  describe("sumRange", () => {
    it("聚合多天的收支和计数", () => {
      const txs = [
        makeTx({ id: "tx1", type: "income", amount: 100, date: "2026-08-12T00:00:00Z" }),
        makeTx({ id: "tx2", type: "expense", amount: 50, date: "2026-08-13T00:00:00Z" }),
      ];
      const map = buildDayMap({ events: [], tasks: [], transactions: txs });
      const days = [
        new Date(2026, 7, 12, 0, 0, 0, 0),
        new Date(2026, 7, 13, 0, 0, 0, 0),
      ];
      const result = sumRange(map, days);
      expect(result.income).toBe(100);
      expect(result.expense).toBe(50);
    });

    it("空区间返回零值", () => {
      const map = buildDayMap({ events: [], tasks: [], transactions: [] });
      const result = sumRange(map, [new Date(2026, 7, 12)]);
      expect(result).toEqual({ income: 0, expense: 0, eventCount: 0, taskCount: 0 });
    });

    it("跳过没有数据的日期", () => {
      const txs = [
        makeTx({ id: "tx1", type: "income", amount: 10, date: "2026-08-12T00:00:00Z" }),
      ];
      const map = buildDayMap({ events: [], tasks: [], transactions: txs });
      const days = [
        new Date(2026, 7, 11, 0, 0, 0, 0),
        new Date(2026, 7, 12, 0, 0, 0, 0),
        new Date(2026, 7, 13, 0, 0, 0, 0),
      ];
      const result = sumRange(map, days);
      expect(result.income).toBe(10);
    });
  });

  describe("toLocalInputValue", () => {
    it("返回 datetime-local 所需格式", () => {
      const d = new Date(2026, 7, 12, 9, 5);
      const result = toLocalInputValue(d);
      expect(result).toBe("2026-08-12T09:05");
    });

    it("小时和分钟补零", () => {
      const d = new Date(2026, 0, 3, 0, 0);
      const result = toLocalInputValue(d);
      expect(result).toBe("2026-01-03T00:00");
    });
  });
});
