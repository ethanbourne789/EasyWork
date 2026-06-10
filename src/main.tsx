import { createRouter, RouterProvider } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { applyTheme, useThemeStore } from "./stores/theme-store"
import "./index.css"

// Create router
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
})

// Register router type
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Apply initial theme from store
const savedTheme = localStorage.getItem("easywork-theme") as "light" | "dark" | "system" | null
applyTheme(savedTheme || "system")

// Listen to system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme } = useThemeStore.getState()
  if (theme === "system") applyTheme("system")
})

// Render
const rootElement = document.getElementById("root")!
const root = createRoot(rootElement)
root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
