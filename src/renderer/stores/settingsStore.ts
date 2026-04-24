import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FontSize  = 'xs' | 'sm' | 'base'
export type Density   = 'compact' | 'comfortable' | 'spacious'
export type Theme     = 'lumen-dark' | 'midnight' | 'slate' | 'github' | 'mocha' | 'rosepine' | 'high-contrast'
export type ColorMode = 'light' | 'dark' | 'auto'
export type ChatFont  = 'default' | 'sans' | 'system' | 'dyslexia'
export type BgAnim    = 'enabled' | 'auto' | 'disabled'

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  // API / Models
  claudeApiKey:        '',
  defaultClaudeModel:  'claude-sonnet-4-6',
  helmClaudeModel:     'claude-haiku-4-5-20251001',  // Helm agents use Haiku by default (higher TPM, lower cost)
  defaultOllamaModel:  'qwen2.5:14b',
  ollamaBaseUrl:       'http://localhost:11434',
  defaultProvider:     'claude' as 'ollama' | 'claude',

  // Profile
  profileName:         '',
  profileCallName:     '',
  profileWork:         '',
  profileAbout:        '',
  profilePreferences:  '',

  // Appearance
  fontSize:            'sm'           as FontSize,
  density:             'comfortable'  as Density,
  theme:               'lumen-dark'   as Theme,
  colorMode:           'dark'         as ColorMode,
  chatFont:            'default'      as ChatFont,
  backgroundAnimation: 'auto'         as BgAnim,
  showThinkingBlocks:  true,
  animateMessages:     true,
  showStreamingCursor: true,
  compactToolCards:    false,

  // Notifications
  notifyResponseComplete: true,
  notifyDispatch:         true,

  // Vault / Obsidian
  vaultPath:            '',
  vaultRagEnabled:      false,   // inject relevant vault notes into system prompt
  vaultEmbedModel:      'nomic-embed-text',  // Ollama model for semantic indexing

  // Remote dispatch
  remoteDispatchEnabled: false,
  remoteDispatchPort:    7747,

  // Mobile Companion
  mobileEnabled: false,
  mobileToken:   '',

  // Memory
  memorySearchRef: true,
  memoryGenerate:  false,

  // Capabilities
  capFileRead:   true,
  capFileWrite:  true,
  capShellExec:  false,
  capBrowser:    true,
  capWebSearch:  true,
  capArtifacts:  true,
  capAiArtifacts: false,
  capInlineViz:  true,
  capCodeExec:   false,

  // Token usage
  tokenInputMonth:       0,
  tokenOutputMonth:      0,
  tokenCacheReadMonth:   0,   // tokens served from prompt cache (billed at 10%)
  tokenCacheWriteMonth:  0,   // tokens written into cache (billed at 125%)
  tokenBudgetMonth:      500_000,
  tokenMonthKey:         '',
}

// ─── Interface ────────────────────────────────────────────────────────────────

interface SettingsStore {
  // State
  claudeApiKey:        string
  defaultClaudeModel:  string
  helmClaudeModel:     string
  defaultOllamaModel:  string
  ollamaBaseUrl:       string
  defaultProvider:     'ollama' | 'claude'

  profileName:        string
  profileCallName:    string
  profileWork:        string
  profileAbout:       string
  profilePreferences: string

  fontSize:             FontSize
  density:              Density
  theme:                Theme
  colorMode:            ColorMode
  chatFont:             ChatFont
  backgroundAnimation:  BgAnim
  showThinkingBlocks:   boolean
  animateMessages:      boolean
  showStreamingCursor:  boolean
  compactToolCards:     boolean

  notifyResponseComplete: boolean
  notifyDispatch:         boolean

  vaultPath:             string
  vaultRagEnabled:       boolean
  vaultEmbedModel:       string
  remoteDispatchEnabled: boolean
  remoteDispatchPort:    number

  mobileEnabled: boolean
  mobileToken:   string

  memorySearchRef: boolean
  memoryGenerate:  boolean

  capFileRead:    boolean
  capFileWrite:   boolean
  capShellExec:   boolean
  capBrowser:     boolean
  capWebSearch:   boolean
  capArtifacts:   boolean
  capAiArtifacts: boolean
  capInlineViz:   boolean
  capCodeExec:    boolean

  tokenInputMonth:      number
  tokenOutputMonth:     number
  tokenCacheReadMonth:  number
  tokenCacheWriteMonth: number
  tokenBudgetMonth:     number
  tokenMonthKey:        string

  // Loading gate — true once settings have been read from disk
  loaded: boolean

  // Actions
  loadFromDisk: () => Promise<void>

  setClaudeApiKey:       (v: string) => void
  setDefaultClaudeModel: (v: string) => void
  setHelmClaudeModel:    (v: string) => void
  setDefaultOllamaModel: (v: string) => void
  setOllamaBaseUrl:      (v: string) => void
  setDefaultProvider:    (v: 'ollama' | 'claude') => void

