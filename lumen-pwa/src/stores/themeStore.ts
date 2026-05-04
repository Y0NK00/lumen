import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Theme {
  id: string
  label: string
  desc: string
  /** Swatch colors shown in the picker [bg, surface, border, accent, text] */
  swatches: string[]
  // Background layers
  bg: string
  sidebar: string
  surface: string
  surfaceHover: string
  surfaceActive: string
  border: string
  // Text
  textPrimary: string
  textSecondary: string
  textMuted: string
  // Accent
  accent: string
  accentHover: string
  accentLight: string
  accentDark: string
  // Code blocks
  codeBg: string
  codeHeader: string
  codeInline: string
  // Error
  error: string
}

export const THEMES: Theme[] = [
  {
    id: 'lumen',
    label: 'Lumen',
    desc: 'Clean violet',
    swatches: ['#0d0d10', '#18181f', '#2a2a38', '#8b6fff', '#e8e6f0'],
    bg: '#0d0d10',
    sidebar: '#111116',
    surface: '#18181f',
    surfaceHover: '#1f1f28',
    surfaceActive: '#26263a',
    border: '#2a2a38',
    textPrimary: '#e8e6f0',
    textSecondary: '#9b98b0',
    textMuted: '#5c596e',
    accent: '#8b6fff',
    accentHover: '#7c5cfc',
    accentLight: '#a082ff',
    accentDark: '#6d44e0',
    codeBg: '#09090e',
    codeHeader: '#0e0e17',
    codeInline: '#16162a',
    error: '#f87171',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    desc: 'Deep navy',
    swatches: ['#080810', '#10101e', '#1e1e35', '#7c5cfc', '#dcd8f8'],
    bg: '#080810',
    sidebar: '#0c0c17',
    surface: '#10101e',
    surfaceHover: '#16162a',
    surfaceActive: '#1e1e35',
    border: '#1e1e35',
    textPrimary: '#dcd8f8',
    textSecondary: '#8a86b0',
    textMuted: '#4a4768',
    accent: '#7c5cfc',
    accentHover: '#6b4eea',
    accentLight: '#9477ff',
    accentDark: '#5b3dd4',
    codeBg: '#05050d',
    codeHeader: '#09091a',
    codeInline: '#12122a',
    error: '#fc7171',
  },
  {
    id: 'github',
    label: 'GitHub',
    desc: 'Slate & muted',
    swatches: ['#0d1117', '#161b22', '#30363d', '#58a6ff', '#e6edf3'],
    bg: '#0d1117',
    sidebar: '#010409',
    surface: '#161b22',
    surfaceHover: '#21262d',
    surfaceActive: '#2d333b',
    border: '#30363d',
    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textMuted: '#484f58',
    accent: '#58a6ff',
    accentHover: '#388bfd',
    accentLight: '#79c0ff',
    accentDark: '#1f6feb',
    codeBg: '#090c10',
    codeHeader: '#0d1117',
    codeInline: '#1c2128',
    error: '#f85149',
  },
  {
    id: 'mocha',
    label: 'Catppuccin',
    desc: 'Mocha warmth',
    swatches: ['#1e1e2e', '#313244', '#45475a', '#cba6f7', '#cdd6f4'],
    bg: '#1e1e2e',
    sidebar: '#181825',
    surface: '#1e1e2e',
    surfaceHover: '#313244',
    surfaceActive: '#3d3f52',
    border: '#45475a',
    textPrimary: '#cdd6f4',
    textSecondary: '#a6adc8',
    textMuted: '#6c7086',
    accent: '#cba6f7',
    accentHover: '#b48ef4',
    accentLight: '#d4bbff',
    accentDark: '#a479e2',
    codeBg: '#181825',
    codeHeader: '#1e1e2e',
    codeInline: '#2a2a3d',
    error: '#f38ba8',
  },
  {
    id: 'rosepine',
    label: 'Rosé Pine',
    desc: 'Muted & warm',
    swatches: ['#191724', '#26233a', '#403d52', '#c4a7e7', '#e0def4'],
    bg: '#191724',
    sidebar: '#1f1d2e',
    surface: '#26233a',
    surfaceHover: '#2a2740',
    surfaceActive: '#353150',
    border: '#403d52',
    textPrimary: '#e0def4',
    textSecondary: '#908caa',
    textMuted: '#6e6a86',
    accent: '#c4a7e7',
    accentHover: '#b28fd4',
    accentLight: '#d4b8f2',
    accentDark: '#9b7dc0',
    codeBg: '#151320',
    codeHeader: '#1c1a2c',
    codeInline: '#2e2b42',
    error: '#eb6f92',
  },
  {
    id: 'hc',
    label: 'High Contrast',
    desc: 'Max readability',
    swatches: ['#000000', '#0d0d0d', '#333333', '#ffffff', '#ffffff'],
    bg: '#000000',
    sidebar: '#050505',
    surface: '#0d0d0d',
    surfaceHover: '#1a1a1a',
    surfaceActive: '#262626',
    border: '#333333',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    accent: '#ffffff',
    accentHover: '#dddddd',
    accentLight: '#ffffff',
    accentDark: '#cccccc',
    codeBg: '#000000',
    codeHeader: '#080808',
    codeInline: '#1a1a1a',
    error: '#ff4444',
  },
  {
    id: 'claude',
    label: 'Claude',
    desc: 'Warm sand & amber',
    swatches: ['#1c1917', '#292524', '#3d3835', '#d4915a', '#f5f0e8'],
    bg: '#1c1917',
    sidebar: '#211f1c',
    surface: '#292524',
    surfaceHover: '#333028',
    surfaceActive: '#3d3835',
    border: '#3d3835',
    textPrimary: '#f5f0e8',
    textSecondary: '#a09888',
    textMuted: '#6b6258',
    accent: '#d4915a',
    accentHover: '#c07a42',
    accentLight: '#e0a870',
    accentDark: '#b0703a',
    codeBg: '#131110',
    codeHeader: '#1c1917',
    codeInline: '#2e2b28',
    error: '#f87171',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    desc: 'Classic purple & cyan',
    swatches: ['#282a36', '#313244', '#44475a', '#bd93f9', '#f8f8f2'],
    bg: '#282a36',
    sidebar: '#21222c',
    surface: '#313244',
    surfaceHover: '#3a3c50',
    surfaceActive: '#44475a',
    border: '#44475a',
    textPrimary: '#f8f8f2',
    textSecondary: '#a6adc8',
    textMuted: '#6272a4',
    accent: '#bd93f9',
    accentHover: '#a879f5',
    accentLight: '#cba6ff',
    accentDark: '#9b72e0',
    codeBg: '#1e1f29',
    codeHeader: '#252735',
    codeInline: '#373a4d',
    error: '#ff5555',
  },
  {
    id: 'nord',
    label: 'Nord',
    desc: 'Arctic blue & frost',
    swatches: ['#2e3440', '#3b4252', '#4c566a', '#88c0d0', '#eceff4'],
    bg: '#2e3440',
    sidebar: '#272c38',
    surface: '#3b4252',
    surfaceHover: '#434c5e',
    surfaceActive: '#4c566a',
    border: '#4c566a',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textMuted: '#7b88a1',
    accent: '#88c0d0',
    accentHover: '#6dafc2',
    accentLight: '#9fcfde',
    accentDark: '#5e9fb0',
    codeBg: '#242932',
    codeHeader: '#2e3440',
    codeInline: '#3b4252',
    error: '#bf616a',
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

/** Applies ALL of a theme's CSS variables to :root */
export function applyTheme(theme: Theme) {
  const r = document.documentElement
  r.style.setProperty('--color-background',    theme.bg)
  r.style.setProperty('--color-sidebar',        theme.sidebar)
  r.style.setProperty('--color-surface',        theme.surface)
  r.style.setProperty('--color-surface-hover',  theme.surfaceHover)
  r.style.setProperty('--color-surface-active', theme.surfaceActive)
  r.style.setProperty('--color-border',         theme.border)
  r.style.setProperty('--color-text-primary',   theme.textPrimary)
  r.style.setProperty('--color-text-secondary', theme.textSecondary)
  r.style.setProperty('--color-text-muted',     theme.textMuted)
  r.style.setProperty('--color-accent',         theme.accent)
  r.style.setProperty('--color-accent-hover',   theme.accentHover)
  r.style.setProperty('--color-accent-light',   theme.accentLight)
  r.style.setProperty('--color-accent-dark',    theme.accentDark)
  r.style.setProperty('--color-code-bg',        theme.codeBg)
  r.style.setProperty('--color-code-header',    theme.codeHeader)
  r.style.setProperty('--color-code-inline',    theme.codeInline)
  r.style.setProperty('--color-error',          theme.error)
}
