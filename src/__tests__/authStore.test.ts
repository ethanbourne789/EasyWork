import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/features/auth/authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it("初始状态为未加载且无会话", () => {
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.loading).toBe(true);
  });

  it("setSession 设置会话并清除 loading", () => {
    const session = { user: { id: "u1" } } as any;
    useAuthStore.getState().setSession(session);
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it("clearSession 清除会话并清除 loading", () => {
    useAuthStore.getState().setSession({ user: { id: "u1" } } as any);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });
});