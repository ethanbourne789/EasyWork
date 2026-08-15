import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  ClipboardCheck,
  Mail,
  NotebookText,
  CalendarDays,
  Search,
  Bell,
  Settings,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { useProfile } from "@/features/settings/useProfile";
import { useAuthStore } from "@/features/auth/authStore";
import { useNotifications } from "@/lib/notifications";
import { NotificationCenter } from "@/components/layout/NotificationCenter";


type Item = { to: string; labelKey: string; icon: LucideIcon };

const navItems: Item[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/tasks", labelKey: "nav.tasks", icon: ClipboardCheck },
  { to: "/mail", labelKey: "nav.mail", icon: Mail },
  { to: "/notes", labelKey: "nav.notes", icon: NotebookText },
  { to: "/finance", labelKey: "nav.finance", icon: PiggyBank },
  { to: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
];

export function Sidebar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const email = useAuthStore((s) => s.user?.email) ?? "";
  const [notifOpen, setNotifOpen] = useState(false);
  const { items: notifications, unreadCount, dismiss, markAllRead } = useNotifications();

  const openSearch = () => window.dispatchEvent(new CustomEvent("ew:search"));

  return (
    <aside className="relative hidden md:flex flex-col items-center gap-1 w-[60px] py-4 border-r bg-card">
      {/* 品牌徽标 / 个人头像：有头像时显示头像，否则回退为姓名首字母 */}
      <div className="mb-3">
        <Avatar
          src={profile?.avatar_url ?? undefined}
          name={profile?.display_name ?? (email || "E")}
          size="md"
          className="h-[34px] w-[34px] text-xs"
        />
      </div>
      {navItems.map(({ to, labelKey, icon: Icon }) => {
        const active = pathname.startsWith(to);
        const label = t(labelKey);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
              active
                ? "bg-brand-50 text-brand-700"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {active && (
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand-500" />
            )}
            <Icon size={23} />
            <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              {label}
            </span>
          </Link>
        );
      })}

      {/* 账户区：固定在底部 */}
      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={openSearch}
          aria-label={t('common.search')}
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent"
        >
          <Search size={23} />
          <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {t('common.search')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setNotifOpen(true)}
          aria-label={t('settings.notifications')}
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent"
        >
          <Bell size={23} />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {t('settings.notifications')}
          </span>
        </button>

        <NotificationCenter
          open={notifOpen}
          onOpenChange={setNotifOpen}
          items={notifications}
          onDismiss={dismiss}
          onMarkAllRead={markAllRead}
        />

        <Link
          to="/settings"
          aria-label={t('nav.settings')}
          className={cn(
            "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
            pathname.startsWith("/settings")
              ? "bg-brand-50 text-brand-700"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {pathname.startsWith("/settings") && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand-500" />
          )}
          <Settings size={23} />
          <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {t('nav.settings')}
          </span>
        </Link>
      </div>
    </aside>
  );
}
