import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Sidebar } from "@/components/Sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Bell, Search } from "lucide-react"

function RootLayout() {
  const { t } = useTranslation()

  return (
    <div className="flex h-screen overflow-hidden dark:bg-surface-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-6 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500" />
              <input
                type="text"
                placeholder={t("common.search")}
                className="w-40 lg:w-72 h-9 pl-9 pr-4 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder:text-surface-400 dark:placeholder:text-surface-500 dark:text-surface-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button className="relative p-2 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 bg-surface-50 dark:bg-surface-950">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
