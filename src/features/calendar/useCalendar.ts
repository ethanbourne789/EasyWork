import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/features/auth/authStore';
import { useSafeMutation } from '@/lib/mutation';
import type { CalendarEvent, CalendarSubscription } from '@/types';
import type { Database } from '@/types/database.types';

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarEvent[];
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: Partial<CalendarEvent>) => {
      const insertData: Database['public']['Tables']['calendar_events']['Insert'] = {
        title: data.title!,
        description: data.description ?? null,
        start_at: data.start_at!,
        end_at: data.end_at!,
        all_day: data.all_day ?? false,
        location: data.location ?? null,
        color: data.color ?? null,
        reminder_minutes: data.reminder_minutes ?? null,
        source: 'local',
        user_id: getCurrentUserId(),
        subscription_id: null,
        external_uid: null,
      };
      const { data: row, error } = await supabase
        .from('calendar_events')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      return row as CalendarEvent;
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
      const { data: row, error } = await supabase
        .from('calendar_events')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return row as CalendarEvent;
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
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id)
        .eq('user_id', getCurrentUserId());
      if (error) throw error;
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_subscriptions')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarSubscription[];
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: Partial<CalendarSubscription>) => {
      const insertData: Database['public']['Tables']['calendar_subscriptions']['Insert'] = {
        name: data.name!,
        provider: data.provider!,
        url: data.url!,
        username: data.username ?? null,
        password: data.password ?? null,
        color: data.color ?? '#6366f1',
        enabled: data.enabled ?? true,
        user_id: getCurrentUserId(),
      };
      const { data: row, error } = await supabase
        .from('calendar_subscriptions')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      return row as CalendarSubscription;
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
      const { data: row, error } = await supabase
        .from('calendar_subscriptions')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return row as CalendarSubscription;
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
      const { error } = await supabase
        .from('calendar_subscriptions')
        .delete()
        .eq('id', id)
        .eq('user_id', getCurrentUserId());
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.subscriptions() });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events() });
    },
  });
}

export interface SyncResult {
  synced: number;
  removed: number;
  subscription: string;
}

/**
 * 触发订阅同步。
 *
 * 走 Edge Function 而非前端直连：ICS/CalDAV 服务端普遍不下发 CORS 头，
 * 浏览器与 WebView 直接请求会被拦截；且 CalDAV 需要携带专用密码，
 * 放在服务端（service_role 读取凭据）比暴露在客户端更安全。
 */
export function useSyncSubscription() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (subscriptionId?: string) => {
      const { data: res, error } = await supabase.functions.invoke('sync-calendar', {
        body: subscriptionId ? { subscriptionId } : {},
      });
      if (error) throw new Error(error.message);
      if (res && (res as { error?: string }).error) {
        throw new Error((res as { error: string }).error);
      }
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
