/**
 * 云端同步 API 层（Tauri invoke 懒加载封装）。
 *
 * 所有函数均通过 Tauri 命令与 Rust 后端通信。在浏览器 / 开发服务器环境下
 * `isTauri()` 为 false，调用会安全地抛出友好错误，不会加载原生模块，因此
 * 同步相关的 UI 在 Web 端不会崩溃，只是不可用。
 */

import { isTauri } from "@/lib/tauri";

export interface SyncConfig {
  id: string;
  enabled: boolean;
  provider: string;
  connection_string: string;
  database_name: string;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncStatus {
  enabled: boolean;
  last_sync_at: string | null;
  sync_error: string | null;
  device_id: string;
  device_name: string;
}

export interface SyncLogEntry {
  id: string;
  direction: string;
  table_name: string;
  records_count: number;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export interface SyncResult {
  success: boolean;
  records_uploaded: number;
  records_downloaded: number;
  error: string | null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error("桌面端功能：当前不在 Tauri 环境中");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export const syncApi = {
  getConfig: () => invoke<SyncConfig>("sync_config_get"),
  saveConfig: (config: SyncConfig) => invoke<void>("sync_config_save", { config }),
  deleteConfig: () => invoke<void>("sync_config_delete"),
  testConnection: (connectionString?: string) =>
    invoke<ConnectionTestResult>("sync_test_connection", { connection_string: connectionString }),
  triggerSync: () => invoke<SyncResult>("sync_trigger"),
  getStatus: () => invoke<SyncStatus>("sync_status"),
  getLog: (limit?: number) => invoke<SyncLogEntry[]>("sync_log_get", { limit }),
  setDeviceName: (name: string) => invoke<void>("sync_set_device_name", { name }),
};
