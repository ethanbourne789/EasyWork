import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore, getCurrentUserId } from "@/features/auth/authStore";

// mock 本地认证 API（真实调用需要 Tauri 环境）
vi.mock("@/lib/authApi", () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    getUser: vi.fn(),
  },
}));

import { authApi } from "@/lib/authApi";

const fakeUser = {
  id: "u1",
  email: "a@b.com",
  display_name: null,
  avatar_data: null,
  created_at: "",
  updated_at: "",
};

describe("authStore（local-first）", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, loading: true });
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.register).mockReset();
    vi.mocked(authApi.getUser).mockReset();
  });

  it("初始状态为未登录且加载中", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(true);
  });

  it("setUser 设置用户并持久化会话", () => {
    useAuthStore.getState().setUser(fakeUser);
    expect(useAuthStore.getState().user).toEqual(fakeUser);
    expect(useAuthStore.getState().loading).toBe(false);
    expect(localStorage.getItem("easywork:user_id")).toBe("u1");
  });

  it("clearSession 清除用户与会话", () => {
    useAuthStore.getState().setUser(fakeUser);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem("easywork:user_id")).toBeNull();
  });

  it("login 成功设置用户并返回 null", async () => {
    vi.mocked(authApi.login).mockResolvedValue(fakeUser);
    const err = await useAuthStore.getState().login("a@b.com", "123456");
    expect(err).toBeNull();
    expect(useAuthStore.getState().user?.id).toBe("u1");
  });

  it("login 失败返回错误且不登录", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error("邮箱或密码错误"));
    const err = await useAuthStore.getState().login("a@b.com", "wrong");
    expect(err).toBe("邮箱或密码错误");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("register 成功即自动登录", async () => {
    vi.mocked(authApi.register).mockResolvedValue(fakeUser);
    const err = await useAuthStore.getState().register("a@b.com", "123456");
    expect(err).toBeNull();
    expect(useAuthStore.getState().user?.id).toBe("u1");
  });

  it("logout 清除本地会话", () => {
    useAuthStore.getState().setUser(fakeUser);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem("easywork:user_id")).toBeNull();
  });

  it("refreshUser 从本地库恢复用户", async () => {
    localStorage.setItem("easywork:user_id", "u1");
    vi.mocked(authApi.getUser).mockResolvedValue(fakeUser);
    await useAuthStore.getState().refreshUser();
    expect(useAuthStore.getState().user?.email).toBe("a@b.com");
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it("refreshUser 用户不存在时清除会话", async () => {
    localStorage.setItem("easywork:user_id", "ghost");
    vi.mocked(authApi.getUser).mockRejectedValue(new Error("not found"));
    await useAuthStore.getState().refreshUser();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("getCurrentUserId 未登录返回空字符串", () => {
    useAuthStore.getState().clearSession();
    expect(getCurrentUserId()).toBe("");
  });
});
