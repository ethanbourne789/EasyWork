import { create } from "zustand"

type Theme = "light" | "dark" | "system"

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem("easywork-theme") as Theme) || "system",
  setTheme: (theme) => {
    localStorage.setItem("easywork-theme", theme)
    set({ theme })
    applyTheme(theme)
  },
}))

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.classList.toggle("dark", prefersDark)
  } else {
    root.classList.toggle("dark", theme === "dark")
  }
}
