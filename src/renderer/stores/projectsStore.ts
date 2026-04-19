// src/renderer/stores/projectsStore.ts
// Projects give a conversation a persistent context: a root folder + a system
// prompt. When a conversation is scoped to a project, that folder is the
// working directory for tool calls, and the system prompt is prepended to
// every turn.
//
// Storage is separate from chatStore so projects survive conversation cleanup
// and so project CRUD doesn't churn the much-larger conversation state.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

// Lightweight color tokens — map to Tailwind classes at render time.
// Keeps the persisted store format simple and theme-agnostic.
export type ProjectColor =
  | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate'

export interface Project {
  id: string
  name: string
  rootPath: string              // absolute path on the user's machine
  systemPrompt: string          // prepended to every conversation in this project
  color: ProjectColor
  emoji?: string                // optional one-glyph icon (defaults to folder)
  createdAt: number
  updatedAt: number
}

// Input shape when creating — only require name. Everything else has defaults.
export type ProjectDraft = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> &
  Pick<Project, 'name'>

interface ProjectsStore {
  projects: Record<string, Project>
  activeProjectId: string | null

  createProject: (draft: ProjectDraft) => string
  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string | null) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useProjectsStore = create<ProjectsStore>()(
  persist(
    (set) => ({
      projects: {},
      activeProjectId: null,

      createProject: (draft) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const project: Project = {
          id,
          name:          draft.name,
          rootPath:      draft.rootPath     ?? '',
          systemPrompt:  draft.systemPrompt ?? '',
          color:         draft.color        ?? 'violet',
          emoji:         draft.emoji,
          createdAt:     now,
          updatedAt:     now,
        }
        set((state) => ({
          projects: { ...state.projects, [id]: project },
          activeProjectId: id,
        }))
        return id
      },

      updateProject: (id, patch) => {
        set((state) => {
          const p = state.projects[id]
          if (!p) return state
          return {
            projects: {
              ...state.projects,
              [id]: { ...p, ...patch, updatedAt: Date.now() },
            },
          }
        })
      },

      deleteProject: (id) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...rest } = state.projects
          return {
            projects: rest,
            activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
          }
        })
      },

      setActiveProject: (id) => set({ activeProjectId: id }),
    }),
    { name: 'lumen-projects', version: 1 }
  )
)

// ─── Color helpers ────────────────────────────────────────────────────────────
// Tailwind class tokens per project color. Use these at render time so the
// class list is stable (Tailwind needs to see the classes statically —
// template-interpolated class names break the JIT). This enumerates each
// color so the JIT keeps them in the build.

export const PROJECT_COLOR_CLASSES: Record<ProjectColor, { bg: string; text: string; border: string; dot: string }> = {
  violet:  { bg: 'bg-violet-500/15',  text: 'text-violet-300',  border: 'border-violet-500/30',  dot: 'bg-violet-400'  },
  blue:    { bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/30',    dot: 'bg-blue-400'    },
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  amber:   { bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/30',   dot: 'bg-amber-400'   },
  rose:    { bg: 'bg-rose-500/15',    text: 'text-rose-300',    border: 'border-rose-500/30',    dot: 'bg-rose-400'    },
  slate:   { bg: 'bg-slate-500/15',   text: 'text-slate-300',   border: 'border-slate-500/30',   dot: 'bg-slate-400'   },
}
