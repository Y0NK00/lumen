import React, { useState, useEffect } from 'react'
import { useThemeStore, THEMES, getActiveTheme, applyTheme } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { WindowControlButtons } from './WindowChrome'
import {
  logout,
  updateProfile,
  listMemories,
  createMemory,
  deleteMemory,
  listOAuthConnectors,
  disconnectOAuthProvider,
  oauthStartRedirect,
  type OAuthConnectorInfo,
} from '../lib/api'
import type { Memory } from '../lib/api'
import { IcBack, IcChevron, IcCheck } from './SettingsIcons'

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 flex items-center justify-center rounded-lg"
      style={{ width: 30, height: 30, background: 'var(--color-surface-hover)' }}>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const trackW = 40
  const trackH = 22
  const knob = 17
  const pad = 2.5
  const knobLeftOn = trackW - knob - pad
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-[var(--color-background)]"
      style={{
        width: trackW,
        height: trackH,
        borderRadius: trackH / 2,
        background: checked ? 'var(--color-accent)' : 'var(--color-border)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: pad,
          left: checked ? knobLeftOn : pad,
          width: knob,
          height: knob,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.28)',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md"
      style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
      {label}
    </span>
  )
}

interface RowProps {
  icon: React.ReactNode; label: string; subtitle?: string; badge?: string; value?: string
  toggle?: boolean; toggleOn?: boolean; onToggle?: (v: boolean) => void
  onClick?: () => void; noChevron?: boolean; danger?: boolean
}

function Row({ icon, label, subtitle, badge, value, toggle, toggleOn, onToggle, onClick, noChevron, danger }: RowProps) {
  const interactive = !!onClick || !!onToggle
  return (
    <div role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
      onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick?.() }}
      className="flex items-center gap-3.5 px-5 sm:px-6 py-4 sm:py-5 min-h-[56px] select-none"
      style={{ cursor: interactive ? 'pointer' : 'default', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { if (interactive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={(e) => { if (interactive) e.currentTarget.style.background = 'transparent' }}>
      <IconBox>{icon}</IconBox>
      <div className="flex-1 min-w-0 pr-2">
        <p className="text-[13.5px] leading-snug"
          style={{ color: danger ? 'var(--color-error)' : 'var(--color-text-primary)' }}>{label}</p>
        {subtitle && <p className="text-[11.5px] mt-1 leading-snug truncate" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 self-center">
        {badge && <Badge label={badge} />}
        {value && <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>{value}</span>}
        {toggle ? (
          <Toggle checked={!!toggleOn} onChange={(v) => onToggle?.(v)} />
        ) : !noChevron ? (
          <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}><IcChevron /></span>
        ) : null}
      </div>
    </div>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings-group rounded-2xl"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {children}
    </div>
  )
}

/** Rounded panel with hairline dividers between rows (see globals `.settings-group`). */
function SettingsPane({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings-group rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {children}
    </div>
  )
}

function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
        <IcBack />
      </button>
      <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>
    </div>
  )
}

// ── Appearance sub-page ──────────────────────────────────────────────────────

