import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AppLayout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-12 items-center justify-end px-3 border-b">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}