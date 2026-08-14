import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/features/auth/useAuth";
import { useAuthStore } from "@/features/auth/authStore";

vi.mock("@/lib/authApi", () => ({
  authApi: {
    getUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  },
}));

import { authApi } from "@/lib/authApi";

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("useAuth（local-first 会话恢复）", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, loading: true });
    vi.mocked(authApi.getUser).mockReset();
  });

  it("无本地会话时清空用户且 loading=false", async () => {
    const { result } = renderHook(() => useAuth());
    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it("存在本地会话时恢复用户", async () => {
    localStorage.setItem("easywork:user_id", "u1");
    vi.mocked(authApi.getUser).mockResolvedValue({
      id: "u1",
      email: "real@example.com",
      display_name: null,
      avatar_data: null,
      created_at: "",
      updated_at: "",
    });

    const { result } = renderHook(() => useAuth());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.session?.email).toBe("real@example.com");
  });

  it("显式 logout 后用户被清空", async () => {
    useAuthStore.getState().setUser({
      id: "u1",
      email: "real@example.com",
      display_name: null,
      avatar_data: null,
      created_at: "",
      updated_at: "",
    });
    const { result } = renderHook(() => useAuth());
    await flush();
    expect(result.current.session).not.toBeNull();

    act(() => {
      useAuthStore.getState().logout();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
