import { describe, it, expect } from "vitest";
import { computeNextOccurrence, describeRecurrence } from "@/lib/recurrence";
import type { RecurrenceRule } from "@/types";

function makeRule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    frequency: "daily",
    interval: 1,
    ...overrides,
  };
}

describe("recurrence 周期计算工具", () => {
  describe("computeNextOccurrence", () => {
    describe("daily 频率", () => {
      it("间隔 1 天返回次日 ISO", () => {
        const rule = makeRule({ frequency: "daily", interval: 1 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-13T00:00:00.000Z");
      });

      it("间隔 3 天返回 3 天后", () => {
        const rule = makeRule({ frequency: "daily", interval: 3 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-15T00:00:00.000Z");
      });

      it("跨月进位", () => {
        const rule = makeRule({ frequency: "daily", interval: 1 });
        const next = computeNextOccurrence(rule, "2026-08-31T00:00:00Z");
        expect(next).toBe("2026-09-01T00:00:00.000Z");
      });
    });

    describe("weekly 频率", () => {
      it("间隔 1 周返回 7 天后", () => {
        const rule = makeRule({ frequency: "weekly", interval: 1 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-19T00:00:00.000Z");
      });

      it("间隔 2 周返回 14 天后", () => {
        const rule = makeRule({ frequency: "weekly", interval: 2 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-26T00:00:00.000Z");
      });
    });

    describe("monthly 频率", () => {
      it("间隔 1 月返回下月同日", () => {
        const rule = makeRule({ frequency: "monthly", interval: 1 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-09-12T00:00:00.000Z");
      });

      it("间隔 3 月返回 3 个月后", () => {
        const rule = makeRule({ frequency: "monthly", interval: 3 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-11-12T00:00:00.000Z");
      });

      it("跨月边界：1 月 31 日 +1 月进位到 3 月初", () => {
        const rule = makeRule({ frequency: "monthly", interval: 1 });
        const next = computeNextOccurrence(rule, "2026-01-31T00:00:00Z");
        expect(next).not.toBe(null);
        const nextDate = new Date(next!);
        expect(nextDate.getMonth()).toBe(2);
      });
    });

    describe("end_date 限制", () => {
      it("下次超过 end_date 返回 null", () => {
        const rule = makeRule({
          frequency: "daily",
          interval: 1,
          end_date: "2026-08-13T00:00:00Z",
        });
        const next = computeNextOccurrence(rule, "2026-08-13T00:00:00Z");
        expect(next).toBe(null);
      });

      it("下次恰好在 end_date 之内仍返回", () => {
        const rule = makeRule({
          frequency: "daily",
          interval: 1,
          end_date: "2026-08-14T00:00:00Z",
        });
        const next = computeNextOccurrence(rule, "2026-08-13T00:00:00Z");
        expect(next).toBe("2026-08-14T00:00:00.000Z");
      });

      it("没有 end_date 时不受限制", () => {
        const rule = makeRule({ frequency: "daily", interval: 1 });
        const next = computeNextOccurrence(rule, "2099-12-31T00:00:00Z");
        expect(next).not.toBe(null);
      });
    });

    describe("边界条件", () => {
      it("interval 为 0 时回退到 1", () => {
        const rule = makeRule({ frequency: "daily", interval: 0 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-13T00:00:00.000Z");
      });

      it("interval 为负数时回退到 1", () => {
        const rule = makeRule({ frequency: "daily", interval: -5 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-13T00:00:00.000Z");
      });

      it("interval 缺失时默认为 1", () => {
        // interval 为必填字段，用 0 来模拟缺失（会被修正为 1）
        const rule = makeRule({ frequency: "daily", interval: 0 });
        const next = computeNextOccurrence(rule, "2026-08-12T00:00:00Z");
        expect(next).toBe("2026-08-13T00:00:00.000Z");
      });
    });
  });

  describe("describeRecurrence", () => {
    it("null 和 undefined 返回 null", () => {
      expect(describeRecurrence(null)).toBe(null);
      expect(describeRecurrence(undefined)).toBe(null);
    });

    it("每天重复", () => {
      const rule = makeRule({ frequency: "daily", interval: 1 });
      expect(describeRecurrence(rule)).toBe("每 天重复");
    });

    it("每 3 天重复", () => {
      const rule = makeRule({ frequency: "daily", interval: 3 });
      expect(describeRecurrence(rule)).toBe("每 3 天重复");
    });

    it("每周重复", () => {
      const rule = makeRule({ frequency: "weekly", interval: 1 });
      expect(describeRecurrence(rule)).toBe("每 周重复");
    });

    it("每 2 周重复", () => {
      const rule = makeRule({ frequency: "weekly", interval: 2 });
      expect(describeRecurrence(rule)).toBe("每 2 周重复");
    });

    it("每月重复", () => {
      const rule = makeRule({ frequency: "monthly", interval: 1 });
      expect(describeRecurrence(rule)).toBe("每 月重复");
    });

    it("带 end_date 显示截止日期", () => {
      const rule = makeRule({
        frequency: "daily",
        interval: 1,
        end_date: "2026-12-31T00:00:00Z",
      });
      const result = describeRecurrence(rule);
      expect(result).toContain("至 2026年12月31日");
    });

    it("end_date 为非法日期时不追加日期文本", () => {
      const rule = makeRule({
        frequency: "daily",
        interval: 1,
        end_date: "not-a-date",
      });
      const result = describeRecurrence(rule);
      expect(result).toBe("每 天重复");
    });
  });
});
