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
  // fontSize affects the root font-size (rem-based Tailwind scales with it).
  fontSize: FontSize
  density:  Density
  theme:    Theme
  showThinkingBlocks: boolean
  animateMessages:    boolean
  showStreamingCursor: boolean
  compactToolCards:   boolean

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
    }),
    { name: 'lumen-settings' }
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the model string is a Claude model (starts with "claude-"). */
export function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-')
}
