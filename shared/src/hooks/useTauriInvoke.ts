// shared/src/hooks/useTauriInvoke.ts
import { useState, useCallback } from 'react';

/**
 * 封装 Tauri invoke 调用的 Hook
 * 在非 Tauri 环境下自动返回 mock 数据或空值
 *
 * 注意：此 Hook 仅在 Tauri 桌面端有效，Web 开发模式下 invoke 会静默失败。
 * 使用前确保 @tauri-apps/api 已安装在宿主应用中。
 */
export function useTauriInvoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(async (overrideArgs?: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      // 通过 Tauri 全局对象调用 IPC（运行时解析，不打包时引入依赖）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if (win.__TAURI_INTERNALS__?.invoke) {
        const result = await win.__TAURI_INTERNALS__.invoke(command, overrideArgs ?? args);
        setData(result as T);
      } else if (win.__TAURI__) {
        // Tauri 2.x 备用路径
        const { invoke: inv } = await win.__TAURI__.core;
        const result = await inv(command, overrideArgs ?? args);
        setData(result as T);
      } else {
        setError('Tauri API 不可用（非桌面环境）');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [command, args]);

  return { data, loading, error, invoke };
}
