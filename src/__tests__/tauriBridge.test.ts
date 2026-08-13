import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  isTauri,
  getAppVersion,
  getAutostartStatus,
  setAutostart,
  getCloseBehavior,
  setCloseBehavior,
} from "@/lib/tauri";

interface MockTauriGlobal {
  __TAURI__?: {
    core?: {
      invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
}

function setGlobalTauri(tauri: { core?: { invoke?: (...args: any[]) => any } } | undefined) {
  (window as unknown as MockTauriGlobal).__TAURI__ = tauri;
}

describe("tauri 桥接工具", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setGlobalTauri(undefined);
  });

  describe("isTauri", () => {
    it("非 Tauri 环境返回 false", () => {
      setGlobalTauri(undefined);
      expect(isTauri()).toBe(false);
    });

    it("有 __TAURI__.core.invoke 时返回 true", () => {
      setGlobalTauri({ core: { invoke: vi.fn() } });
      expect(isTauri()).toBe(true);
    });

    it("有 __TAURI__ 但无 core.invoke 时返回 false", () => {
      setGlobalTauri({});
      expect(isTauri()).toBe(false);
    });
  });

  describe("getAppVersion", () => {
    it("非 Tauri 环境返回默认回退值", async () => {
      setGlobalTauri(undefined);
      const v = await getAppVersion();
      expect(v).toBe("0.1.0");
    });

    it("可自定义回退值", async () => {
      setGlobalTauri(undefined);
      const v = await getAppVersion("9.9.9");
      expect(v).toBe("9.9.9");
    });

    it("Tauri 环境调用 invoke 获取版本", async () => {
      const mockInvoke = vi.fn().mockResolvedValue("1.2.3");
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const v = await getAppVersion();
      expect(v).toBe("1.2.3");
      expect(mockInvoke).toHaveBeenCalledWith("app_version");
    });

    it("invoke 抛错时回退到默认值", async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("not available"));
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const v = await getAppVersion("fallback");
      expect(v).toBe("fallback");
    });
  });

  describe("getAutostartStatus", () => {
    it("非 Tauri 环境返回 false", async () => {
      setGlobalTauri(undefined);
      const status = await getAutostartStatus();
      expect(status).toBe(false);
    });

    it("Tauri 环境调用 get_autostart_status 命令", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(true);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const status = await getAutostartStatus();
      expect(status).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("get_autostart_status");
    });

    it("invoke 抛错时回退 false", async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("command not found"));
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const status = await getAutostartStatus();
      expect(status).toBe(false);
    });
  });

  describe("setAutostart", () => {
    it("非 Tauri 环境静默忽略", async () => {
      setGlobalTauri(undefined);
      await expect(setAutostart(true)).resolves.toBeUndefined();
    });

    it("Tauri 环境调用 set_autostart 命令并传参", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      await setAutostart(true);
      expect(mockInvoke).toHaveBeenCalledWith("set_autostart", { enabled: true });
    });

    it("关闭开机自启时传 enabled=false", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      await setAutostart(false);
      expect(mockInvoke).toHaveBeenCalledWith("set_autostart", { enabled: false });
    });

    it("invoke 抛错时静默忽略", async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("fail"));
      setGlobalTauri({ core: { invoke: mockInvoke } });
      await expect(setAutostart(true)).resolves.toBeUndefined();
    });
  });

  describe("getCloseBehavior", () => {
    it("非 Tauri 环境返回 false（默认最小化到托盘）", async () => {
      setGlobalTauri(undefined);
      const behavior = await getCloseBehavior();
      expect(behavior).toBe(false);
    });

    it("Tauri 环境返回 true 表示直接关闭", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(true);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const behavior = await getCloseBehavior();
      expect(behavior).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("get_close_behavior");
    });

    it("Tauri 环境返回 false 表示最小化到托盘", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(false);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const behavior = await getCloseBehavior();
      expect(behavior).toBe(false);
    });

    it("invoke 抛错时回退 false", async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("not found"));
      setGlobalTauri({ core: { invoke: mockInvoke } });
      const behavior = await getCloseBehavior();
      expect(behavior).toBe(false);
    });
  });

  describe("setCloseBehavior", () => {
    it("非 Tauri 环境静默忽略", async () => {
      setGlobalTauri(undefined);
      await expect(setCloseBehavior(true)).resolves.toBeUndefined();
    });

    it("Tauri 环境调用 set_close_behavior 命令", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      await setCloseBehavior(true);
      expect(mockInvoke).toHaveBeenCalledWith("set_close_behavior", { closeOnExit: true });
    });

    it("设置最小化到托盘时传 closeOnExit=false", async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      setGlobalTauri({ core: { invoke: mockInvoke } });
      await setCloseBehavior(false);
      expect(mockInvoke).toHaveBeenCalledWith("set_close_behavior", { closeOnExit: false });
    });

    it("invoke 抛错时静默忽略", async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error("error"));
      setGlobalTauri({ core: { invoke: mockInvoke } });
      await expect(setCloseBehavior(true)).resolves.toBeUndefined();
    });
  });
});
