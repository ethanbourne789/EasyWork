/**
 * 轻量客户端通知工具（无需后端）。
 * 用于预算超支提醒等场景；真实邮件收发 / 系统级后台通知仍需后端支持。
 */
import { format } from "date-fns";
import { financeApi } from "@/features/finance/financeApi";
import { NOTIFICATION_COOLDOWN } from "@/lib/constants";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function notify(title: string, body?: string): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

const NOTIFY_KEY = "easywork:notifications";
const NOTIFY_DEFAULT = {
  task_reminder: true,
  email_notify: true,
  budget_warning: false,
};

const BUDGET_WARN_KEY = "easywork:budget-warn-cooldown";
const BUDGET_WARN_COOLDOWN_MS = NOTIFICATION_COOLDOWN;

export function loadNotifyPref(): {
  task_reminder: boolean;
  email_notify: boolean;
  budget_warning: boolean;
} {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (raw) return { ...NOTIFY_DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return NOTIFY_DEFAULT;
}

/**
 * 检查当前月份各分类预算，对超支项通过系统通知提醒
 * （仅在用户开启「预算超支警告」时）。
 * 内置冷却：仅当存在「新增」超支预算且距上次提醒已超过 30 分钟时才提醒，
 * 避免每次组件挂载都重复推送。
 * 返回触发提醒的分类名列表。
 */
export async function fireBudgetWarnings(): Promise<string[]> {
  const pref = loadNotifyPref();
  if (!pref.budget_warning) return [];
  const warned: string[] = [];
  try {
    // 统一使用本地时区月份，与 BudgetList 保持一致，避免 UTC 跨天导致查错月份
    const currentMonth = format(new Date(), "yyyy-MM");
    const currentYearMonth = Number(format(new Date(), "yyyyMM"));

    // local-first：数据源为本地 SQLite（经 Tauri 命令），本地数据量小，直接全量拉取后客户端过滤
    const [allBudgets, categories, allTransactions] = await Promise.all([
      financeApi.listBudgets(),
      financeApi.listCategories(),
      financeApi.listTransactions(),
    ]);
    // 只取当前生效的预算行（按 year_month 精确匹配），避免历史月份预算参与本月判断
    const budgets = (allBudgets ?? []).filter((b) => b.year_month === currentYearMonth);
    // 本月支出（仅 expense，按本地日期前缀过滤）
    const transactions = (allTransactions ?? []).filter(
      (t) => t.type === "expense" && (t.date ?? "").startsWith(currentMonth),
    );

    // 本月分类支出聚合 + 整体总支出
    const spending: Record<string, number> = {};
    let totalSpent = 0;
    for (const t of transactions ?? []) {
      const amt = t.amount ?? 0;
      if (t.category_id) {
        spending[t.category_id] = (spending[t.category_id] ?? 0) + amt;
      }
      totalSpent += amt;
    }

    // 超支判定与 BudgetList 保持一致：有效额度 = 预算 + 上月结转（carry_over 可为负）；
    // overall 预算（category_id 为 null）用本月总支出比较。
    const isOverBudget = (b: { scope?: string | null; category_id?: string | null; amount?: number | null; carry_over?: number | null }): boolean => {
      const effective = (b.amount ?? 0) + (b.carry_over ?? 0);
      const spent = b.scope === "overall" ? totalSpent : (spending[b.category_id ?? ""] ?? 0);
      return spent > effective;
    };

    // 先收集当前超支的预算 id，用于冷却去重（避免对相同超支集合反复提醒）
    const overBudgetIds = (budgets ?? [])
      .filter(isOverBudget)
      .map((b) => b.id)
      .sort();
    const signature = `${currentMonth}|${overBudgetIds.join(",")}`;

    let shouldNotify = overBudgetIds.length > 0;
    try {
      const raw = localStorage.getItem(BUDGET_WARN_KEY);
      if (raw) {
        const { signature: lastSig, ts } = JSON.parse(raw) as {
          signature: string;
          ts: number;
        };
        const withinCooldown =
          typeof ts === "number" && Date.now() - ts < BUDGET_WARN_COOLDOWN_MS;
        // 集合未变化且仍在冷却期内 → 跳过
        if (signature === lastSig && withinCooldown) shouldNotify = false;
      }
    } catch {
      /* 读取冷却记录失败则用默认行为 */
    }

    if (shouldNotify && overBudgetIds.length > 0) {
      for (const b of budgets ?? []) {
        if (!isOverBudget(b)) continue;
        const effective = (b.amount ?? 0) + (b.carry_over ?? 0);
        const spent = b.scope === "overall" ? totalSpent : (spending[b.category_id ?? ""] ?? 0);
        const name =
          b.scope === "overall"
            ? "整体预算"
            : (categories ?? []).find((c) => c.id === b.category_id)?.name ?? "未分类";
        notify("预算超支提醒", `${name} 已超支 ¥${(spent - effective).toFixed(2)}`);
        warned.push(name);
      }
      try {
        localStorage.setItem(
          BUDGET_WARN_KEY,
          JSON.stringify({ signature, ts: Date.now() })
        );
      } catch {
        /* 写入冷却记录失败不影响提醒 */
      }
    }
  } catch {
    /* 通知失败不影响主流程 */
  }
  return warned;
}
