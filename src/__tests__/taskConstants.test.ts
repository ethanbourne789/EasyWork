import { describe, it, expect } from "vitest";
import {
  priorityColors,
  priorityDotColors,
  priorityLabels,
  statusColors,
  statusLabels,
} from "@/features/tasks/taskConstants";
import type { TaskPriority, TaskStatus } from "@/types";

describe("taskConstants 任务常量", () => {
  describe("priorityColors", () => {
    it("包含所有 4 个优先级", () => {
      expect(Object.keys(priorityColors)).toEqual(["low", "medium", "high", "urgent"]);
    });

    it("每个优先级都有非空样式字符串", () => {
      for (const priority of ["low", "medium", "high", "urgent"]) {
        expect(priorityColors[priority as TaskPriority]).toBeTypeOf("string");
        expect(priorityColors[priority as TaskPriority].length).toBeGreaterThan(0);
      }
    });

    it("low 使用 muted 色调", () => {
      expect(priorityColors.low).toContain("muted");
    });

    it("medium 使用 brand 色调", () => {
      expect(priorityColors.medium).toContain("brand");
    });

    it("high 使用 warning 色调", () => {
      expect(priorityColors.high).toContain("warning");
    });

    it("urgent 使用 destructive 色调", () => {
      expect(priorityColors.urgent).toContain("destructive");
    });

    it("包含 dark 模式样式", () => {
      expect(priorityColors.medium).toContain("dark:");
      expect(priorityColors.high).toContain("dark:");
      expect(priorityColors.urgent).toContain("dark:");
    });
  });

  describe("priorityDotColors", () => {
    it("包含所有 4 个优先级", () => {
      expect(Object.keys(priorityDotColors)).toEqual(["low", "medium", "high", "urgent"]);
    });

    it("每个优先级都有非空样式字符串", () => {
      for (const priority of ["low", "medium", "high", "urgent"]) {
        expect(priorityDotColors[priority as TaskPriority]).toBeTypeOf("string");
        expect(priorityDotColors[priority as TaskPriority].length).toBeGreaterThan(0);
      }
    });

    it("low 使用 muted-foreground 降低饱和度", () => {
      expect(priorityDotColors.low).toContain("muted-foreground");
    });

    it("medium 使用 brand-500 饱和色", () => {
      expect(priorityDotColors.medium).toBe("bg-brand-500");
    });

    it("high 使用 warning 饱和色", () => {
      expect(priorityDotColors.high).toBe("bg-warning");
    });

    it("urgent 使用 destructive 饱和色", () => {
      expect(priorityDotColors.urgent).toBe("bg-destructive");
    });
  });

  describe("priorityLabels", () => {
    it("包含所有 4 个优先级", () => {
      expect(Object.keys(priorityLabels)).toEqual(["low", "medium", "high", "urgent"]);
    });

    it("中文标签正确", () => {
      expect(priorityLabels.low).toBe("低");
      expect(priorityLabels.medium).toBe("中");
      expect(priorityLabels.high).toBe("高");
      expect(priorityLabels.urgent).toBe("紧急");
    });

    it("所有标签都是非空短字符串", () => {
      for (const priority of ["low", "medium", "high", "urgent"]) {
        const label = priorityLabels[priority as TaskPriority];
        expect(label.length).toBeGreaterThanOrEqual(1);
        expect(label.length).toBeLessThanOrEqual(4);
      }
    });
  });

  describe("statusColors", () => {
    it("包含所有 4 个状态", () => {
      expect(Object.keys(statusColors)).toEqual(["todo", "in_progress", "done", "cancelled"]);
    });

    it("每个状态都有非空样式字符串", () => {
      for (const status of ["todo", "in_progress", "done", "cancelled"]) {
        expect(statusColors[status as TaskStatus]).toBeTypeOf("string");
        expect(statusColors[status as TaskStatus].length).toBeGreaterThan(0);
      }
    });

    it("todo 使用 muted 色调", () => {
      expect(statusColors.todo).toContain("muted");
    });

    it("in_progress 使用 brand 色调", () => {
      expect(statusColors.in_progress).toContain("brand");
    });

    it("done 使用 success 色调", () => {
      expect(statusColors.done).toContain("success");
    });

    it("cancelled 使用 muted 色调", () => {
      expect(statusColors.cancelled).toContain("muted");
    });

    it("包含 dark 模式样式", () => {
      expect(statusColors.in_progress).toContain("dark:");
      expect(statusColors.done).toContain("dark:");
      expect(statusColors.cancelled).toContain("dark:");
    });
  });

  describe("statusLabels", () => {
    it("包含所有 4 个状态", () => {
      expect(Object.keys(statusLabels)).toEqual(["todo", "in_progress", "done", "cancelled"]);
    });

    it("中文标签正确", () => {
      expect(statusLabels.todo).toBe("待办");
      expect(statusLabels.in_progress).toBe("进行中");
      expect(statusLabels.done).toBe("完成");
      expect(statusLabels.cancelled).toBe("已取消");
    });

    it("所有标签都是非空字符串", () => {
      for (const status of ["todo", "in_progress", "done", "cancelled"]) {
        expect(statusLabels[status as TaskStatus].length).toBeGreaterThan(0);
      }
    });
  });

  describe("颜色与标签一致性", () => {
    it("priorityColors 和 priorityLabels key 一致", () => {
      expect(Object.keys(priorityColors)).toEqual(Object.keys(priorityLabels));
    });

    it("priorityColors 和 priorityDotColors key 一致", () => {
      expect(Object.keys(priorityColors)).toEqual(Object.keys(priorityDotColors));
    });

    it("statusColors 和 statusLabels key 一致", () => {
      expect(Object.keys(statusColors)).toEqual(Object.keys(statusLabels));
    });
  });
});
