import { useThemeStore } from "@/stores/theme-store"
import { Sun, Moon, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"

const options: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "浅色" },
  { value: "dark", icon: Moon, label: "深色" },
  { value: "system", icon: Monitor, label: "系统" },
]

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            theme === option.value
              ? "bg-white text-surface-900 shadow-sm"
              : "text-surface-500 hover:text-surface-700"
          )}
        >
          <option.icon size={14} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}
