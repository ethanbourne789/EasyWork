/**
 * 本地持久化统一入口。
 * 所有 localStorage 读写都应通过此模块，避免 key 分散、类型不一致和异常泄漏。
 */

export const STORAGE_KEYS = {
  userId: "easywork:user_id",
  demoMode: "easywork:demo_mode",
  theme: "easywork-theme",
  language: "language",
  notifySettings: "easywork:notifications",
  dismissedNotifications: "easywork:dismissed-notifications",
  budgetWarnCooldown: "easywork:budget-warn-cooldown",
  budgetWarnedAt: "budget_warned_at",
} as const;

function getRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode errors */
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// -------------------- 认证 --------------------

export function getStoredUserId(): string | null {
  return getRaw(STORAGE_KEYS.userId);
}

export function setStoredUserId(userId: string): void {
  setRaw(STORAGE_KEYS.userId, userId);
}

export function removeStoredUserId(): void {
  removeRaw(STORAGE_KEYS.userId);
}

export function getDemoFlag(): boolean {
  return getRaw(STORAGE_KEYS.demoMode) === "1";
}

export function setDemoFlag(): void {
  setRaw(STORAGE_KEYS.demoMode, "1");
}

export function removeDemoFlag(): void {
  removeRaw(STORAGE_KEYS.demoMode);
}

export function clearAuthSession(): void {
  removeStoredUserId();
  removeDemoFlag();
}

// -------------------- 主题 --------------------

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme | null {
  const saved = getRaw(STORAGE_KEYS.theme) as Theme | null;
  return saved && (saved === "light" || saved === "dark") ? saved : null;
}

export function setStoredTheme(theme: Theme): void {
  setRaw(STORAGE_KEYS.theme, theme);
}

// -------------------- 语言 --------------------

export type Language = "zh-CN" | "en-US";

export function getStoredLanguage(): Language | null {
  const saved = getRaw(STORAGE_KEYS.language) as Language | null;
  return saved && (saved === "zh-CN" || saved === "en-US") ? saved : null;
}

export function setStoredLanguage(language: Language): void {
  setRaw(STORAGE_KEYS.language, language);
}

// -------------------- 通知设置 --------------------

export interface NotifySettings {
  task_reminder: boolean;
  email_notify: boolean;
  budget_warning: boolean;
}

const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  task_reminder: true,
  email_notify: true,
  budget_warning: false,
};

export function getNotifySettings(): NotifySettings {
  return { ...DEFAULT_NOTIFY_SETTINGS, ...parseJSON<Partial<NotifySettings>>(getRaw(STORAGE_KEYS.notifySettings), {}) };
}

export function setNotifySettings(settings: NotifySettings): void {
  setRaw(STORAGE_KEYS.notifySettings, JSON.stringify(settings));
}

// -------------------- 通知中心已读 --------------------

export function getDismissedNotifications(): Set<string> {
  return new Set<string>(parseJSON<string[]>(getRaw(STORAGE_KEYS.dismissedNotifications), []));
}

export function setDismissedNotifications(ids: Set<string>): void {
  setRaw(STORAGE_KEYS.dismissedNotifications, JSON.stringify([...ids]));
}

// -------------------- 预算超支提醒冷却 --------------------

export interface BudgetWarnCooldown {
  signature: string;
  ts: number;
}

export function getBudgetWarnCooldown(): BudgetWarnCooldown | null {
  return parseJSON<BudgetWarnCooldown | null>(getRaw(STORAGE_KEYS.budgetWarnCooldown), null);
}

export function setBudgetWarnCooldown(cooldown: BudgetWarnCooldown): void {
  setRaw(STORAGE_KEYS.budgetWarnCooldown, JSON.stringify(cooldown));
}

// -------------------- 预算列表页单日提醒 --------------------

export function getBudgetWarnedAt(): number | null {
  const raw = getRaw(STORAGE_KEYS.budgetWarnedAt);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isNaN(ts) ? null : ts;
}

export function setBudgetWarnedAt(ts: number): void {
  setRaw(STORAGE_KEYS.budgetWarnedAt, String(ts));
}
