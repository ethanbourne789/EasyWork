import { Link, useRouterState } from "@tanstack/react-router"
import { useSidebarStore } from "@/stores/sidebar-store"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Columns3,
  Calendar,
  Mail,
  StickyNote,
  TrendingUp,
  PiggyBank,
  Dumbbell,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

const navItems = [
  { id: "dashboard", to: "/", icon: LayoutDashboard, label: "仪表盘" },
  { id: "kanban", to: "/kanban", icon: Columns3, label: "看板" },
  { id: "calendar", to: "/calendar", icon: Calendar, label: "日历" },
  { id: "email", to: "/email", icon: Mail, label: "邮箱" },
  { id: "notes", to: "/notes", icon: StickyNote, label: "笔记" },
  { id: "stocks", to: "/stocks", icon: TrendingUp, label: "股票" },
  { id: "accounting", to: "/accounting", icon: PiggyBank, label: "记账" },
  { id: "sports", to: "/sports", icon: Dumbbell, label: "运动" },
  { id: "logs", to: "/logs", icon: ScrollText, label: "日志" },
  { id: "settings", to: "/settings", icon: Settings, label: "设置" },
]

export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-white border-r border-surface-200 transition-all duration-300 shrink-0",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-surface-100">
        {!collapsed && (
          <span className="font-bold text-lg text-primary-600 tracking-tight">
            EasyWork
          </span>
        )}
        {collapsed && (
          <span className="font-bold text-lg text-primary-600 tracking-tight mx-auto">
            E
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.to)

          return (
            <Link
              key={item.id}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-surface-600 hover:bg-surface-100 hover:text-surface-900"
              )}
            >
              <item.icon
                size={20}
                className={cn(
                  "shrink-0 transition-colors",
                  isActive ? "text-primary-600" : "text-surface-400 group-hover:text-surface-600"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-surface-100">
        <button
          onClick={toggle}
          className="flex items-center justify-center w-full py-2 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  )
}
