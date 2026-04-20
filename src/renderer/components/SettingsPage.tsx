// src/renderer/components/SettingsPage.tsx
// Full-page Settings — two-column layout (left nav + content), opened as an
// overlay from Layout. Replaces the old sidebar-embedded SettingsPanel.

import { useState, useEffect, useMemo } from 'react'
import { useSettingsStore, type FontSize, type Density, type Theme } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'

// ─── Known models ─────────────────────────────────────────────────────────────

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-5',    label: 'Claude Opus 4.5',    tier: 'Most capable' },
  { value: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5',  tier: 'Balanced'     },
  { value: 'claude-haiku-4-5',   label: 'Claude Haiku 4.5',   tier: 'Fastest'      },
]

const OLLAMA_MODELS = [
  { value: 'qwen2.5:14b',    label: 'Qwen 2.5 14B'   },
  { value: 'qwen2.5:7b',     label: 'Qwen 2.5 7B'    },
  { value: 'llama3.2:3b',    label: 'Llama 3.2 3B'   },
  { value: 'mistral:7b',     label: 'Mistral 7B'     },
  { value: 'deepseek-r1:7b', label: 'DeepSeek R1 7B' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsSection =
  | 'account'
  | 'models'
  | 'appearance'
  | 'privacy'
  | 'usage'
  | 'connectors'
  | 'memory'
  | 'capabilities'
  | 'workspace'
  | 'integrations'
  | 'keybindings'
  | 'about'

interface SettingsPageProps {
  onClose: () => void
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-text-primary mb-1">{children}</h2>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest
                     border-b border-border pb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      {children}
      {hint && <p className="text-[11.5px] text-text-muted leading-snug">{hint}</p>}
    </div>
  )
}

const inputClass =
  'bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary ' +
  'placeholder:text-text-muted focus:outline-none focus:border-accent/60 ' +
  'focus:ring-1 focus:ring-accent/20 transition-colors'

function Toggle({
  on,
  onChange,
}: {
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${
        on ? 'bg-accent' : 'bg-surface-active'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ToggleRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string
  desc?: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-text-primary">{label}</p>
        {desc && <p className="text-[11.5px] text-text-muted">{desc}</p>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  )
}

// ─── Section: Account ─────────────────────────────────────────────────────────

function AccountSection() {
  const { claudeApiKey, setClaudeApiKey } = useSettingsStore()
  const [draft, setDraft] = useState(claudeApiKey)
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = () => {
    setClaudeApiKey(draft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isValid = !draft || (draft.startsWith('sk-ant-') && draft.length > 20)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Account</SectionTitle>
        <p className="text-sm text-text-muted">Manage your API credentials and profile.</p>
      </div>

      <SubSection title="Profile">
        <div className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl">
          <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30
                          flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-accent">W</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Will Medina</p>
            <p className="text-xs text-text-muted">william.a.medina@gmail.com</p>
          </div>
        </div>
      </SubSection>

      <SubSection title="Anthropic API Key">
        <Field
          label="API Key"
          hint={
            !claudeApiKey
              ? 'Get your key at console.anthropic.com → API Keys'
              : claudeApiKey
              ? 'Key is set. Update it below.'
              : undefined
          }
        >
          <div className="flex gap-2">
            <input
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-ant-api03-..."
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={() => setShow((v) => !v)}
              className="px-3 bg-surface border border-border rounded-lg text-xs
                         text-text-muted hover:text-text-primary transition-colors whitespace-nowrap"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {draft && !isValid && (
            <p className="text-[11.5px] text-amber-400 mt-1">
              Key format looks off — should start with sk-ant-
            </p>
          )}
          {claudeApiKey && draft !== claudeApiKey && (
            <p className="text-[11.5px] text-amber-400 mt-1">Unsaved changes</p>
          )}
        </Field>
        <button
          onClick={save}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-accent text-white hover:bg-accent-hover active:scale-95'
          }`}
        >
          {saved ? '✓ Saved' : 'Save API Key'}
        </button>
      </SubSection>

      <SubSection title="Danger Zone">
        <button
          className="px-4 py-2.5 rounded-xl border border-error/30 bg-error/5 text-sm
                     text-error hover:bg-error/10 transition-colors"
        >
          Log out
        </button>
      </SubSection>
    </div>
  )
}

// ─── Section: Models ──────────────────────────────────────────────────────────

function ModelsSection() {
  const {
    defaultProvider, setDefaultProvider,
    defaultClaudeModel, setDefaultClaudeModel,
    defaultOllamaModel, setDefaultOllamaModel,
    ollamaBaseUrl, setOllamaBaseUrl,
  } = useSettingsStore()
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Models</SectionTitle>
        <p className="text-sm text-text-muted">Configure which models Lumen uses for new conversations.</p>
      </div>

      <SubSection title="Default Provider">
        <div className="flex gap-2">
          {(['ollama', 'claude'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setDefaultProvider(p)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                defaultProvider === p
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {p === 'ollama' ? '🏠 Ollama (local)' : '🤖 Claude (cloud)'}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">Used when creating a new conversation.</p>
      </SubSection>

      <SubSection title="Claude Models">
        <div className="flex flex-col gap-2">
          {CLAUDE_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setDefaultClaudeModel(m.value)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                defaultClaudeModel === m.value
                  ? 'bg-accent/10 border-accent/30 text-text-primary'
                  : 'bg-surface border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-text-muted">{m.tier}</p>
              </div>
              {defaultClaudeModel === m.value && (
                <span className="text-xs text-accent font-medium">default</span>
              )}
            </button>
          ))}
        </div>
      </SubSection>

      <SubSection title="Ollama (Local)">
        <Field label="Server URL">
          <div className="flex gap-2">
            <input
              type="text"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="http://10.0.0.22:11434"
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={() => setOllamaBaseUrl(urlDraft.trim())}
              className="px-3 bg-surface border border-border rounded-lg text-xs
                         text-text-muted hover:text-text-primary transition-colors"
            >
              Save
            </button>
          </div>
        </Field>
        <div className="flex flex-col gap-2">
          {OLLAMA_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setDefaultOllamaModel(m.value)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                defaultOllamaModel === m.value
                  ? 'bg-accent/10 border-accent/30 text-text-primary'
                  : 'bg-surface border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="text-sm font-medium">{m.label}</span>
              {defaultOllamaModel === m.value && (
                <span className="text-xs text-accent font-medium">default</span>
              )}
            </button>
          ))}
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Appearance ──────────────────────────────────────────────────────

function AppearanceSection() {
  const {
    fontSize, setFontSize,
    density, setDensity,
    theme, setTheme,
    showThinkingBlocks, setShowThinkingBlocks,
    animateMessages,    setAnimateMessages,
    showStreamingCursor, setShowStreamingCursor,
    compactToolCards,   setCompactToolCards,
  } = useSettingsStore()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Appearance</SectionTitle>
        <p className="text-sm text-text-muted">Customize how Lumen looks and feels.</p>
      </div>

      <SubSection title="Theme">
        <div className="flex gap-2">
          {[
            { id: 'lumen-dark' as Theme, label: 'Lumen Dark', dot: '#6c6ff5' },
            { id: 'midnight'   as Theme, label: 'Midnight',   dot: '#5b5b8f' },
            { id: 'slate'      as Theme, label: 'Slate',      dot: '#64748b' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex-1 flex items-center gap-2 justify-center py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                theme === t.id
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.dot }} />
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">Midnight and Slate themes coming soon.</p>
      </SubSection>

      <SubSection title="Font Size">
        <div className="flex gap-2">
          {[
            { id: 'xs'   as FontSize, label: 'Small'   },
            { id: 'sm'   as FontSize, label: 'Default' },
            { id: 'base' as FontSize, label: 'Large'   },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFontSize(id)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                fontSize === id
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Changes the root font size — scales the entire interface.
        </p>
      </SubSection>

      <SubSection title="Message Density">
        <div className="flex gap-2">
          {(['compact', 'comfortable', 'spacious'] as Density[]).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium capitalize transition-colors ${
                density === d
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">Controls message list padding. Saved — wires up to chat in next update.</p>
      </SubSection>

      <SubSection title="Interface">
        <div className="flex flex-col divide-y divide-border/60">
          <div className="py-3">
            <ToggleRow
              label="Show thinking blocks"
              desc="Expand Claude extended thinking in responses"
              on={showThinkingBlocks}
              onChange={setShowThinkingBlocks}
            />
          </div>
          <div className="py-3">
            <ToggleRow
              label="Animate messages"
              desc="Slide-in animation on new messages"
              on={animateMessages}
              onChange={setAnimateMessages}
            />
          </div>
          <div className="py-3">
            <ToggleRow
              label="Show streaming cursor"
              desc="Blinking cursor while generating"
              on={showStreamingCursor}
              onChange={setShowStreamingCursor}
            />
          </div>
          <div className="py-3">
            <ToggleRow
              label="Compact tool call cards"
              desc="Collapse tool results by default"
              on={compactToolCards}
              onChange={setCompactToolCards}
            />
          </div>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Privacy & Safety ────────────────────────────────────────────────

function PrivacySection() {
  const [analyticsOn, setAnalyticsOn] = useState(false)
  const [crashOn, setCrashOn] = useState(true)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Privacy & Safety</SectionTitle>
        <p className="text-sm text-text-muted">Control how your data is handled.</p>
      </div>

      <SubSection title="Data Handling">
        <div className="flex flex-col gap-3 p-4 bg-surface border border-border rounded-xl text-sm text-text-secondary leading-relaxed">
          <p>
            <span className="font-semibold text-text-primary">Your conversations are stored locally.</span>{' '}
            No conversation data is sent to Anthropic beyond what's needed to call the API.
          </p>
          <p>
            API calls go directly from your machine to Anthropic's API endpoint.
            Lumen does not proxy or store your messages on any server.
          </p>
        </div>
      </SubSection>

      <SubSection title="Telemetry">
        <div className="flex flex-col divide-y divide-border/60">
          <div className="py-3">
            <ToggleRow
              label="Usage analytics"
              desc="Send anonymous feature usage stats to help improve Lumen"
              on={analyticsOn}
              onChange={setAnalyticsOn}
            />
          </div>
          <div className="py-3">
            <ToggleRow
              label="Crash reports"
              desc="Automatically send crash logs when Lumen crashes"
              on={crashOn}
              onChange={setCrashOn}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Telemetry features are not yet active. This section is a placeholder for upcoming opt-in analytics.
        </p>
      </SubSection>
    </div>
  )
}

// ─── Section: Usage ───────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function UsageSection() {
  const conversations = useChatStore((s) => s.conversations)

  const stats = useMemo(() => {
    const allMsgs = Object.values(conversations).flatMap((c) => c.messages)
    const convCount = Object.keys(conversations).length
    const msgCount = allMsgs.length

    // Weekly bars: last 7 calendar days, count messages per day
    const now = Date.now()
    const dayMs = 86_400_000
    const days: { label: string; count: number }[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * dayMs)
      return { label: DAY_LABELS[d.getDay()], count: 0 }
    })
    for (const msg of allMsgs) {
      const daysAgo = Math.floor((now - msg.timestamp) / dayMs)
      if (daysAgo >= 0 && daysAgo < 7) {
        days[6 - daysAgo].count++
      }
    }
    const maxDay = Math.max(...days.map((d) => d.count), 1)

    // Session messages: this session only (approximated as messages in last hour)
    const sessionMsgs = allMsgs.filter((m) => now - m.timestamp < 3_600_000).length

    return { convCount, msgCount, days, maxDay, sessionMsgs }
  }, [conversations])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Usage</SectionTitle>
        <p className="text-sm text-text-muted">Message activity and data management for your conversations.</p>
      </div>

      <SubSection title="Activity This Week">
        {/* Weekly bar chart */}
        <div className="flex items-end gap-1.5 h-20 px-1">
          {stats.days.map((day, i) => {
            const pct = stats.maxDay > 0 ? (day.count / stats.maxDay) * 100 : 0
            return (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div className="w-full flex flex-col justify-end" style={{ height: '56px' }}>
                  <div
                    className="w-full rounded-t-sm bg-accent/40 transition-all duration-300"
                    style={{ height: `${Math.max(pct, day.count > 0 ? 8 : 2)}%` }}
                    title={`${day.count} message${day.count !== 1 ? 's' : ''}`}
                  />
                </div>
                <span className="text-[9px] text-text-muted leading-none">{day.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
          <span>{stats.days.reduce((a, d) => a + d.count, 0)} messages this week</span>
          <span>{stats.sessionMsgs} this session</span>
        </div>
      </SubSection>

      <SubSection title="All-Time Stats">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Conversations', value: stats.convCount },
            { label: 'Total messages', value: stats.msgCount },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col gap-1 px-4 py-3 bg-surface border border-border rounded-xl"
            >
              <p className="text-2xl font-bold text-text-primary tabular-nums">{value}</p>
              <p className="text-xs text-text-muted">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          All data is stored locally. Nothing is sent to any server beyond the API call itself.
        </p>
      </SubSection>

      <SubSection title="Data Management">
        <div className="flex flex-col gap-2">
          <button
            className="w-full py-2.5 px-4 rounded-xl border border-border bg-surface text-sm
                       text-text-secondary hover:text-text-primary hover:border-text-muted
                       transition-colors text-left"
          >
            Export all conversations (JSON)
          </button>
          <button
            className="w-full py-2.5 px-4 rounded-xl border border-error/30 bg-error/5
                       text-sm text-error hover:bg-error/10 transition-colors text-left"
          >
            Clear all conversations…
          </button>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Connectors ──────────────────────────────────────────────────────

interface Connector {
  id: string
  name: string
  desc: string
  icon: string
  status: 'connected' | 'disconnected' | 'coming_soon'
  detail?: string
}

const DEFAULT_CONNECTORS: Connector[] = [
  {
    id: 'browser',
    name: 'Lumen Browser Extension',
    desc: 'Control Chrome for web browsing, scraping, and form-filling tasks',
    icon: '🌐',
    status: 'disconnected',
    detail: 'Install the extension from the Chrome Web Store, then open it and click Connect.',
  },
  {
    id: 'google',
    name: 'Google Drive & Docs',
    desc: 'Read and write Google Docs, Sheets, and Drive files',
    icon: '📁',
    status: 'coming_soon',
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Send messages, read channels, and interact with your workspace',
    icon: '💬',
    status: 'coming_soon',
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Create issues, open PRs, read code, and review repos',
    icon: '🐙',
    status: 'coming_soon',
  },
  {
    id: 'notion',
    name: 'Notion',
    desc: 'Read and write pages, databases, and blocks in your workspace',
    icon: '📒',
    status: 'coming_soon',
  },
]

function ConnectorsSection() {
  const [connectors, setConnectors] = useState<Connector[]>(DEFAULT_CONNECTORS)
  const [browserConnected, setBrowserConnected] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const status = await window.tower?.getBrowserStatus?.()
        setBrowserConnected(status?.connected ?? false)
      } catch { setBrowserConnected(false) }
    }
    check()
    const offOn  = window.tower?.onBrowserConnected?.(() => setBrowserConnected(true))
    const offOff = window.tower?.onBrowserDisconnected?.(() => setBrowserConnected(false))
    return () => { offOn?.(); offOff?.() }
  }, [])

  const resolvedConnectors = connectors.map((c) =>
    c.id === 'browser' ? { ...c, status: (browserConnected ? 'connected' : 'disconnected') as Connector['status'] } : c
  )

  const statusBadge = (status: Connector['status']) => {
    if (status === 'connected')
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-400/15 text-green-400">Connected</span>
    if (status === 'coming_soon')
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-text-muted/10 text-text-muted">Coming soon</span>
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-text-muted/10 text-text-muted">Not connected</span>
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Connectors</SectionTitle>
        <p className="text-sm text-text-muted">
          Connect Lumen to external services so agents can act on your behalf.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {resolvedConnectors.map((c) => (
          <div
            key={c.id}
            className="flex gap-4 p-4 bg-surface border border-border rounded-xl"
          >
            <span className="text-xl shrink-0 mt-0.5">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[13px] font-semibold text-text-primary">{c.name}</p>
                {statusBadge(c.status)}
              </div>
              <p className="text-xs text-text-muted mb-2">{c.desc}</p>
              {c.detail && c.status !== 'coming_soon' && (
                <p className="text-[11.5px] text-text-secondary mb-2">{c.detail}</p>
              )}
              {c.status === 'disconnected' && c.id === 'browser' && (
                <a
                  href="chrome://extensions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  Open Chrome Extensions →
                </a>
              )}
              {c.status === 'connected' && c.id === 'browser' && (
                <p className="text-xs text-green-400">Claude can navigate, read, and interact with Chrome.</p>
              )}
            </div>
            {c.status !== 'coming_soon' && (
              <div className="shrink-0 self-start">
                {c.status === 'disconnected' ? (
                  <button
                    onClick={() => c.id === 'google' && window.tower?.connectGoogle?.()}
                    className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-xs
                               text-accent hover:bg-accent/20 transition-colors"
                  >
                    Connect
                  </button>
                ) : (
                  <button
                    className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs
                               text-text-muted hover:text-error hover:border-error/30 transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add connector */}
      <div className="flex flex-col items-center justify-center h-20 gap-2
                      border border-dashed border-border rounded-xl cursor-default">
        <p className="text-sm text-text-muted">+ Add connector</p>
        <p className="text-xs text-text-muted">Custom connector marketplace coming soon</p>
      </div>
    </div>
  )
}

// ─── Section: Memory ─────────────────────────────────────────────────────────

function MemorySection() {
  const {
    memorySearchRef, setMemorySearchRef,
    memoryGenerate,  setMemoryGenerate,
  } = useSettingsStore()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Memory</SectionTitle>
        <p className="text-sm text-text-muted">
          Control how Lumen stores and uses context from your conversations.
        </p>
      </div>

      <SubSection title="Memory Settings">
        <div className="flex flex-col divide-y divide-border/60">
          <div className="py-3">
            <ToggleRow
              label="Search & reference memory"
              desc="Lumen can search saved notes and past context to personalize responses"
              on={memorySearchRef}
              onChange={setMemorySearchRef}
            />
          </div>
          <div className="py-3">
            <ToggleRow
              label="Generate new memories"
              desc="Lumen automatically saves key facts and preferences from conversations"
              on={memoryGenerate}
              onChange={setMemoryGenerate}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Memory is stored locally and never sent to Anthropic. These controls take effect in future conversations.
        </p>
      </SubSection>

      <SubSection title="Saved Memories">
        <div className="flex flex-col items-center justify-center h-24 gap-2
                        border border-dashed border-border rounded-xl">
          <p className="text-sm text-text-muted">No memories saved yet</p>
          <p className="text-xs text-text-muted">Enable "Generate new memories" above to start building context</p>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Capabilities ────────────────────────────────────────────────────

interface CapabilityRow {
  key: keyof Pick<ReturnType<typeof useSettingsStore.getState>,
        'capFileRead' | 'capFileWrite' | 'capShellExec' | 'capBrowser' | 'capWebSearch'>
  setter: keyof Pick<ReturnType<typeof useSettingsStore.getState>,
          'setCapFileRead' | 'setCapFileWrite' | 'setCapShellExec' | 'setCapBrowser' | 'setCapWebSearch'>
  label: string
  desc: string
  risk: 'low' | 'medium' | 'high'
}

const CAPABILITY_ROWS: CapabilityRow[] = [
  { key: 'capFileRead',  setter: 'setCapFileRead',  label: 'Read files',        desc: 'Claude can read files from your filesystem', risk: 'low'    },
  { key: 'capFileWrite', setter: 'setCapFileWrite', label: 'Write files',       desc: 'Claude can create and modify files',          risk: 'medium' },
  { key: 'capShellExec', setter: 'setCapShellExec', label: 'Run shell commands',desc: 'Claude can execute terminal commands',        risk: 'high'   },
  { key: 'capBrowser',   setter: 'setCapBrowser',   label: 'Browser control',   desc: 'Claude can navigate and interact with Chrome', risk: 'medium' },
  { key: 'capWebSearch', setter: 'setCapWebSearch', label: 'Web search',        desc: 'Claude can search the web for information',   risk: 'low'    },
]

const RISK_BADGE: Record<'low' | 'medium' | 'high', string> = {
  low:    'text-green-400/80 bg-green-400/10',
  medium: 'text-amber-400/80 bg-amber-400/10',
  high:   'text-error/80 bg-error/10',
}

function CapabilitiesSection() {
  const store = useSettingsStore()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Capabilities</SectionTitle>
        <p className="text-sm text-text-muted">
          Control which tools Lumen agents are allowed to use.
        </p>
      </div>

      <SubSection title="Tool Permissions">
        <div className="flex flex-col divide-y divide-border/60">
          {CAPABILITY_ROWS.map((cap) => (
            <div key={cap.key} className="flex items-center justify-between py-3 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[13px] text-text-primary">{cap.label}</p>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${RISK_BADGE[cap.risk]}`}>
                    {cap.risk}
                  </span>
                </div>
                <p className="text-[11.5px] text-text-muted">{cap.desc}</p>
              </div>
              <Toggle
                on={store[cap.key] as boolean}
                onChange={(v) => (store[cap.setter] as (v: boolean) => void)(v)}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl">
          <span className="text-amber-400 text-sm shrink-0">⚠</span>
          <p className="text-[11.5px] text-amber-400/80 leading-snug">
            High-risk permissions allow Claude to run commands on your machine.
            Only enable these if you trust the conversation's context.
          </p>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Workspace ───────────────────────────────────────────────────────

function WorkspaceSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Workspace</SectionTitle>
        <p className="text-sm text-text-muted">Configure how Lumen's agents operate.</p>
      </div>

      <SubSection title="System Prompt">
        <Field
          label="Global system prompt"
          hint="Prepended to every conversation. Leave blank for the default."
        >
          <textarea
            rows={4}
            placeholder="e.g. You are a helpful assistant. Always respond concisely..."
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </Field>
      </SubSection>

      <SubSection title="Tool Limits">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max tool calls / turn" hint="Safety limit per agent turn.">
            <input type="number" defaultValue={25} min={1} max={100} className={inputClass} />
          </Field>
          <Field label="Command timeout (s)" hint="Max runtime for shell commands.">
            <input type="number" defaultValue={30} min={5} max={300} className={inputClass} />
          </Field>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Integrations ────────────────────────────────────────────────────

function IntegrationsSection() {
  const [browserConnected, setBrowserConnected] = useState(false)
  const [googleConnected] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const status = await window.tower?.getBrowserStatus?.()
        setBrowserConnected(status?.connected ?? false)
      } catch { setBrowserConnected(false) }
    }
    check()
    window.tower?.onBrowserConnected?.(() => setBrowserConnected(true))
    window.tower?.onBrowserDisconnected?.(() => setBrowserConnected(false))
  }, [])

  const integrations = [
    {
      id: 'browser',
      name: 'Lumen Browser Extension',
      desc: 'Control Chrome for web browsing tasks',
      icon: '🌐',
      connected: browserConnected,
      detail: browserConnected
        ? 'Connected — Claude can navigate, read, and interact with Chrome.'
        : 'Not connected. Install the Lumen Browser Extension from Chrome, then open it and click Connect.',
      action: browserConnected ? null : (
        <a
          href="chrome://extensions"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline"
        >
          Open Chrome Extensions →
        </a>
      ),
    },
    {
      id: 'google',
      name: 'Google Calendar',
      desc: 'Read and create calendar events',
      icon: '📅',
      connected: googleConnected,
      detail: googleConnected ? 'Connected.' : 'Not connected.',
      action: !googleConnected ? (
        <button
          onClick={() => window.tower?.connectGoogle?.()}
          className="text-xs text-accent hover:underline"
        >
          Connect Google →
        </button>
      ) : null,
    },
    {
      id: 'slack',
      name: 'Slack',
      desc: 'Send messages and read channels',
      icon: '💬',
      connected: false,
      detail: 'Coming soon.',
      action: null,
    },
    {
      id: 'github',
      name: 'GitHub',
      desc: 'Create issues, PRs, and browse repos',
      icon: '🐙',
      connected: false,
      detail: 'Coming soon.',
      action: null,
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Integrations</SectionTitle>
        <p className="text-sm text-text-muted">
          Connect external tools so Lumen's agents can act on your behalf.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {integrations.map((integ) => (
          <div
            key={integ.id}
            className="flex gap-4 p-4 bg-surface border border-border rounded-xl"
          >
            <span className="text-2xl shrink-0 mt-0.5">{integ.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-text-primary">{integ.name}</p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    integ.connected
                      ? 'bg-green-400/15 text-green-400'
                      : 'bg-text-muted/10 text-text-muted'
                  }`}
                >
                  {integ.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <p className="text-xs text-text-muted mb-2">{integ.desc}</p>
              <p className="text-[11.5px] text-text-secondary">{integ.detail}</p>
              {integ.action && <div className="mt-2">{integ.action}</div>}
            </div>
          </div>
        ))}
      </div>

      <SubSection title="Get More Apps & Extensions">
        <div className="flex flex-col items-center justify-center h-24 gap-2
                        border border-dashed border-border rounded-xl">
          <p className="text-sm text-text-muted">Plugin marketplace coming soon</p>
          <p className="text-xs text-text-muted">Browse and install Lumen extensions</p>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Keybindings ─────────────────────────────────────────────────────

const KEYBINDINGS = [
  { action: 'New conversation',   keys: ['Ctrl', 'N']      },
  { action: 'Send message',       keys: ['Enter']          },
  { action: 'New line in input',  keys: ['Shift', 'Enter'] },
  { action: 'Stop generation',    keys: ['Escape']         },
  { action: 'Focus search',       keys: ['Ctrl', 'K']      },
  { action: 'Toggle sidebar',     keys: ['Ctrl', 'B']      },
  { action: 'Open settings',      keys: ['Ctrl', ',']      },
  { action: 'Switch to Chat',     keys: ['Ctrl', '1']      },
  { action: 'Switch to Helm',     keys: ['Ctrl', '2']      },
  { action: 'Switch to Code',     keys: ['Ctrl', '3']      },
]

function Key({ label }: { label: string }) {
  return (
    <kbd className="px-2 py-0.5 rounded-md bg-surface border border-border
                    text-[11px] font-mono text-text-secondary shadow-sm">
      {label}
    </kbd>
  )
}

function KeybindingsSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Keyboard Shortcuts</SectionTitle>
        <p className="text-sm text-text-muted">Global shortcuts available anywhere in Lumen.</p>
      </div>

      <div className="flex flex-col divide-y divide-border/60">
        {KEYBINDINGS.map(({ action, keys }) => (
          <div
            key={action}
            className="flex items-center justify-between py-3"
          >
            <span className="text-sm text-text-secondary">{action}</span>
            <div className="flex items-center gap-1">
              {keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Key label={k} />
                  {i < keys.length - 1 && (
                    <span className="text-[10px] text-text-muted">+</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted">Custom keybindings coming in a future update.</p>
    </div>
  )
}

// ─── Section: About ───────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>About Lumen</SectionTitle>
        <p className="text-sm text-text-muted">Version info and credits.</p>
      </div>

      <SubSection title="Version">
        <div className="flex flex-col gap-3 p-4 bg-surface border border-border rounded-xl text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Version</span>
            <span className="text-text-primary font-mono">1.0.0-dev</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Electron</span>
            <span className="text-text-primary font-mono">Latest</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">React</span>
            <span className="text-text-primary font-mono">18.x</span>
          </div>
        </div>
      </SubSection>

      <SubSection title="Links">
        <div className="flex flex-col gap-2">
          {[
            { label: 'Anthropic Console', url: 'https://console.anthropic.com' },
            { label: 'Claude API Docs', url: 'https://docs.anthropic.com' },
          ].map(({ label, url }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-4 py-2.5 bg-surface border
                         border-border rounded-xl text-sm text-text-secondary
                         hover:text-text-primary hover:border-text-muted transition-colors"
            >
              <span>{label}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
                   strokeWidth="1.4" strokeLinecap="round">
                <path d="M3.5 1H1.5a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V6.5M6 1H9m0 0v3M9 1L5 5" />
              </svg>
            </a>
          ))}
        </div>
      </SubSection>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_SECTIONS: {
  id: SettingsSection
  label: string
  icon: string
  group?: string
}[] = [
  { id: 'account',      label: 'Account',       icon: '👤', group: 'User' },
  { id: 'models',       label: 'Models',         icon: '🤖', group: 'User' },
  { id: 'appearance',   label: 'Appearance',     icon: '🎨', group: 'User' },
  { id: 'privacy',      label: 'Privacy',        icon: '🔒', group: 'User' },
  { id: 'usage',        label: 'Usage',          icon: '📊', group: 'User' },
  { id: 'connectors',   label: 'Connectors',     icon: '🔗', group: 'Lumen' },
  { id: 'memory',       label: 'Memory',         icon: '🧠', group: 'Lumen' },
  { id: 'capabilities', label: 'Capabilities',   icon: '🛠️', group: 'Lumen' },
  { id: 'workspace',    label: 'Workspace',      icon: '🗂️',  group: 'Lumen' },
  { id: 'integrations', label: 'Integrations',   icon: '🔌', group: 'Lumen' },
  { id: 'keybindings',  label: 'Keybindings',    icon: '⌨️',  group: 'Lumen' },
  { id: 'about',        label: 'About',          icon: 'ℹ️',  group: 'Lumen' },
]

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>('account')

  const content: Record<SettingsSection, React.ReactNode> = {
    account:      <AccountSection />,
    models:       <ModelsSection />,
    appearance:   <AppearanceSection />,
    privacy:      <PrivacySection />,
    usage:        <UsageSection />,
    connectors:   <ConnectorsSection />,
    memory:       <MemorySection />,
    capabilities: <CapabilitiesSection />,
    workspace:    <WorkspaceSection />,
    integrations: <IntegrationsSection />,
    keybindings:  <KeybindingsSection />,
    about:        <AboutSection />,
  }

  // Group nav items
  const groups = ['User', 'Lumen']

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left nav */}
      <nav className="w-[210px] shrink-0 border-r border-border bg-sidebar flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-text-muted
                       hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Close settings"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
                 strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold text-text-primary">Settings</h1>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-3">
          {groups.map((group) => {
            const items = NAV_SECTIONS.filter((s) => s.group === group)
            return (
              <div key={group} className="mb-3">
                <p className="px-4 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-widest">
                  {group}
                </p>
                <div className="px-2 space-y-0.5">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSection(item.id)}
                      className={[
                        'relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all',
                        section === item.id
                          ? 'bg-surface border border-border text-text-primary'
                          : 'text-text-secondary hover:bg-surface hover:text-text-primary border border-transparent',
                      ].join(' ')}
                    >
                      {section === item.id && (
                        <div className="absolute left-0 top-2 bottom-2 w-[2px] bg-accent rounded-full" />
                      )}
                      <span className="text-base w-5 text-center leading-none">{item.icon}</span>
                      <span className="text-[13px] font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-2xl mx-auto px-10 py-10">
          {content[section]}
        </div>
      </div>
    </div>
  )
}
