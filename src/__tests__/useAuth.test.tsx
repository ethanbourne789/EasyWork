import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/features/auth/useAuth";
import { useAuthStore } from "@/features/auth/authStore";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it("无会话时设置 loading=false 且 session=null", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeNull();
  });
});