  setProfileName:        (v: string) => void
  setProfileCallName:    (v: string) => void
  setProfileWork:        (v: string) => void
  setProfileAbout:       (v: string) => void
  setProfilePreferences: (v: string) => void

  setFontSize:            (v: FontSize)  => void
  setDensity:             (v: Density)   => void
  setTheme:               (v: Theme)     => void
  setColorMode:           (v: ColorMode) => void
  setChatFont:            (v: ChatFont)  => void
  setBackgroundAnimation: (v: BgAnim)    => void
  setShowThinkingBlocks:  (v: boolean)   => void
  setAnimateMessages:     (v: boolean)   => void
  setShowStreamingCursor: (v: boolean)   => void
  setCompactToolCards:    (v: boolean)   => void

  setNotifyResponseComplete: (v: boolean) => void
  setNotifyDispatch:         (v: boolean) => void

  setVaultPath:             (v: string)  => void
  setVaultRagEnabled:       (v: boolean) => void
  setVaultEmbedModel:       (v: string)  => void
  setRemoteDispatchEnabled: (v: boolean) => void
  setRemoteDispatchPort:    (v: number)  => void

  setMobileEnabled: (v: boolean) => void
  setMobileToken:   (v: string)  => void

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
  // Called by the chat system after each Claude response (includes real cache stats from API)
  addTokenUsage: (input: number, output: number, cacheRead?: number, cacheWrite?: number) => void
}

// ─── Helper exports (used by components + hooks) ─────────────────────────────

/** Returns true if the model string is a Claude (cloud) model. */
export function isClaudeModel(model: string | undefined | null): boolean {
  return typeof model === 'string' && model.startsWith('claude-')
}

