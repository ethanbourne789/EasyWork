import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, Menu, Search, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerBody, DrawerClose, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/authStore";
import { useNavigate } from "@tanstack/react-router";

const MORE_ROUTES = [
  { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { to: "/settings", key: "nav.settings", icon: Settings },
];

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const openSearch = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("ew:search"));
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={t("common.menu")}
        onClick={() => setOpen(true)}
      >
        <Menu size={22} />
      </Button>
      <Drawer open={open} onOpenChange={setOpen} side="left" width="w-[260px]">
        <DrawerHeader>
          <DrawerTitle>EasyWork</DrawerTitle>
          <DrawerClose onClose={() => setOpen(false)} />
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-1 p-2">
          <button
            type="button"
            onClick={openSearch}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              "text-muted-foreground hover:bg-accent"
            )}
          >
            <Search size={20} />
            {t("common.search")}
          </button>
          {MORE_ROUTES.map(({ to, key, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Icon size={20} />
                {t(key)}
              </Link>
            );
          })}
          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                "text-destructive hover:bg-destructive/10"
              )}
            >
              <LogOut size={20} />
              {t("settings.logout")}
            </button>
          </div>
        </DrawerBody>
      </Drawer>
    </>
  );
}
