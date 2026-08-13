import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRealtimeStore } from "./realtimeStore";
import { MS_PER_SECOND } from "@/lib/constants";
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
 * 业务表 → 需要失效的 TanStack Query key 前缀。
 * 用前缀失效即可覆盖 list / detail 等所有子查询。
 */
const TABLE_TO_KEYS: Record<string, string[][]> = {
  profiles: [["profile"]],
  tasks: [["tasks"], ["subtasks"], ["tags"], ["taskTags"]],
  subtasks: [["subtasks"], ["tasks"]],
  tags: [["tags"], ["taskTags"]],
  task_tags: [["taskTags"], ["tasks"]],
  calendar_events: [["calendar"]],
  calendar_subscriptions: [["calendar"]],
  transactions: [["finance"]],
  accounts: [["finance"]],
  categories: [["finance"]],
  budgets: [["finance"]],
  note_folders: [["note-folders"], ["notes"]],
  notes: [["notes"]],
  note_tags: [["note-tags"], ["notes"]],
  note_note_tags: [
    ["note-tags"],
    ["notes"],
    ["note-tag-relations"],
    ["note-tag-ids"],
  ],
  };

/**
 * 把表拆到多个 channel 订阅。
 * Supabase Realtime 单个 channel 监听过多的 postgres_changes 时，join 阶段容易
 * 超时或触发 CHANNEL_ERROR；按业务模块拆分后每个 channel 负担更轻，也更易定位
 * 是哪个模块的订阅出了问题。
 * 
 * 优化为 2 个 channel：
 * - productivity: 核心生产力模块（任务、日历、笔记）
 * - finance: 财务模块（数据敏感且独立）
 * 
 * 注意：邮件模块不再使用 Supabase Realtime，改用 Tauri 事件监听（mail://sync-progress
 * 和 mail://new-mail），由 Rust 后端在同步完成后直接 emit 事件到前端。
 */
const CHANNEL_GROUPS = [
  { name: "easywork-productivity", tables: ["profiles", "tasks", "subtasks", "tags", "task_tags", "calendar_events", "calendar_subscriptions", "note_folders", "notes", "note_tags", "note_note_tags"] },
  { name: "easywork-finance", tables: ["transactions", "accounts", "categories", "budgets"] },
];

/** 指数退避重连：最大连续重试次数，超过则标记为 unavailable 不再高频重试。 */
const MAX_RETRIES = 5;
const BASE_DELAY_MS = MS_PER_SECOND;
const MAX_DELAY_MS = 30 * MS_PER_SECOND;

type ChannelStatus = "subscribed" | "pending" | "unavailable";

/**
 * 订阅 Supabase Realtime 的 postgres_changes，实现跨设备/多标签页实时同步。
 * 仅在已登录时启用：未登录订阅会失败并耗尽重试预算（登录/登出后依赖 enabled
 * 变化重新挂载，重试计数随之归零）。RLS 已按 auth.uid() 隔离，只会收到当前用户的数据变更。
 */
