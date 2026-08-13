import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/features/auth/authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it("初始状态为未登录且加载中", () => {
    // 复位到启动态
    useAuthStore.setState({ session: null, loading: true });
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

  it("logout 清除会话", () => {
    useAuthStore.getState().setSession({ user: { id: "u1" } } as any);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("getCurrentUserId 未登录返回空字符串", () => {
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().session?.user.id ?? "").toBe("");
  });
});
