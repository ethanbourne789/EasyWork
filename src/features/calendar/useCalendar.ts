import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeMutation } from '@/lib/mutation';
import { calendarApi, type SyncResult } from './calendarApi';
import type { CalendarEvent, CalendarSubscription } from '@/types';

export const calendarKeys = {
  all: ['calendar'] as const,
  events: () => [...calendarKeys.all, 'events'] as const,
  subscriptions: () => [...calendarKeys.all, 'subscriptions'] as const,
};

// ---------------------------------------------------------------------------
// 日程事件
// ---------------------------------------------------------------------------

export function useCalendarEvents() {
  return useQuery({
    queryKey: calendarKeys.events(),
    queryFn: () => calendarApi.listEvents(),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: Partial<CalendarEvent>) => {
      return calendarApi.createEvent({
        title: data.title ?? "",
        description: data.description ?? undefined,
        start_at: data.start_at!,
        end_at: data.end_at!,
        all_day: data.all_day ?? false,
        location: data.location ?? undefined,
        color: data.color ?? undefined,
        reminder_minutes: data.reminder_minutes ?? undefined,
        source: data.source ?? "local",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CalendarEvent> }) => {
      return calendarApi.updateEvent({
        id,
        title: data.title,
        description: data.description ?? undefined,
        location: data.location ?? undefined,
        start_at: data.start_at,
        end_at: data.end_at,
        all_day: data.all_day,
        color: data.color ?? undefined,
        reminder_minutes: data.reminder_minutes ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      await calendarApi.deleteEvent(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

// ---------------------------------------------------------------------------
// 订阅源（钉钉 CalDAV / 通用 ICS）
// ---------------------------------------------------------------------------

export function useCalendarSubscriptions() {
  return useQuery({
    queryKey: calendarKeys.subscriptions(),
    queryFn: () => calendarApi.listSubscriptions(),
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: Partial<CalendarSubscription>) => {
      return calendarApi.createSubscription({
        name: data.name ?? "",
        provider: (data.provider ?? "ics") as CalendarSubscription["provider"],
        url: data.url ?? "",
        username: data.username ?? undefined,
        password: data.password ?? undefined,
        color: data.color ?? "#6366f1",
        enabled: data.enabled ?? true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.subscriptions() });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CalendarSubscription> }) => {
      return calendarApi.updateSubscription({
        id,
        name: data.name,
        provider: data.provider,
        url: data.url,
        username: data.username ?? undefined,
        password: data.password ?? undefined,
        color: data.color,
        enabled: data.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.subscriptions() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      // calendar_events.subscription_id 为 on delete cascade，事件随订阅一并清除
      await calendarApi.deleteSubscription(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.subscriptions() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

export type { SyncResult };

/**
 * 触发订阅同步（本地优先：由 Tauri Rust 后端直接拉取 ICS/CalDAV 并写入本地 SQLite，
 * 不再依赖 Supabase Edge Function；CalDAV 凭据存于本地数据库）。
 */
export function useSyncSubscription() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (subscriptionId?: string) => {
      const res = await calendarApi.syncSubscription(subscriptionId);
      return res as { results: SyncResult[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.subscriptions() });
    },
    onError: () => {
      // 即使同步失败，也刷新查询（部分订阅可能已成功写入）
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.subscriptions() });
    },
  });
}
