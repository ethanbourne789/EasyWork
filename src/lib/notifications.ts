import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useTasks } from "@/features/tasks/useTasks";
import { useTransactions, useBudgets, useCategories } from "@/features/finance/useFinance";
import { useFolderUnreadCounts } from "@/features/mail/useMail";
import type { Task, Transaction, Budget, Category } from "@/types";
import { MS_PER_DAY } from "@/lib/constants";

export type NotificationType = "budget" | "task" | "mail";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  /** 排序用时间戳 */
  ts: number;
}

export interface NotificationsApi {
  items: NotificationItem[];
  unreadCount: number;
  dismiss: (id: string) => void;
  markAllRead: () => void;
}

const DISMISS_KEY = "easywork:dismissed-notifications";
const DAY = MS_PER_DAY;

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set<string>();
}

function saveDismissed(set: Set<string>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/**
 * 聚合多模块事件为统一通知列表：预算超支、任务到期、邮件未读。
 * - 数据来自各模块已有的 React Query 缓存（task/transaction/budget/category/email folder），不额外发请求。
 * - 周期刷新（每 60s）以常驻检查，不再依赖 BudgetList 页面挂载（修复 P4）。
 * - 已读状态按 id 存于 localStorage；仅保留仍处于「活跃」的已读项，便于下月/新邮件再次提醒。
 */
export function useNotifications(): NotificationsApi {
  const { data: tasksRaw } = useTasks();
  const { data: txRaw } = useTransactions();
  const { data: budgetsRaw } = useBudgets();
  const { data: catsRaw } = useCategories();
  const { data: folderUnreadRaw } = useFolderUnreadCounts();

  const [now, setNow] = useState<number>(() => Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  // 常驻周期检查（P4）：不依赖某个页面挂载
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const items = useMemo<NotificationItem[]>(() => {
    const tasks = (tasksRaw ?? []) as Task[];
    const transactions = (txRaw ?? []) as Transaction[];
    const budgets = (budgetsRaw ?? []) as Budget[];
    const categories = (catsRaw ?? []) as Category[];
    const folderUnread = (folderUnreadRaw ?? {}) as Record<string, number>;
    const result: NotificationItem[] = [];
    const currentMonth = format(new Date(now), "yyyy-MM");
    const currentMonthNum = Number(format(new Date(now), "yyyyMM"));

    // 1) 预算超支（仅当前月）
    const categorySpending: Record<string, number> = {};
    let overallSpent = 0;
    for (const t of transactions) {
      if (t.type !== "expense" || !(t.date || "").startsWith(currentMonth)) continue;
      overallSpent += t.amount;
      if (t.category_id) {
        categorySpending[t.category_id] = (categorySpending[t.category_id] ?? 0) + t.amount;
      }
    }
    for (const b of budgets) {
      if (b.year_month !== currentMonthNum) continue;
      // 有效额度 = 预算 + 上月结转（与 BudgetList 保持一致；carry_over 可为负）
      const effective = (b.amount ?? 0) + (b.carry_over ?? 0);
      if (effective <= 0) continue;
      const totalSpent = b.scope === "overall" ? overallSpent : categorySpending[b.category_id ?? ""] ?? 0;
      if (totalSpent > effective) {
        const catName = b.scope === "overall"
          ? "整体"
          : (categories.find((c) => c.id === b.category_id)?.name ?? "未分类");
        result.push({
          id: `budget:${b.id}:${currentMonthNum}`,
          type: "budget",
          title: "预算超支提醒",
          body: `${catName} 本月已支出 ¥${totalSpent.toFixed(2)}，超出预算 ¥${(totalSpent - effective).toFixed(2)}`,
          href: "/finance",
          ts: now,
        });
      }
    }

    // 2) 任务到期（未来 2 天内，未完成）
    const soon = now + 2 * DAY;
    for (const t of tasks) {
      if (t.status === "done" || !t.due_date) continue;
      const due = new Date(t.due_date).getTime();
      if (due <= soon) {
        const overdue = due < now;
        result.push({
          id: `task:${t.id}`,
          type: "task",
          title: overdue ? "任务已逾期" : "任务即将到期",
          body: t.title,
          href: `/tasks?focus=${t.id}`,
          ts: due,
        });
      }
    }

    // 3) 邮件未读
    const totalUnread = Object.values(folderUnread).reduce<number>((a, b) => a + (b ?? 0), 0);
    if (totalUnread > 0) {
      result.push({
        id: "mail:unread",
        type: "mail",
        title: "未读邮件",
        body: `您有 ${totalUnread} 封未读邮件`,
        href: "/mail",
        ts: now,
      });
    }

    return result.sort((a, b) => b.ts - a.ts);
  }, [tasksRaw, txRaw, budgetsRaw, catsRaw, folderUnreadRaw, now]);

  // 自动清理已读集合：仅保留仍处于「活跃」的 id，便于下月 / 新邮件重新提醒
  const activeIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  useEffect(() => {
    setDismissed((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (activeIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [activeIds]);

  const visible = useMemo(() => items.filter((i) => !dismissed.has(i.id)), [items, dismissed]);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };
  const markAllRead = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      items.forEach((i) => next.add(i.id));
      saveDismissed(next);
      return next;
    });
  };

  return { items: visible, unreadCount: visible.length, dismiss, markAllRead };
}
