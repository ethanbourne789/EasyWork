import { describe, it, expect } from "vitest";
import {
  formatDateLocal,
  formatDateChinese,
  formatMonthChinese,
  formatTime,
  formatDateTime,
  formatIsoDate,
  formatIsoDateChinese,
  formatRelativeDate,
} from "@/lib/dateUtils";

describe("dateUtils 日期格式化工具", () => {
  describe("formatDateLocal", () => {
    it("格式化为 YYYY-MM-DD 本地日期字符串", () => {
      const d = new Date(2026, 7, 12);
      expect(formatDateLocal(d)).toBe("2026-08-12");
    });

    it("月份和日期补零", () => {
      const d = new Date(2026, 0, 5);
      expect(formatDateLocal(d)).toBe("2026-01-05");
    });

    it("月份为 12 月不补零错误", () => {
      const d = new Date(2026, 11, 25);
      expect(formatDateLocal(d)).toBe("2026-12-25");
    });
  });

  describe("formatDateChinese", () => {
    it("格式化为中文日期", () => {
      const d = new Date(2026, 7, 12);
      const result = formatDateChinese(d);
      expect(result).toBe("2026年8月12日");
    });

    it("单月单日不补零", () => {
      const d = new Date(2026, 0, 1);
      const result = formatDateChinese(d);
      expect(result).toBe("2026年1月1日");
    });
  });

  describe("formatMonthChinese", () => {
    it("格式化为中文月份", () => {
      const d = new Date(2026, 7, 15);
      expect(formatMonthChinese(d)).toBe("2026年8月");
    });

    it("1 月格式正确", () => {
      const d = new Date(2026, 0, 1);
      expect(formatMonthChinese(d)).toBe("2026年1月");
    });
  });

  describe("formatTime", () => {
    it("格式化为 HH:MM", () => {
      const d = new Date(2026, 7, 12, 9, 30);
      expect(formatTime(d)).toBe("09:30");
    });

    it("小时和分钟补零", () => {
      const d = new Date(2026, 7, 12, 0, 5);
      expect(formatTime(d)).toBe("00:05");
    });

    it("午夜时间", () => {
      const d = new Date(2026, 7, 12, 0, 0);
      expect(formatTime(d)).toBe("00:00");
    });
  });

  describe("formatDateTime", () => {
    it("格式化为完整日期时间", () => {
      const d = new Date(2026, 7, 12, 9, 30);
      expect(formatDateTime(d)).toBe("2026年8月12日 09:30");
    });

    it("时间部分补零", () => {
      const d = new Date(2026, 7, 12, 0, 5);
      expect(formatDateTime(d)).toBe("2026年8月12日 00:05");
    });
  });

  describe("formatIsoDate", () => {
    it("从 ISO 字符串解析并格式化", () => {
      expect(formatIsoDate("2026-08-12T09:30:00Z")).toBe("2026-08-12");
    });

    it("自定义格式字符串", () => {
      const result = formatIsoDate("2026-08-12T09:30:00Z", "yyyy/MM/dd");
      expect(result).toBe("2026/08/12");
    });

    it("非法 ISO 字符串原样返回", () => {
      expect(formatIsoDate("not-a-date")).toBe("not-a-date");
    });

    it("空字符串原样返回", () => {
      expect(formatIsoDate("")).toBe("");
    });
  });

  describe("formatIsoDateChinese", () => {
    it("从 ISO 字符串格式化为中文日期", () => {
      const result = formatIsoDateChinese("2026-08-12T09:30:00Z");
      expect(result).toBe("2026年8月12日");
    });

    it("非法 ISO 字符串原样返回", () => {
      expect(formatIsoDateChinese("invalid")).toBe("invalid");
    });
  });

  describe("formatRelativeDate", () => {
    it("今天返回「今天」", () => {
      const today = new Date();
      expect(formatRelativeDate(today)).toBe("今天");
    });

    it("明天返回「明天」", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(formatRelativeDate(tomorrow)).toBe("明天");
    });

    it("昨天返回「昨天」", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatRelativeDate(yesterday)).toBe("昨天");
    });

    it("3 天后返回「3天后」", () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);
      expect(formatRelativeDate(future)).toBe("3天后");
    });

    it("5 天前返回「5天前」", () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      expect(formatRelativeDate(past)).toBe("5天前");
    });

    it("7 天后仍显示「7天后」", () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      expect(formatRelativeDate(future)).toBe("7天后");
    });

    it("8 天后显示具体日期", () => {
      const future = new Date();
      future.setDate(future.getDate() + 8);
      const result = formatRelativeDate(future);
      expect(result).toMatch(/\d{4}年\d+月\d+日/);
      expect(result).not.toContain("天后");
    });

    it("8 天前显示具体日期", () => {
      const past = new Date();
      past.setDate(past.getDate() - 8);
      const result = formatRelativeDate(past);
      expect(result).toMatch(/\d{4}年\d+月\d+日/);
      expect(result).not.toContain("天前");
    });

    it("不同时间但同一天仍算「今天」", () => {
      const now = new Date();
      const differentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
      expect(formatRelativeDate(differentHour)).toBe("今天");
    });
  });
});
