/**
 * 云端同步相关的 TanStack Query hooks。
 * 集中管理同步配置 / 状态 / 日志的查询与变更，并负责失效刷新。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncApi, type SyncConfig } from "./syncApi";

export const syncKeys = {
  config: ["sync", "config"] as const,
  status: ["sync", "status"] as const,
  log: ["sync", "log"] as const,
};

export function useSyncConfig() {
  return useQuery({
    queryKey: syncKeys.config,
    queryFn: () => syncApi.getConfig(),
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: syncKeys.status,
    queryFn: () => syncApi.getStatus(),
    // 每 30 秒轮询一次，使侧边栏状态图标与设置页状态保持新鲜
    refetchInterval: 30_000,
  });
}

export function useSyncLog(limit = 20) {
  return useQuery({
    queryKey: [...syncKeys.log, limit],
    queryFn: () => syncApi.getLog(limit),
  });
}

export function useSaveSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: SyncConfig) => syncApi.saveConfig(config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syncKeys.config });
      qc.invalidateQueries({ queryKey: syncKeys.status });
    },
  });
}

export function useDeleteSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncApi.deleteConfig(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syncKeys.config });
      qc.invalidateQueries({ queryKey: syncKeys.status });
      qc.invalidateQueries({ queryKey: syncKeys.log });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (connectionString?: string) => syncApi.testConnection(connectionString),
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncApi.triggerSync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syncKeys.status });
      qc.invalidateQueries({ queryKey: syncKeys.log });
    },
  });
}

export function useSetDeviceName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => syncApi.setDeviceName(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: syncKeys.status });
      qc.invalidateQueries({ queryKey: syncKeys.config });
    },
  });
}
