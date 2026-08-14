import { OverviewCards } from "@/features/dashboard/OverviewCards";
import { TodayFocus } from "@/features/dashboard/TodayFocus";
import { RecentFinance } from "@/features/dashboard/RecentFinance";
import { MiniCalendar } from "@/features/dashboard/MiniCalendar";
import { useTasks } from "@/features/tasks/useTasks";
import { useAuthStore } from "@/features/auth/authStore";
import { useProfile } from "@/features/settings/useProfile";
import { formatDateChinese } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";

import { Link } from "@tanstack/react-router";
import { ClipboardCheck, NotebookText, PiggyBank, CalendarDays } from "lucide-react";

function greetingByHour(hour: number, t: (key: string) => string): string {
  if (hour < 6) return t("dashboard.goodLateNight");
  if (hour < 12) return t("dashboard.goodMorning");
  if (hour < 18) return t("dashboard.goodAfternoon");
  return t("dashboard.goodEvening");
}

function QuickActions() {
  const { t } = useTranslation();
  const actions = [
    { to: "/tasks", label: t("dashboard.newTask"), icon: ClipboardCheck, color: "text-brand-700 bg-brand-50" },
    { to: "/notes", label: t("dashboard.newNote"), icon: NotebookText, color: "text-foreground bg-muted" },
    { to: "/finance", label: t("dashboard.addExpense"), icon: PiggyBank, color: "text-destructive bg-secondary" },
    { to: "/calendar", label: t("dashboard.addEvent"), icon: CalendarDays, color: "text-brand-700 bg-brand-100" },
  ];

  return (
    <div>
      <strong className="text-[15px] font-semibold">{t("dashboard.quickActions")}</strong>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {actions.map(({ to, label, icon: Icon, color }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/60"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
              <Icon size={18} />
            </div>
            <span className="text-[12px] font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const { data: tasks = [] } = useTasks();
  const user = useAuthStore((s) => s.user);
  const { data: profile } = useProfile();

  const now = new Date();
  const greeting = greetingByHour(now.getHours(), t);
  const dateLabel = formatDateChinese(now);
  const pending = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress",
  ).length;
  const email = user?.email ?? "";
  const name = profile?.display_name || (email ? email.split("@")[0] : "同学");

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 问候语 — 对齐原型 .screen-head（动态生成，不再写死） */}
      <div className="mb-2">
        <h1 className="font-display text-2xl font-semibold leading-tight">
          {greeting}，{name} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dateLabel} — {t("dashboard.todayPending", { count: pending })}
        </p>
      </div>

      {/* 4 张统计卡 — 对齐原型 .grid.cols-4 > .card.stat */}
      <OverviewCards />

      {/* 双栏：今日聚焦(span 2) + 近期记账 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <TodayFocus />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <RecentFinance />
        </div>
      </div>

      {/* 双栏：迷你月历(span 2) + 快捷操作 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <MiniCalendar />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
