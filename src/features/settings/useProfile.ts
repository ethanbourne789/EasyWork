import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/authApi";
import { getCurrentUserId } from "@/features/auth/authStore";

export interface Profile {
  id: string;
  display_name: string | null;
  /** 头像：base64 data URL（本地存储，无云端 URL） */
  avatar_url: string | null;
}

/** 读取当前登录本地用户的资料（local-first，存于本地 users 表）。 */
export function useProfile() {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const user = await authApi.getUser(userId!);
      return {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_data,
      };
    },
  });
}

/** 更新当前用户资料（显示名称 / 头像 data URL）。 */
export function useUpdateProfile() {
  const userId = getCurrentUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { display_name?: string; avatar_url?: string | null }) => {
      const user = await authApi.updateProfile(
        userId!,
        patch.display_name,
        patch.avatar_url ?? undefined,
        patch.avatar_url === null,
      );
      return {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_data,
      } as Profile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });
}
