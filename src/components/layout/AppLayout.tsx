import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { GlobalSearchDialog } from "@/components/layout/GlobalSearchDialog";
import { NetworkStatus } from "@/components/NetworkStatus";
import { useRealtimeStore } from "@/features/realtime/realtimeStore";

export function AppLayout() {
  const { t } = useTranslation();
  const realtimeStatus = useRealtimeStore((s) => s.status);
  const realtimeError = useRealtimeStore((s) => s.error);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
      <GlobalSearchDialog />
      <NetworkStatus />
      {realtimeStatus === "reconnecting" && (
        <div className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background shadow-md">
          {t("layout.realtimeDisconnected")}
        </div>
      )}
      {realtimeStatus === "unavailable" && (
        <div
          className="pointer-events-auto fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm"
          title={realtimeError ?? t("layout.realtimeRetrying")}
        >
          {t("layout.realtimeUnavailable")}
        </div>
      )}
    </div>
  );
}
