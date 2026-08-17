import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, ListChecks, Mail, NotebookText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** 移动端记账 Tab 图标：人民币符号 ¥（与桌面端侧边栏及原型保持一致） */
function YenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <text x="12" y="18" fontSize="18" fontWeight={700} textAnchor="middle" fill="currentColor" stroke="none" fontFamily="system-ui,-apple-system,sans-serif">¥</text>
    </svg>
  );
}

const TAB_ROUTES = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/tasks", key: "nav.tasks", icon: ListChecks },
  { to: "/mail", key: "nav.mail", icon: Mail },
  { to: "/notes", key: "nav.notes", icon: NotebookText },
  { to: "/finance", key: "nav.finance", icon: YenIcon },
];

export function MobileTabBar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) return null;

  return (
    <nav className="flex items-center justify-around border-t bg-card h-14 pb-[env(safe-area-inset-bottom)]">
      {TAB_ROUTES.map(({ to, key, icon: Icon }) => {
        const active = pathname.startsWith(to);
        const label = t(key);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
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
    </nav>
  );
}
