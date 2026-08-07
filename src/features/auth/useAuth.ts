import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";

export function useAuth() {
  const { session, loading, setSession, clearSession } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      } else {
        clearSession();
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
      } else {
        clearSession();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [setSession, clearSession]);

  return { session, loading };
}