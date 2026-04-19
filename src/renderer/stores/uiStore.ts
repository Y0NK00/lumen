import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMode = 'chat' | 'code' | 'helm'

export type HelmNav = 'new-task' | 'projects' | 'scheduled' | 'customize' | 'dispatch'

interface UIStore {
  // Active top-level mode
  mode: AppMode
  setMode: (mode: AppMode) => void

  // Active nav item within Helm mode
  helmNav: HelmNav
  setHelmNav: (nav: HelmNav) => void

  // Sidebar visibility (toggleable via Ctrl+B)
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      mode: 'chat',
      setMode: (mode) => set({ mode }),

      helmNav: 'new-task',
      setHelmNav: (helmNav) => set({ helmNav }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    { name: 'lumen-ui' }
  )
)
