import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/features/auth/useAuth";
import { useAuthStore } from "@/features/auth/authStore";

const getSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("useAuth", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: null } });
    useAuthStore.setState({ session: null, loading: true });
  });

  it("无真实会话时清空会话且 loading=false", async () => {
    const { result } = renderHook(() => useAuth());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it("存在真实会话时以真实会话覆盖", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "real-token",
          token_type: "bearer",
          expires_in: 3600,
          user: { id: "real-user-id", email: "real@example.com" },
        },
      },
    });

    const { result } = renderHook(() => useAuth());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.session?.user.id).toBe("real-user-id");
  });

  it("显式 logout 后会话被清空", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "real-token",
          token_type: "bearer",
          expires_in: 3600,
          user: { id: "real-user-id", email: "real@example.com" },
        },
      },
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
