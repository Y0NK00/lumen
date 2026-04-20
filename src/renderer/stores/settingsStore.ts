import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FontSize = 'xs' | 'sm' | 'base'
export type Density  = 'compact' | 'comfortable' | 'spacious'
export type Theme    = 'lumen-dark' | 'midnight' | 'slate'

interface SettingsStore {
  // Claude
  claudeApiKey: string
  defaultClaudeModel: string

  // Ollama
  defaultOllamaModel: string
  ollamaBaseUrl: string

  // Which provider to use for NEW conversations
  defaultProvider: 'ollama' | 'claude'

  // ── Appearance ─────────────────────────────────────────────────────────────
  fontSize: FontSize
  density:  Density
  theme:    Theme
  showThinkingBlocks: boolean
  animateMessages:    boolean
  showStreamingCursor: boolean
  compactToolCards:   boolean

  // ── Memory ─────────────────────────────────────────────────────────────────
  memorySearchRef: boolean
  memoryGenerate:  boolean

  // ── Capabilities (tool permissions) ────────────────────────────────────────
  capFileRead:   boolean
  capFileWrite:  boolean
  capShellExec:  boolean
  capBrowser:    boolean
  capWebSearch:  boolean

  // Actions
  setClaudeApiKey: (key: string) => void
  setDefaultClaudeModel: (model: string) => void
  setDefaultOllamaModel: (model: string) => void
  setOllamaBaseUrl: (url: string) => void
  setDefaultProvider: (provider: 'ollama' | 'claude') => void
  setFontSize: (v: FontSize) => void
  setDensity:  (v: Density)  => void
  setTheme:    (v: Theme)    => void
  setShowThinkingBlocks:  (v: boolean) => void
  setAnimateMessages:     (v: boolean) => void
  setShowStreamingCursor: (v: boolean) => void
  setCompactToolCards:    (v: boolean) => void
  setMemorySearchRef: (v: boolean) => void
  setMemoryGenerate:  (v: boolean) => void
  setCapFileRead:   (v: boolean) => void
  setCapFileWrite:  (v: boolean) => void
  setCapShellExec:  (v: boolean) => void
  setCapBrowser:    (v: boolean) => void
  setCapWebSearch:  (v: boolean) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Defaults
      claudeApiKey: '',
      defaultClaudeModel: 'claude-sonnet-4-5',
      defaultOllamaModel: 'qwen2.5:14b',
      ollamaBaseUrl: 'http://10.0.0.22:11434',
      defaultProvider: 'ollama',

      // Appearance defaults
      fontSize: 'sm',
      density:  'comfortable',
      theme:    'lumen-dark',
      showThinkingBlocks:  true,
      animateMessages:     true,
      showStreamingCursor: true,
      compactToolCards:    false,

      // Memory defaults
      memorySearchRef: true,
      memoryGenerate:  false,

      // Capability defaults
      capFileRead:   true,
      capFileWrite:  true,
      capShellExec:  false,
      capBrowser:    false,
      capWebSearch:  false,

      // Actions
      setClaudeApiKey: (key) => set({ claudeApiKey: key }),
      setDefaultClaudeModel: (model) => set({ defaultClaudeModel: model }),
      setDefaultOllamaModel: (model) => set({ defaultOllamaModel: model }),
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
      setDefaultProvider: (provider) => set({ defaultProvider: provider }),
      setFontSize: (fontSize) => set({ fontSize }),
      setDensity:  (density)  => set({ density }),
      setTheme:    (theme)    => set({ theme }),
      setShowThinkingBlocks:  (showThinkingBlocks)  => set({ showThinkingBlocks }),
      setAnimateMessages:     (animateMessages)     => set({ animateMessages }),
      setShowStreamingCursor: (showStreamingCursor) => set({ showStreamingCursor }),
      setCompactToolCards:    (compactToolCards)    => set({ compactToolCards }),
      setMemorySearchRef: (memorySearchRef) => set({ memorySearchRef }),
      setMemoryGenerate:  (memoryGenerate)  => set({ memoryGenerate }),
      setCapFileRead:   (capFileRead)   => set({ capFileRead }),
      setCapFileWrite:  (capFileWrite)  => set({ capFileWrite }),
      setCapShellExec:  (capShellExec)  => set({ capShellExec }),
      setCapBrowser:    (capBrowser)    => set({ capBrowser }),
      setCapWebSearch:  (capWebSearch)  => set({ capWebSearch }),
    }),
    { name: 'lumen-settings' }
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the model string is a Claude model (starts with "claude-"). */
export function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-')
}