export function useRealtimeSync(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // 用于跟踪 effect 是否已清理，防止 StrictMode 下的竞态条件
    let isCleanedUp = false;
    const channels = new Map<string, ReturnType<typeof supabase.channel>>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const retryCount = new Map<string, number>();
    const channelStatus = new Map<string, ChannelStatus>();

    const updateGlobalStatus = () => {
      if (isCleanedUp) return;
      const store = useRealtimeStore.getState();

      // 任一 channel 超过重试上限 -> 整体标记不可用
      for (const [, count] of retryCount) {
        if (count > MAX_RETRIES) {
          store.setStatus("unavailable");
          return;
        }
      }

      // 检查是否有 channel 处于 pending 状态（正在初始化）
      // 如果所有非 subscribed 的 channel 都是 pending，说明是正常初始化，不更新 UI 状态
      let hasPending = false;
      for (const group of CHANNEL_GROUPS) {
        const st = channelStatus.get(group.name);
        if (st === "pending") {
          hasPending = true;
        }
      }
      if (hasPending) {
        // 仍在初始化阶段，保持当前状态不变（不要闪烁 reconnecting）
        return;
      }

      // 任一 channel 尚未订阅（且不是 pending）-> 重连中
      for (const group of CHANNEL_GROUPS) {
        if (channelStatus.get(group.name) !== "subscribed") {
          store.setStatus("reconnecting");
          return;
        }
      }

      store.setStatus("connected");
    };

    const setupGroup = (group: (typeof CHANNEL_GROUPS)[number]) => {
      if (isCleanedUp) return;

      // 清理同一 group 的上一个 channel 与定时器，避免重复订阅
      const oldTimer = timers.get(group.name);
      if (oldTimer) {
        clearTimeout(oldTimer);
        timers.delete(group.name);
      }
      const oldChannel = channels.get(group.name);
      if (oldChannel) {
        void supabase.removeChannel(oldChannel);
        channels.delete(group.name);
      }

      channelStatus.set(group.name, "pending");

      // 使用带时间戳的唯一 channel 名称，避免 StrictMode 下旧 channel 未完全清理时复用同名对象
      const uniqueChannelName = `${group.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ch = supabase.channel(uniqueChannelName);
      channels.set(group.name, ch);

      for (const table of group.tables) {
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            const keys = TABLE_TO_KEYS[table];
            for (const key of keys) {
              void queryClient.invalidateQueries({ queryKey: key });
            }
          },
        );
      }

      ch.subscribe((status, err) => {
        if (isCleanedUp) return;

        if (status === "SUBSCRIBED") {
          retryCount.set(group.name, 0);
          channelStatus.set(group.name, "subscribed");
          updateGlobalStatus();
          return;
        }

        // 断线 / 鉴权失效 / 被服务端关闭：记录错误并安排重试
        console.error(`[realtime] ${group.name}: ${status}`, err);
        channelStatus.set(group.name, "pending");
        updateGlobalStatus();

        const count = (retryCount.get(group.name) ?? 0) + 1;
        retryCount.set(group.name, count);

        if (count > MAX_RETRIES) {
          channelStatus.set(group.name, "unavailable");
          useRealtimeStore.getState().setStatus("unavailable");
          useRealtimeStore
            .getState()
            .setError(`${group.name}: ${status}${err ? ` – ${String(err)}` : ""}`);
          updateGlobalStatus();
          return;
        }

        const delay = Math.min(BASE_DELAY_MS * 2 ** (count - 1), MAX_DELAY_MS);
        timers.set(
          group.name,
          setTimeout(() => {
            if (isCleanedUp) return;
            timers.delete(group.name);
            setupGroup(group);
          }, delay),
        );
      });
    };

    for (const group of CHANNEL_GROUPS) {
      setupGroup(group);
    }

  // 监听 Tauri 邮件事件（Rust 后端同步完成后 emit）
  const unlisteners: Array<() => void> = [];
  safeTauriListen('mail://sync-progress', () => {
    queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['email-folders'] });
    queryClient.invalidateQueries({ queryKey: ['folder-unread-counts'] });
    queryClient.invalidateQueries({ queryKey: ['unified-unread'] });
    queryClient.invalidateQueries({ queryKey: ['emails'] });
  }).then((fn) => { if (fn) unlisteners.push(fn); });
  safeTauriListen('mail://new-mail', () => {
    queryClient.invalidateQueries({ queryKey: ['emails'] });
    queryClient.invalidateQueries({ queryKey: ['email'] });
  }).then((fn) => { if (fn) unlisteners.push(fn); });

    return () => {
      isCleanedUp = true;
      for (const unlisten of unlisteners) unlisten();
      for (const timer of timers.values()) clearTimeout(timer);
      for (const ch of channels.values()) void supabase.removeChannel(ch);
      timers.clear();
      channels.clear();
    };
  }, [queryClient, enabled]);
}
