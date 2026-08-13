/**
 * 轻量 Tauri 桥接工具（无需 @tauri-apps/api 依赖）。
 * 当运行在桌面端（window.__TAURI__ 存在）时调用真实命令；
 * 在浏览器 / 开发服务器下安全回退，避免引入不必要的打包体积。
 */

interface TauriGlobal {
  core?: {
    invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
}

function getTauri(): TauriGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

/** 获取应用版本：桌面端返回真实版本，Web 端返回静态回退值。 */
export async function getAppVersion(fallback = "0.1.0"): Promise<string> {
  try {
    const tauri = getTauri();
    if (tauri?.core?.invoke) {
      const v = await tauri.core.invoke<string>("app_version");
      if (v) return v;
    }
  } catch {
    /* 非 Tauri 环境，使用回退值 */
  }
  return fallback;
}

/** 当前是否运行在 Tauri 桌面壳内。 */
export function isTauri(): boolean {
  return !!getTauri()?.core?.invoke;
}

/** 获取开机自启状态。 */
export async function getAutostartStatus(): Promise<boolean> {
  try {
    const tauri = getTauri();
    if (tauri?.core?.invoke) {
      return await tauri.core.invoke<boolean>("get_autostart_status");
    }
  } catch { /* 非 Tauri 环境 */ }
  return false;
}

/** 设置开机自启。 */
export async function setAutostart(enabled: boolean): Promise<void> {
  try {
    const tauri = getTauri();
    if (tauri?.core?.invoke) {
      await tauri.core.invoke<void>("set_autostart", { enabled });
    }
  } catch { /* 非 Tauri 环境 */ }
}

/** 获取窗口关闭行为（true=直接关闭，false=最小化到托盘）。 */
export async function getCloseBehavior(): Promise<boolean> {
  try {
    const tauri = getTauri();
    if (tauri?.core?.invoke) {
      return await tauri.core.invoke<boolean>("get_close_behavior");
    }
  } catch { /* 非 Tauri 环境 */ }
  return false;
}

/** 设置窗口关闭行为（true=直接关闭，false=最小化到托盘）。 */
export async function setCloseBehavior(closeOnExit: boolean): Promise<void> {
  try {
    const tauri = getTauri();
    if (tauri?.core?.invoke) {
      await tauri.core.invoke<void>("set_close_behavior", { closeOnExit });
    }
  } catch { /* 非 Tauri 环境 */ }
}
