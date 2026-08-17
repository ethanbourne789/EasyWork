import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";
import { GlobalSearchDialog } from "@/components/layout/GlobalSearchDialog";
import { NetworkStatus } from "@/components/NetworkStatus";
import { useAuthStore } from "@/features/auth/authStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export function AppLayout() {
  const { t } = useTranslation();
  const isDemo = useAuthStore((s) => s.isDemo);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        {!isDesktop && (
        <header className="flex items-center justify-between border-b bg-card px-4 h-14 shrink-0">
          <MobileNavDrawer />
          <span className="font-display text-lg font-semibold">EasyWork</span>
          <div className="w-9" />
        </header>
        )}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
      <GlobalSearchDialog />
      <NetworkStatus />
      {isDemo && (
        <div className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-md">
          {t("auth.demoMode")}
        </div>
      )}
    </div>
  );
}
