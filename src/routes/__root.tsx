import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Sidebar } from "@/components/Sidebar"
import { useSidebarStore } from "@/stores/sidebar-store"
import { Menu } from "lucide-react"

function RootLayout() {
  const { toggleMobile } = useSidebarStore()

  return (
    <div className="flex h-screen overflow-hidden dark:bg-surface-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — mobile-only hamburger. Search / ThemeToggle / Bell removed per user request. */}
        <header className="flex items-center h-14 px-4 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shrink-0 md:hidden">
          <button
            onClick={toggleMobile}
            className="p-2 rounded-lg text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
          >
            <Menu size={20} />
          </button>
        </header>

        {/* Content — zero padding so child pages can fully fill the viewport.
            Each page is responsible for its own internal padding/spacing. */}
        <main className="flex-1 overflow-hidden bg-surface-50 dark:bg-surface-950">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
