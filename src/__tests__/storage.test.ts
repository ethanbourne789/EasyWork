import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  STORAGE_KEYS,
  getStoredUserId,
  setStoredUserId,
  removeStoredUserId,
  getDemoFlag,
  setDemoFlag,
  removeDemoFlag,
  clearAuthSession,
  getStoredTheme,
  setStoredTheme,
  getStoredLanguage,
  setStoredLanguage,
  getNotifySettings,
  setNotifySettings,
  getDismissedNotifications,
  setDismissedNotifications,
  getBudgetWarnCooldown,
  setBudgetWarnCooldown,
  getBudgetWarnedAt,
  setBudgetWarnedAt,
} from "@/lib/storage";

describe("storage 本地持久化工具", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("STORAGE_KEYS", () => {
    it("包含所有必需的 key", () => {
      expect(STORAGE_KEYS.userId).toBe("easywork:user_id");
      expect(STORAGE_KEYS.demoMode).toBe("easywork:demo_mode");
      expect(STORAGE_KEYS.theme).toBe("easywork-theme");
      expect(STORAGE_KEYS.language).toBe("language");
      expect(STORAGE_KEYS.notifySettings).toBe("easywork:notifications");
      expect(STORAGE_KEYS.dismissedNotifications).toBe("easywork:dismissed-notifications");
      expect(STORAGE_KEYS.budgetWarnCooldown).toBe("easywork:budget-warn-cooldown");
      expect(STORAGE_KEYS.budgetWarnedAt).toBe("budget_warned_at");
    });
  });

  describe("认证存储", () => {
    it("getStoredUserId 空值时返回 null", () => {
      expect(getStoredUserId()).toBe(null);
    });

    it("setStoredUserId 和 getStoredUserId 读写一致", () => {
      setStoredUserId("user-123");
      expect(getStoredUserId()).toBe("user-123");
    });

    it("removeStoredUserId 清除用户 ID", () => {
      setStoredUserId("user-123");
      removeStoredUserId();
      expect(getStoredUserId()).toBe(null);
    });

    it("getDemoFlag 空值时返回 false", () => {
      expect(getDemoFlag()).toBe(false);
    });

    it("setDemoFlag 后返回 true", () => {
      setDemoFlag();
      expect(getDemoFlag()).toBe(true);
    });

    it("getDemoFlag 非 '1' 值返回 false", () => {
      localStorage.setItem(STORAGE_KEYS.demoMode, "0");
      expect(getDemoFlag()).toBe(false);
      localStorage.setItem(STORAGE_KEYS.demoMode, "true");
      expect(getDemoFlag()).toBe(false);
    });

    it("removeDemoFlag 清除 demo 标记", () => {
      setDemoFlag();
      removeDemoFlag();
      expect(getDemoFlag()).toBe(false);
    });

    it("clearAuthSession 同时清除用户 ID 和 demo 标记", () => {
      setStoredUserId("user-123");
      setDemoFlag();
      clearAuthSession();
      expect(getStoredUserId()).toBe(null);
      expect(getDemoFlag()).toBe(false);
    });
  });

  describe("主题存储", () => {
    it("getStoredTheme 空值时返回 null", () => {
      expect(getStoredTheme()).toBe(null);
    });

    it("setStoredTheme 和 getStoredTheme 读写 light", () => {
      setStoredTheme("light");
      expect(getStoredTheme()).toBe("light");
    });

    it("setStoredTheme 和 getStoredTheme 读写 dark", () => {
      setStoredTheme("dark");
      expect(getStoredTheme()).toBe("dark");
    });

    it("非法主题值返回 null", () => {
      localStorage.setItem(STORAGE_KEYS.theme, "system");
      expect(getStoredTheme()).toBe(null);
    });

    it("空字符串返回 null", () => {
      localStorage.setItem(STORAGE_KEYS.theme, "");
      expect(getStoredTheme()).toBe(null);
    });
  });

  describe("语言存储", () => {
    it("getStoredLanguage 空值时返回 null", () => {
      expect(getStoredLanguage()).toBe(null);
    });

    it("setStoredLanguage 和 getStoredLanguage 读写 zh-CN", () => {
      setStoredLanguage("zh-CN");
      expect(getStoredLanguage()).toBe("zh-CN");
    });

    it("setStoredLanguage 和 getStoredLanguage 读写 en-US", () => {
      setStoredLanguage("en-US");
      expect(getStoredLanguage()).toBe("en-US");
    });

    it("非法语言值返回 null", () => {
      localStorage.setItem(STORAGE_KEYS.language, "ja-JP");
      expect(getStoredLanguage()).toBe(null);
    });

    it("空字符串返回 null", () => {
      localStorage.setItem(STORAGE_KEYS.language, "");
      expect(getStoredLanguage()).toBe(null);
    });
  });

  describe("通知设置", () => {
    it("空值时返回默认设置", () => {
      const settings = getNotifySettings();
      expect(settings).toEqual({
        task_reminder: true,
        email_notify: true,
        budget_warning: false,
      });
    });

    it("setNotifySettings 和 getNotifySettings 读写一致", () => {
      setNotifySettings({
        task_reminder: false,
        email_notify: true,
        budget_warning: true,
      });
      expect(getNotifySettings()).toEqual({
        task_reminder: false,
        email_notify: true,
        budget_warning: true,
      });
    });

    it("部分覆盖时未设置项使用默认值", () => {
      localStorage.setItem(
        STORAGE_KEYS.notifySettings,
        JSON.stringify({ budget_warning: true })
      );
      const settings = getNotifySettings();
      expect(settings.task_reminder).toBe(true);
      expect(settings.email_notify).toBe(true);
      expect(settings.budget_warning).toBe(true);
    });

    it("损坏的 JSON 回退默认值", () => {
      localStorage.setItem(STORAGE_KEYS.notifySettings, "{not-json");
      expect(getNotifySettings().budget_warning).toBe(false);
    });
  });

  describe("通知已读", () => {
    it("空值时返回空 Set", () => {
      const dismissed = getDismissedNotifications();
      expect(dismissed).toBeInstanceOf(Set);
      expect(dismissed.size).toBe(0);
    });

    it("setDismissedNotifications 和 getDismissedNotifications 读写一致", () => {
      const ids = new Set(["n1", "n2", "n3"]);
      setDismissedNotifications(ids);
      const result = getDismissedNotifications();
      expect(result).toEqual(ids);
    });

    it("空 Set 正确序列化", () => {
      setDismissedNotifications(new Set());
      expect(getDismissedNotifications().size).toBe(0);
    });
  });

  describe("预算超支冷却", () => {
    it("空值时返回 null", () => {
      expect(getBudgetWarnCooldown()).toBe(null);
    });

    it("读写一致", () => {
      const cooldown = { signature: "budget:monthly:2026-08", ts: Date.now() };
      setBudgetWarnCooldown(cooldown);
      const result = getBudgetWarnCooldown();
      expect(result).toEqual(cooldown);
    });

    it("损坏的 JSON 返回 null", () => {
      localStorage.setItem(STORAGE_KEYS.budgetWarnCooldown, "{not-json");
      expect(getBudgetWarnCooldown()).toBe(null);
    });
  });

  describe("预算列表页单日提醒", () => {
    it("空值时返回 null", () => {
      expect(getBudgetWarnedAt()).toBe(null);
    });

    it("读写一致", () => {
      const ts = 1723456789000;
      setBudgetWarnedAt(ts);
      expect(getBudgetWarnedAt()).toBe(ts);
    });

    it("非法数字字符串返回 null", () => {
      localStorage.setItem(STORAGE_KEYS.budgetWarnedAt, "not-a-number");
      expect(getBudgetWarnedAt()).toBe(null);
    });
  });

  describe("localStorage 异常容错", () => {
    it("读取时 localStorage 抛错不向外传播", () => {
      vi.spyOn(localStorage, "getItem").mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      expect(getStoredUserId()).toBe(null);
      expect(getStoredTheme()).toBe(null);
      expect(getStoredLanguage()).toBe(null);
    });

    it("写入时 localStorage 抛错不向外传播", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      expect(() => setStoredUserId("u1")).not.toThrow();
      expect(() => setStoredTheme("dark")).not.toThrow();
      expect(() => setStoredLanguage("zh-CN")).not.toThrow();
    });

    it("删除时 localStorage 抛错不向外传播", () => {
      vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      expect(() => removeStoredUserId()).not.toThrow();
      expect(() => removeDemoFlag()).not.toThrow();
    });
  });
});