/**
 * Rough token estimator — ~4 chars per token, good enough for budget tracking.
 * Does not require an API call.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 4)
}

// ─── IPC bridge (via preload) ─────────────────────────────────────────────────

const ipc = (window as any).tower as {
  loadSettings: () => Promise<Record<string, unknown> | null>
  saveSettings: (patch: Record<string, unknown>) => Promise<boolean>
}

function save(patch: Record<string, unknown>) {
  ipc?.saveSettings(patch)
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  // ── Boot: read from settings.json via IPC ───────────────────────────────────
  loadFromDisk: async () => {
    const saved = await ipc?.loadSettings()
    const merged: Partial<typeof DEFAULTS> = {}

    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
        if (key in saved) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (merged as any)[key] = saved[key]
        }
      }
    }

    // ── One-time migration from old Zustand localStorage persist ─────────────
    // The previous store used persist() middleware which wrote everything to
    // localStorage. On first boot after this change, settings.json won't have
    // the API key or any user preferences. We scan known persist key names,
    // pull the old data, save it to disk, then clear it from localStorage.
    if (!merged.claudeApiKey) {
      const LEGACY_KEYS = ['lumen-settings', 'settings-storage', 'lumen-store', 'settings']
      for (const lsKey of LEGACY_KEYS) {
        try {
          const raw = localStorage.getItem(lsKey)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          // Zustand persist wraps state in { state: {...}, version: N }
          const legacyState = parsed?.state ?? parsed
          if (legacyState && typeof legacyState === 'object' && legacyState.claudeApiKey) {
            // Merge legacy values that aren't already set by settings.json
            for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
              if (!(key in merged) && key in legacyState) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (merged as any)[key] = legacyState[key]
              }
            }
            // Persist migrated data to settings.json so next boot reads from disk
            ipc?.saveSettings(merged as Record<string, unknown>)
            // Clean up the old localStorage key so migration doesn't re-run
            localStorage.removeItem(lsKey)
            console.log(`[settings] Migrated from localStorage key "${lsKey}" to settings.json`)
            break
          }
        } catch {
          // malformed JSON — skip
        }
      }
    }

    set({ ...merged, loaded: true })
  },

  // ── API / Models ────────────────────────────────────────────────────────────
  setClaudeApiKey:       (v) => { set({ claudeApiKey: v });       save({ claudeApiKey: v }) },
  setDefaultClaudeModel: (v) => { set({ defaultClaudeModel: v }); save({ defaultClaudeModel: v }) },
  setHelmClaudeModel:    (v) => { set({ helmClaudeModel: v });    save({ helmClaudeModel: v }) },
  setDefaultOllamaModel: (v) => { set({ defaultOllamaModel: v }); save({ defaultOllamaModel: v }) },
  setOllamaBaseUrl:      (v) => { set({ ollamaBaseUrl: v });      save({ ollamaBaseUrl: v }) },
  setDefaultProvider:    (v) => { set({ defaultProvider: v });    save({ defaultProvider: v }) },

  // ── Profile ─────────────────────────────────────────────────────────────────
  setProfileName:        (v) => { set({ profileName: v });        save({ profileName: v }) },
  setProfileCallName:    (v) => { set({ profileCallName: v });    save({ profileCallName: v }) },
  setProfileWork:        (v) => { set({ profileWork: v });        save({ profileWork: v }) },
  setProfileAbout:       (v) => { set({ profileAbout: v });       save({ profileAbout: v }) },
  setProfilePreferences: (v) => { set({ profilePreferences: v }); save({ profilePreferences: v }) },

  // ── Appearance ──────────────────────────────────────────────────────────────
  setFontSize:            (v) => { set({ fontSize: v });            save({ fontSize: v }) },
  setDensity:             (v) => { set({ density: v });             save({ density: v }) },
  setTheme:               (v) => { set({ theme: v });               save({ theme: v }) },
  setColorMode:           (v) => { set({ colorMode: v });           save({ colorMode: v }) },
  setChatFont:            (v) => { set({ chatFont: v });            save({ chatFont: v }) },
  setBackgroundAnimation: (v) => { set({ backgroundAnimation: v }); save({ backgroundAnimation: v }) },
  setShowThinkingBlocks:  (v) => { set({ showThinkingBlocks: v });  save({ showThinkingBlocks: v }) },
  setAnimateMessages:     (v) => { set({ animateMessages: v });     save({ animateMessages: v }) },
  setShowStreamingCursor: (v) => { set({ showStreamingCursor: v }); save({ showStreamingCursor: v }) },
  setCompactToolCards:    (v) => { set({ compactToolCards: v });    save({ compactToolCards: v }) },

  // ── Notifications ────────────────────────────────────────────────────────────
  setNotifyResponseComplete: (v) => { set({ notifyResponseComplete: v }); save({ notifyResponseComplete: v }) },
  setNotifyDispatch:         (v) => { set({ notifyDispatch: v });         save({ notifyDispatch: v }) },

  // ── Vault ─────────────────────────────────────────────────────────────────────
  setVaultPath:             (v) => { set({ vaultPath: v });             save({ vaultPath: v }) },
  setVaultRagEnabled:       (v) => { set({ vaultRagEnabled: v });       save({ vaultRagEnabled: v }) },
  setVaultEmbedModel:       (v) => { set({ vaultEmbedModel: v });       save({ vaultEmbedModel: v }) },
  setRemoteDispatchEnabled: (v) => { set({ remoteDispatchEnabled: v }); save({ remoteDispatchEnabled: v }) },
  setRemoteDispatchPort:    (v) => { set({ remoteDispatchPort: v });    save({ remoteDispatchPort: v }) },

  setMobileEnabled: (v) => { set({ mobileEnabled: v }); save({ mobileEnabled: v }) },
  setMobileToken:   (v) => { set({ mobileToken: v });   save({ mobileToken: v }) },

  // ── Memory ───────────────────────────────────────────────────────────────────
  setMemorySearchRef: (v) => { set({ memorySearchRef: v }); save({ memorySearchRef: v }) },
  setMemoryGenerate:  (v) => { set({ memoryGenerate: v });  save({ memoryGenerate: v }) },

  // ── Capabilities ─────────────────────────────────────────────────────────────
  setCapFileRead:    (v) => { set({ capFileRead: v });    save({ capFileRead: v }) },
  setCapFileWrite:   (v) => { set({ capFileWrite: v });   save({ capFileWrite: v }) },
  setCapShellExec:   (v) => { set({ capShellExec: v });   save({ capShellExec: v }) },
  setCapBrowser:     (v) => { set({ capBrowser: v });     save({ capBrowser: v }) },
  setCapWebSearch:   (v) => { set({ capWebSearch: v });   save({ capWebSearch: v }) },
  setCapArtifacts:   (v) => { set({ capArtifacts: v });   save({ capArtifacts: v }) },
  setCapAiArtifacts: (v) => { set({ capAiArtifacts: v }); save({ capAiArtifacts: v }) },
  setCapInlineViz:   (v) => { set({ capInlineViz: v });   save({ capInlineViz: v }) },
  setCapCodeExec:    (v) => { set({ capCodeExec: v });    save({ capCodeExec: v }) },

  // ── Token tracking ────────────────────────────────────────────────────────────
  setTokenBudgetMonth: (v) => { set({ tokenBudgetMonth: v }); save({ tokenBudgetMonth: v }) },

  addTokenUsage: (input, output, cacheRead = 0, cacheWrite = 0) => {
    const now   = new Date()
    const key   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const s     = get()
    const reset = s.tokenMonthKey !== key

    const next = {
      tokenMonthKey:        key,
      tokenInputMonth:      (reset ? 0 : s.tokenInputMonth)      + input,
      tokenOutputMonth:     (reset ? 0 : s.tokenOutputMonth)     + output,
      tokenCacheReadMonth:  (reset ? 0 : s.tokenCacheReadMonth)  + cacheRead,
      tokenCacheWriteMonth: (reset ? 0 : s.tokenCacheWriteMonth) + cacheWrite,
    }
    set(next)
    save(next)
  },
}))