function AppearancePage({ onBack, omitHeader }: { onBack: () => void; omitHeader?: boolean }) {
  const { themeId, setTheme } = useThemeStore()
  const handleSelect = (id: string) => { setTheme(id); applyTheme(getActiveTheme(id)) }
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {!omitHeader && <SubPageHeader title="Appearance" onBack={onBack} />}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full py-7 sm:py-8">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-4" style={{ color: 'var(--color-text-muted)' }}>Preset themes</p>
          <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {THEMES.map((t) => {
                const isActive = themeId === t.id
                return (
                  <button key={t.id} onClick={() => handleSelect(t.id)}
                    type="button"
                    className="relative rounded-xl p-4 pr-12 text-left transition-all w-full"
                    style={{ background: 'var(--color-surface-hover)', border: isActive ? '2px solid var(--color-accent)' : '2px solid var(--color-border)' }}>
                    <div className="flex gap-px rounded-md overflow-hidden mb-3 h-[18px] max-w-[140px]">
                      {t.swatches.map((c, si) => <div key={si} className="flex-1" style={{ background: c }} />)}
                    </div>
                    <p className="text-[13px] font-semibold leading-snug" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{t.label}</p>
                    <p className="text-[11.5px] mt-1 leading-snug" style={{ color: 'var(--color-text-muted)' }}>{t.desc}</p>
                    {isActive && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-sm" style={{ background: 'var(--color-accent)' }}>
                        <IcCheck />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Memory sub-page ──────────────────────────────────────────────────────────

function MemoryPage({ onBack, omitHeader }: { onBack: () => void; omitHeader?: boolean }) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listMemories().then(setMemories).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleAdd = async () => {
    if (!input.trim()) return
    setSaving(true)
    try {
      const m = await createMemory(input.trim())
      setMemories((prev) => [m, ...prev])
      setInput('')
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    await deleteMemory(id).catch(console.error)
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {!omitHeader && <SubPageHeader title="Memory" onBack={onBack} />}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full py-6 space-y-4">
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Memories are injected into every conversation automatically. Use them to give Lumen permanent context — your resume, target roles, preferences.
          </p>

          {/* Add new */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g. I have 5 years of IT experience, currently working at a credit union..."
              rows={3}
              className="w-full px-4 pt-3 pb-2 text-[13px] resize-none outline-none bg-transparent"
              style={{ color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
            />
            <div className="flex justify-end px-3 py-2">
              <button onClick={handleAdd} disabled={saving || !input.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ background: 'var(--color-accent)', color: '#fff', opacity: (saving || !input.trim()) ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Add memory'}
              </button>
            </div>
          </div>

          {/* List */}
          {loading ? (
            <p className="text-[13px] text-center py-4" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : memories.length === 0 ? (
            <p className="text-[13px] text-center py-4" style={{ color: 'var(--color-text-muted)' }}>No memories yet.</p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <p className="flex-1 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{m.content}</p>
                  <button onClick={() => handleDelete(m.id)}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg mt-0.5"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = `color-mix(in srgb, var(--color-error) 10%, transparent)` }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Connectors sub-page ──────────────────────────────────────────────────────

function ConnectorIcon({ id }: { id: 'google' | 'github' }) {
  if (id === 'github') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-text-primary)' }}>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

const CONNECTOR_META: Record<string, { authType: 'OAuth'; envVars: string[] }> = {
  google: { authType: 'OAuth', envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  github: { authType: 'OAuth', envVars: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'] },
}

function ConnectorsPage({ onBack, omitHeader }: { onBack: () => void; omitHeader?: boolean }) {
  const [items, setItems] = useState<OAuthConnectorInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    listOAuthConnectors()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('oauth') === 'success' || sp.get('oauth') === 'error') {
      const path = window.location.pathname || '/'
      window.history.replaceState({}, document.title, path)
      load()
    }
  }, [])

  const disconnect = async (id: 'google' | 'github') => {
    setBusyId(id)
    try {
      await disconnectOAuthProvider(id)
      await load()
    } catch (e) {
      console.error(e)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--color-background)' }}>
      {!omitHeader && <SubPageHeader title="Connectors" onBack={onBack} />}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-full py-7 sm:py-8 space-y-6">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Link accounts so Lumen can use their APIs on your behalf. Each user stores their own tokens on this server.
          </p>

          <div className="settings-group rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {loading ? (
              <div className="px-6 py-10 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                Loading connectors…
              </div>
            ) : (
              items.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-4 p-5 sm:p-6 sm:flex-row sm:items-center sm:gap-5"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--color-surface-hover)' }}
                  >
                    <ConnectorIcon id={c.id} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                        {c.name}
                      </p>
                      {CONNECTOR_META[c.id] && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}>
                          {CONNECTOR_META[c.id].authType}
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      {c.description}
                    </p>
                    {!c.configured && CONNECTOR_META[c.id] && (
                      <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                        Needs server env vars:{' '}
                        {CONNECTOR_META[c.id].envVars.map((v, i) => (
                          <React.Fragment key={v}>
                            <code className="text-[10.5px] px-1 py-0.5 rounded" style={{ background: 'var(--color-surface-hover)' }}>{v}</code>
                            {i < CONNECTOR_META[c.id].envVars.length - 1 && ' · '}
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                    {c.connected && c.scope && (
                      <p className="text-[11px] mt-2 font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {c.scope}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 sm:justify-end sm:min-w-[120px]">
                    {!c.configured ? (
                      <span className="text-[12px] font-medium px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-hover)' }}>
                        Needs setup
                      </span>
                    ) : c.connected ? (
                      <button
                        type="button"
                        onClick={() => void disconnect(c.id)}
                        disabled={busyId === c.id}
                        className="min-h-[40px] px-4 py-2.5 rounded-xl text-[13px] font-medium transition-opacity"
                        style={{
                          color: 'var(--color-error)',
                          background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
                          opacity: busyId === c.id ? 0.65 : 1,
                        }}
                      >
                        {busyId === c.id ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setBusyId(c.id)
                          oauthStartRedirect(c.id)
                            .catch((e) => console.error(e))
                            .finally(() => setBusyId(null))
                        }}
                        disabled={busyId === c.id}
                        className="inline-flex items-center justify-center min-h-[40px] min-w-[104px] px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity"
                        style={{
                          background: 'var(--color-accent)',
                          color: '#fff',
                          opacity: busyId === c.id ? 0.75 : 1,
                        }}
                      >
                        {busyId === c.id ? 'Opening…' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Register callback URLs on each provider: your server&apos;s public URL plus{' '}
            <code className="text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--color-surface-hover)' }}>
              /api/oauth/google/callback
            </code>{' '}
            or{' '}
            <code className="text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--color-surface-hover)' }}>
              /api/oauth/github/callback
            </code>
            . Set <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-surface-hover)' }}>FRONTEND_URL</code> on the server so users return to your PWA after consent.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main settings view (Claude-style sidebar + pane) ─────────────────────────

type SettingsSection =
  | 'general'
  | 'appearance'
  | 'account'
  | 'privacy'
  | 'billing'
  | 'usage'
  | 'capabilities'
  | 'memory'
  | 'connectors'
  | 'code'
  | 'cowork'
  | 'chromeBeta'
  | 'desktopGeneral'
  | 'desktopExtensions'
  | 'desktopDeveloper'

function NavHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="pl-4 pr-3 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.07em]"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {children}
    </p>
  )
}

function NavItem({
  id,
  current,
  onSelect,
  label,
  beta,
}: {
  id: SettingsSection
  current: SettingsSection
  onSelect: (id: SettingsSection) => void
  label: string
  beta?: boolean
}) {
  const on = current === id
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="w-full flex items-center gap-2 rounded-lg pl-4 pr-3 py-2.5 text-left text-[13px] transition-colors leading-snug"
      style={{
        background: on ? 'var(--color-surface-hover)' : 'transparent',
        color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontWeight: on ? 600 : 450,
        border: on ? '1px solid var(--color-border)' : '1px solid transparent',
      }}
    >
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      {beta ? <span className="shrink-0"><Badge label="Beta" /></span> : null}
    </button>
  )
}

function PaneTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8 sm:mb-10">
      <h2 className="text-[22px] sm:text-[24px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {subtitle ? (
        <p className="text-[13px] sm:text-[14px] mt-2.5 leading-relaxed max-w-xl" style={{ color: 'var(--color-text-muted)' }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

function SettingsToggleRow({
  title,
  description,
  checked,
  onChange,
  badges,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  badges?: string[]
}) {
  return (
    <div className="flex items-center gap-5 px-5 sm:px-6 py-5 sm:py-6 min-h-[60px]">
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13.5px] font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </p>
          {badges?.map((b) => (
            <Badge key={b} label={b} />
          ))}
        </div>
        {description ? (
          <p className="text-[12px] mt-1.5 leading-relaxed max-w-[52rem]" style={{ color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 flex items-center self-start sm:self-center pt-0.5 sm:pt-0">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  )
}

interface SettingsViewProps { onClose: () => void }

export function SettingsView({ onClose }: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>('general')
  const [haptic, setHaptic] = useState(true)
  const [streaming, setStreaming] = useState(true)
  const [tokenCount, setTokenCount] = useState(false)
  const [dispatchOn, setDispatchOn] = useState(true)
  const [searchMemory, setSearchMemory] = useState(true)
  const [genMemory, setGenMemory] = useState(true)
  const [artifacts, setArtifacts] = useState(false)
  const [aiArtifacts, setAiArtifacts] = useState(true)
  const [inlineViz, setInlineViz] = useState(true)
  const [codeExec, setCodeExec] = useState(true)
  const [networkEgress, setNetworkEgress] = useState(true)
  const [previewOn, setPreviewOn] = useState(true)
  const [persistPreview, setPersistPreview] = useState(true)
  const [runStartup, setRunStartup] = useState(true)
  const [tray, setTray] = useState(true)
  const [keepAwake, setKeepAwake] = useState(true)
  const [bypassPerm, setBypassPerm] = useState(false)
  const [drawAttention, setDrawAttention] = useState(false)
  const [computerUse, setComputerUse] = useState(false)
  const { themeId } = useThemeStore()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const resetSession = useAppStore((s) => s.resetSession)
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace)
  const activeTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  const [editName, setEditName] = useState(user?.displayName ?? '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  useEffect(() => { setEditName(user?.displayName ?? '') }, [user?.displayName])
  const saveName = async () => {
    if (!editName.trim() || editName === user?.displayName) return
    setNameSaving(true)
    try {
      await updateProfile({ displayName: editName.trim() })
      if (user) setUser({ ...user, displayName: editName.trim() })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch { /* noop */ } finally { setNameSaving(false) }
  }

  const finalizeSignOut = async () => {
    await logout().catch(() => {})
    resetSession()
    resetWorkspace()
    clearAuth()
    onClose()
  }

  let main: React.ReactNode
  switch (section) {
    case 'appearance':
      main = <AppearancePage onBack={() => setSection('general')} omitHeader />
      break
    case 'memory':
      main = <MemoryPage onBack={() => setSection('capabilities')} omitHeader />
      break
    case 'connectors':
      main = <ConnectorsPage onBack={() => setSection('connectors')} omitHeader />
      break
    case 'general':
      main = (
        <div className=”w-full py-7 sm:py-8”>
          <PaneTitle title=”General” subtitle=”Profile and preferences for Lumen chat.” />
          <div className=”space-y-6 sm:space-y-7”>
            <div>
              <div className=”flex items-baseline justify-between mb-2.5”>
                <label className=”text-[11px] font-medium uppercase tracking-wide” style={{ color: 'var(--color-text-muted)' }}>
                  Full name
                </label>
                {editName !== (user?.displayName ?? '') && (
                  <button
                    type=”button”
                    onClick={() => void saveName()}
                    disabled={nameSaving || !editName.trim()}
                    className=”text-[11.5px] font-semibold px-3 py-1 rounded-lg transition-opacity”
                    style={{
                      background: 'var(--color-accent)',
                      color: '#fff',
                      opacity: nameSaving || !editName.trim() ? 0.5 : 1,
                    }}
                  >
                    {nameSaving ? 'Saving…' : 'Save'}
                  </button>
                )}
                {nameSaved && editName === (user?.displayName ?? '') && (
                  <span className=”text-[11.5px] font-medium” style={{ color: 'var(--color-accent)' }}>Saved ✓</span>
                )}
              </div>
              <input
                className=”w-full rounded-xl px-5 py-3.5 text-[13px] outline-none leading-snug transition-colors focus:ring-1”
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveName() }}
                placeholder=”Your name”
              />
            </div>
            <div>
              <label className=”text-[11px] font-medium uppercase tracking-wide block mb-2.5” style={{ color: 'var(--color-text-muted)' }}>
                Email
              </label>
              <input
                readOnly
                className=”w-full rounded-xl px-5 py-3.5 text-[13px] outline-none leading-snug”
                style={{
                  background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'default',
                }}
                value={user?.email ?? ''}
              />
            </div>
            <div>
              <label className=”text-[11px] font-medium uppercase tracking-wide block mb-2.5” style={{ color: 'var(--color-text-muted)' }}>
                Instructions for Lumen
              </label>
              <textarea
                placeholder=”Persistent about-me context coming soon — use per-conversation system prompts for now.”
                rows={4}
                className=”w-full rounded-xl px-5 py-4 text-[13px] outline-none resize-none leading-relaxed min-h-[128px]”
                style={{
                  background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                  cursor: 'not-allowed',
                }}
                readOnly
              />
            </div>
          </div>
          <div className="mt-12 sm:mt-14">
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Chat
            </p>
            <Group>
              <Row
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                }
                label="Appearance & themes"
                subtitle={activeTheme.label}
                onClick={() => setSection('appearance')}
              />
              <Row
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                }
                label="Haptic feedback"
                toggle
                toggleOn={haptic}
                onToggle={setHaptic}
                noChevron
              />
              <Row
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 6h16M4 12h16M4 18h10" />
                  </svg>
                }
                label="Streaming responses"
                toggle
                toggleOn={streaming}
                onToggle={setStreaming}
                noChevron
              />
              <Row
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <path d="M8 9h8M8 13h5" />
                  </svg>
                }
                label="Show token count"
                toggle
                toggleOn={tokenCount}
                onToggle={setTokenCount}
                noChevron
              />
            </Group>
          </div>
        </div>
      )
      break
    case 'account':
      main = (
        <div className="w-full py-7 sm:py-8">
          <PaneTitle title="Account" subtitle="Session and sign-in for this device." />
          <Group>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between px-6 py-6 sm:px-8 sm:py-8">
              <div className="min-w-0 pr-2">
                <p className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                  Switch account
                </p>
                <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  Signs you out on this device and opens the login screen so you can use a different email or password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void finalizeSignOut()}
                className="shrink-0 self-start sm:self-center min-h-[44px] min-w-[148px] px-6 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                Switch account
              </button>
            </div>
          </Group>
          <p className="text-[12px] mt-8 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Organization and multi-device session lists can plug in here when your server exposes those APIs.
          </p>
        </div>
      )
      break
    case 'privacy':
    case 'billing':
      main = (
        <div className="w-full py-6">
          <PaneTitle
            title={section === 'privacy' ? 'Privacy' : 'Billing'}
            subtitle="Self-hosted Lumen — you control data retention and any external APIs. Detailed policy and plan controls can go here."
          />
        </div>
      )
      break
    case 'usage':
      main = (
        <div className="w-full py-6">
          <PaneTitle title="Usage" subtitle="Token and request usage will appear here once wired to your provider billing or local counters." />
          <div className="rounded-xl p-4 mt-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
              No usage limits configured for this build.
            </p>
          </div>
        </div>
      )
      break
    case 'capabilities':
      main = (
        <div className="w-full py-7 sm:py-8">
          <PaneTitle title="Capabilities" subtitle="What Lumen is allowed to do across chat, Cowork, and Code." />
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Memory
          </p>
          <SettingsPane>
            <SettingsToggleRow
              title="Search and reference chats"
              description="Let Lumen use past conversations for context when supported by the backend."
              checked={searchMemory}
              onChange={setSearchMemory}
            />
            <SettingsToggleRow
              title="Generate memory from chat history"
              description="Summaries stored as memories for future sessions."
              checked={genMemory}
              onChange={setGenMemory}
            />
            <button
              type="button"
              onClick={() => setSection('memory')}
              className="w-full text-left px-5 sm:px-6 py-5 min-h-[56px] flex items-center justify-between gap-4 text-[13px] font-medium transition-colors"
              style={{ color: 'var(--color-accent)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              View and manage memory
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                <IcChevron />
              </span>
            </button>
          </SettingsPane>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 mt-10" style={{ color: 'var(--color-text-muted)' }}>
            Visuals
          </p>
          <SettingsPane>
            <SettingsToggleRow
              title="Artifacts"
              description="Dedicated side panel for long outputs (planned)."
              checked={artifacts}
              onChange={setArtifacts}
            />
            <SettingsToggleRow
              title="AI-powered artifacts"
              checked={aiArtifacts}
              onChange={setAiArtifacts}
            />
            <SettingsToggleRow
              title="Inline visualizations"
              description="Charts and diagrams inline in chat when the model returns them."
              checked={inlineViz}
              onChange={setInlineViz}
            />
          </SettingsPane>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 mt-10" style={{ color: 'var(--color-text-muted)' }}>
            Code execution &amp; files
          </p>
          <SettingsPane>
            <SettingsToggleRow
              title="Code execution and file creation"
              description="Server-side tooling when your deployment enables it."
              checked={codeExec}
              onChange={setCodeExec}
              badges={['Chat']}
            />
            <SettingsToggleRow
              title="Allow network egress"
              description="Let tools reach the network for packages and analysis."
              checked={networkEgress}
              onChange={setNetworkEgress}
              badges={['Chat', 'Cowork']}
            />
          </SettingsPane>
        </div>
      )
      break
    case 'code':
      main = (
        <div className="w-full py-7 sm:py-8">
          <PaneTitle title="Code" subtitle="Desktop and agent defaults for the Code workspace (mirrors your Claude Code reference)." />
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Desktop / agent
          </p>
          <SettingsPane>
            <SettingsToggleRow
              title="Allow bypass permissions mode"
              description="Run fixes without confirming each shell command — use only in trusted repos."
              checked={bypassPerm}
              onChange={setBypassPerm}
            />
            <SettingsToggleRow
              title="Draw attention on notifications"
              description="Flash taskbar or dock when the agent needs input."
              checked={drawAttention}
              onChange={setDrawAttention}
            />
            <SettingsToggleRow title="Preview (dev servers &amp; DOM)" checked={previewOn} onChange={setPreviewOn} />
            <SettingsToggleRow
              title="Persist preview sessions"
              description="Keep cookies for local previews across restarts."
              checked={persistPreview}
              onChange={setPersistPreview}
            />
          </SettingsPane>
          <p className="text-[12px] mt-8 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Worktree location and branch prefix hook into your Git host when those APIs are connected.
          </p>
        </div>
      )
      break
    case 'cowork':
      main = (
        <div className="w-full py-7 sm:py-8">
          <PaneTitle title="Cowork" subtitle="Dispatch-style tasks from your phone into this desktop session." />
          <SettingsPane>
            <SettingsToggleRow
              title="Dispatch"
              description="When on, scheduled and mobile-dispatched tasks can target this machine via Lumen APIs."
              checked={dispatchOn}
              onChange={setDispatchOn}
              badges={['Beta']}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 sm:px-6 py-5 min-h-[56px]">
              <div className="min-w-0 pr-2">
                <p className="text-[13.5px] font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                  Global instructions
                </p>
                <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  Applied to every Cowork session — conventions and context the model should always see.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 self-start sm:self-center min-h-[40px] px-4 py-2.5 rounded-xl text-[13px] font-medium"
                style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}
              >
                Edit
              </button>
            </div>
          </SettingsPane>
        </div>
      )
      break
    case 'chromeBeta':
      main = (
        <div className="w-full py-6">
          <PaneTitle
            title="Lumen in Chrome"
            subtitle="Browser extension and connector flows — placeholder for Beta features."
          />
        </div>
      )
      break
    case 'desktopGeneral':
      main = (
        <div className="w-full py-7 sm:py-8">
          <PaneTitle title="Desktop app · General" subtitle="Electron / native shell behavior." />
          <SettingsPane>
            <SettingsToggleRow title="Run on startup" checked={runStartup} onChange={setRunStartup} />
            <SettingsToggleRow title="Keep in system tray" checked={tray} onChange={setTray} />
            <SettingsToggleRow
              title="Keep computer awake while tasks run"
              checked={keepAwake}
              onChange={setKeepAwake}
            />
            <SettingsToggleRow
              title="Computer use (screen + input)"
              description="Requires OS permissions when implemented."
              checked={computerUse}
              onChange={setComputerUse}
            />
          </SettingsPane>
        </div>
      )
      break
    case 'desktopExtensions':
      main = (
        <div className="w-full py-6">
          <PaneTitle
            title="Extensions"
            subtitle="Allow Lumen to interact with apps and tools on this computer."
          />
          <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
            Browse and install extensions from here once the extension registry is wired up.
          </p>
        </div>
      )
      break
    case 'desktopDeveloper':
      main = (
        <div className="w-full py-6">
          <PaneTitle title="Local MCP servers" subtitle="Add and manage Model Context Protocol servers you are developing." />
          <div
            className="rounded-2xl flex flex-col items-center justify-center py-16 px-6 mt-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
              No servers added
            </p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-[13px] font-medium"
                style={{ background: 'var(--color-text-primary)', color: 'var(--color-background)' }}
              >
                Edit config
              </button>
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl text-[13px] font-medium"
                style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}
              >
                Developer docs ↗
              </a>
            </div>
          </div>
        </div>
      )
      break
    default:
      main = null
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <div
        className="flex items-center gap-3 pl-4 pr-4 sm:pr-5 py-4 shrink-0 min-h-[56px]"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
          aria-label="Close settings"
        >
          <IcBack />
        </button>
        <h1 className="flex-1 min-w-0 text-[15px] font-semibold tracking-tight truncate text-center sm:pl-2" style={{ color: 'var(--color-text-primary)' }}>
          Settings
        </h1>
        <div className="flex items-center shrink-0 w-[120px] sm:w-[132px] justify-end">
          <WindowControlButtons className="hidden sm:flex" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside
          className="w-[272px] lg:w-[288px] shrink-0 overflow-y-auto overflow-x-hidden py-4 pl-4 pr-4 hidden sm:block"
          style={{ borderRight: '1px solid var(--color-border)' }}
        >
          <NavHeading>Main</NavHeading>
          <div className="space-y-1">
            <NavItem id="general" current={section} onSelect={setSection} label="General" />
            <NavItem id="appearance" current={section} onSelect={setSection} label="Appearance" />
            <NavItem id="account" current={section} onSelect={setSection} label="Account" />
            <NavItem id="privacy" current={section} onSelect={setSection} label="Privacy" />
            <NavItem id="billing" current={section} onSelect={setSection} label="Billing" />
            <NavItem id="usage" current={section} onSelect={setSection} label="Usage" />
            <NavItem id="capabilities" current={section} onSelect={setSection} label="Capabilities" />
            <NavItem id="memory" current={section} onSelect={setSection} label="Memory" />
            <NavItem id="connectors" current={section} onSelect={setSection} label="Connectors" />
            <NavItem id="code" current={section} onSelect={setSection} label="Code" />
            <NavItem id="cowork" current={section} onSelect={setSection} label="Cowork" />
            <NavItem id="chromeBeta" current={section} onSelect={setSection} label="Lumen in Chrome" beta />
          </div>
          <NavHeading>Desktop app</NavHeading>
          <div className="space-y-1">
            <NavItem id="desktopGeneral" current={section} onSelect={setSection} label="General" />
            <NavItem id="desktopExtensions" current={section} onSelect={setSection} label="Extensions" />
            <NavItem id="desktopDeveloper" current={section} onSelect={setSection} label="Developer" />
          </div>
        </aside>

        {/* Mobile: section dropdown could be added later; for now scroll nav */}
        <aside
          className="sm:hidden shrink-0 overflow-x-auto flex gap-1 px-2 py-2 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {(
            [
              'general',
              'appearance',
              'account',
              'capabilities',
              'connectors',
              'code',
              'cowork',
              'desktopDeveloper',
            ] as SettingsSection[]
          ).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize"
              style={{
                background: section === id ? 'var(--color-surface-hover)' : 'transparent',
                color: section === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              }}
            >
              {id.replace('desktop', '').replace('Beta', '')}
            </button>
          ))}
        </aside>

        <main
          className="flex-1 overflow-y-auto min-h-0 min-w-0 flex flex-col box-border"
          style={{ background: 'var(--color-background)' }}
        >
          {/* Centered content column + wide side gutters (Claude-style). Sign out lives under Account, not the header. */}
          <div className="flex-1 flex justify-center w-full min-h-0">
            <div className="w-full max-w-[min(40rem,calc(100%-1.5rem))] sm:max-w-[42rem] px-6 sm:px-12 lg:px-16 xl:px-20 py-8 sm:py-12 lg:py-16">
              {main}
            </div>
          </div>
          <div className="text-center py-10 px-6 shrink-0">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Lumen · Self-hosted assistant
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
