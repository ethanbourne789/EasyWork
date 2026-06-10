import { useTranslation } from "react-i18next"
import { useThemeStore } from "@/stores/theme-store"
import { Sun, Moon, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"

const options: { value: Theme; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
]

export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="flex items-center gap-1 bg-surface-100 dark:bg-surface-800 rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            theme === option.value
              ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm"
              : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
          )}
        >
          <option.icon size={14} />
          <span>{t(`theme.${option.value}`)}</span>
        </button>
      ))}
    </div>
  )
}
