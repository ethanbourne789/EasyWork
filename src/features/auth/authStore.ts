import { create } from "zustand";
import { authApi, type LocalUser } from "@/lib/authApi";

/** 会话持久化 key：本地登录用户 id（local-first，无服务端 session）。 */
const SESSION_KEY = "easywork:user_id";

interface AuthState {
  /** 当前登录的本地用户；null 表示未登录。 */
  user: LocalUser | null;
  /** 启动期间等待本地会话恢复。 */
  loading: boolean;
  setUser: (user: LocalUser | null) => void;
  clearSession: () => void;
  /** 本地账号密码登录；成功写入 localStorage 并返回 null，失败返回中文错误。 */
  login: (email: string, password: string) => Promise<string | null>;
  /** 本地账号注册（成功即自动登录）。 */
  register: (email: string, password: string, displayName?: string) => Promise<string | null>;
  /** 登出：清除本地会话（本地无服务端会话可撤销）。 */
  logout: () => void;
  /** 从本地库重新拉取当前用户资料（资料更新后刷新缓存）。 */
  refreshUser: () => Promise<void>;
}

function readStoredUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (user) => {
    if (user) {
      try {
        localStorage.setItem(SESSION_KEY, user.id);
      } catch {
        /* ignore */
      }
    }
    set({ user, loading: false });
  },
  clearSession: () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({ user: null, loading: false });
  },
  login: async (email, password) => {
    try {
      const user = await authApi.login(email, password);
      get().setUser(user);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "登录失败";
    }
  },
  register: async (email, password, displayName) => {
    try {
      const user = await authApi.register(email, password, displayName);
      get().setUser(user);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "注册失败";
    }
  },
  logout: () => {
    // 本地模式无服务端会话可撤销，直接清除本地登录态
    get().clearSession();
  },
  refreshUser: async () => {
    const id = readStoredUserId();
    if (!id) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const user = await authApi.getUser(id);
      set({ user, loading: false });
    } catch {
      // 用户已不存在（如数据库被清空）：清除本地会话
      get().clearSession();
    }
  },
}));

/**
 * 获取当前登录用户 ID。未登录返回空字符串。
 */
export function getCurrentUserId(): string {
  return useAuthStore.getState().user?.id ?? "";
}

/** 供启动时恢复本地会话：读取 localStorage 中的 user id 并拉取资料。 */
export function restoreLocalSession(): Promise<void> {
  return useAuthStore.getState().refreshUser();
}
