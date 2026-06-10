import { useThemeStore } from "@/stores/theme-store"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  const isDark = theme === "dark"

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <button
      onClick={handleToggle}
      title={isDark ? "切换浅色" : "切换深色"}
      className={cn(
        "p-1.5 rounded-lg transition-all duration-200",
        "text-surface-500 dark:text-surface-400",
        "hover:bg-surface-100 dark:hover:bg-surface-700",
        "hover:text-surface-700 dark:hover:text-surface-200"
      )}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
