// src/renderer/stores/skillsStore.ts
// Skills are named prompt injections + optional tool configs that can be
// activated manually or auto-triggered by keyword patterns.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriggerType = 'keyword' | 'always' | 'manual'

export interface SkillTrigger {
  type:     TriggerType
  keywords: string[]   // for type='keyword' — comma-separated match patterns (case-insensitive)
}

export interface Skill {
  id:          string
  name:        string
  description: string
  icon:        string              // emoji
  prompt:      string              // system prompt content injected when active
  trigger:     SkillTrigger
  enabled:     boolean
  createdAt:   number
  updatedAt:   number
  // Optional tool access overrides (null = inherit from capabilities settings)
  allowFileRead?:  boolean
  allowFileWrite?: boolean
  allowShell?:     boolean
  allowBrowser?:   boolean
}

interface SkillsStore {
  skills: Record<string, Skill>

  // CRUD
  createSkill: (data: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'>) => string
  updateSkill: (id: string, patch: Partial<Omit<Skill, 'id' | 'createdAt'>>) => void
  deleteSkill: (id: string) => void
  toggleSkill: (id: string) => void

  // Active skills: manually activated by user for the current session
  activeSkillIds: string[]
  activateSkill:   (id: string) => void
  deactivateSkill: (id: string) => void
  clearActive:     () => void
}

// ─── Defaults ────────────────────────────────────────────────────────────────
// A few built-in skills to give users a starting point.

function builtInSkills(): Record<string, Skill> {
  const now = Date.now()

  const make = (
    id: string,
    name: string,
    icon: string,
    description: string,
    prompt: string,
    trigger: SkillTrigger
  ): [string, Skill] => [
    id,
    { id, name, icon, description, prompt, trigger, enabled: true, createdAt: now, updatedAt: now },
  ]

  return Object.fromEntries([
    make(
      'builtin-obsidian',
      'Obsidian Session Logger',
      '📓',
      'Writes session logs to your Obsidian vault at the end of conversations.',
      `You have access to the user's Obsidian vault. At the end of sessions when asked, write a structured session log using the writeSessionLog tool. The log should include: a descriptive title, a 2-3 sentence summary, key decisions made, and concrete next steps as checkboxes.`,
      { type: 'keyword', keywords: ['session log', 'write log', 'log this', 'save session'] }
    ),
    make(
      'builtin-research',
      'Deep Research',
      '🔬',
      'Activates web search and structured summarization for research tasks.',
      `You are in research mode. For every claim or fact, provide a source. Structure your response with clear sections: Overview, Key Findings, Sources. Be thorough — the user is relying on you for comprehensive research, not a quick answer.`,
      { type: 'keyword', keywords: ['research', 'investigate', 'look up', 'find out about'] }
    ),
    make(
      'builtin-code-review',
      'Code Reviewer',
      '👁️',
      'Strict code review mode: security, performance, and readability.',
      `You are doing a professional code review. Evaluate: 1) Security vulnerabilities, 2) Performance issues, 3) Code clarity and maintainability, 4) Edge cases and error handling. Be specific — reference exact line numbers or code patterns. Prioritize issues by severity.`,
      { type: 'keyword', keywords: ['review this', 'review my code', 'code review', 'check this code'] }
    ),
    make(
      'builtin-concise',
      'Concise Mode',
      '⚡',
      'Forces short, direct responses. No padding, no preamble.',
      `Be extremely concise. No preamble, no "Great question!", no filler. Answer directly. If a list, use bullets. If code, just the code. Max 3 sentences unless more is truly necessary.`,
      { type: 'manual', keywords: [] }
    ),
  ])
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSkillsStore = create<SkillsStore>()(
  persist(
    (set, get) => ({
      skills: builtInSkills(),
      activeSkillIds: [],

      createSkill: (data) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const skill: Skill = { id, enabled: true, createdAt: now, updatedAt: now, ...data }
        set((s) => ({ skills: { ...s.skills, [id]: skill } }))
        return id
      },

      updateSkill: (id, patch) => {
        set((s) => {
          const skill = s.skills[id]
          if (!skill) return s
          return { skills: { ...s.skills, [id]: { ...skill, ...patch, updatedAt: Date.now() } } }
        })
      },

      deleteSkill: (id) => {
        set((s) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _r, ...rest } = s.skills
          return {
            skills: rest,
            activeSkillIds: s.activeSkillIds.filter((aid) => aid !== id),
          }
        })
      },

      toggleSkill: (id) => {
        set((s) => {
          const skill = s.skills[id]
          if (!skill) return s
          return { skills: { ...s.skills, [id]: { ...skill, enabled: !skill.enabled, updatedAt: Date.now() } } }
        })
      },

      activateSkill: (id) => {
        set((s) => {
          if (s.activeSkillIds.includes(id)) return s
          return { activeSkillIds: [...s.activeSkillIds, id] }
        })
      },

      deactivateSkill: (id) => {
        set((s) => ({ activeSkillIds: s.activeSkillIds.filter((aid) => aid !== id) }))
      },

      clearActive: () => set({ activeSkillIds: [] }),
    }),
    {
      name: 'lumen-skills',
      version: 1,
      // Don't persist active skills — they reset each session
      partialize: (state) => ({ skills: state.skills }),
    }
  )
)

// ─── Auto-trigger matching ────────────────────────────────────────────────────
// Call this with the user's message to find any skills that should auto-activate.

export function matchSkillTriggers(message: string): string[] {
  const { skills, activeSkillIds } = useSkillsStore.getState()
  const lower = message.toLowerCase()
  const triggered: string[] = []

  for (const skill of Object.values(skills)) {
    if (!skill.enabled) continue
    if (activeSkillIds.includes(skill.id)) continue  // already active
    if (skill.trigger.type !== 'keyword') continue
    const matched = skill.trigger.keywords.some((kw) => lower.includes(kw.toLowerCase().trim()))
    if (matched) triggered.push(skill.id)
  }

  return triggered
}

// ─── Prompt block builder ─────────────────────────────────────────────────────
// Builds the combined skill prompt injection from all currently active skills
// + any 'always' trigger skills.

export function buildSkillsBlock(): string {
  const { skills, activeSkillIds } = useSkillsStore.getState()

  const active = Object.values(skills).filter(
    (s) => s.enabled && (activeSkillIds.includes(s.id) || s.trigger.type === 'always')
  )

  if (active.length === 0) return ''

  const blocks = active.map((s) => `### Skill: ${s.name}\n${s.prompt}`)
  return `<skills>\n${blocks.join('\n\n')}\n</skills>`
}
