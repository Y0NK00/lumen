import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Theme {
  id: string
  label: string
  /** Main accent color */
  accent: string
  /** Slightly lighter — gradient start */
  accentLight: string
  /** Slightly darker — gradient end */
  accentDark: string
  /** Hover state */
  accentHover: string
}

export const THEMES: Theme[] = [
  {
    id: 'lumen',
    label: 'Lumen',
    accent:      '#8b5cf6',
    accentLight: '#9f7aea',
    accentDark:  '#6d28d9',
    accentHover: '#7c3aed',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    accent:      '#3b82f6',
    accentLight: '#60a5fa',
    accentDark:  '#1d4ed8',
    accentHover: '#2563eb',
  },
  {
    id: 'ember',
    label: 'Ember',
    accent:      '#f97316',
    accentLight: '#fb923c',
    accentDark:  '#c2410c',
    accentHover: '#ea6c0a',
  },
  {
    id: 'sage',
    label: 'Sage',
    accent:      '#10b981',
    accentLight: '#34d399',
    accentDark:  '#047857',
    accentHover: '#059669',
  },
  {
    id: 'rose',
    label: 'Rose',
    accent:      '#f43f5e',
    accentLight: '#fb7185',
    accentDark:  '#be123c',
    accentHover: '#e11d48',
  },
  {
    id: 'gold',
    label: 'Gold',
    accent:      '#eab308',
    accentLight: '#facc15',
    accentDark:  '#a16207',
    accentHover: '#ca8a04',
  },
]

interface ThemeState {
  themeId: string
  setTheme: (id: string) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: 'lumen',
      setTheme: (id) => set({ themeId: id }),
    }),
    { name: 'lumen-theme' }
  )
)

/** Returns the active Theme object */
export function getActiveTheme(themeId: string): Theme {
  return THEMES.find((t) => t.id === themeId) ?? THEMES[0]
}

/** Applies a theme's CSS variables to :root */
export function applyTheme(theme: Theme) {
  const r = document.documentElement
  r.style.setProperty('--color-accent',       theme.accent)
  r.style.setProperty('--color-accent-hover',  theme.accentHover)
  r.style.setProperty('--color-accent-light',  theme.accentLight)
  r.style.setProperty('--color-accent-dark',   theme.accentDark)
}
