/**
 * 全局常量定义
 * 提取代码中的魔法数字，提高可读性和可维护性
 */

// 时间相关常量
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

// UI 延迟常量
export const TOAST_DURATION = 2000; // Toast 提示显示时长
export const DEBOUNCE_DELAY = 500; // 输入防抖延迟
export const AUTOSAVE_DELAY = 1500; // 自动保存延迟
export const DRAFT_SAVE_DELAY = 800; // 草稿保存提示延迟

// 重试相关常量
export const DEFAULT_RETRY_COUNT = 1; // 默认重试次数
export const MUTATION_RETRY_COUNT = 0; // Mutation 不重试

// 通知相关常量
export const NOTIFICATION_COOLDOWN = 30 * MS_PER_MINUTE; // 通知冷却时间
export const NOTIFICATION_EXPIRY = 24 * MS_PER_HOUR; // 通知过期时间

// 查询缓存常量
export const QUERY_STALE_TIME = 30 * MS_PER_SECOND; // 查询过期时间
