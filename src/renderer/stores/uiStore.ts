import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMode = 'chat' | 'code' | 'helm'

export type HelmNav = 'chat' | 'new-task' | 'projects' | 'scheduled' | 'customize' | 'dispatch'

// Tracks a task dispatched from Helm — used by the Progress widget.
// Not persisted: cleared on reload, capped at 20 entries.
export interface DispatchRecord {
  id: string
  prompt: string
  agentName: string
  convId: string
  createdAt: number
}

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

  // Which conversation is shown in Helm's center chat view.
  // null = show the task form for the current helmNav item.
  // Not persisted — resets on reload.
  helmConvId: string | null
  setHelmConvId: (id: string | null) => void

  // Pending auto-send — HelmChatView picks this up, fires sendMessage(),
  // then clears it. ChatPane has a mode guard so it only consumes in 'chat' mode.
  // Not persisted.
  pendingDispatch: string | null
  setPendingDispatch: (prompt: string | null) => void

  // Recent Helm dispatches for the Progress widget. Not persisted, capped at 20.
  dispatchLog: DispatchRecord[]
  addDispatch: (record: DispatchRecord) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      mode: 'chat',
      setMode: (mode) => set({ mode }),

      helmNav: 'chat',
      setHelmNav: (helmNav) => set({ helmNav }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      helmConvId: null,
      setHelmConvId: (helmConvId) => set({ helmConvId }),

      pendingDispatch: null,
      setPendingDispatch: (pendingDispatch) => set({ pendingDispatch }),

      dispatchLog: [],
      addDispatch: (record) =>
        set((s) => ({
          dispatchLog: [record, ...s.dispatchLog].slice(0, 20),
        })),
    }),
    {
      name: 'lumen-ui',
      // Only persist UI layout — runtime state is ephemeral
      partialize: (s) => ({
        mode:             s.mode,
        helmNav:          s.helmNav,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
)
