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
    invoke<LocalUser>("auth_register", { email, password, display_name }),
  login: (email: string, password: string) =>
    invoke<LocalUser>("auth_login", { email, password }),
  getUser: (user_id: string) => invoke<LocalUser>("auth_get_user", { user_id }),
  updateProfile: (user_id: string, display_name?: string, avatar_data?: string, clear_avatar?: boolean) =>
    invoke<LocalUser>("auth_update_profile", { user_id, display_name, avatar_data, clear_avatar }),
  changePassword: (user_id: string, current_password: string, new_password: string) =>
    invoke<void>("auth_change_password", { user_id, current_password, new_password }),
};
