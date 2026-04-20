import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FontSize  = 'xs' | 'sm' | 'base'
export type Density   = 'compact' | 'comfortable' | 'spacious'
export type Theme     = 'lumen-dark' | 'midnight' | 'slate'
export type ColorMode = 'light' | 'dark' | 'auto'
export type ChatFont  = 'default' | 'sans' | 'system' | 'dyslexia'
export type BgAnim    = 'enabled' | 'auto' | 'disabled'

interface SettingsStore {
  // ── API / Models ──────────────────────────────────────────────────────────
  claudeApiKey: string
  defaultClaudeModel: string
  defaultOllamaModel: string
  ollamaBaseUrl: string
  defaultProvider: 'ollama' | 'claude'

  // ── Profile ───────────────────────────────────────────────────────────────
  profileName: string
  profileCallName: string
  profileWork: string
  profileAbout: string
  profilePreferences: string

  // ── Appearance ────────────────────────────────────────────────────────────
  fontSize: FontSize
  density:  Density
  theme:    Theme
  colorMode: ColorMode
  chatFont:  ChatFont
  backgroundAnimation: BgAnim
  showThinkingBlocks: boolean
  animateMessages:    boolean
  showStreamingCursor: boolean
  compactToolCards:   boolean

  // ── Notifications ─────────────────────────────────────────────────────────
  notifyResponseComplete: boolean
  notifyDispatch: boolean

  // ── Memory ────────────────────────────────────────────────────────────────
  memorySearchRef: boolean
  memoryGenerate:  boolean

  // ── Capabilities ──────────────────────────────────────────────────────────
  capFileRead:      boolean
  capFileWrite:     boolean
  capShellExec:     boolean
  capBrowser:       boolean
  capWebSearch:     boolean
  capArtifacts:     boolean
  capAiArtifacts:   boolean
  capInlineViz:     boolean
  capCodeExec:      boolean

  // ── Token usage (estimated, resets monthly) ───────────────────────────────
  tokenInputMonth:  number
  tokenOutputMonth: number
  tokenBudgetMonth: number   // user-set monthly cap
  tokenMonthKey:    string   // "YYYY-MM" — reset when month changes

  // ── Actions ───────────────────────────────────────────────────────────────
  setClaudeApiKey: (v: string) => void
  setDefaultClaudeModel: (v: string) => void
  setDefaultOllamaModel: (v: string) => void
  setOllamaBaseUrl: (v: string) => void
  setDefaultProvider: (v: 'ollama' | 'claude') => void

  setProfileName: (v: string) => void
  setProfileCallName: (v: string) => void
  setProfileWork: (v: string) => void
  setProfileAbout: (v: string) => void
  setProfilePreferences: (v: string) => void

  setFontSize: (v: FontSize) => void
  setDensity:  (v: Density)  => void
  setTheme:    (v: Theme)    => void
  setColorMode: (v: ColorMode) => void
  setChatFont:  (v: ChatFont)  => void
  setBackgroundAnimation: (v: BgAnim) => void
  setShowThinkingBlocks:  (v: boolean) => void
  setAnimateMessages:     (v: boolean) => void
  setShowStreamingCursor: (v: boolean) => void
  setCompactToolCards:    (v: boolean) => void

  setNotifyResponseComplete: (v: boolean) => void
  setNotifyDispatch: (v: boolean) => void

  setMemorySearchRef: (v: boolean) => void
  setMemoryGenerate:  (v: boolean) => void

  setCapFileRead:    (v: boolean) => void
  setCapFileWrite:   (v: boolean) => void
  setCapShellExec:   (v: boolean) => void
  setCapBrowser:     (v: boolean) => void
  setCapWebSearch:   (v: boolean) => void
  setCapArtifacts:   (v: boolean) => void
  setCapAiArtifacts: (v: boolean) => void
  setCapInlineViz:   (v: boolean) => void
  setCapCodeExec:    (v: boolean) => void

  setTokenBudgetMonth: (v: number) => void
  addTokenUsage: (inputTokens: number, outputTokens: number) => void
  resetTokensIfNewMonth: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // API / Models
      claudeApiKey: '',
      defaultClaudeModel: 'claude-sonnet-4-5',
      defaultOllamaModel: 'qwen2.5:14b',
      ollamaBaseUrl: 'http://10.0.0.22:11434',
      defaultProvider: 'ollama',

      // Profile
      profileName: '',
      profileCallName: '',
      profileWork: '',
      profileAbout: '',
      profilePreferences: '',

