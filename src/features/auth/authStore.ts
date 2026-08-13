import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { friendlyAuthError } from "@/lib/authErrors";

interface AuthState {
  session: Session | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  clearSession: () => void;
  logout: () => void;
}

// 注意：已彻底移除「演示账号数据模式」。应用不再内置伪造会话 / 硬编码用户 ID，
// 所有数据读写都以真实 Supabase 认证用户为准（RLS: auth.uid() = user_id）。
// 演示数据通过 supabase/seed.sql 写入真实数据库，体验入口走真实登录（见 loginDemo）。

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true, // 启动期间等待 getSession 结果，避免被路由误判为未登录而闪退
  setSession: (session) => set({ session, loading: false }),
  clearSession: () => set({ session: null, loading: false }),
  logout: () => {
    supabase.auth.signOut().catch(() => {});
    set({ session: null, loading: false });
  },
}));

/**
 * 获取当前已登录用户 ID。未登录时返回空字符串（insert 会因 RLS/FK 失败，
 * 显式暴露「未登录无法写入」而非悄悄写入错误归属）。
 */
export function getCurrentUserId(): string {
  return useAuthStore.getState().session?.user?.id ?? "";
}

/**
 * 演示账号凭据（对应 supabase/seed.sql 写入的演示用户）。
 * 邮箱为公开演示标识（非机密）；密码从环境变量读取，避免明文落库。
 * 本地开发请在 .env 配置 VITE_DEMO_PASSWORD（参考 .env.example），该文件已被 gitignore。
 */
export const DEMO_CREDENTIALS = {
  email: import.meta.env.VITE_DEMO_EMAIL ?? "demo@easywork.app",
  password: import.meta.env.VITE_DEMO_PASSWORD ?? "",
};

/**
 * 以演示账号真实登录 Supabase。演示数据已通过 seed.sql 写入数据库，
 * 登录后即可看到真实数据，而非伪造的本地模式。
 */
export async function loginDemo(): Promise<{ error: string | null }> {
  if (!DEMO_CREDENTIALS.password) {
    return {
      error:
        "演示账号未配置密码：请在项目根目录 .env 中设置 VITE_DEMO_PASSWORD（可参考 .env.example），或直接使用您的真实账号登录。",
    };
  }
  const { error } = await supabase.auth.signInWithPassword(DEMO_CREDENTIALS);
  if (error) return { error: friendlyAuthError(error) };
  return { error: null };
}
