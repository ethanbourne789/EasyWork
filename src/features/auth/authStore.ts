import { create } from "zustand";
import { authApi, type LocalUser } from "@/lib/authApi";
import { systemApi } from "@/lib/systemApi";
import { seedDemoData } from "@/features/auth/seedDemoData";
import {
  clearAuthSession,
  getDemoFlag,
  getStoredUserId,
  setDemoFlag,
  setStoredUserId,
} from "@/lib/storage";

interface AuthState {
  /** 当前登录的本地用户；null 表示未登录。 */
  user: LocalUser | null;
  /** 启动期间等待本地会话恢复。 */
  loading: boolean;
  /** 是否为演示会话（演示账号进入，数据每次打开刷新）。 */
  isDemo: boolean;
  setUser: (user: LocalUser | null) => void;
  clearSession: () => void;
  /** 本地账号密码登录；成功写入本地持久化并返回 null，失败返回中文错误。 */
  login: (email: string, password: string) => Promise<string | null>;
  /** 本地账号注册（成功即自动登录）。 */
  register: (email: string, password: string, displayName?: string) => Promise<string | null>;
  /** 以演示账号进入：确保演示用户、播种「近 1 个月」演示数据、建立本地会话。 */
  enterDemo: () => Promise<string | null>;
  /** 登出：清除本地会话（本地无服务端会话可撤销）。 */
  logout: () => void;
  /** 从本地库重新拉取当前用户资料（资料更新后刷新缓存）。 */
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isDemo: false,
  setUser: (user) => {
    if (user) {
      setStoredUserId(user.id);
    }
    set({ user, loading: false });
  },
  clearSession: () => {
    clearAuthSession();
    set({ user: null, loading: false, isDemo: false });
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
  enterDemo: async () => {
    try {
      const user = await systemApi.enterDemoSession();
      // 清空并重新播种「近 1 个月」演示数据（日期相对 now，每次进入都是最新）
      await seedDemoData();
      setDemoFlag();
      get().setUser(user);
      set({ isDemo: true });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "进入演示模式失败";
    }
  },
  logout: () => {
    // 本地模式无服务端会话可撤销，直接清除本地登录态（含演示标记）
    get().clearSession();
  },
  refreshUser: async () => {
    const id = getStoredUserId();
    if (!id) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const user = await authApi.getUser(id);
      const isDemo = readDemoFlag();
      set({ user, loading: false, isDemo });
    } catch {
      // 用户已不存在（如数据库被清空）：清除本地会话
      get().clearSession();
    }
  },
}));

/** 读取演示模式标记。 */
function readDemoFlag(): boolean {
  return getDemoFlag();
}

/**
 * 获取当前登录用户 ID。未登录返回空字符串。
 */
export function getCurrentUserId(): string {
  return useAuthStore.getState().user?.id ?? "";
}

/** 供启动时恢复本地会话：读取本地持久化中的 user id 并拉取资料。 */
export function restoreLocalSession(): Promise<void> {
  return useAuthStore.getState().refreshUser();
}
