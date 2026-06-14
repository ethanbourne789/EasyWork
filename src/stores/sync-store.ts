import { create } from "zustand";
import * as syncIpc from "@/lib/sync-ipc";

type SyncStatus = "not_authenticated" | "offline" | "syncing" | "synced" | "failed";

interface SyncState {
  status: SyncStatus;
  isAuthenticated: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  isLoading: boolean;

  // Actions
  refreshStatus: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithOAuth: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  checkConnectivity: () => Promise<boolean>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: "not_authenticated",
  isAuthenticated: false,
  lastSyncedAt: null,
  error: null,
  isLoading: false,

  refreshStatus: async () => {
    try {
      const status = await syncIpc.getSyncStatus();
      const authenticated = await syncIpc.isAuthenticated();
      set({
        status: status.status,
        isAuthenticated: authenticated,
        lastSyncedAt: status.last_synced_at,
        error: status.error,
      });
    } catch (err) {
      console.error("Failed to refresh sync status:", err);
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      await syncIpc.signIn(email, password);
      await get().refreshStatus();
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      await syncIpc.signUp(email, password);
      await get().refreshStatus();
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithOAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      await syncIpc.signInWithOAuth();
      await get().refreshStatus();
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null });
    try {
      await syncIpc.signOut();
      set({
        status: "not_authenticated",
        isAuthenticated: false,
        lastSyncedAt: null,
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ isLoading: false });
    }
  },

  syncNow: async () => {
    set({ isLoading: true, error: null, status: "syncing" });
    try {
      await syncIpc.syncNow();
      await get().refreshStatus();
    } catch (err) {
      set({ error: String(err), status: "failed" });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  checkConnectivity: async () => {
    try {
      return await syncIpc.checkConnectivity();
    } catch {
      return false;
    }
  },
}));
