import { describe, it, expect, beforeEach } from "vitest";
import {
  requestNotificationPermission,
  notify,
  notificationsSupported,
  loadNotifyPref,
} from "@/lib/notify";

describe("notify 客户端通知工具 (P2 #9 / #17)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("jsdom 无 Notification 时安全降级，不抛错", async () => {
    expect(notificationsSupported()).toBe(false);
    const perm = await requestNotificationPermission();
    expect(perm).toBe("denied");
    expect(notify("标题", "内容")).toBe(false);
  });

  it("loadNotifyPref 缺省返回安全默认值", () => {
    const pref = loadNotifyPref();
    expect(pref).toEqual({
      task_reminder: true,
      email_notify: true,
      budget_warning: false,
    });
  });

  it("loadNotifyPref 合并本地存储中的用户覆盖", () => {
    localStorage.setItem(
      "easywork:notifications",
      JSON.stringify({ task_reminder: false, email_notify: true, budget_warning: true })
    );
    expect(loadNotifyPref()).toEqual({
      task_reminder: false,
      email_notify: true,
      budget_warning: true,
    });
  });

  it("loadNotifyPref 容忍损坏的 JSON，回退默认值", () => {
    localStorage.setItem("easywork:notifications", "{not-json");
    expect(loadNotifyPref().budget_warning).toBe(false);
  });
});
