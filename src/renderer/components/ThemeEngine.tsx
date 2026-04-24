// ─── ThemeEngine.tsx ──────────────────────────────────────────────────────────
// Full replacement for AppearanceSection in SettingsPage.tsx
// Includes: preset theme cards, seed color picker, color mode, and all
// other appearance settings — wired directly to settingsStore + globals.css vars.

import { useState, useCallback } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import type { Theme, ColorMode, FontSize, Density, ChatFont, BgAnim } from '../stores/settingsStore'

// ─── Preset theme definitions ─────────────────────────────────────────────────

const PRESET_THEMES = [
  {
    id: 'lumen-dark', name: 'Claude-Lumen', desc: 'Clean violet',
    colors: { bg: '#0d0d10', sidebar: '#111116', surface: '#18181f', accent: '#8b6fff', text: '#e8e6f0' },
  },
  {
    id: 'midnight', name: 'Midnight', desc: 'Deep violet',
    colors: { bg: '#080810', sidebar: '#0c0c17', surface: '#10101e', accent: '#7c5cfc', text: '#dcd8f8' },
  },
  {
    id: 'github', name: 'GitHub Dark', desc: 'Slate & muted',
    colors: { bg: '#0d1117', sidebar: '#010409', surface: '#161b22', accent: '#58a6ff', text: '#e6edf3' },
  },
  {
    id: 'mocha', name: 'Catppuccin', desc: 'Mocha warmth',
    colors: { bg: '#1e1e2e', sidebar: '#181825', surface: '#313244', accent: '#cba6f7', text: '#cdd6f4' },
  },
  {
    id: 'rosepine', name: 'Rosé Pine', desc: 'Muted + warm',
    colors: { bg: '#191724', sidebar: '#1f1d2e', surface: '#26233a', accent: '#c4a7e7', text: '#e0def4' },
  },
  {
    id: 'high-contrast', name: 'High Contrast', desc: 'Max readability',
    colors: { bg: '#000000', sidebar: '#050505', surface: '#0d0d0d', accent: '#ffffff', text: '#ffffff' },
  },
] as const

// ─── HSL seed color utilities ─────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] | null {
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h = h * 60
      if (h < 0) h += 360
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
  } catch {
    return null
  }
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * sl
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(255, (v + m) * 255))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const PALETTE_LABELS: [string, string][] = [
  ['--color-background', 'bg'],
  ['--color-sidebar', 'sidebar'],
  ['--color-surface', 'surface'],
  ['--color-border', 'border'],
  ['--color-accent', 'accent'],
  ['--color-text-primary', 't1'],
  ['--color-text-secondary', 't2'],
]

function generatePalette(hex: string, off: number): Record<string, string> | null {
  const hsl = hexToHsl(hex)
  if (!hsl) return null
  const [h, s, l] = hsl
  return {
    '--color-background':     hslToHex(h, Math.round(s * 0.15), Math.max(3,  6 + off)),
    '--color-sidebar':        hslToHex(h, Math.round(s * 0.17), Math.max(5,  8 + off)),
    '--color-surface':        hslToHex(h, Math.round(s * 0.20), Math.max(8,  11 + off)),
    '--color-surface-hover':  hslToHex(h, Math.round(s * 0.22), Math.max(11, 14 + off)),
    '--color-surface-active': hslToHex(h, Math.round(s * 0.25), Math.max(14, 17 + off)),
    '--color-border':         hslToHex(h, Math.round(s * 0.28), Math.max(17, 20 + off)),
    '--color-text-primary':   hslToHex(h, Math.round(s * 0.10), 91),
    '--color-text-secondary': hslToHex(h, Math.round(s * 0.20), 62),
    '--color-text-muted':     hslToHex(h, Math.round(s * 0.25), 37),
    '--color-accent':         hex,
    '--color-accent-hover':   hslToHex(h, s, Math.min(75, l + 8)),
    '--color-error':          '#f87171',
  }
}

const CUSTOM_VARS = Object.keys(generatePalette('#000000', 0) ?? {})

// ─── Shared sub-components ────────────────────────────────────────────────────

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[10.5px] font-semibold text-text-muted uppercase tracking-widest">
        {title}
      </h3>
      {children}
    </div>
  )
}

