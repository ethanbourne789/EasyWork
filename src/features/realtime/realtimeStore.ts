import { create } from "zustand";

export type RealtimeStatus = "connected" | "reconnecting" | "unavailable";

interface RealtimeState {
  status: RealtimeStatus;
  error: string | null;
  setStatus: (status: RealtimeStatus) => void;
  setError: (error: string | null) => void;
}

/**
 * 实时同步连接状态（全局单例）。由 useRealtimeSync 在断线/重连时更新，
 * 供布局层（如 AppLayout）渲染「正在重连」提示，避免断线被静默吞掉。
 */
export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: "connected",
  error: null,
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
}));
