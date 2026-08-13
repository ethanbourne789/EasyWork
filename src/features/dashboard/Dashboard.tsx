import { OverviewCards } from "@/features/dashboard/OverviewCards";
import { TodayFocus } from "@/features/dashboard/TodayFocus";
import { RecentFinance } from "@/features/dashboard/RecentFinance";
import { MiniCalendar } from "@/features/dashboard/MiniCalendar";
import { useTasks } from "@/features/tasks/useTasks";
import { useAuthStore } from "@/features/auth/authStore";
import { useProfile } from "@/features/settings/useProfile";
import { formatDateChinese } from "@/lib/dateUtils";

import { Link } from "@tanstack/react-router";
import { ClipboardCheck, NotebookText, PiggyBank, CalendarDays } from "lucide-react";

function greetingByHour(hour: number): string {
  if (hour < 5) return "凌晨好";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function QuickActions() {
  const actions = [
    { to: "/tasks", label: "新建任务", icon: ClipboardCheck, color: "text-brand-700 bg-brand-50" },
    { to: "/notes", label: "新建笔记", icon: NotebookText, color: "text-foreground bg-muted" },
    { to: "/finance", label: "记一笔", icon: PiggyBank, color: "text-destructive bg-secondary" },
    { to: "/calendar", label: "添加日程", icon: CalendarDays, color: "text-brand-700 bg-brand-100" },
  ];

  return (
    <div>
      <strong className="text-[15px] font-semibold">快捷操作</strong>
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
  const { data: tasks = [] } = useTasks();
  const session = useAuthStore((s) => s.session);
  const { data: profile } = useProfile();

  const now = new Date();
  const greeting = greetingByHour(now.getHours());
  const dateLabel = formatDateChinese(now);
  const pending = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress",
  ).length;
  const email = session?.user?.email ?? "";
  const name = profile?.display_name || (email ? email.split("@")[0] : "同学");

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 问候语 — 对齐原型 .screen-head（动态生成，不再写死） */}
      <div className="mb-2">
        <h1 className="font-display text-2xl font-semibold leading-tight">
          {greeting}，{name} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dateLabel} — 今天有 {pending} 项待办，先把最重要的做了。
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
