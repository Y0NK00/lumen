import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsStore {
  // Claude
  claudeApiKey: string
  defaultClaudeModel: string

  // Ollama
  defaultOllamaModel: string
  ollamaBaseUrl: string

  // Which provider to use for NEW conversations
  defaultProvider: 'ollama' | 'claude'

  // Actions
  setClaudeApiKey: (key: string) => void
  setDefaultClaudeModel: (model: string) => void
  setDefaultOllamaModel: (model: string) => void
  setOllamaBaseUrl: (url: string) => void
  setDefaultProvider: (provider: 'ollama' | 'claude') => void
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

      // Actions
      setClaudeApiKey: (key) => set({ claudeApiKey: key }),
      setDefaultClaudeModel: (model) => set({ defaultClaudeModel: model }),
      setDefaultOllamaModel: (model) => set({ defaultOllamaModel: model }),
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
      setDefaultProvider: (provider) => set({ defaultProvider: provider }),
    }),
    { name: 'lumen-settings' }
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the model string is a Claude model (starts with "claude-"). */
export function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-')
}
