// src/renderer/stores/helmStore.ts
// Helm mode state: scheduled tasks + dispatch agent roster.
//
// Design notes:
//   - This store intentionally does NOT execute anything. Execution is the
//     responsibility of a future orchestrator (main-process cron runner,
//     scheduled-tasks MCP bridge, etc.). The store only owns declarative
//     state: what tasks exist, what agents are enabled, when they last ran.
//   - Separating state from runtime means the UI can be built, tested, and
//     iterated on without wiring a backend. When execution lands, it just
//     reads from and writes to this store.
//   - Persisted so users don't lose scheduled tasks on reload. Versioned so
//     schema migrations are cheap later.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Cadence = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface ScheduledTask {
  id: string
  label: string              // short human-readable name
  prompt: string             // the actual task prompt
  cadence: Cadence
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  nextRunAt?: number         // optional — computed by a future runner
}

// Agents are preconfigured archetypes (not user-created yet). The store tracks
// which ones are enabled and how many tasks have been routed to each.
export type AgentId = 'code' | 'research' | 'file' | 'schedule'

export interface DispatchAgentState {
  id: AgentId
  enabled: boolean
  tasksRouted: number
}

interface HelmStore {
  // Scheduled
  scheduledTasks: Record<string, ScheduledTask>
  createScheduledTask: (data: Omit<ScheduledTask, 'id' | 'createdAt' | 'enabled'>) => string
  updateScheduledTask: (id: string, patch: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>) => void
  deleteScheduledTask: (id: string) => void
  toggleScheduledTask: (id: string) => void

  // Dispatch
  agents: Record<AgentId, DispatchAgentState>
  toggleAgent: (id: AgentId) => void
  incrementAgentRouteCount: (id: AgentId) => void
}

// Default agent roster — kept in the store (not hardcoded in the component)
// so UI can read enabled state.
const DEFAULT_AGENTS: Record<AgentId, DispatchAgentState> = {
  code:     { id: 'code',     enabled: true,  tasksRouted: 0 },
  research: { id: 'research', enabled: true,  tasksRouted: 0 },
  file:     { id: 'file',     enabled: true,  tasksRouted: 0 },
  schedule: { id: 'schedule', enabled: false, tasksRouted: 0 },
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useHelmStore = create<HelmStore>()(
  persist(
    (set) => ({
      scheduledTasks: {},
      agents: DEFAULT_AGENTS,

      // ── Scheduled CRUD ───────────────────────────────────────────────────

      createScheduledTask: (data) => {
        const id = crypto.randomUUID()
        const task: ScheduledTask = {
          id,
          createdAt: Date.now(),
          enabled: true,
          ...data,
        }
        set((state) => ({
          scheduledTasks: { ...state.scheduledTasks, [id]: task },
        }))
        return id
      },

      updateScheduledTask: (id, patch) => {
        set((state) => {
          const existing = state.scheduledTasks[id]
          if (!existing) return state
          return {
            scheduledTasks: {
              ...state.scheduledTasks,
              [id]: { ...existing, ...patch },
            },
          }
        })
      },

      deleteScheduledTask: (id) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...rest } = state.scheduledTasks
          return { scheduledTasks: rest }
        })
      },

      toggleScheduledTask: (id) => {
        set((state) => {
          const t = state.scheduledTasks[id]
          if (!t) return state
          return {
            scheduledTasks: {
              ...state.scheduledTasks,
              [id]: { ...t, enabled: !t.enabled },
            },
          }
        })
      },

      // ── Dispatch ─────────────────────────────────────────────────────────

      toggleAgent: (id) => {
        set((state) => ({
          agents: {
            ...state.agents,
            [id]: { ...state.agents[id], enabled: !state.agents[id].enabled },
          },
        }))
      },

      incrementAgentRouteCount: (id) => {
        set((state) => ({
          agents: {
            ...state.agents,
            [id]: { ...state.agents[id], tasksRouted: state.agents[id].tasksRouted + 1 },
          },
        }))
      },
    }),
    {
      name: 'lumen-helm',
      version: 1,
      // Merge defaults so new agents added in later versions get picked up
      // automatically without nuking the user's toggled state.
      merge: (persisted, current) => {
        const p = persisted as Partial<HelmStore> | undefined
        return {
          ...current,
          ...(p ?? {}),
          agents: { ...current.agents, ...(p?.agents ?? {}) },
          scheduledTasks: p?.scheduledTasks ?? {},
        }
      },
    }
  )
)

// ─── Display helpers ──────────────────────────────────────────────────────────

export const CADENCE_LABELS: Record<Cadence, string> = {
  once:    'One-time',
  hourly:  'Hourly',
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
}

export const AGENT_META: Record<AgentId, { name: string; desc: string; icon: string }> = {
  code:     { name: 'Code Agent',     desc: 'Shell, grep, git — code tasks',   icon: '⌥' },
  research: { name: 'Research Agent', desc: 'Web search + summarization',      icon: '◎' },
  file:     { name: 'File Agent',     desc: 'Read, write, organize files',     icon: '◫' },
  schedule: { name: 'Schedule Agent', desc: 'Manage recurring jobs',           icon: '◷' },
}
