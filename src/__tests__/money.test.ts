import { describe, it, expect } from "vitest";
import { formatMoney, sumMoney, roundMoney } from "@/lib/money";

describe("money 工具函数", () => {
  describe("roundMoney", () => {
    it("四舍五入到 2 位小数", () => {
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(1.004)).toBe(1.0);
    });
  });

  describe("sumMoney", () => {
    it("以整数分累加避免浮点漂移", () => {
      expect(sumMoney([0.1, 0.2])).toBe(0.3);
      expect(sumMoney([1.23, 4.56, 7.89])).toBe(13.68);
    });
  });

  describe("formatMoney", () => {
    it("默认不显示正负号", () => {
      expect(formatMoney(1234.56)).toBe("¥1,234.56");
      expect(formatMoney(-1234.56)).toBe("¥1,234.56");
      expect(formatMoney(0)).toBe("¥0.00");
    });

    it("showSign=true 时显示正负号（零不显示）", () => {
      expect(formatMoney(1234.56, true)).toBe("+¥1,234.56");
      expect(formatMoney(-1234.56, true)).toBe("-¥1,234.56");
      expect(formatMoney(0, true)).toBe("¥0.00");
    });
  });
});