      // Appearance
      fontSize: 'sm',
      density:  'comfortable',
      theme:    'lumen-dark',
      colorMode: 'dark',
      chatFont:  'default',
      backgroundAnimation: 'auto',
      showThinkingBlocks:  true,
      animateMessages:     true,
      showStreamingCursor: true,
      compactToolCards:    false,

      // Notifications
      notifyResponseComplete: true,
      notifyDispatch: true,

      // Memory
      memorySearchRef: true,
      memoryGenerate:  false,

      // Capabilities
      capFileRead:    true,
      capFileWrite:   true,
      capShellExec:   false,
      capBrowser:     false,
      capWebSearch:   false,
      capArtifacts:   true,
      capAiArtifacts: false,
      capInlineViz:   true,
      capCodeExec:    false,

      // Token usage
      tokenInputMonth:  0,
      tokenOutputMonth: 0,
      tokenBudgetMonth: 1_000_000,
      tokenMonthKey:    new Date().toISOString().slice(0, 7),

      // Actions
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
      setDefaultClaudeModel: (defaultClaudeModel) => set({ defaultClaudeModel }),
      setDefaultOllamaModel: (defaultOllamaModel) => set({ defaultOllamaModel }),
      setOllamaBaseUrl: (ollamaBaseUrl) => set({ ollamaBaseUrl }),
      setDefaultProvider: (defaultProvider) => set({ defaultProvider }),

      setProfileName:        (profileName) => set({ profileName }),
      setProfileCallName:    (profileCallName) => set({ profileCallName }),
      setProfileWork:        (profileWork) => set({ profileWork }),
      setProfileAbout:       (profileAbout) => set({ profileAbout }),
      setProfilePreferences: (profilePreferences) => set({ profilePreferences }),

      setFontSize: (fontSize) => set({ fontSize }),
      setDensity:  (density)  => set({ density }),
      setTheme:    (theme)    => set({ theme }),
      setColorMode: (colorMode) => set({ colorMode }),
      setChatFont:  (chatFont)  => set({ chatFont }),
      setBackgroundAnimation: (backgroundAnimation) => set({ backgroundAnimation }),
      setShowThinkingBlocks:  (showThinkingBlocks)  => set({ showThinkingBlocks }),
      setAnimateMessages:     (animateMessages)     => set({ animateMessages }),
      setShowStreamingCursor: (showStreamingCursor) => set({ showStreamingCursor }),
      setCompactToolCards:    (compactToolCards)    => set({ compactToolCards }),

      setNotifyResponseComplete: (notifyResponseComplete) => set({ notifyResponseComplete }),
      setNotifyDispatch: (notifyDispatch) => set({ notifyDispatch }),

      setMemorySearchRef: (memorySearchRef) => set({ memorySearchRef }),
      setMemoryGenerate:  (memoryGenerate)  => set({ memoryGenerate }),

      setCapFileRead:    (capFileRead)    => set({ capFileRead }),
      setCapFileWrite:   (capFileWrite)   => set({ capFileWrite }),
      setCapShellExec:   (capShellExec)   => set({ capShellExec }),
      setCapBrowser:     (capBrowser)     => set({ capBrowser }),
      setCapWebSearch:   (capWebSearch)   => set({ capWebSearch }),
      setCapArtifacts:   (capArtifacts)   => set({ capArtifacts }),
      setCapAiArtifacts: (capAiArtifacts) => set({ capAiArtifacts }),
      setCapInlineViz:   (capInlineViz)   => set({ capInlineViz }),
      setCapCodeExec:    (capCodeExec)    => set({ capCodeExec }),

      setTokenBudgetMonth: (tokenBudgetMonth) => set({ tokenBudgetMonth }),

      addTokenUsage: (inputTokens, outputTokens) => {
        const state = get()
        const thisMonth = new Date().toISOString().slice(0, 7)
        if (state.tokenMonthKey !== thisMonth) {
          set({ tokenInputMonth: inputTokens, tokenOutputMonth: outputTokens, tokenMonthKey: thisMonth })
        } else {
          set({
            tokenInputMonth:  state.tokenInputMonth  + inputTokens,
            tokenOutputMonth: state.tokenOutputMonth + outputTokens,
          })
        }
      },

      resetTokensIfNewMonth: () => {
        const thisMonth = new Date().toISOString().slice(0, 7)
        if (get().tokenMonthKey !== thisMonth) {
          set({ tokenInputMonth: 0, tokenOutputMonth: 0, tokenMonthKey: thisMonth })
        }
      },
    }),
    { name: 'lumen-settings' }
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-')
}

/** Rough token estimator: ~4 chars per token (GPT/Claude standard approximation). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
