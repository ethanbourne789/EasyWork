import { create } from "zustand"

interface SidebarState {
  collapsed: boolean
  activeModule: string
  toggle: () => void
  setActiveModule: (module: string) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  activeModule: "dashboard",
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
  setActiveModule: (module) => set({ activeModule: module }),
}))
