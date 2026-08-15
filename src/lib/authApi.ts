/**
 * 本地认证 API 层（Tauri invoke 封装）。
 * 在浏览器 / 开发服务器环境下 isTauri() 为 false，调用会抛出友好错误。
 */
import { isTauri } from "@/lib/tauri";

export interface LocalUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_data: string | null;
  created_at: string;
  updated_at: string;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error("桌面端功能：当前不在 Tauri 环境中");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export const authApi = {
  register: (email: string, password: string, display_name?: string) =>
    invoke<LocalUser>("auth_register", { email, password, displayName: display_name }),
  login: (email: string, password: string) =>
    invoke<LocalUser>("auth_login", { email, password }),
  getUser: async (user_id: string) => {
    if (!user_id) throw new Error("auth_get_user: user_id 为空");
    return invoke<LocalUser>("auth_get_user", { userId: user_id });
  },
  updateProfile: (user_id: string, display_name?: string, avatar_data?: string, clear_avatar?: boolean) =>
    invoke<LocalUser>("auth_update_profile", {
      userId: user_id,
      displayName: display_name,
      avatarData: avatar_data,
      clearAvatar: clear_avatar,
    }),
  changePassword: (user_id: string, current_password: string, new_password: string) =>
    invoke<void>("auth_change_password", {
      userId: user_id,
      currentPassword: current_password,
      newPassword: new_password,
    }),
};
