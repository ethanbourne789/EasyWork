import { describe, it, expect } from "vitest";
import { getMonday, sanitizeHtml } from "@/lib/utils";

describe("utils 工具函数", () => {
  describe("getMonday (P2 #12 以周一为一周起点)", () => {
    it("给定周五返回本周一 0 点", () => {
      // 2026-08-07 为周五
      const friday = new Date(2026, 7, 7, 15, 30);
      const mon = getMonday(friday);
      expect(mon.getDay()).toBe(1); // 周一
      expect(mon.getHours()).toBe(0);
      expect(mon.getMinutes()).toBe(0);
      expect(mon.getDate()).toBe(3); // 8/3 周一
    });

    it("给定周日回退到本周一而非下周一（符合中文习惯）", () => {
      // 2026-08-09 为周日
      const sunday = new Date(2026, 7, 9, 10, 0);
      const mon = getMonday(sunday);
      expect(mon.getDay()).toBe(1);
      expect(mon.getDate()).toBe(3);
    });

    it("给定周一本身保持为周一", () => {
      const monday = new Date(2026, 7, 3, 9, 0);
      const mon = getMonday(monday);
      expect(mon.getDay()).toBe(1);
      expect(mon.getDate()).toBe(3);
    });
  });

  describe("sanitizeHtml (XSS 防护)", () => {
    it("去除 <script> 与 on* 事件属性", () => {
      const dirty =
        '<p onclick="evil()">hi</p><script>alert(1)</script><img src=x onerror="x()">';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain("<script");
      expect(clean.toLowerCase()).not.toContain("onerror");
      expect(clean.toLowerCase()).not.toContain("onclick");
    });

    it("空字符串返回空", () => {
      expect(sanitizeHtml("")).toBe("");
    });

    it("保留安全的排版标签", () => {
      const clean = sanitizeHtml("<h2>标题</h2><p>正文</p><strong>粗</strong>");
      expect(clean).toContain("<h2>");
      expect(clean).toContain("<strong>");
    });
  });
});
