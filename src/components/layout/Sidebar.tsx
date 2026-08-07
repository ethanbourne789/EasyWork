import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Mail, NotebookText, Wallet, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/tasks", label: "任务", icon: ListChecks },
  { to: "/mail", label: "邮箱", icon: Mail },
  { to: "/notes", label: "笔记", icon: NotebookText },
  { to: "/finance", label: "记账", icon: Wallet },
  { to: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden md:flex flex-col items-center gap-1 w-14 py-4 border-r bg-card">
      {navItems.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon size={20} />
            <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs opacity-0 shadow group-hover:opacity-100 bg-background border">
              {label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}