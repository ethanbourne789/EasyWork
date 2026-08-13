import { format, parseISO, isValid } from "date-fns";
import { zhCN } from "date-fns/locale";

/**
 * 统一日期格式化工具函数
 * 替代分散在各模块中的重复日期格式化逻辑
 */

/** 格式化为本地日期字符串 (YYYY-MM-DD) */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 格式化为中文日期 (如 "2026年8月12日") */
export function formatDateChinese(date: Date): string {
  return format(date, "yyyy年M月d日", { locale: zhCN });
}

/** 格式化为中文月份 (如 "2026年8月") */
export function formatMonthChinese(date: Date): string {
  return format(date, "yyyy年M月", { locale: zhCN });
}

/** 格式化为短时间 (如 "09:30") */
export function formatTime(date: Date): string {
  return format(date, "HH:mm");
}

/** 格式化为完整日期时间 (如 "2026年8月12日 09:30") */
export function formatDateTime(date: Date): string {
  return format(date, "yyyy年M月d日 HH:mm", { locale: zhCN });
}

/** 从 ISO 字符串安全解析并格式化日期 */
export function formatIsoDate(isoString: string, formatStr = "yyyy-MM-dd"): string {
  const date = parseISO(isoString);
  if (!isValid(date)) return isoString;
  return format(date, formatStr, { locale: zhCN });
}

/** 从 ISO 字符串安全解析并格式化为中文日期 */
export function formatIsoDateChinese(isoString: string): string {
  const date = parseISO(isoString);
  if (!isValid(date)) return isoString;
  return formatDateChinese(date);
}

/** 获取相对日期 (今天/明天/昨天/具体日期) */
export function formatRelativeDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays === -1) return "昨天";
  if (diffDays > 1 && diffDays <= 7) return `${diffDays}天后`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)}天前`;

  return formatDateChinese(date);
}
