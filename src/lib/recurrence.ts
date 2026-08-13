import type { RecurrenceRule } from "@/types";
import { formatDateChinese } from "@/lib/dateUtils";
import { MS_PER_DAY } from "@/lib/constants";

const DAY_MS = MS_PER_DAY;

/**
 * 根据周期规则，从 fromISO 计算下一次发生的日期（ISO 字符串）。
 * 若已越过 end_date 则返回 null（表示周期结束，不再生成）。
 * 注意：monthly 使用 setMonth 处理跨月（如 1 月 31 +1 月会自然进位到 3 月初），
 * 这是简单实现下的预期行为。
 */
export function computeNextOccurrence(
  rule: RecurrenceRule,
  fromISO: string
): string | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const from = new Date(fromISO);

  let next: Date;
  switch (rule.frequency) {
    case "daily":
      next = new Date(from.getTime() + interval * DAY_MS);
      break;
    case "weekly":
      next = new Date(from.getTime() + interval * 7 * DAY_MS);
      break;
    case "monthly":
      next = new Date(from);
      next.setMonth(next.getMonth() + interval);
      break;
    default:
      return null;
  }

  if (rule.end_date && next.getTime() > new Date(rule.end_date).getTime()) {
    return null;
  }
  return next.toISOString();
}

/** 人类可读的周期描述，用于列表/详情展示。 */
export function describeRecurrence(rule: RecurrenceRule | null | undefined): string | null {
  if (!rule) return null;
  const unitMap: Record<RecurrenceRule["frequency"], string> = {
    daily: "天",
    weekly: "周",
    monthly: "月",
  };
  const unit = unitMap[rule.frequency] ?? "天";
  const intervalText = rule.interval > 1 ? `${rule.interval} ` : "";
  let text = `每 ${intervalText}${unit}重复`;
  if (rule.end_date) {
    const d = new Date(rule.end_date);
    if (!Number.isNaN(d.getTime())) {
      text += ` · 至 ${formatDateChinese(d)}`;
    }
  }
  return text;
}
