import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@/lib/tauri";

/**
 * 安全的 Tauri 事件监听封装。
 * 仅在 Tauri 桌面壳内才调用 @tauri-apps/api 的 listen()，
 * 浏览器 / dev 模式下跳过（避免 window.__TAURI__ 未定义报错）。
 */
async function safeTauriListen(event: string, handler: () => void): Promise<(() => void) | undefined> {
  if (!isTauri()) return undefined;
  try {
    // 动态导入：避免在非 Tauri 环境下加载 @tauri-apps/api 时触发模块级副作用
    const { listen } = await import("@tauri-apps/api/event");
    return listen(event, handler);
  } catch {
    return undefined;
  }
}

/**
 * 监听 Rust 后端同步完成后 emit 的邮件事件（mail://sync-progress 与 mail://new-mail），
 * 失效对应的 TanStack Query 缓存以刷新邮件列表。
 */
export function useMailEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    safeTauriListen("mail://sync-progress", () => {
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-folders"] });
      queryClient.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      queryClient.invalidateQueries({ queryKey: ["unified-unread"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    }).then((fn) => {
      if (fn) unlisteners.push(fn);
    });

    safeTauriListen("mail://new-mail", () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email"] });
    }).then((fn) => {
      if (fn) unlisteners.push(fn);
    });

    return () => {
      for (const unlisten of unlisteners) unlisten();
    };
  }, [queryClient]);
}