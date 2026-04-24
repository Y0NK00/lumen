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

// ─── Cron IPC helper ──────────────────────────────────────────────────────────
// Thin wrapper so store actions can notify the main-process cron runner without
// importing the full window type. Falls back silently if preload isn't loaded.

type CronTask = { id: string; label: string; prompt: string; cadence: string; enabled: boolean }

function cronSend(action: 'register' | 'unregister' | 'sync', data: CronTask | string | CronTask[]) {
  if (typeof window === 'undefined') return
  const t = (window as Window & { tower?: {
    cronRegister?:   (task: CronTask) => void
    cronUnregister?: (id: string) => void
    cronSync?:       (tasks: CronTask[]) => void
  } }).tower
  if (!t) return
  if (action === 'register'   && t.cronRegister)   t.cronRegister(data as CronTask)
  if (action === 'unregister' && t.cronUnregister) t.cronUnregister(data as string)
  if (action === 'sync'       && t.cronSync)       t.cronSync(data as CronTask[])
}

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
  scheduledFor?: number      // for cadence='once': unix ms timestamp of when to fire
  lastStatus?: 'ok' | 'error'
}

export interface TaskResult {
  taskId: string
  label: string
  prompt: string
  result: string
  ranAt: number
  error?: string
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

  // Execution results — last 20 per task, persisted
  taskResults: Record<string, TaskResult[]>
  recordTaskRan:    (taskId: string, ranAt: number) => void
  recordTaskResult: (result: TaskResult) => void
  clearTaskResults: (taskId: string) => void

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
    (set, get) => ({
      scheduledTasks: {},
      taskResults: {},
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
        cronSend('register', task)
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
        const updated = get().scheduledTasks[id]
        if (updated) cronSend('register', updated)  // re-register with new settings
      },

      deleteScheduledTask: (id) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...rest } = state.scheduledTasks
          return { scheduledTasks: rest }
        })
        cronSend('unregister', id)
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
        const toggled = get().scheduledTasks[id]
        if (toggled) {
          if (toggled.enabled) cronSend('register', toggled)
          else cronSend('unregister', id)
        }
      },

      // ── Execution results ─────────────────────────────────────────────────

      recordTaskRan: (taskId, ranAt) => {
        set((state) => {
          const task = state.scheduledTasks[taskId]
          if (!task) return state
          return {
            scheduledTasks: {
              ...state.scheduledTasks,
              [taskId]: { ...task, lastRunAt: ranAt },
            },
          }
        })
      },

      recordTaskResult: (result) => {
        set((state) => {
          const existing = state.taskResults[result.taskId] ?? []
          const updated = [result, ...existing].slice(0, 20) // keep last 20 per task
          // Also update lastStatus on the task
          const task = state.scheduledTasks[result.taskId]
          const lastStatus: 'ok' | 'error' = result.error ? 'error' : 'ok'
          const taskPatch = task
            ? { scheduledTasks: { ...state.scheduledTasks, [result.taskId]: { ...task, lastStatus } } }
            : {}
          return {
            ...taskPatch,
            taskResults: { ...state.taskResults, [result.taskId]: updated },
          }
        })
      },

      clearTaskResults: (taskId) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [taskId]: _removed, ...rest } = state.taskResults
          return { taskResults: rest }
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

export const AGENT_META: Record<AgentId, { name: string; desc: string; icon: string; systemPrompt: string }> = {
  code: {
    name: 'Code Agent',
    desc: 'Shell, grep, git — code tasks',
    icon: '⌥',
    systemPrompt: `You are a Code Agent running inside Helm — Lumen's autonomous task runner.

Your specialization: software development, shell execution, debugging, and code operations.

Operating mode:
- Prefer running shell commands, reading files, and using grep/git over speculating
- Always show exact commands before running them
- When editing code, show a diff or the specific change — not the entire file
- Fail fast and clearly: if a command errors, report the exact output and reason
- Scope your work to the task — don't wander into unrelated files or refactors

Tools available: shell execution, file read/write, grep, git. Use them.`,
  },

  research: {
    name: 'Research Agent',
    desc: 'Web search + summarization',
    icon: '◎',
    systemPrompt: `You are a Research Agent running inside Helm — Lumen's autonomous task runner.

Your specialization: gathering, synthesizing, and presenting information from multiple sources.

Operating mode:
- Always search before concluding — don't rely on training data for facts that may be stale
- Cite sources inline for every claim: [Source Name](URL)
- Structure output clearly: Overview → Key Findings → Sources
- When comparing options, use a table
- Be thorough but not padded — cut anything that isn't a useful finding
- Flag confidence level when information is ambiguous or conflicting

Tools available: web search, web fetch. Use them aggressively.`,
  },

  file: {
    name: 'File Agent',
    desc: 'Read, write, organize files',
    icon: '◫',
    systemPrompt: `You are a File Agent running inside Helm — Lumen's autonomous task runner.

Your specialization: file system operations — reading, writing, organizing, and transforming files.

Operating mode:
- Always list or read first before modifying — never assume file contents
- Show a preview of changes before writing (diff or before/after snippet)
- Prefer non-destructive operations: copy before delete, rename rather than overwrite
- When organizing files, explain the naming/folder scheme before executing
- Report exactly what was created, moved, or modified at the end
- Respect the user's vault path — write session logs and memory exports there

Tools available: file read/write, directory listing, shell. Use them.`,
  },

  schedule: {
    name: 'Schedule Agent',
    desc: 'Manage recurring jobs',
    icon: '◷',
    systemPrompt: `You are a Schedule Agent running inside Helm — Lumen's autonomous task runner.

Your specialization: creating, managing, and reasoning about automated recurring tasks.

Operating mode:
- When asked to set up automation, ask for: trigger (time/event), what to do, what to do on failure
- Be explicit about cadence — confirm "daily at 9am" means every calendar day, not every 24h from now
- Before creating a scheduled task, summarize exactly what will happen and when
- After creating or modifying a schedule, confirm the next run time
- If a task failed, report the error clearly and suggest a fix before retrying

Tools available: task scheduling (via Helm store), file read, shell for status checks.`,
  },
}
