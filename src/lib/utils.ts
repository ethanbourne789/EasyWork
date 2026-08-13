import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import DOMPurify from "dompurify";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 净化不可信 HTML（如邮件正文），防御存储型 XSS。
 * 仅允许安全的排版标签与属性，禁止 script/on* 事件与危险协议。
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "form", "input", "button", "script", "link", "meta"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });
}

/**
 * 返回「本周一」的 0 点（中文习惯以周一为一周起点）。
 * getDay() 中 0=周日 .. 6=周六，故周日需回退 6 天。
 */
export function getMonday(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}