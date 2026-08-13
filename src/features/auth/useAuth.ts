import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";

/**
 * 认证同步。
 * 策略：以真实 Supabase 会话为准。启动期间等待 getSession 结果，
 * 有会话则用真实会话，无会话则清空（不再保留任何伪造的本地演示会话）。
 */
export function useAuth() {
  const { session, loading, setSession, clearSession } = useAuthStore();

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session) setSession(data.session);
        else clearSession();
      })
      .catch((err) => {
        if (!active) return;
        console.error("[useAuth] getSession failed:", err);
        clearSession();
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) setSession(nextSession);
      else clearSession();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, clearSession]);

  return { session, loading };
}
