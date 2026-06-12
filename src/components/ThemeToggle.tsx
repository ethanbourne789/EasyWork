import { useThemeStore } from "@/stores/theme-store"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  /** When true, render a square icon-only button (for collapsed sidebar). */
  iconOnly?: boolean
  className?: string
}

export function ThemeToggle({ iconOnly = false, className }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore()

  const isDark = theme === "dark"

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <button
      onClick={handleToggle}
      title={isDark ? "切换浅色" : "切换深色"}
      aria-label={isDark ? "切换浅色" : "切换深色"}
      className={cn(
        iconOnly
          ? "flex items-center justify-center w-full p-2 rounded-lg text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
          : "p-1.5 rounded-lg transition-all duration-200 text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 hover:text-surface-700 dark:hover:text-surface-200",
        className
      )}
    >
      {isDark ? <Sun size={iconOnly ? 18 : 16} /> : <Moon size={iconOnly ? 18 : 16} />}
    </button>
  )
}
