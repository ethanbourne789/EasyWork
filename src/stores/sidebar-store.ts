import { create } from "zustand"

const isLaptop = typeof window !== "undefined" ? window.innerWidth < 1440 : false

interface SidebarState {
  collapsed: boolean
  mobileOpen: boolean
  activeModule: string
  toggle: () => void
  setCollapsed: (value: boolean) => void
  setActiveModule: (module: string) => void
  setMobileOpen: (open: boolean) => void
  toggleMobile: () => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: isLaptop,
  mobileOpen: false,
  activeModule: "dashboard",
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (value) => set({ collapsed: value }),
  setActiveModule: (module) => set({ activeModule: module }),
  setMobileOpen: (open) => set({ mobileOpen: open }),
  toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
}))
