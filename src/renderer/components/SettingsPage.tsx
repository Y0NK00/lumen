// src/renderer/components/SettingsPage.tsx
// Full-page Settings — two-column layout (left nav + content), opened as an
// overlay from Layout.

import { useState, useEffect, useMemo } from 'react'
import {
  useSettingsStore,
  type FontSize, type Density, type Theme,
  type ColorMode, type ChatFont, type BgAnim,
} from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'

// ─── Nav sections ─────────────────────────────────────────────────────────────

type SettingsSection =
  | 'profile' | 'general' | 'models' | 'appearance' | 'privacy' | 'usage'
  | 'connectors' | 'memory' | 'capabilities' | 'skills'
  | 'workspace' | 'keybindings' | 'about'

interface SettingsPageProps { onClose: () => void }

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-text-primary mb-1">{children}</h2>
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest border-b border-border pb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${on ? 'bg-accent' : 'bg-surface-active'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function ToggleRow({ label, desc, on, onChange }: { label: string; desc?: string; on: boolean; onChange: (v: boolean) => void }) {
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

function PillGroup<T extends string>({
  value,
  options,
  onChange,
  cols = 3,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  cols?: 2 | 3 | 4
}) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3'
  return (
    <div className={`grid ${colClass} gap-2`}>
      {options.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
            value === id
              ? 'bg-accent/15 border-accent/30 text-accent'
              : 'bg-surface border-border text-text-muted hover:text-text-primary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Section: Profile ─────────────────────────────────────────────────────────

const WORK_OPTIONS = [
  { value: '', label: 'Select your function' },
  { value: 'security', label: 'Security / Cybersecurity' },
  { value: 'software', label: 'Software Engineering' },
  { value: 'data', label: 'Data Science / AI / ML' },
  { value: 'product', label: 'Product / Design' },
  { value: 'devops', label: 'DevOps / Infrastructure' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
]

function ProfileSection() {
  const {
    profileName, setProfileName,
    profileCallName, setProfileCallName,
    profileWork, setProfileWork,
    profileAbout, setProfileAbout,
    profilePreferences, setProfilePreferences,
  } = useSettingsStore()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Profile</SectionTitle>
        <p className="text-sm text-text-muted">
          Tell Lumen about yourself so responses feel personal and relevant.
        </p>
      </div>

      <SubSection title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Will Medina"
              className={inputClass}
            />
          </Field>
          <Field label="What should Claude call you?">
            <input
              type="text"
              value={profileCallName}
              onChange={(e) => setProfileCallName(e.target.value)}
              placeholder="Will"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="What best describes your work?">
          <select
            value={profileWork}
            onChange={(e) => setProfileWork(e.target.value)}
            className={inputClass}
          >
            {WORK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </SubSection>

      <SubSection title="Preferences">
        <Field
          label="What personal preferences should Claude consider in responses?"
          hint="Applied to every conversation. Within Anthropic's guidelines."
        >
          <textarea
            rows={7}
            value={profilePreferences}
            onChange={(e) => setProfilePreferences(e.target.value)}
            placeholder={`Be direct and concise. Don't pad responses.\nUse bullet points for lists.\nDefault to code examples when possible.\nIf I'm wrong, tell me directly.\nAlways explain the why, not just the what.`}
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </Field>
      </SubSection>

      <SubSection title="About Me">
        <Field
          label="Background context"
          hint="Claude uses this to give more relevant, personalized responses."
        >
          <textarea
            rows={5}
            value={profileAbout}
            onChange={(e) => setProfileAbout(e.target.value)}
            placeholder="I'm a security analyst and developer focused on cybersecurity and AI tools..."
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </Field>
      </SubSection>
    </div>
  )
}

// ─── Section: General ────────────────────────────────────────────────────────

function GeneralSection() {
  const {
    colorMode, setColorMode,
    backgroundAnimation, setBackgroundAnimation,
    chatFont, setChatFont,
    notifyResponseComplete, setNotifyResponseComplete,
    notifyDispatch, setNotifyDispatch,
  } = useSettingsStore()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>General</SectionTitle>
        <p className="text-sm text-text-muted">Notifications, interface, and accessibility preferences.</p>
      </div>

      <SubSection title="Notifications">
        <div className="flex flex-col divide-y divide-border/60">
          <div className="py-3">
            <ToggleRow
              label="Response completions"
              desc="Notify when Claude finishes a long-running response"
              on={notifyResponseComplete}
              onChange={setNotifyResponseComplete}
            />
          </div>
          <div className="py-3">
            <ToggleRow
              label="Dispatch messages"
              desc="Push notification when a scheduled task completes"
              on={notifyDispatch}
              onChange={setNotifyDispatch}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">Notifications require system permissions to be enabled.</p>
      </SubSection>

      <SubSection title="Color mode">
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

      <SubSection title="Background animation">
        <PillGroup
          value={backgroundAnimation}
          onChange={setBackgroundAnimation}
          cols={3}
          options={[
            { id: 'enabled'  as BgAnim, label: 'Enabled'  },
            { id: 'auto'     as BgAnim, label: 'Auto'     },
            { id: 'disabled' as BgAnim, label: 'Disabled' },
          ]}
        />
        <p className="text-xs text-text-muted">Auto respects system "reduce motion" settings.</p>
      </SubSection>

      <SubSection title="Chat font">
        <PillGroup
          value={chatFont}
          onChange={setChatFont}
          cols={2}
          options={[
            { id: 'default'  as ChatFont, label: 'Default' },
            { id: 'sans'     as ChatFont, label: 'Sans'    },
            { id: 'system'   as ChatFont, label: 'System'  },
            { id: 'dyslexia' as ChatFont, label: 'Dyslexia-friendly' },
          ]}
        />
      </SubSection>

      <SubSection title="Voice settings">
        <div className="grid grid-cols-3 gap-2">
          {['Battery', 'Airy', 'Mellow', 'Glassy', 'Rounded'].map((v) => (
            <button
              key={v}
              disabled
              className="py-2.5 rounded-xl border border-border bg-surface text-sm text-text-muted opacity-50 cursor-not-allowed"
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">Voice output is coming in a future update.</p>
      </SubSection>
    </div>
  )
}

// ─── Section: Models ──────────────────────────────────────────────────────────

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-5',    label: 'Claude Opus 4.5',    tier: 'Most capable'  },
  { value: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5',  tier: 'Balanced'      },
  { value: 'claude-haiku-4-5',   label: 'Claude Haiku 4.5',   tier: 'Fastest'       },
  { value: 'claude-opus-4-7',    label: 'Claude Opus 4.7',    tier: 'Latest / Best' },
  { value: 'claude-sonnet-4-6',  label: 'Claude Sonnet 4.6',  tier: 'Latest'        },
]

const OLLAMA_MODELS = [
  { value: 'qwen2.5:14b',    label: 'Qwen 2.5 14B'   },
  { value: 'qwen2.5:7b',     label: 'Qwen 2.5 7B'    },
  { value: 'llama3.2:3b',    label: 'Llama 3.2 3B'   },
  { value: 'mistral:7b',     label: 'Mistral 7B'     },
  { value: 'deepseek-r1:7b', label: 'DeepSeek R1 7B' },
]

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
        <PillGroup
          value={defaultProvider}
          onChange={setDefaultProvider}
          cols={2}
          options={[
            { id: 'ollama' as 'ollama' | 'claude', label: '🏠 Ollama (local)' },
            { id: 'claude' as 'ollama' | 'claude', label: '🤖 Claude (cloud)' },
          ]}
        />
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
              {defaultClaudeModel === m.value && <span className="text-xs text-accent font-medium">default</span>}
            </button>
          ))}
        </div>
      </SubSection>

      <SubSection title="Ollama (Local)">
        <Field label="Server URL">
          <div className="flex gap-2">
            <input type="text" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="http://10.0.0.22:11434" className={`${inputClass} flex-1`} />
            <button onClick={() => setOllamaBaseUrl(urlDraft.trim())} className="px-3 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors">Save</button>
          </div>
        </Field>
        <div className="flex flex-col gap-2">
          {OLLAMA_MODELS.map((m) => (
            <button key={m.value} onClick={() => setDefaultOllamaModel(m.value)} className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${defaultOllamaModel === m.value ? 'bg-accent/10 border-accent/30 text-text-primary' : 'bg-surface border-border text-text-secondary hover:text-text-primary'}`}>
              <span className="text-sm font-medium">{m.label}</span>
              {defaultOllamaModel === m.value && <span className="text-xs text-accent font-medium">default</span>}
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
    fontSize, setFontSize, density, setDensity, theme, setTheme,
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
        <PillGroup
          value={theme}
          onChange={setTheme}
          cols={3}
          options={[
            { id: 'lumen-dark' as Theme, label: 'Lumen Dark' },
            { id: 'midnight'   as Theme, label: 'Midnight'   },
            { id: 'slate'      as Theme, label: 'Slate'      },
          ]}
        />
      </SubSection>

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

      <SubSection title="Interface">
        <div className="flex flex-col divide-y divide-border/60">
          {[
            { label: 'Show thinking blocks', desc: 'Expand Claude extended thinking in responses', on: showThinkingBlocks, onChange: setShowThinkingBlocks },
            { label: 'Animate messages', desc: 'Slide-in animation on new messages', on: animateMessages, onChange: setAnimateMessages },
            { label: 'Show streaming cursor', desc: 'Blinking cursor while generating', on: showStreamingCursor, onChange: setShowStreamingCursor },
            { label: 'Compact tool call cards', desc: 'Collapse tool results by default', on: compactToolCards, onChange: setCompactToolCards },
          ].map(({ label, desc, on, onChange }) => (
            <div key={label} className="py-3">
              <ToggleRow label={label} desc={desc} on={on} onChange={onChange} />
            </div>
          ))}
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Privacy ─────────────────────────────────────────────────────────

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
          <p><span className="font-semibold text-text-primary">Your conversations are stored locally.</span>{' '}No conversation data is sent to Anthropic beyond what's needed to call the API.</p>
          <p>API calls go directly from your machine to Anthropic's API. Lumen does not proxy or store your messages on any server.</p>
        </div>
      </SubSection>

      <SubSection title="Telemetry">
        <div className="flex flex-col divide-y divide-border/60">
          <div className="py-3"><ToggleRow label="Usage analytics" desc="Send anonymous feature usage stats to help improve Lumen" on={analyticsOn} onChange={setAnalyticsOn} /></div>
          <div className="py-3"><ToggleRow label="Crash reports" desc="Automatically send crash logs when Lumen crashes" on={crashOn} onChange={setCrashOn} /></div>
        </div>
        <p className="text-xs text-text-muted">Telemetry is not yet active.</p>
      </SubSection>
    </div>
  )
}

// ─── Section: Usage ───────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function UsageSection() {
  const {
    tokenInputMonth, tokenOutputMonth, tokenBudgetMonth,
    setTokenBudgetMonth, tokenMonthKey,
  } = useSettingsStore()
  const conversations = useChatStore((s) => s.conversations)
  const [budgetDraft, setBudgetDraft] = useState(String(tokenBudgetMonth))

  const stats = useMemo(() => {
    const allMsgs = Object.values(conversations).flatMap((c) => c.messages)
    const convCount = Object.keys(conversations).length
    const now = Date.now()
    const dayMs = 86_400_000
    const days: { label: string; count: number }[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * dayMs)
      return { label: DAY_LABELS[d.getDay()], count: 0 }
    })
    for (const msg of allMsgs) {
      const daysAgo = Math.floor((now - msg.timestamp) / dayMs)
      if (daysAgo >= 0 && daysAgo < 7) days[6 - daysAgo].count++
    }
    const maxDay = Math.max(...days.map((d) => d.count), 1)
    const weekTotal = days.reduce((a, d) => a + d.count, 0)
    return { convCount, totalMsgs: allMsgs.length, days, maxDay, weekTotal }
  }, [conversations])

  const totalTokens = tokenInputMonth + tokenOutputMonth
  const budgetPct = tokenBudgetMonth > 0 ? Math.min((totalTokens / tokenBudgetMonth) * 100, 100) : 0
  const barColor = budgetPct > 90 ? '#f87171' : budgetPct > 70 ? '#fb923c' : '#8b5cf6'
  const estCost = ((tokenInputMonth * 3 + tokenOutputMonth * 15) / 1_000_000).toFixed(2)
  const monthLabel = tokenMonthKey ? new Date(tokenMonthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Usage</SectionTitle>
        <p className="text-sm text-text-muted">Token usage, estimated cost, and conversation activity.</p>
      </div>

      {/* Token usage bar */}
      <SubSection title={`Token Usage — ${monthLabel}`}>
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-text-muted">Tokens used this month</span>
            <span className="text-text-primary font-mono tabular-nums font-medium">
              {totalTokens.toLocaleString()} / {tokenBudgetMonth.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 bg-surface-active rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${budgetPct}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted">
            <span>{budgetPct.toFixed(1)}% of monthly budget used</span>
            <span>Est. cost: ~${estCost}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="px-4 py-3 bg-surface border border-border rounded-xl">
            <p className="text-xl font-bold text-text-primary tabular-nums">{tokenInputMonth.toLocaleString()}</p>
            <p className="text-xs text-text-muted mt-0.5">Input tokens</p>
          </div>
          <div className="px-4 py-3 bg-surface border border-border rounded-xl">
            <p className="text-xl font-bold text-text-primary tabular-nums">{tokenOutputMonth.toLocaleString()}</p>
            <p className="text-xs text-text-muted mt-0.5">Output tokens</p>
          </div>
        </div>

        <div className="p-3 bg-surface border border-border rounded-xl text-[12px] text-text-muted space-y-1 leading-snug">
          <p>Token counts are <strong className="text-text-secondary">estimated</strong> from message character length (~4 chars/token). Resets on the 1st of each month.</p>
          <p>Sonnet 4.5 pricing: <strong className="text-text-secondary">$3/M input · $15/M output</strong></p>
        </div>
      </SubSection>

      {/* Monthly budget */}
      <SubSection title="Monthly Budget">
        <Field label="Token budget" hint="Set a soft cap for tracking. Lumen won't stop you — it's just for your awareness.">
          <div className="flex gap-2">
            <input
              type="number"
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              step={100000}
              min={0}
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={() => setTokenBudgetMonth(Math.max(0, Number(budgetDraft)))}
              className="px-3 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors whitespace-nowrap"
            >
              Save
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {[500_000, 1_000_000, 5_000_000].map((n) => (
            <button
              key={n}
              onClick={() => { setTokenBudgetMonth(n); setBudgetDraft(String(n)) }}
              className={`py-2 rounded-lg border text-xs font-medium transition-colors ${tokenBudgetMonth === n ? 'bg-accent/15 border-accent/30 text-accent' : 'bg-surface border-border text-text-muted hover:text-text-primary'}`}
            >
              {n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`}
            </button>
          ))}
        </div>
      </SubSection>

      {/* Weekly activity */}
      <SubSection title="Activity This Week">
        <div className="flex items-end gap-1.5 px-1" style={{ height: '60px' }}>
          {stats.days.map((day, i) => {
            const pct = stats.maxDay > 0 ? (day.count / stats.maxDay) * 100 : 0
            return (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div className="w-full flex flex-col justify-end" style={{ height: '44px' }}>
                  <div
                    className="w-full rounded-t-sm bg-accent/35 transition-all duration-300"
                    style={{ height: `${Math.max(pct, day.count > 0 ? 10 : 2)}%` }}
                    title={`${day.count} messages`}
                  />
                </div>
                <span className="text-[9px] text-text-muted">{day.label}</span>
              </div>
            )
          })}
        </div>
        <p className="text-[11.5px] text-text-muted">{stats.weekTotal} messages this week · {stats.convCount} total conversations</p>
      </SubSection>

      {/* Data management */}
      <SubSection title="Data Management">
        <div className="flex flex-col gap-2">
          <button className="w-full py-2.5 px-4 rounded-xl border border-border bg-surface text-sm text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors text-left">
            Export all conversations (JSON)
          </button>
          <button className="w-full py-2.5 px-4 rounded-xl border border-error/30 bg-error/5 text-sm text-error hover:bg-error/10 transition-colors text-left">
            Clear all conversations…
          </button>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Connectors ──────────────────────────────────────────────────────

interface ConnectorDef {
  id: string
  name: string
  desc: string
  icon: React.ReactNode
  available: boolean
}

function ConnectorIcon({ label, color }: { label: string; color: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-bold" style={{ backgroundColor: color }}>
      {label}
    </div>
  )
}

const CONNECTORS: ConnectorDef[] = [
  { id: 'browser', name: 'Lumen Browser',    desc: 'Control Chrome for browsing, scraping, and interaction',  icon: <ConnectorIcon label="LB" color="#2563eb" />, available: true   },
  { id: 'google',  name: 'Google Drive',     desc: 'Read and write Docs, Sheets, and Drive files',           icon: <ConnectorIcon label="G"  color="#ea4335" />, available: false  },
  { id: 'slack',   name: 'Slack',            desc: 'Send messages and read channels in your workspace',       icon: <ConnectorIcon label="S"  color="#4a154b" />, available: false  },
  { id: 'github',  name: 'GitHub',           desc: 'Create issues, open PRs, and browse repositories',        icon: <ConnectorIcon label="GH" color="#24292f" />, available: false  },
  { id: 'notion',  name: 'Notion',           desc: 'Read and write pages and databases in your workspace',    icon: <ConnectorIcon label="N"  color="#1a1a1a" />, available: false  },
]

function ConnectorsSection() {
  const [browserConnected, setBrowserConnected] = useState(false)

  useEffect(() => {
    const check = async () => {
      try { setBrowserConnected((await window.tower?.getBrowserStatus?.())?.connected ?? false) } catch { setBrowserConnected(false) }
    }
    check()
    const offOn  = window.tower?.onBrowserConnected?.(() => setBrowserConnected(true))
    const offOff = window.tower?.onBrowserDisconnected?.(() => setBrowserConnected(false))
    return () => { offOn?.(); offOff?.() }
  }, [])

  const isConnected = (id: string) => id === 'browser' && browserConnected

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionTitle>Connectors</SectionTitle>
        <p className="text-sm text-text-muted">Connect Lumen to external services so agents can act on your behalf.</p>
      </div>

      <div className="flex flex-col gap-px bg-border rounded-xl overflow-hidden">
        {CONNECTORS.map((c, i) => {
          const connected = isConnected(c.id)
          return (
            <div
              key={c.id}
              className={`flex items-center gap-4 px-4 py-3.5 bg-surface transition-colors ${i === 0 ? '' : ''}`}
            >
              {c.icon}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-text-primary">{c.name}</p>
                  {connected && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-400/15 text-green-400">
                      Connected
                    </span>
                  )}
                  {!c.available && !connected && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-active text-text-muted">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">{c.desc}</p>
                {c.id === 'browser' && !connected && (
                  <p className="text-[11.5px] text-text-muted mt-1">
                    Install the Lumen extension in Chrome, then open it and click Connect.
                  </p>
                )}
              </div>
              {c.available && (
                <button
                  className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    connected
                      ? 'border-border text-text-muted hover:text-error hover:border-error/40'
                      : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'
                  }`}
                >
                  {connected ? 'Disconnect' : 'Connect'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-text-muted hover:text-text-primary hover:border-text-muted transition-colors">
        <span className="text-lg leading-none">+</span>
        <span>Add connector</span>
      </button>
    </div>
  )
}

// ─── Section: Memory ─────────────────────────────────────────────────────────

function MemorySection() {
  const { memorySearchRef, setMemorySearchRef, memoryGenerate, setMemoryGenerate } = useSettingsStore()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Memory</SectionTitle>
        <p className="text-sm text-text-muted">Control how Lumen stores and uses context from your conversations.</p>
      </div>

      <SubSection title="Memory Settings">
        <div className="flex flex-col divide-y divide-border/60">
          <div className="py-3">
            <ToggleRow label="Search & reference memory" desc="Lumen can reference saved context to personalize responses" on={memorySearchRef} onChange={setMemorySearchRef} />
          </div>
          <div className="py-3">
            <ToggleRow label="Generate memories from history" desc="Automatically save key facts and preferences from conversations" on={memoryGenerate} onChange={setMemoryGenerate} />
          </div>
        </div>
        <p className="text-xs text-text-muted">Memory is stored locally and never sent to Anthropic.</p>
      </SubSection>

      <SubSection title="Saved Memories">
        <div className="flex flex-col items-center justify-center h-20 gap-2 border border-dashed border-border rounded-xl">
          <p className="text-sm text-text-muted">No memories saved yet</p>
          <p className="text-xs text-text-muted">Enable "Generate memories" above to start building context</p>
        </div>
      </SubSection>
    </div>
  )
}

// ─── Section: Capabilities ────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high'

interface CapDef {
  group: string
  key: keyof Pick<ReturnType<typeof useSettingsStore.getState>,
        'memorySearchRef' | 'memoryGenerate' |
        'capFileRead' | 'capFileWrite' | 'capShellExec' | 'capBrowser' | 'capWebSearch' |
        'capArtifacts' | 'capAiArtifacts' | 'capInlineViz' | 'capCodeExec'>
  setter: keyof Pick<ReturnType<typeof useSettingsStore.getState>,
          'setMemorySearchRef' | 'setMemoryGenerate' |
          'setCapFileRead' | 'setCapFileWrite' | 'setCapShellExec' | 'setCapBrowser' | 'setCapWebSearch' |
          'setCapArtifacts' | 'setCapAiArtifacts' | 'setCapInlineViz' | 'setCapCodeExec'>
  label: string
  desc: string
  risk: RiskLevel
}

const CAPABILITY_DEFS: CapDef[] = [
  // Memory
  { group: 'Memory',       key: 'memorySearchRef', setter: 'setMemorySearchRef', label: 'Search & reference memory',         desc: 'Claude reads saved context when generating responses',       risk: 'low'    },
  { group: 'Memory',       key: 'memoryGenerate',  setter: 'setMemoryGenerate',  label: 'Generate memory from history',       desc: 'Claude saves key facts from conversations automatically',    risk: 'low'    },
  // Tools
  { group: 'Tool Access',  key: 'capFileRead',     setter: 'setCapFileRead',     label: 'Read files',                         desc: 'Claude can read files from your filesystem',                 risk: 'low'    },
  { group: 'Tool Access',  key: 'capFileWrite',    setter: 'setCapFileWrite',    label: 'Write files',                        desc: 'Claude can create and modify files on disk',                 risk: 'medium' },
  { group: 'Tool Access',  key: 'capShellExec',    setter: 'setCapShellExec',    label: 'Run shell commands',                  desc: 'Claude can execute terminal commands on your machine',       risk: 'high'   },
  { group: 'Tool Access',  key: 'capBrowser',      setter: 'setCapBrowser',      label: 'Browser control',                    desc: 'Claude can navigate and interact with Chrome',               risk: 'medium' },
  { group: 'Tool Access',  key: 'capWebSearch',    setter: 'setCapWebSearch',    label: 'Web search',                         desc: 'Claude can search the web for up-to-date information',      risk: 'low'    },
  // Visuals
  { group: 'Visuals',      key: 'capArtifacts',    setter: 'setCapArtifacts',    label: 'Artifacts',                          desc: 'Claude can create interactive HTML/React previews',          risk: 'low'    },
  { group: 'Visuals',      key: 'capAiArtifacts',  setter: 'setCapAiArtifacts',  label: 'AI-powered artifacts',               desc: 'Artifacts with AI features and dynamic data fetching',       risk: 'medium' },
  { group: 'Visuals',      key: 'capInlineViz',    setter: 'setCapInlineViz',    label: 'Inline visualization',               desc: 'Render charts and diagrams inline in chat',                  risk: 'low'    },
  // Code
  { group: 'Code',         key: 'capCodeExec',     setter: 'setCapCodeExec',     label: 'Code execution & file creation',     desc: 'Claude can run code and output files to your system',       risk: 'high'   },
]

const RISK_STYLE: Record<RiskLevel, string> = {
  low:    'text-green-400/80 bg-green-400/10',
  medium: 'text-amber-400/80 bg-amber-400/10',
  high:   'text-error/80 bg-error/10',
}

function CapabilitiesSection() {
  const store = useSettingsStore()
  const groups = [...new Set(CAPABILITY_DEFS.map((c) => c.group))]

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Capabilities</SectionTitle>
        <p className="text-sm text-text-muted">Control what Lumen agents are allowed to do.</p>
      </div>

      {groups.map((group) => (
        <SubSection key={group} title={group}>
          <div className="flex flex-col divide-y divide-border/60">
            {CAPABILITY_DEFS.filter((c) => c.group === group).map((cap) => (
              <div key={cap.key} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[13px] text-text-primary">{cap.label}</p>
                    <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${RISK_STYLE[cap.risk]}`}>
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
        </SubSection>
      ))}

      <div className="flex gap-2.5 p-3.5 bg-amber-400/5 border border-amber-400/15 rounded-xl">
        <span className="text-amber-400 text-sm shrink-0 mt-0.5">⚠</span>
        <p className="text-[12px] text-amber-400/80 leading-snug">
          High-risk permissions allow Claude to run commands or code on your machine. Only enable these in conversations you trust.
        </p>
      </div>
    </div>
  )
}

// ─── Section: Skills ──────────────────────────────────────────────────────────

function SkillsSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Skills & Triggers</SectionTitle>
        <p className="text-sm text-text-muted">Install skills that extend what Lumen can do, and set triggers to activate them automatically.</p>
      </div>

      <SubSection title="Installed Skills">
        <div className="flex flex-col items-center justify-center h-28 gap-2 border border-dashed border-border rounded-xl">
          <p className="text-sm text-text-muted">No skills installed</p>
          <p className="text-xs text-text-muted">Skills let Claude do specialized tasks — analyze files, run reports, send emails, and more</p>
        </div>
      </SubSection>

      <SubSection title="Triggers">
        <div className="flex flex-col items-center justify-center h-20 gap-2 border border-dashed border-border rounded-xl">
          <p className="text-sm text-text-muted">No triggers configured</p>
          <p className="text-xs text-text-muted">Triggers fire skills automatically based on conditions (e.g. time, keywords, events)</p>
        </div>
      </SubSection>

      <button className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-text-muted hover:text-text-primary hover:border-text-muted transition-colors">
        <span className="text-lg leading-none">+</span>
        <span>Browse skill marketplace</span>
      </button>
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
        <Field label="Global system prompt" hint="Prepended to every conversation. Leave blank for default.">
          <textarea rows={4} placeholder="e.g. You are a helpful assistant. Always respond concisely..." className={`${inputClass} resize-none leading-relaxed`} />
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

function KeybindingsSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Keyboard Shortcuts</SectionTitle>
        <p className="text-sm text-text-muted">Global shortcuts available anywhere in Lumen.</p>
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {KEYBINDINGS.map(({ action, keys }) => (
          <div key={action} className="flex items-center justify-between py-3">
            <span className="text-sm text-text-secondary">{action}</span>
            <div className="flex items-center gap-1">
              {keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded-md bg-surface border border-border text-[11px] font-mono text-text-secondary shadow-sm">{k}</kbd>
                  {i < keys.length - 1 && <span className="text-[10px] text-text-muted">+</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section: Account ─────────────────────────────────────────────────────────

function AccountSection() {
  const { claudeApiKey, setClaudeApiKey, profileName, profileCallName } = useSettingsStore()
  const [draft, setDraft] = useState(claudeApiKey)
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = () => { setClaudeApiKey(draft.trim()); setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const isValid = !draft || (draft.startsWith('sk-ant-') && draft.length > 20)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Account</SectionTitle>
        <p className="text-sm text-text-muted">Manage your API credentials.</p>
      </div>

      <SubSection title="Profile">
        <div className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl">
          <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <span className="text-lg font-semibold text-accent">
              {(profileCallName || profileName || 'W').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{profileName || 'Will Medina'}</p>
            <p className="text-xs text-text-muted">
              {profileCallName ? `Goes by: ${profileCallName}` : 'Set your name in Profile'}
            </p>
          </div>
        </div>
      </SubSection>

      <SubSection title="Anthropic API Key">
        <Field label="API Key" hint={!claudeApiKey ? 'Get your key at console.anthropic.com → API Keys' : 'Key is set. Update below.'}>
          <div className="flex gap-2">
            <input type={show ? 'text' : 'password'} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-ant-api03-..." className={`${inputClass} flex-1`} />
            <button onClick={() => setShow((v) => !v)} className="px-3 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors">
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {draft && !isValid && <p className="text-[11.5px] text-amber-400 mt-1">Key format looks off — should start with sk-ant-</p>}
        </Field>
        <button onClick={save} className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${saved ? 'bg-green-600 text-white' : 'bg-accent text-white hover:bg-accent-hover active:scale-95'}`}>
          {saved ? '✓ Saved' : 'Save API Key'}
        </button>
      </SubSection>
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
          {[['Version', '2.0.0-dev'], ['Electron', 'Latest'], ['React', '18.x'], ['Claude SDK', '4.x']].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-text-muted">{k}</span>
              <span className="text-text-primary font-mono">{v}</span>
            </div>
          ))}
        </div>
      </SubSection>
      <SubSection title="Links">
        <div className="flex flex-col gap-2">
          {[['Anthropic Console', 'https://console.anthropic.com'], ['Claude API Docs', 'https://docs.anthropic.com']].map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors">
              <span>{label}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3.5 1H1.5a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V6.5M6 1H9m0 0v3M9 1L5 5" /></svg>
            </a>
          ))}
        </div>
      </SubSection>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV: { id: SettingsSection; label: string; icon: string; group: string }[] = [
  { id: 'profile',      label: 'Profile',       icon: '👤', group: 'User'  },
  { id: 'general',      label: 'General',        icon: '⚙️',  group: 'User'  },
  { id: 'models',       label: 'Models',         icon: '🤖', group: 'User'  },
  { id: 'appearance',   label: 'Appearance',     icon: '🎨', group: 'User'  },
  { id: 'privacy',      label: 'Privacy',        icon: '🔒', group: 'User'  },
  { id: 'usage',        label: 'Usage',          icon: '📊', group: 'User'  },
  { id: 'connectors',   label: 'Connectors',     icon: '🔗', group: 'Lumen' },
  { id: 'memory',       label: 'Memory',         icon: '🧠', group: 'Lumen' },
  { id: 'capabilities', label: 'Capabilities',   icon: '🛠️', group: 'Lumen' },
  { id: 'skills',       label: 'Skills',         icon: '⚡', group: 'Lumen' },
  { id: 'workspace',    label: 'Workspace',      icon: '🗂️',  group: 'Lumen' },
  { id: 'keybindings',  label: 'Keybindings',    icon: '⌨️',  group: 'Lumen' },
  { id: 'about',        label: 'About',          icon: 'ℹ️',  group: 'Lumen' },
]

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>('profile')

  const content: Record<SettingsSection, React.ReactNode> = {
    profile:      <ProfileSection />,
    general:      <GeneralSection />,
    models:       <ModelsSection />,
    appearance:   <AppearanceSection />,
    privacy:      <PrivacySection />,
    usage:        <UsageSection />,
    connectors:   <ConnectorsSection />,
    memory:       <MemorySection />,
    capabilities: <CapabilitiesSection />,
    skills:       <SkillsSection />,
    workspace:    <WorkspaceSection />,
    keybindings:  <KeybindingsSection />,
    about:        <AboutSection />,
  }

  const groups = ['User', 'Lumen']

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left nav */}
      <nav className="w-[210px] shrink-0 border-r border-border bg-sidebar flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Close settings"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold text-text-primary">Settings</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <p className="px-4 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-widest">{group}</p>
              <div className="px-2 space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => (
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
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-2xl mx-auto px-10 py-10">
          {content[section]}
        </div>
      </div>
    </div>
  )
}
