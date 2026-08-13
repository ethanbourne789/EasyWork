import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/features/auth/authStore";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** 读取当前登录用户的 profiles 资料（跨设备同步，存于 Supabase）。 */
export function useProfile() {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
    },
  });
}

/** 更新当前用户资料（显示名称 / 头像 URL）。upsert 自动按主键 id 写入。 */
export function useUpdateProfile() {
  const userId = getCurrentUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { display_name?: string; avatar_url?: string | null }) => {
      const { data, error } = await supabase
        .from("profiles")
        .upsert({ id: userId, ...patch } as never, { onConflict: "id" })
        .select("id, display_name, avatar_url")
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });
}
