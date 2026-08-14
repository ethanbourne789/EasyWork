import { useEffect } from "react";
import { useAuthStore } from "@/features/auth/authStore";

/**
 * 认证同步（local-first）。
 * 启动时从 localStorage 读取本地登录用户 id，再从本地库拉取资料；
 * 无本地会话则清空。不再依赖 Supabase Auth。
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    let active = true;
    useAuthStore
      .getState()
      .refreshUser()
      .catch((err) => {
        if (!active) return;
        console.error("[useAuth] 本地会话恢复失败:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  return { session: user, loading };
}
