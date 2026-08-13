import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@/lib/tauri";

/**
 * 安全的 Tauri 事件监听封装（同 useRealtimeSync）。
 * 仅在 Tauri 桌面壳内调用 @tauri-apps/api 的 listen()，
 * 浏览器 / dev 模式下跳过。
 */
async function safeTauriListen<T = unknown>(event: string, handler: (event: { payload: T }) => void): Promise<(() => void) | undefined> {
  if (!isTauri()) return undefined;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<T>(event, handler);
  } catch {
    return undefined;
  }
}

/**
 * Rust 后端发出的同步进度事件数据。
 * 与后端 SyncProgress 枚举保持对应。
 */
export interface SyncProgressEvent {
  phase: "connecting" | "folder" | "done" | "error" | "new-mail";
  account_id: string;
  /** folder 阶段：当前正在同步的文件夹路径 */
  path?: string;
  /** folder 阶段：当前文件夹已处理数量 */
  done?: number;
  /** folder 阶段：当前文件夹总数 */
  total?: number;
  /** done 阶段：累计获取数量 */
  fetched?: number;
  /** done 阶段：累计插入数量 */
  inserted?: number;
  /** error 阶段：错误信息 */
  message?: string;
  /** new-mail 阶段：邮件主题 */
  subject?: string;
  /** new-mail 阶段：发件人 */
  from?: string;
}

/** 单个账户的同步进度状态 */
interface AccountSyncState {
  phase: "idle" | "connecting" | "syncing" | "done" | "error";
  /** 当前正在同步的文件夹路径 */
  currentFolder?: string;
  /** 当前文件夹进度 */
  folderDone: number;
  folderTotal: number;
  /** 累计数据 */
  fetched: number;
  inserted: number;
  /** 错误信息 */
  error?: string;
}

type SyncProgressMap = Record<string, AccountSyncState>;

/**
 * 监听 Tauri `mail://sync-progress` 事件，提供同步进度状态。
 *
 * 同步完成后自动刷新相关 query 缓存。
 */
export function useSyncProgress() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncProgressMap>({});
  const progressRef = useRef<SyncProgressMap>({});

  const updateAccount = useCallback(
    (accountId: string, partial: Partial<AccountSyncState>) => {
      setProgress((prev) => {
        const next = {
          ...prev,
          [accountId]: { ...(prev[accountId] ?? { phase: "idle", folderDone: 0, folderTotal: 0, fetched: 0, inserted: 0 }), ...partial },
        };
        progressRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    safeTauriListen<SyncProgressEvent>("mail://sync-progress", (event) => {
      const data = event.payload;
      const accountId = data.account_id;

      switch (data.phase) {
        case "connecting":
          updateAccount(accountId, {
            phase: "connecting",
            currentFolder: undefined,
            folderDone: 0,
            folderTotal: 0,
            fetched: 0,
            inserted: 0,
            error: undefined,
          });
          break;

        case "folder":
          updateAccount(accountId, {
            phase: "syncing",
            currentFolder: data.path,
            folderDone: data.done ?? 0,
            folderTotal: data.total ?? 0,
            error: undefined,
          });
          break;

        case "done":
          updateAccount(accountId, {
            phase: "done",
            currentFolder: undefined,
            folderDone: 0,
            folderTotal: 0,
            fetched: data.fetched ?? 0,
            inserted: data.inserted ?? 0,
            error: undefined,
          });
          // 同步完成后自动刷新
          queryClient.invalidateQueries({ queryKey: ["emails"] });
          queryClient.invalidateQueries({ queryKey: ["email-folders"] });
          queryClient.invalidateQueries({ queryKey: ["folder-unread-counts"] });
          queryClient.invalidateQueries({ queryKey: ["unified-unread"] });
          // 2 秒后重置为 idle
          setTimeout(() => {
            setProgress((prev) => {
              if (prev[accountId]?.phase === "done") {
                return { ...prev, [accountId]: { ...prev[accountId], phase: "idle" } };
              }
              return prev;
            });
          }, 3000);
          break;

        case "error":
          updateAccount(accountId, {
            phase: "error",
            error: data.message,
            currentFolder: undefined,
          });
          break;
      }
    }).then((fn) => { if (fn) unlisteners.push(fn); });

    return () => {
      for (const fn of unlisteners) fn();
    };
  }, [queryClient, updateAccount]);

  /** 是否有任何账户正在同步中 */
  const isSyncing = Object.values(progress).some(
    (s) => s.phase === "connecting" || s.phase === "syncing",
  );

  /** 同步中的账户列表 */
  const syncingAccounts = Object.entries(progress)
    .filter(([, s]) => s.phase === "connecting" || s.phase === "syncing")
    .map(([id, state]) => ({ id, ...state }));

  /** 最近完成的同步结果 */
  const lastResults = Object.entries(progress)
    .filter(([, s]) => s.phase === "done" && s.fetched > 0)
    .map(([id, state]) => ({ id, ...state }));

  /** 清除所有进度 */
  const clearProgress = useCallback(() => {
    setProgress({});
    progressRef.current = {};
  }, []);

  return {
    progress,
    isSyncing,
    syncingAccounts,
    lastResults,
    clearProgress,
  } as const;
}