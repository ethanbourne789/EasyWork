import { useEffect } from "react";
import { useAuthStore } from "@/features/auth/authStore";
import { getDemoFlag } from "@/lib/storage";

/**
 * 认证同步（local-first）。
 * 启动时从本地持久化读取登录用户 id，再从本地库拉取资料；
 * 若为演示会话，则重新播种「近 1 个月」演示数据（每次打开都是最新）。
 * 无本地会话则清空。不再依赖 Supabase Auth。
 */

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    let active = true;
    const isDemo = getDemoFlag();

    const resume = isDemo
      ? useAuthStore.getState().enterDemo()
      : useAuthStore.getState().refreshUser();

    resume.catch((err) => {
      if (!active) return;
      console.error("[useAuth] 本地会话恢复失败:", err);
      // 兜底：避免演示会话恢复失败时卡在启动加载页
      useAuthStore.setState({ loading: false });
    });
    return () => {
      active = false;
    };
  }, []);

  return { session: user, loading };
}
