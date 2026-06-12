import { useEffect, useCallback } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useSidebarStore } from "@/stores/sidebar-store"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Columns3, Calendar, Mail, StickyNote,
  TrendingUp, PiggyBank, Dumbbell, ScrollText, Settings,
  ChevronLeft, ChevronRight, X,
} from "lucide-react"

const navItems = [
  { id: "dashboard", to: "/", icon: LayoutDashboard },
  { id: "kanban", to: "/kanban", icon: Columns3 },
  { id: "calendar", to: "/calendar", icon: Calendar },
  { id: "email", to: "/email", icon: Mail },
  { id: "notes", to: "/notes", icon: StickyNote },
  { id: "stocks", to: "/stocks", icon: TrendingUp },
  { id: "accounting", to: "/accounting", icon: PiggyBank },
  { id: "sports", to: "/sports", icon: Dumbbell },
  { id: "logs", to: "/logs", icon: ScrollText },
]

export function Sidebar() {
  const { t } = useTranslation()
  const { collapsed, mobileOpen, toggle, setCollapsed, setMobileOpen } = useSidebarStore()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  // Auto-collapse sidebar on laptop / smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1440) setCollapsed(true)
      // Close mobile drawer when resizing to desktop
      if (window.innerWidth >= 768) setMobileOpen(false)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [setCollapsed, setMobileOpen])

  // Close mobile drawer on route change
  const onNavClick = useCallback(() => {
    if (window.innerWidth < 768) setMobileOpen(false)
  }, [setMobileOpen])

  // Check if we need the 2-column layout (short screen on mobile)
  const useTwoColumns = typeof window !== "undefined" && window.innerWidth < 768 && window.innerHeight < 700

  const navContent = (
    <nav className={cn("flex-1 py-3 px-2 overflow-y-auto", useTwoColumns ? "grid grid-cols-2 gap-x-1 auto-rows-min" : "space-y-0.5")}>
      {navItems.map((item) => {
        const isActive = item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to)
        return (
          <Link
            key={item.id}
            to={item.to}
            onClick={onNavClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
              collapsed && !mobileOpen ? "justify-center" : "",
              isActive
                ? "bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200"
            )}
          >
            <item.icon
              size={20}
              className={cn(
                "shrink-0 transition-colors",
                isActive ? "text-primary-600 dark:text-primary-400" : "text-surface-400 dark:text-surface-500 group-hover:text-surface-600 dark:group-hover:text-surface-300"
              )}
            />
            {(!collapsed || mobileOpen) && <span>{t(`sidebar.${item.id}`)}</span>}
          </Link>
        )
      })}
    </nav>
  )

  // Footer area: in expanded mode shows ThemeToggle + Settings link + Collapse
  // toggle, in collapsed mode stacks them as icon buttons. Pushed to the bottom
  // of the sidebar via mt-auto.
  const settingsActive = currentPath.startsWith("/settings")
  const footer = (
    <div className="mt-auto p-2 border-t border-surface-100 dark:border-surface-800 flex flex-col gap-0.5">
      {collapsed && !mobileOpen ? (
        <>
          <ThemeToggle iconOnly />
          <Link
            to="/settings"
            onClick={onNavClick}
            className={cn(
              "flex items-center justify-center w-full p-2 rounded-lg transition-all duration-200",
              settingsActive
                ? "bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                : "text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200"
            )}
            title={t("sidebar.settings")}
          >
            <Settings size={20} className="shrink-0" />
          </Link>
          <button
            onClick={toggle}
            className="flex items-center justify-center w-full p-2 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
            title="展开侧边栏"
          >
            <ChevronRight size={18} />
          </button>
        </>
      ) : (
        <>
          <div className={cn("flex items-center gap-1", mobileOpen ? "" : "px-1")}>
            <ThemeToggle />
            <Link
              to="/settings"
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                settingsActive
                  ? "bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                  : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200"
              )}
            >
              <Settings
                size={20}
                className={cn(
                  "shrink-0",
                  settingsActive ? "text-primary-600 dark:text-primary-400" : "text-surface-400 dark:text-surface-500"
                )}
              />
              <span>{t("sidebar.settings")}</span>
            </Link>
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
              title="收起侧边栏"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      {/* ===== DESKTOP SIDEBAR ===== (hidden on mobile) */}
      <aside
        className={cn(
          "hidden md:flex flex-col h-screen bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 transition-all duration-300 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {navContent}
        {footer}
      </aside>

      {/* ===== MOBILE DRAWER BACKDROP ===== */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ===== MOBILE DRAWER ===== (slide from left) */}
      <div
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-surface-900 shadow-2xl md:hidden",
          "flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-surface-200 dark:border-surface-700 shrink-0">
          <span className="font-bold text-base text-primary-600 dark:text-primary-400">EasyWork</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {navContent}
        {footer}
      </div>
    </>
  )
}
