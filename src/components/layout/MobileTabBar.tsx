import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Mail, NotebookText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/tasks", label: "任务", icon: ListChecks },
  { to: "/mail", label: "邮箱", icon: Mail },
  { to: "/notes", label: "笔记", icon: NotebookText },
  { to: "/finance", label: "记账", icon: Wallet },
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
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px]",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}