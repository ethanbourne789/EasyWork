import { isTauri } from "@/lib/tauri";
import type { LocalUser } from "@/lib/authApi";

/**
 * 系统级命令封装（懒加载 Tauri invoke，浏览器环境友好失败）。
 * - enterDemoSession: 确保演示账号存在并返回其用户信息（前端据此建立本地会话）。
 * - clearAllData: 清空全部业务表（演示播种前先清场，见 seedDemoData）。
 */
async function getInvoke() {
  if (!isTauri()) {
    throw new Error("桌面端功能：当前不在 Tauri 环境中");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export const systemApi = {
  /** 进入演示：确保演示用户存在并返回用户信息。 */
  enterDemoSession: async (): Promise<LocalUser> => {
    const invoke = await getInvoke();
    return invoke<LocalUser>("demo_enter");
  },
  /** 清空全部业务表（任务/笔记/记账/日历）。 */
  clearAllData: async (): Promise<void> => {
    const invoke = await getInvoke();
    return invoke<void>("data_clear_all");
  },
};
