import React, { useState } from 'react'
import { useThemeStore, THEMES, getActiveTheme, applyTheme } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { logout } from '../lib/api'
import {
  IcProfile, IcBilling, IcUsage,
  IcCapabilities, IcConnectors, IcPermissions,
  IcAppearance, IcSpeech, IcNotifications, IcPrivacy, IcShare,
  IcHaptic, IcStreaming, IcTokenCount, IcSignOut,
  IcBack, IcChevron, IcCheck,
} from './SettingsIcons'

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-lg"
      style={{ width: 30, height: 30, background: 'var(--color-surface-hover)' }}
    >
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0"
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: checked ? 'var(--color-accent)' : 'var(--color-border)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.2s',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
      style={{
        background: 'var(--color-surface-hover)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      {label}
    </span>
  )
}

interface RowProps {
  icon: React.ReactNode
  label: string
  subtitle?: string
  badge?: string
  value?: string
  toggle?: boolean
  toggleOn?: boolean
  onToggle?: (v: boolean) => void
  onClick?: () => void
  noChevron?: boolean
  danger?: boolean
}

function Row({ icon, label, subtitle, badge, value, toggle, toggleOn, onToggle, onClick, noChevron, danger }: RowProps) {
  const interactive = !!onClick || !!onToggle
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.() }}
      className="flex items-center gap-3 px-4 py-3 select-none"
      style={{ cursor: interactive ? 'pointer' : 'default', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { if (interactive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={(e) => { if (interactive) e.currentTarget.style.background = 'transparent' }}
    >
      <IconBox>{icon}</IconBox>
      <div className="flex-1 min-w-0">
        <p
          className="text-[13.5px] leading-tight"
          style={{ color: danger ? 'var(--color-error)' : 'var(--color-text-primary)' }}
        >
          {label}
        </p>
        {subtitle && (
          <p className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && <Badge label={badge} />}
        {value && (
          <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>
            {value}
          </span>
        )}
        {toggle ? (
          <Toggle checked={!!toggleOn} onChange={(v) => onToggle?.(v)} />
        ) : !noChevron ? (
          <span style={{ color: 'var(--color-text-muted)' }}>
            <IcChevron />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="settings-group rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {children}
    </div>
  )
}

function AppearancePage({ onBack }: { onBack: () => void }) {
  const { themeId, setTheme } = useThemeStore()
  const handleSelect = (id: string) => {
    setTheme(id)
    applyTheme(getActiveTheme(id))
  }
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3.5 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <IcBack />
        </button>
        <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Appearance
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5">
          <p
            className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-3"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Preset themes
          </p>
          <div
            className="rounded-2xl overflow-hidden p-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map((t) => {
                const isActive = themeId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelect(t.id)}
                    className="relative rounded-xl p-3 text-left transition-all"
                    style={{
                      background: 'var(--color-surface-hover)',
                      border: isActive ? '2px solid var(--color-accent)' : '2px solid var(--color-border)',
                    }}
                  >
                    <div className="flex gap-px rounded-md overflow-hidden mb-2.5 h-[18px]">
                      {t.swatches.map((c, si) => (
                        <div key={si} className="flex-1" style={{ background: c }} />
                      ))}
                    </div>
                    <p
                      className="text-[12px] font-semibold"
                      style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                    >
                      {t.label}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {t.desc}
                    </p>
                    {isActive && (
                      <div
                        className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--color-accent)' }}
                      >
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

interface SettingsViewProps {
  onClose: () => void
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const [subPage, setSubPage] = useState<null | 'appearance'>(null)
  const [haptic, setHaptic] = useState(true)
  const [streaming, setStreaming] = useState(true)
  const [tokenCount, setTokenCount] = useState(false)
  const { themeId } = useThemeStore()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const activeTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  const handleLogout = async () => {
    await logout()
    clearAuth()
    onClose()
  }

  if (subPage === 'appearance') {
    return (
      <div className="fixed inset-0 z-50" style={{ background: 'var(--color-background)' }}>
        <AppearancePage onBack={() => setSubPage(null)} />
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: 'var(--color-background)' }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <line x1="1" y1="1" x2="13" y2="13"/>
            <line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
        <h1
          className="flex-1 text-[15px] font-semibold tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Settings
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
          <div
            className="rounded-2xl px-4 py-3 text-[13px]"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {user?.email ?? 'dejavuyonko@gmail.com'}
          </div>
          <Group>
            <Row icon={<IcProfile />} label="Profile" onClick={() => {}} />
            <Row icon={<IcBilling />} label="Billing" badge="Self-hosted" onClick={() => {}} />
            <Row icon={<IcUsage />} label="Usage" onClick={() => {}} />
          </Group>
          <Group>
            <Row icon={<IcCapabilities />} label="Capabilities" onClick={() => {}} />
            <Row icon={<IcConnectors />} label="Connectors" onClick={() => {}} />
            <Row icon={<IcPermissions />} label="Permissions" onClick={() => {}} />
          </Group>
          <Group>
            <Row
              icon={<IcAppearance />}
              label="Appearance"
              subtitle={activeTheme.label}
              onClick={() => setSubPage('appearance')}
            />
            <Row icon={<IcSpeech />} label="Speech language" value="EN" onClick={() => {}} />
            <Row icon={<IcNotifications />} label="Notifications" onClick={() => {}} />
            <Row icon={<IcPrivacy />} label="Privacy" onClick={() => {}} />
            <Row icon={<IcShare />} label="Shared links" onClick={() => {}} />
          </Group>
          <Group>
            <Row
              icon={<IcHaptic />}
              label="Haptic feedback"
              toggle
              toggleOn={haptic}
              onToggle={setHaptic}
              noChevron
            />
            <Row
              icon={<IcStreaming />}
              label="Streaming responses"
              toggle
              toggleOn={streaming}
              onToggle={setStreaming}
              noChevron
            />
            <Row
              icon={<IcTokenCount />}
              label="Show token count"
              toggle
              toggleOn={tokenCount}
              onToggle={setTokenCount}
              noChevron
            />
          </Group>
          <Group>
            <Row icon={<IcSignOut />} label="Sign out" danger noChevron onClick={handleLogout} />
          </Group>
          <div className="text-center py-4">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Lumen v0.2 &middot; Powered by Claude API
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              lumen.myspiritdomain.net
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
