import { isTauri } from "@/lib/tauri";
import type { CalendarEvent, CalendarSubscription, CalendarEventSource, CalendarProvider } from "@/types";

/**
 * 懒加载 Tauri invoke 函数。
 * 使用动态导入避免在浏览器环境下因 @tauri-apps/api/core 模块无法加载而崩溃。
 */
async function getInvoke() {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export interface SyncResult {
  synced: number;
  removed: number;
  subscription: string;
}

export const calendarApi = {
  // ---------------------------------------------------------------------------
  // CalendarEvent CRUD
  // ---------------------------------------------------------------------------
  listEvents: async () => {
    const invoke = await getInvoke();
    return invoke<CalendarEvent[]>("calendar_event_list_all");
  },
  getEvent: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<CalendarEvent>("calendar_event_get", { id });
  },
  createEvent: async (data: {
    title: string;
    description?: string;
    location?: string;
    start_at: string;
    end_at: string;
    all_day?: boolean;
    color?: string;
    reminder_minutes?: number;
    source?: CalendarEventSource;
  }) => {
    const invoke = await getInvoke();
    return invoke<CalendarEvent>("calendar_event_create", {
      title: data.title,
      description: data.description,
      location: data.location,
      start_at: data.start_at,
      end_at: data.end_at,
      all_day: data.all_day,
      color: data.color,
      reminder_minutes: data.reminder_minutes,
      source: data.source,
    });
  },
  updateEvent: async (data: {
    id: string;
    title?: string;
    description?: string;
    location?: string;
    start_at?: string;
    end_at?: string;
    all_day?: boolean;
    color?: string;
    reminder_minutes?: number;
  }) => {
    const invoke = await getInvoke();
    return invoke<CalendarEvent>("calendar_event_update", {
      id: data.id,
      title: data.title,
      description: data.description,
      location: data.location,
      start_at: data.start_at,
      end_at: data.end_at,
      all_day: data.all_day,
      color: data.color,
      reminder_minutes: data.reminder_minutes,
    });
  },
  deleteEvent: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("calendar_event_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // CalendarSubscription CRUD
  // ---------------------------------------------------------------------------
  listSubscriptions: async () => {
    const invoke = await getInvoke();
    return invoke<CalendarSubscription[]>("calendar_subscription_list_all");
  },
  getSubscription: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<CalendarSubscription>("calendar_subscription_get", { id });
  },
  createSubscription: async (data: {
    name: string;
    provider: CalendarProvider;
    url: string;
    username?: string;
    password?: string;
    color?: string;
    enabled?: boolean;
  }) => {
    const invoke = await getInvoke();
    return invoke<CalendarSubscription>("calendar_subscription_create", {
      name: data.name,
      provider: data.provider,
      url: data.url,
      username: data.username,
      password: data.password,
      color: data.color,
      enabled: data.enabled,
    });
  },
  updateSubscription: async (data: {
    id: string;
    name?: string;
    provider?: CalendarProvider;
    url?: string;
    username?: string;
    password?: string;
    color?: string;
    enabled?: boolean;
  }) => {
    const invoke = await getInvoke();
    return invoke<CalendarSubscription>("calendar_subscription_update", {
      id: data.id,
      name: data.name,
      provider: data.provider,
      url: data.url,
      username: data.username,
      password: data.password,
      color: data.color,
      enabled: data.enabled,
    });
  },
  deleteSubscription: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("calendar_subscription_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------
  syncSubscription: async (subscriptionId?: string) => {
    const invoke = await getInvoke();
    return invoke<{ results: SyncResult[] }>("calendar_sync_subscription", {
      subscription_id: subscriptionId,
    });
  },
};
