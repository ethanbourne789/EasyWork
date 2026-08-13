import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Mail, NotebookText, CalendarDays, Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** 移动端记账 Tab 图标：人民币符号 ¥（与桌面端侧边栏及原型保持一致） */
function YenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <text x="12" y="18" fontSize="18" fontWeight={700} textAnchor="middle" fill="currentColor" stroke="none" fontFamily="system-ui,-apple-system,sans-serif">¥</text>
    </svg>
  );
}

const tabs = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/tasks", label: "任务", icon: ListChecks },
  { to: "/mail", label: "邮箱", icon: Mail },
  { to: "/notes", label: "笔记", icon: NotebookText },
  { to: "/finance", label: "记账", icon: YenIcon },
  { to: "/calendar", label: "日历", icon: CalendarDays },
  { to: "/settings", label: "设置", icon: Settings },
];

export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="md:hidden flex items-center justify-around border-t bg-card h-14 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
              "h-full min-h-[44px] min-w-[44px] select-none transition-colors",
              "active:bg-accent/60",
              active ? "text-brand-700" : "text-muted-foreground"
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        aria-label="搜索"
        onClick={() => window.dispatchEvent(new CustomEvent("ew:search"))}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
          "h-full min-h-[44px] min-w-[44px] select-none transition-colors",
          "active:bg-accent/60 text-muted-foreground"
        )}
      >
        <Search size={20} />
        搜索
      </button>
    </nav>
  );
}