import React, { useState, useEffect } from 'react'
import { useThemeStore, THEMES, getActiveTheme, applyTheme } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { logout, listMemories, createMemory, deleteMemory, getOAuthStatus, disconnectOAuth } from '../lib/api'
import type { Memory } from '../lib/api'
import {
  IcProfile, IcBilling, IcUsage,
  IcCapabilities, IcConnectors, IcPermissions,
  IcAppearance, IcSpeech, IcNotifications, IcPrivacy, IcShare,
  IcHaptic, IcStreaming, IcTokenCount, IcSignOut,
  IcBack, IcChevron, IcCheck,
} from './SettingsIcons'

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 flex items-center justify-center rounded-lg"
      style={{ width: 30, height: 30, background: 'var(--color-surface-hover)' }}>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="relative shrink-0"
      style={{ width: 44, height: 26, borderRadius: 13,
        background: checked ? 'var(--color-accent)' : 'var(--color-border)',
        border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}>
      <div style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 20, height: 20,
        borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
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
      className="flex items-center gap-3 px-4 py-3 select-none"
      style={{ cursor: interactive ? 'pointer' : 'default', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { if (interactive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={(e) => { if (interactive) e.currentTarget.style.background = 'transparent' }}>
      <IconBox>{icon}</IconBox>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] leading-tight"
          style={{ color: danger ? 'var(--color-error)' : 'var(--color-text-primary)' }}>{label}</p>
        {subtitle && <p className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && <Badge label={badge} />}
        {value && <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>{value}</span>}
        {toggle ? (
          <Toggle checked={!!toggleOn} onChange={(v) => onToggle?.(v)} />
        ) : !noChevron ? (
          <span style={{ color: 'var(--color-text-muted)' }}><IcChevron /></span>
        ) : null}
      </div>
    </div>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings-group rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
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

function AppearancePage({ onBack }: { onBack: () => void }) {
  const { themeId, setTheme } = useThemeStore()
  const handleSelect = (id: string) => { setTheme(id); applyTheme(getActiveTheme(id)) }
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <SubPageHeader title="Appearance" onBack={onBack} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: 'var(--color-text-muted)' }}>Preset themes</p>
          <div className="rounded-2xl overflow-hidden p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map((t) => {
                const isActive = themeId === t.id
                return (
                  <button key={t.id} onClick={() => handleSelect(t.id)}
                    className="relative rounded-xl p-3 text-left transition-all"
                    style={{ background: 'var(--color-surface-hover)', border: isActive ? '2px solid var(--color-accent)' : '2px solid var(--color-border)' }}>
                    <div className="flex gap-px rounded-md overflow-hidden mb-2.5 h-[18px]">
                      {t.swatches.map((c, si) => <div key={si} className="flex-1" style={{ background: c }} />)}
                    </div>
                    <p className="text-[12px] font-semibold" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{t.label}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{t.desc}</p>
                    {isActive && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--color-accent)' }}>
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

function MemoryPage({ onBack }: { onBack: () => void }) {
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
      <SubPageHeader title="Memory" onBack={onBack} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
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

function ConnectorsPage({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<{ connected: boolean; scope?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    getOAuthStatus().then(setStatus).catch(() => setStatus({ connected: false })).finally(() => setLoading(false))
  }, [])

  const handleConnect = () => {
    window.location.href = '/api/oauth/google/start'
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    await disconnectOAuth().catch(console.error)
    setStatus({ connected: false })
    setDisconnecting(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <SubPageHeader title="Connectors" onBack={onBack} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Connect external accounts so Lumen can read your files and emails using their free APIs — not your Claude credits.
          </p>

          {/* Google card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-surface-hover)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Google</p>
                <p className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
                  {loading ? 'Checking…' : status?.connected ? 'Connected — Drive, Gmail, Calendar' : 'Drive, Gmail, Calendar'}
                </p>
              </div>
              {!loading && (
                status?.connected ? (
                  <button onClick={handleDisconnect} disabled={disconnecting}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                    style={{ color: 'var(--color-error)', background: `color-mix(in srgb, var(--color-error) 10%, transparent)`, opacity: disconnecting ? 0.6 : 1 }}>
                    {disconnecting ? 'Removing…' : 'Disconnect'}
                  </button>
                ) : (
                  <button onClick={handleConnect}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}>
                    Connect
                  </button>
                )
              )}
            </div>
            {status?.connected && (
              <div className="px-4 pb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#34A853' }} />
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Active — Lumen can read your Google data</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)' }}>
            More connectors (GitHub, Notion, Slack) coming soon
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main settings view ───────────────────────────────────────────────────────

type SubPage = 'appearance' | 'memory' | 'connectors'

interface SettingsViewProps { onClose: () => void }

export function SettingsView({ onClose }: SettingsViewProps) {
  const [subPage, setSubPage] = useState<SubPage | null>(null)
  const [haptic, setHaptic] = useState(true)
  const [streaming, setStreaming] = useState(true)
  const [tokenCount, setTokenCount] = useState(false)
  const { themeId } = useThemeStore()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const activeTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  const handleLogout = async () => { await logout(); clearAuth(); onClose() }

  if (subPage === 'appearance') return (
    <div className="fixed inset-0 z-50" style={{ background: 'var(--color-background)' }}>
      <AppearancePage onBack={() => setSubPage(null)} />
    </div>
  )
  if (subPage === 'memory') return (
    <div className="fixed inset-0 z-50" style={{ background: 'var(--color-background)' }}>
      <MemoryPage onBack={() => setSubPage(null)} />
    </div>
  )
  if (subPage === 'connectors') return (
    <div className="fixed inset-0 z-50" style={{ background: 'var(--color-background)' }}>
      <ConnectorsPage onBack={() => setSubPage(null)} />
    </div>
  )

  const IcMemory = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
    </svg>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <div className="flex items-center gap-3 px-4 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
        <h1 className="flex-1 text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
          <div className="rounded-2xl px-4 py-3 text-[13px]"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {user?.email ?? 'dejavuyonko@gmail.com'}
          </div>

          <Group>
            <Row icon={<IcProfile />} label="Profile" onClick={() => {}} />
            <Row icon={<IcBilling />} label="Billing" badge="Self-hosted" onClick={() => {}} />
            <Row icon={<IcUsage />} label="Usage" onClick={() => {}} />
          </Group>

          <Group>
            <Row icon={<IcCapabilities />} label="Capabilities" onClick={() => {}} />
            <Row icon={<IcConnectors />} label="Connectors" onClick={() => setSubPage('connectors')} />
            <Row icon={<IcPermissions />} label="Permissions" onClick={() => {}} />
          </Group>

          <Group>
            <Row icon={<IcMemory />} label="Memory" subtitle="Context injected into every chat" onClick={() => setSubPage('memory')} />
            <Row icon={<IcAppearance />} label="Appearance" subtitle={activeTheme.label} onClick={() => setSubPage('appearance')} />
            <Row icon={<IcSpeech />} label="Speech language" value="EN" onClick={() => {}} />
            <Row icon={<IcNotifications />} label="Notifications" onClick={() => {}} />
            <Row icon={<IcPrivacy />} label="Privacy" onClick={() => {}} />
            <Row icon={<IcShare />} label="Shared links" onClick={() => {}} />
          </Group>

          <Group>
            <Row icon={<IcHaptic />} label="Haptic feedback" toggle toggleOn={haptic} onToggle={setHaptic} noChevron />
            <Row icon={<IcStreaming />} label="Streaming responses" toggle toggleOn={streaming} onToggle={setStreaming} noChevron />
            <Row icon={<IcTokenCount />} label="Show token count" toggle toggleOn={tokenCount} onToggle={setTokenCount} noChevron />
          </Group>

          <Group>
            <Row icon={<IcSignOut />} label="Sign out" danger noChevron onClick={handleLogout} />
          </Group>

          <div className="text-center py-4">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Lumen v0.2 &middot; Powered by Claude API</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>lumen.myspiritdomain.net</p>
          </div>
        </div>
      </div>
    </div>
  )
}