function PillGroup<T extends string>({
  value, options, onChange, cols = 3,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  cols?: 2 | 3 | 4
}) {
  const colClass = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[cols]
  return (
    <div className={`grid ${colClass} gap-2`}>
      {options.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            value === id
              ? 'bg-accent/15 border-accent/30 text-accent'
              : 'bg-surface border-border text-text-muted hover:text-text-primary hover:border-border/80 hover:bg-surface-hover'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${on ? 'bg-accent' : 'bg-border'}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${on ? 'translate-x-[16px]' : 'translate-x-0'}`} />
    </button>
  )
}

function ToggleRow({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-text-primary">{label}</p>
        <p className="text-[11.5px] text-text-muted">{desc}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  )
}

// ─── ThemeEngine ──────────────────────────────────────────────────────────────

export default function ThemeEngine() {
  const {
    theme, setTheme,
    colorMode, setColorMode,
    fontSize, setFontSize,
    density, setDensity,
    chatFont, setChatFont,
    backgroundAnimation, setBackgroundAnimation,
    showThinkingBlocks, setShowThinkingBlocks,
    animateMessages, setAnimateMessages,
    showStreamingCursor, setShowStreamingCursor,
    compactToolCards, setCompactToolCards,
  } = useSettingsStore()

  const [seedHex, setSeedHex]         = useState('#8b6fff')
  const [lightOffset, setLightOffset] = useState(0)
  const [isCustom, setIsCustom]       = useState(false)

  const seedPalette = generatePalette(seedHex, lightOffset)

  const handleThemeSelect = useCallback((id: string) => {
    // Remove any inline custom CSS variables
    const root = document.documentElement
    CUSTOM_VARS.forEach(v => root.style.removeProperty(v))
    setTheme(id as Theme)
    setIsCustom(false)
  }, [setTheme])

  const handleApplySeed = useCallback(() => {
    const palette = generatePalette(seedHex, lightOffset)
    if (!palette) return
    const root = document.documentElement
    Object.entries(palette).forEach(([k, v]) => root.style.setProperty(k, v))
    setIsCustom(true)
    ;(window as any).tower?.saveSettings?.({ seedColor: seedHex, seedLightOffset: lightOffset })
  }, [seedHex, lightOffset])

  return (
    <div className="flex flex-col gap-8">

      {/* ── Preset Themes ─────────────────────────────────────────────────── */}
      <SubSection title="Preset Themes">
        <div className="grid grid-cols-3 gap-3">
          {PRESET_THEMES.map((t) => {
            const active = !isCustom && theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => handleThemeSelect(t.id)}
                className={`relative p-3 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-accent/40 bg-accent/5 ring-1 ring-accent/20'
                    : 'border-border bg-surface hover:border-border/80 hover:bg-surface-hover'
                }`}
              >
                {active && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                <div className="flex gap-1 mb-2.5">
                  <div className="w-5 h-4 rounded-sm" style={{ background: t.colors.bg }} />
                  <div className="w-5 h-4 rounded-sm" style={{ background: t.colors.sidebar }} />
                  <div className="w-5 h-4 rounded-sm" style={{ background: t.colors.surface }} />
                  <div className="w-5 h-4 rounded-sm" style={{ background: t.colors.accent }} />
                  <div className="w-5 h-4 rounded-sm" style={{ background: t.colors.text }} />
                </div>
                <p className="text-[12px] font-medium text-text-primary leading-tight">{t.name}</p>
                <p className="text-[10.5px] text-text-muted mt-0.5">{t.desc}</p>
              </button>
            )
          })}
        </div>
      </SubSection>

      {/* ── Custom Seed Color ─────────────────────────────────────────────── */}
      <SubSection title="Custom Seed Color">
        <div className="flex flex-col gap-3 p-4 bg-surface rounded-xl border border-border">
          {/* Picker + hex input */}
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={seedHex}
              onChange={(e) => setSeedHex(e.target.value)}
              className="w-8 h-8 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
            />
            <input
              type="text"
              value={seedHex}
              onChange={(e) => {
                const v = e.target.value
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setSeedHex(v)
              }}
              className="w-24 px-2 py-1.5 bg-surface-hover border border-border rounded-lg text-sm font-mono text-text-primary focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Lightness offset + apply */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-text-muted shrink-0 w-28">Lightness offset</span>
            <input
              type="range"
              min={-10}
              max={15}
              value={lightOffset}
              onChange={(e) => setLightOffset(Number(e.target.value))}
              className="flex-1 accent-accent h-1"
            />
            <span className="text-[11px] text-text-muted w-6 text-right tabular-nums">
              {lightOffset > 0 ? `+${lightOffset}` : lightOffset}
            </span>
            <button
              onClick={handleApplySeed}
              className="px-3 py-1.5 bg-accent text-white text-[12px] font-semibold rounded-lg hover:bg-accent-hover transition-colors"
            >
              Apply
            </button>
          </div>

          {/* Live palette preview swatches */}
          {seedPalette && (
            <div className="flex gap-1.5 pt-1">
              {PALETTE_LABELS.map(([key, label]) => (
                <div key={key} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full h-5 rounded border border-white/5"
                    style={{ background: seedPalette[key] }}
                  />
                  <span className="text-[8px] text-text-muted">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SubSection>

      {/* ── Color Mode ────────────────────────────────────────────────────── */}
      <SubSection title="Color Mode">
        <PillGroup
          value={colorMode}
          onChange={setColorMode}
          cols={3}
          options={[
            { id: 'light' as ColorMode, label: 'Light' },
            { id: 'auto'  as ColorMode, label: 'Auto'  },
            { id: 'dark'  as ColorMode, label: 'Dark'  },
          ]}
        />
      </SubSection>

      {/* ── Font Size ─────────────────────────────────────────────────────── */}
      <SubSection title="Font Size">
        <PillGroup
          value={fontSize}
          onChange={setFontSize}
          cols={3}
          options={[
            { id: 'xs'   as FontSize, label: 'Small'   },
            { id: 'sm'   as FontSize, label: 'Default' },
            { id: 'base' as FontSize, label: 'Large'   },
          ]}
        />
        <p className="text-xs text-text-muted">Changes the root font size — scales the entire interface.</p>
      </SubSection>

      {/* ── Message Density ───────────────────────────────────────────────── */}
      <SubSection title="Message Density">
        <PillGroup
          value={density}
          onChange={setDensity}
          cols={3}
          options={[
            { id: 'compact'     as Density, label: 'Compact'     },
            { id: 'comfortable' as Density, label: 'Comfortable' },
            { id: 'spacious'    as Density, label: 'Spacious'    },
          ]}
        />
      </SubSection>

      {/* ── Chat Font ─────────────────────────────────────────────────────── */}
      <SubSection title="Chat Font">
        <PillGroup
          value={chatFont}
          onChange={setChatFont}
          cols={2}
          options={[
            { id: 'default'  as ChatFont, label: 'Default'            },
            { id: 'sans'     as ChatFont, label: 'Sans'               },
            { id: 'system'   as ChatFont, label: 'System'             },
            { id: 'dyslexia' as ChatFont, label: 'Dyslexia-friendly'  },
          ]}
        />
      </SubSection>

      {/* ── Background Animation ──────────────────────────────────────────── */}
      <SubSection title="Background Animation">
        <PillGroup
          value={backgroundAnimation}
          onChange={setBackgroundAnimation}
          cols={3}
          options={[
            { id: 'enabled'  as BgAnim, label: 'Enabled'  },
            { id: 'auto'     as BgAnim, label: 'Auto'      },
            { id: 'disabled' as BgAnim, label: 'Disabled'  },
          ]}
        />
        <p className="text-xs text-text-muted">Auto respects system "reduce motion" settings.</p>
      </SubSection>

      {/* ── Interface Toggles ─────────────────────────────────────────────── */}
      <SubSection title="Interface">
        <div className="flex flex-col divide-y divide-border/40 mt-1">
          {([
            { label: 'Show thinking blocks',   desc: 'Expand Claude extended thinking in responses', on: showThinkingBlocks,   onChange: setShowThinkingBlocks  },
            { label: 'Animate messages',        desc: 'Slide-in animation on new messages',           on: animateMessages,      onChange: setAnimateMessages      },
            { label: 'Show streaming cursor',   desc: 'Blinking cursor while generating',             on: showStreamingCursor,  onChange: setShowStreamingCursor  },
            { label: 'Compact tool call cards', desc: 'Collapse tool results by default',             on: compactToolCards,     onChange: setCompactToolCards     },
          ] as const).map(({ label, desc, on, onChange }) => (
            <div key={label} className="py-3.5">
              <ToggleRow label={label} desc={desc} on={on} onChange={onChange} />
            </div>
          ))}
        </div>
      </SubSection>

    </div>
  )
}
