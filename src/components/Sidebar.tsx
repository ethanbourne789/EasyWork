import { useEffect } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useSidebarStore } from "@/stores/sidebar-store"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Columns3, Calendar, Mail, StickyNote,
  TrendingUp, PiggyBank, Dumbbell, ScrollText, Settings,
  ChevronLeft, ChevronRight,
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
  { id: "settings", to: "/settings", icon: Settings },
]

export function Sidebar() {
  const { t } = useTranslation()
  const { collapsed, toggle, setCollapsed } = useSidebarStore()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  // Auto-collapse sidebar on laptop / smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1440) setCollapsed(true)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [setCollapsed])

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 transition-all duration-300 shrink-0",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to)
          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
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
              {!collapsed && <span>{t(`sidebar.${item.id}`)}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-surface-100 dark:border-surface-800">
        <button
          onClick={toggle}
          className="flex items-center justify-center w-full py-2 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  )
}
