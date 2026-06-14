// Sync IPC wrapper for Tauri commands
import { invoke } from "@tauri-apps/api/core";

export interface SyncStatus {
  status: "not_authenticated" | "offline" | "syncing" | "synced" | "failed";
  last_synced_at: string | null;
  error: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string | null;
  };
}

// Authentication
export async function signIn(email: string, password: string): Promise<AuthResponse> {
  return invoke("sync_sign_in", { email, password });
}

export async function signUp(email: string, password: string): Promise<AuthResponse> {
  return invoke("sync_sign_up", { email, password });
}

export async function signInWithOAuth(): Promise<void> {
  return invoke("sync_oauth_sign_in");
}

export async function signOut(): Promise<void> {
  return invoke("sync_sign_out");
}

export async function isAuthenticated(): Promise<boolean> {
  return invoke("sync_is_authenticated");
}

// Sync operations
export async function getSyncStatus(): Promise<SyncStatus> {
  return invoke("sync_get_status");
}

export async function syncNow(): Promise<void> {
  return invoke("sync_now");
}

export async function checkConnectivity(): Promise<boolean> {
  return invoke("sync_check_connectivity");
}
