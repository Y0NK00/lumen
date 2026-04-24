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
import ThemeEngine from './ThemeEngine'
import { useMemoryStore, syncMemoriesToVault, type MemoryTag } from '../stores/memoryStore'
import { useSkillsStore, type Skill, type TriggerType } from '../stores/skillsStore'

// ─── Nav sections ─────────────────────────────────────────────────────────────

type SettingsSection =
  | 'profile' | 'general' | 'models' | 'appearance' | 'privacy' | 'usage'
  | 'connectors' | 'memory' | 'capabilities' | 'skills'
  | 'workspace' | 'keybindings' | 'about' | 'mobile'

interface SettingsPageProps { onClose: () => void }

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-text-primary mb-1">{children}</h2>
}

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
      <span className={`absolute top-[3px] left-[3px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${on ? 'translate-x-[16px]' : 'translate-x-0'}`} />
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
    claudeApiKey, setClaudeApiKey,
    defaultProvider, setDefaultProvider,
    defaultClaudeModel, setDefaultClaudeModel,
    helmClaudeModel, setHelmClaudeModel,
    defaultOllamaModel, setDefaultOllamaModel,
    ollamaBaseUrl, setOllamaBaseUrl,
  } = useSettingsStore()
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl)
  const [keyDraft, setKeyDraft] = useState(claudeApiKey)
  const [showKey, setShowKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  const saveKey = () => {
    setClaudeApiKey(keyDraft.trim())
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }
  const keyValid = !keyDraft || (keyDraft.startsWith('sk-ant-') && keyDraft.length > 20)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Models</SectionTitle>
        <p className="text-sm text-text-muted">Configure which AI provider and models Lumen uses.</p>
      </div>

      <SubSection title="Anthropic API Key">
        <Field
          label="API Key"
          hint={claudeApiKey
            ? '✓ Key is set — paste a new one to update'
            : 'Required for Claude. Get yours at console.anthropic.com → API Keys'}
        >
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              placeholder="sk-ant-api03-..."
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="px-3 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          {keyDraft && !keyValid && (
            <p className="text-[11.5px] text-amber-400 mt-1">Key format looks off — should start with sk-ant-</p>
          )}
        </Field>
        <button
          onClick={saveKey}
          disabled={!keyDraft.trim() || !keyValid}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all
            ${keySaved
              ? 'bg-green-600 text-white'
              : 'bg-accent text-white hover:bg-accent-hover active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
        >
          {keySaved ? '✓ Saved' : 'Save API Key'}
        </button>
      </SubSection>

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

      <SubSection title="Chat Model">
        <p className="text-xs text-text-muted -mt-2 mb-1">Used in Chat and Code modes.</p>
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
              {defaultClaudeModel === m.value && <span className="text-xs text-accent font-medium">active</span>}
            </button>
          ))}
        </div>
      </SubSection>

      <SubSection title="Helm Agent Model">
        <p className="text-xs text-text-muted -mt-2 mb-1">Used for Helm dispatches. Haiku has a higher rate limit (50k TPM) and costs ~20× less than Sonnet — ideal for multi-step agent tasks.</p>
        <div className="flex flex-col gap-2">
          {CLAUDE_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setHelmClaudeModel(m.value)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                helmClaudeModel === m.value
                  ? 'bg-accent/10 border-accent/30 text-text-primary'
                  : 'bg-surface border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-text-muted">{m.tier}</p>
              </div>
              {helmClaudeModel === m.value && <span className="text-xs text-accent font-medium">active</span>}
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
        <div className="flex flex-col divide-y divide-border/40 mt-1">
          {[
            { label: 'Show thinking blocks', desc: 'Expand Claude extended thinking in responses', on: showThinkingBlocks, onChange: setShowThinkingBlocks },
            { label: 'Animate messages', desc: 'Slide-in animation on new messages', on: animateMessages, onChange: setAnimateMessages },
            { label: 'Show streaming cursor', desc: 'Blinking cursor while generating', on: showStreamingCursor, onChange: setShowStreamingCursor },
            { label: 'Compact tool call cards', desc: 'Collapse tool results by default', on: compactToolCards, onChange: setCompactToolCards },
          ].map(({ label, desc, on, onChange }) => (
            <div key={label} className="py-3.5">
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
    tokenInputMonth, tokenOutputMonth,
    tokenCacheReadMonth, tokenCacheWriteMonth,
    tokenBudgetMonth, setTokenBudgetMonth, tokenMonthKey,
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
  const monthLabel = tokenMonthKey ? new Date(tokenMonthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''

  // Real cost breakdown using Sonnet 4.6 pricing (per 1M tokens)
  // Cache reads cost 10% of base input price; cache writes cost 125%
  const SONNET_IN  = 3.00;  const SONNET_OUT = 15.00
  const CACHE_READ = 0.30;  const CACHE_WRITE = 3.75
  const estCost = (
    (tokenInputMonth      * SONNET_IN   / 1_000_000) +
    (tokenOutputMonth     * SONNET_OUT  / 1_000_000) +
    (tokenCacheReadMonth  * CACHE_READ  / 1_000_000) +
    (tokenCacheWriteMonth * CACHE_WRITE / 1_000_000)
  ).toFixed(3)
  // What cost would have been without caching
  const estCostNoCaching = (
    ((tokenInputMonth + tokenCacheReadMonth) * SONNET_IN  / 1_000_000) +
    (tokenOutputMonth                        * SONNET_OUT / 1_000_000)
  ).toFixed(3)
  const cacheSavings = Math.max(0, parseFloat(estCostNoCaching) - parseFloat(estCost)).toFixed(3)
  const cacheHitPct = tokenCacheReadMonth > 0
    ? Math.round((tokenCacheReadMonth / (tokenInputMonth + tokenCacheReadMonth)) * 100)
    : 0

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
          <div className="px-4 py-3 bg-surface border border-border rounded-xl">
            <p className="text-xl font-bold text-green-400 tabular-nums">{tokenCacheReadMonth.toLocaleString()}</p>
            <p className="text-xs text-text-muted mt-0.5">Cache reads (10% price)</p>
          </div>
          <div className="px-4 py-3 bg-surface border border-border rounded-xl">
            <p className="text-xl font-bold text-text-primary tabular-nums">{tokenCacheWriteMonth.toLocaleString()}</p>
            <p className="text-xs text-text-muted mt-0.5">Cache writes</p>
          </div>
        </div>

        {/* Cache savings callout */}
        {tokenCacheReadMonth > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-green-500/5 border border-green-500/20 rounded-xl">
            <div>
              <p className="text-sm font-medium text-green-400">Cache hit rate: {cacheHitPct}%</p>
              <p className="text-xs text-text-muted mt-0.5">Prompt caching saved you ~${cacheSavings} vs no caching</p>
            </div>
            <span className="text-2xl">💰</span>
          </div>
        )}

        <div className="p-3 bg-surface border border-border rounded-xl text-[12px] text-text-muted space-y-1 leading-snug">
          <p>Token counts from real API usage data. Resets on the 1st of each month.</p>
          <p>Sonnet 4.6 pricing: <strong className="text-text-secondary">$3/M input · $15/M output · $0.30/M cache read · $3.75/M cache write</strong></p>
          <p>Est. cost this month: <strong className="text-text-secondary">${estCost}</strong>
            {parseFloat(cacheSavings) > 0 && <span className="text-green-400"> (saved ${cacheSavings} via cache)</span>}
          </p>
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

// ─── Section: Mobile Companion ───────────────────────────────────────────────

function MobileSection() {
  const {
    mobileEnabled, setMobileEnabled,
    mobileToken,   setMobileToken,
    remoteDispatchEnabled, remoteDispatchPort,
  } = useSettingsStore()

  const [localToken, setLocalToken]   = useState(mobileToken)
  const [serverIPs, setServerIPs]     = useState<string[]>([])
  const [copied, setCopied]           = useState(false)

  // Load LAN IPs from main process
  useEffect(() => {
    window.tower?.remoteDispatch?.getIPs?.().then((ips: string[]) => setServerIPs(ips ?? []))
  }, [])

  // Keep local draft in sync if store changes from elsewhere
  useEffect(() => { setLocalToken(mobileToken) }, [mobileToken])

  function handleTokenSave() {
    setMobileToken(localToken.trim())
  }

  function handleGenerate() {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    setLocalToken(token)
    setMobileToken(token)
  }

  const port = remoteDispatchEnabled ? remoteDispatchPort : 7747
  const lanUrls = serverIPs.map(ip => `http://${ip}:${port}`)

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Mobile Companion</SectionTitle>
        <p className="text-sm text-text-muted">
          Access Lumen from your phone's browser — same network, no cloud required.
        </p>
      </div>

      <SubSection title="Access">
        <ToggleRow
          label="Enable Mobile Companion"
          desc="Serve the mobile PWA at the root of the 7747 HTTP server."
          on={mobileEnabled}
          onChange={setMobileEnabled}
        />

        {!remoteDispatchEnabled && mobileEnabled && (
          <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            Remote Dispatch is currently off. Enable it in General → Remote Dispatch to start the HTTP server.
          </div>
        )}

        {mobileEnabled && lanUrls.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-text-muted">Open on your phone (same Wi-Fi network):</p>
            {lanUrls.map(url => (
              <button
                key={url}
                onClick={() => copyUrl(url)}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border hover:border-accent/40 transition-colors group"
              >
                <code className="text-[13px] text-accent font-mono">{url}</code>
                <span className="text-[11px] text-text-muted group-hover:text-text-primary transition-colors shrink-0">
                  {copied ? '✓ Copied' : 'Copy'}
                </span>
              </button>
            ))}
            <p className="text-[11px] text-text-muted">
              Add to home screen in your browser's share menu for a full-screen PWA experience.
            </p>
          </div>
        )}
      </SubSection>

      <SubSection title="Auth Token">
        <Field
          label="Token"
          hint={
            mobileToken
              ? 'Required on all API requests as the x-lumen-token header or ?token= query param. Leave blank to disable auth.'
              : 'No token set — anyone on your network can access this server. Set a token to require authentication.'
          }
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={localToken}
              onChange={e => setLocalToken(e.target.value)}
              placeholder="Leave blank to skip auth"
              className={`${inputClass} flex-1 font-mono text-[12px]`}
            />
            <button
              onClick={handleTokenSave}
              className="px-3 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors whitespace-nowrap"
            >
              Save
            </button>
          </div>
          <button
            onClick={handleGenerate}
            className="self-start text-[11.5px] text-accent hover:text-accent/80 transition-colors"
          >
            Generate new token
          </button>
        </Field>
        {!mobileToken && (
          <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            No token set. Anyone on your local network can chat with your Claude API key. Only do this on a trusted network.
          </div>
        )}
      </SubSection>

      <SubSection title="How it Works">
        <div className="flex flex-col gap-3 text-[12.5px] text-text-muted leading-relaxed">
          <p>1. Enable Mobile Companion and make sure Remote Dispatch is on (General → Remote Dispatch).</p>
          <p>2. Open the URL above on your phone's browser while on the same Wi-Fi.</p>
          <p>3. In Safari or Chrome, tap Share → Add to Home Screen for a standalone PWA.</p>
          <p>4. Set an auth token and enter it in the app's settings on first launch.</p>
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

/// ─── Section: Memory ─────────────────────────────────────────────────────────

const TAG_COLORS: Record<MemoryTag, string> = {
  fact:       'bg-blue-500/10 text-blue-400 border-blue-500/20',
  preference: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  project:    'bg-green-500/10 text-green-400 border-green-500/20',
  person:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  context:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  note:       'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

function MemorySection() {
  const { memorySearchRef, setMemorySearchRef, memoryGenerate, setMemoryGenerate, vaultPath } = useSettingsStore()
  const { items, addMemory, deleteMemory, pinMemory, clearAll } = useMemoryStore()
  const [newContent, setNewContent] = useState('')
  const [newTag, setNewTag] = useState<MemoryTag>('fact')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const allItems = Object.values(items).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })

  const handleAdd = () => {
    if (!newContent.trim()) return
    addMemory(newContent.trim(), newTag, 'manual')
    setNewContent('')
  }

  const handleSyncVault = async () => {
    if (!vaultPath) return
    setSyncing(true)
    setSyncStatus(null)
    const ok = await syncMemoriesToVault(vaultPath)
    setSyncing(false)
    setSyncStatus(ok ? '✓ Synced to vault' : '✗ Sync failed')
    setTimeout(() => setSyncStatus(null), 3000)
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Memory</SectionTitle>
        <p className="text-sm text-text-muted">Lumen remembers facts, preferences, and context across conversations.</p>
      </div>

      <SubSection title="Settings">
        <div className="flex flex-col divide-y divide-border/40 mt-1">
          <div className="py-3.5">
            <ToggleRow label="Inject memory into conversations" desc="Relevant memories are added to Claude's context automatically" on={memorySearchRef} onChange={setMemorySearchRef} />
          </div>
          <div className="py-3.5">
            <ToggleRow label="Auto-generate from conversations" desc="Extract and save key facts after each conversation ends" on={memoryGenerate} onChange={setMemoryGenerate} />
          </div>
        </div>
        <p className="text-xs text-text-muted">Memory is stored locally and never sent to Anthropic.</p>
      </SubSection>

      <SubSection title={`Saved Memories (${allItems.length})`}>
        {/* Add new memory */}
        <div className="flex flex-col gap-2 p-3.5 bg-surface rounded-xl border border-border">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a memory... e.g. 'Will works at a credit union and is learning cybersecurity'"
            rows={2}
            className={`${inputClass} resize-none leading-relaxed`}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleAdd() }}
          />
          <div className="flex items-center gap-2">
            <select
              value={newTag}
              onChange={(e) => setNewTag(e.target.value as MemoryTag)}
              className={`${inputClass} flex-1 text-[12px]`}
            >
              {(['fact', 'preference', 'project', 'person', 'context', 'note'] as MemoryTag[]).map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!newContent.trim()}
              className="px-3 py-1.5 bg-accent text-white text-[12px] font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Memory list */}
        {allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-1 border border-dashed border-border rounded-xl">
            <p className="text-sm text-text-muted">No memories yet</p>
            <p className="text-[11px] text-text-muted">Enable auto-generate or add manually above</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {allItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 p-3 bg-surface rounded-lg border border-border group">
                <button
                  onClick={() => pinMemory(item.id, !item.pinned)}
                  className={`mt-0.5 shrink-0 text-sm transition-opacity ${item.pinned ? 'opacity-100' : 'opacity-20 group-hover:opacity-60'}`}
                  title={item.pinned ? 'Unpin' : 'Pin (always inject)'}
                >📌</button>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-text-primary leading-snug">{item.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${TAG_COLORS[item.tag]}`}>{item.tag}</span>
                    <span className="text-[10px] text-text-muted">{item.source}</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteMemory(item.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-text-muted hover:text-error transition-all text-sm"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {allItems.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            {vaultPath && (
              <button
                onClick={handleSyncVault}
                disabled={syncing}
                className="text-[12px] text-accent hover:underline disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : 'Sync to Obsidian vault'}
              </button>
            )}
            {syncStatus && <span className="text-[12px] text-text-muted">{syncStatus}</span>}
            <div className="flex-1" />
            <button onClick={clearAll} className="text-[12px] text-text-muted hover:text-error transition-colors">
              Clear all
            </button>
          </div>
        )}
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

/// ─── Section: Skills ──────────────────────────────────────────────────────────

const EMPTY_SKILL: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: '', description: '', icon: '⚡', prompt: '',
  trigger: { type: 'manual', keywords: [] },
}

function SkillsSection() {
  const { skills, createSkill, updateSkill, deleteSkill, toggleSkill } = useSkillsStore()
  const [editing, setEditing]   = useState<string | null>(null)  // skill id or 'new'
  const [draft, setDraft]       = useState<typeof EMPTY_SKILL>(EMPTY_SKILL)
  const [keywordInput, setKeywordInput] = useState('')

  const allSkills = Object.values(skills).sort((a, b) => a.createdAt - b.createdAt)

  const openNew = () => {
    setDraft(EMPTY_SKILL)
    setKeywordInput('')
    setEditing('new')
  }

  const openEdit = (skill: Skill) => {
    setDraft({
      name: skill.name, description: skill.description, icon: skill.icon,
      prompt: skill.prompt, trigger: { ...skill.trigger, keywords: [...skill.trigger.keywords] },
    })
    setKeywordInput(skill.trigger.keywords.join(', '))
    setEditing(skill.id)
  }

  const handleSave = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) return
    const keywords = keywordInput.split(',').map((k) => k.trim()).filter(Boolean)
    const trigger = { ...draft.trigger, keywords }
    if (editing === 'new') {
      createSkill({ ...draft, trigger })
    } else if (editing) {
      updateSkill(editing, { ...draft, trigger })
    }
    setEditing(null)
  }

  const patchDraft = (patch: Partial<typeof EMPTY_SKILL>) =>
    setDraft((d) => ({ ...d, ...patch }))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Skills & Triggers</SectionTitle>
        <p className="text-sm text-text-muted">Skills are named prompt injections that activate manually or auto-trigger on keywords.</p>
      </div>

      {/* Skill editor */}
      {editing !== null && (
        <div className="flex flex-col gap-4 p-4 bg-surface rounded-xl border border-accent/20">
          <p className="text-[12px] font-semibold text-accent uppercase tracking-wide">
            {editing === 'new' ? 'New Skill' : 'Edit Skill'}
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft.icon}
              onChange={(e) => patchDraft({ icon: e.target.value })}
              className={`${inputClass} w-12 text-center text-lg`}
              maxLength={2}
              placeholder="⚡"
            />
            <input
              type="text"
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              placeholder="Skill name"
              className={`${inputClass} flex-1`}
            />
          </div>

          <input
            type="text"
            value={draft.description}
            onChange={(e) => patchDraft({ description: e.target.value })}
            placeholder="Short description (shown in skills list)"
            className={inputClass}
          />

          <textarea
            value={draft.prompt}
            onChange={(e) => patchDraft({ prompt: e.target.value })}
            placeholder="System prompt injected when this skill is active..."
            rows={4}
            className={`${inputClass} resize-none leading-relaxed font-mono text-[12px]`}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-secondary w-20 shrink-0">Trigger</span>
              <select
                value={draft.trigger.type}
                onChange={(e) => patchDraft({ trigger: { ...draft.trigger, type: e.target.value as TriggerType } })}
                className={`${inputClass} flex-1 text-[12px]`}
              >
                <option value="manual">Manual only</option>
                <option value="keyword">Keyword match</option>
                <option value="always">Always active</option>
              </select>
            </div>
            {draft.trigger.type === 'keyword' && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-secondary w-20 shrink-0">Keywords</span>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="research, look up, investigate (comma-separated)"
                  className={`${inputClass} flex-1 text-[12px]`}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditing(null)}
              className="px-3 py-1.5 text-[12px] text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={!draft.name.trim() || !draft.prompt.trim()}
              className="px-3 py-1.5 text-[12px] font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >Save skill</button>
          </div>
        </div>
      )}

      {/* Skills list */}
      <SubSection title={`Installed Skills (${allSkills.length})`}>
        {allSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-1 border border-dashed border-border rounded-xl">
            <p className="text-sm text-text-muted">No skills yet</p>
            <p className="text-[11px] text-text-muted">Skills inject prompts into conversations to extend Claude's behavior</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {allSkills.map((skill) => (
              <div key={skill.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${skill.enabled ? 'bg-surface border-border' : 'bg-surface/50 border-border/40 opacity-60'}`}>
                <span className="text-xl shrink-0 w-8 text-center">{skill.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-text-primary">{skill.name}</p>
                    <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                      skill.trigger.type === 'always' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      skill.trigger.type === 'keyword' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-surface-hover text-text-muted border-border/60'
                    }`}>{skill.trigger.type}</span>
                  </div>
                  {skill.description && <p className="text-[11.5px] text-text-muted mt-0.5 truncate">{skill.description}</p>}
                  {skill.trigger.type === 'keyword' && skill.trigger.keywords.length > 0 && (
                    <p className="text-[10.5px] text-text-muted mt-0.5">
                      Keywords: {skill.trigger.keywords.slice(0, 4).join(', ')}
                      {skill.trigger.keywords.length > 4 ? ` +${skill.trigger.keywords.length - 4}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(skill)} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors text-sm">✏️</button>
                  {!skill.id.startsWith('builtin-') && (
                    <button onClick={() => deleteSkill(skill.id)} className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-surface-hover transition-colors text-sm">✕</button>
                  )}
                  <Toggle on={skill.enabled} onChange={() => toggleSkill(skill.id)} />
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={openNew}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          <span>Create new skill</span>
        </button>
      </SubSection>
    </div>
  )
}

/// ─── Section: Workspace ───────────────────────────────────────────────────────

function WorkspaceSection() {
  const {
    vaultPath, setVaultPath,
    vaultRagEnabled, setVaultRagEnabled,
    vaultEmbedModel, setVaultEmbedModel,
    remoteDispatchEnabled, setRemoteDispatchEnabled,
    remoteDispatchPort, setRemoteDispatchPort,
    ollamaBaseUrl,
  } = useSettingsStore()
  const [vaultInput, setVaultInput] = useState(vaultPath)
  const [vaultStats, setVaultStats] = useState<{ fileCount?: number; error?: string } | null>(null)
  const [vaultSearchQuery, setVaultSearchQuery] = useState('')
  const [vaultSearchResults, setVaultSearchResults] = useState<{ file: string; snippet: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [dispatchPortInput, setDispatchPortInput] = useState(String(remoteDispatchPort))
  const [serverIPs, setServerIPs] = useState<string[]>([])

  // Semantic index state
  const [embedModelInput, setEmbedModelInput] = useState(vaultEmbedModel)
  const [indexMeta, setIndexMeta] = useState<{
    exists: boolean; builtAt?: number; model?: string; fileCount?: number; chunkCount?: number
  } | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number; currentFile: string } | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)

  const tower = (window as any).tower

  // Load current server IPs when remote dispatch is enabled
  useEffect(() => {
    if (!remoteDispatchEnabled) { setServerIPs([]); return }
    tower?.remoteDispatch?.getIPs?.().then((ips: string[]) => setServerIPs(ips ?? []))
    // Also listen for server-started events to refresh IP display
    const cleanup = tower?.remoteDispatch?.onServerStarted?.((data: { ips: string[] }) => {
      setServerIPs(data.ips ?? [])
    })
    return () => { if (typeof cleanup === 'function') cleanup() }
  }, [remoteDispatchEnabled])

  // Load vault stats when vaultPath changes
  useEffect(() => {
    if (!vaultPath || !tower?.vault) { setVaultStats(null); return }
    tower.vault.getStats().then(setVaultStats)
  }, [vaultPath])

  // Load index metadata on mount
  useEffect(() => {
    tower?.vault?.indexMeta?.().then(setIndexMeta)
  }, [])

  // Index build handler
  const handleBuildIndex = async () => {
    if (!vaultPath || indexing) return
    setIndexing(true)
    setIndexError(null)
    setIndexProgress({ done: 0, total: 0, currentFile: '' })

    // Subscribe to progress events
    const cleanup = tower?.vault?.onIndexProgress?.((data: { done: number; total: number; currentFile: string }) => {
      setIndexProgress(data)
    })

    try {
      const result = await tower.vault.buildIndex({
        ollamaBaseUrl,
        model: embedModelInput || vaultEmbedModel,
      })
      if (result.error) {
        setIndexError(result.error)
      } else {
        setVaultEmbedModel(embedModelInput || vaultEmbedModel)
        // Refresh metadata
        const meta = await tower.vault.indexMeta()
        setIndexMeta(meta)
        setIndexProgress(null)
      }
    } catch (err: unknown) {
      setIndexError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIndexing(false)
      if (typeof cleanup === 'function') cleanup()
    }
  }

  const handleClearIndex = async () => {
    await tower?.vault?.clearIndex?.()
    setIndexMeta({ exists: false })
    setIndexProgress(null)
    setIndexError(null)
  }

  const handleSaveVaultPath = () => {
    const trimmed = vaultInput.trim()
    setVaultPath(trimmed)
    tower?.vault?.setPath?.(trimmed)
  }

  const handlePickFolder = async () => {
    const result = await tower?.openFolderDialog?.()
    if (result) {
      setVaultInput(result)
      setVaultPath(result)
      tower?.vault?.setPath?.(result)
    }
  }

  const handleSearch = async () => {
    if (!vaultSearchQuery.trim() || !vaultPath) return
    setSearching(true)
    const res = await tower?.vault?.search?.(vaultSearchQuery.trim())
    setSearching(false)
    setVaultSearchResults(res?.results ?? [])
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionTitle>Workspace</SectionTitle>
        <p className="text-sm text-text-muted">Connect Lumen to your Obsidian vault and configure agent behavior.</p>
      </div>

      {/* Vault / Obsidian */}
      <SubSection title="Obsidian Vault">
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-text-muted leading-relaxed">
            Point Lumen at your Obsidian vault folder. Claude can then read notes, write session logs, and sync memories — all staying local.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              placeholder="E:\Obsidian\SpiritVault"
              className={`${inputClass} flex-1 font-mono text-[12px]`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveVaultPath() }}
            />
            <button onClick={handlePickFolder} className="px-3 py-1.5 text-[12px] border border-border rounded-lg text-text-muted hover:text-text-primary hover:border-border/80 transition-colors shrink-0">Browse…</button>
            <button onClick={handleSaveVaultPath} className="px-3 py-1.5 text-[12px] font-semibold bg-accent/10 border border-accent/30 text-accent rounded-lg hover:bg-accent/20 transition-colors shrink-0">Set</button>
          </div>

          {vaultStats && !vaultStats.error && (
            <div className="flex items-center gap-2 text-[12px] text-green-400">
              <span>✓</span>
              <span>Connected — {vaultStats.fileCount?.toLocaleString()} notes found</span>
            </div>
          )}
          {vaultStats?.error && (
            <p className="text-[12px] text-error">Could not read vault: {vaultStats.error}</p>
          )}

          {/* Vault RAG toggle */}
          {vaultPath && (
            <div className="flex items-center justify-between py-2 border-t border-border mt-1">
              <div>
                <p className="text-[13px] font-medium text-text-secondary">Inject vault context</p>
                <p className="text-[11.5px] text-text-muted">Automatically search your vault and inject relevant notes into Claude's context with each message.</p>
              </div>
              <Toggle on={vaultRagEnabled} onChange={setVaultRagEnabled} />
            </div>
          )}
        </div>
      </SubSection>

      {/* Semantic Index */}
      {vaultPath && (
        <SubSection title="Semantic Index (Embeddings)">
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-text-muted leading-relaxed">
              Build a vector index of your vault using <span className="text-text-secondary font-medium">Ollama embeddings</span> on your Unraid server.
              Once indexed, vault context injection uses semantic similarity instead of keyword matching — finds relevant notes even when your query doesn't share exact words.
            </p>

            <Field label="Embedding model" hint="Must be pulled in Ollama. Recommended: nomic-embed-text (137MB, fast) or mxbai-embed-large (670MB, more accurate).">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={embedModelInput}
                  onChange={(e) => setEmbedModelInput(e.target.value)}
                  placeholder="nomic-embed-text"
                  className={`${inputClass} flex-1 font-mono text-[12px]`}
                />
              </div>
            </Field>

            <p className="text-[11.5px] text-text-muted">
              Ollama URL: <span className="font-mono text-accent">{ollamaBaseUrl || 'Not set — configure in Settings → Models'}</span>
            </p>

            {/* Index metadata */}
            {indexMeta?.exists && (
              <div className="p-3 bg-surface rounded-lg border border-border flex flex-col gap-1">
                <p className="text-[11.5px] font-semibold text-green-400">✓ Index built</p>
                <p className="text-[11px] text-text-muted">
                  {indexMeta.chunkCount?.toLocaleString()} chunks from {indexMeta.fileCount?.toLocaleString()} files
                  · Model: <span className="font-mono">{indexMeta.model}</span>
                  · Built {indexMeta.builtAt ? new Date(indexMeta.builtAt).toLocaleDateString() : '?'}
                </p>
              </div>
            )}

            {/* Progress bar */}
            {indexing && indexProgress && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px] text-text-muted">
                  <span>Indexing… {indexProgress.currentFile}</span>
                  <span>{indexProgress.done}/{indexProgress.total} files</span>
                </div>
                <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-200"
                    style={{ width: indexProgress.total > 0 ? `${(indexProgress.done / indexProgress.total) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-[11px] text-text-muted">This runs through Ollama on your Unraid server — speed depends on your network and GPU.</p>
              </div>
            )}

            {indexError && (
              <div className="p-2.5 bg-error/10 border border-error/30 rounded-lg">
                <p className="text-[12px] text-error">{indexError}</p>
                <p className="text-[11px] text-text-muted mt-1">Make sure: (1) Ollama is running on Unraid, (2) the model is pulled (<span className="font-mono">ollama pull {embedModelInput}</span>), (3) the Ollama URL in Settings → Models is correct.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleBuildIndex}
                disabled={indexing || !ollamaBaseUrl}
                className="px-3 py-1.5 text-[12px] font-semibold bg-accent/10 border border-accent/30 text-accent rounded-lg hover:bg-accent/20 disabled:opacity-40 transition-colors"
              >
                {indexing ? '⏳ Indexing…' : indexMeta?.exists ? '↺ Re-index Vault' : '⚡ Build Semantic Index'}
              </button>
              {indexMeta?.exists && (
                <button
                  onClick={handleClearIndex}
                  disabled={indexing}
                  className="px-3 py-1.5 text-[12px] text-text-muted border border-border rounded-lg hover:text-error hover:border-error/40 disabled:opacity-40 transition-colors"
                >
                  Clear Index
                </button>
              )}
            </div>
          </div>
        </SubSection>
      )}


      {/* Vault search */}
      {vaultPath && (
        <SubSection title="Search Vault">
          <div className="flex gap-2">
            <input
              type="text"
              value={vaultSearchQuery}
              onChange={(e) => setVaultSearchQuery(e.target.value)}
              placeholder="Search your notes…"
              className={`${inputClass} flex-1`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !vaultSearchQuery.trim()}
              className="px-3 py-1.5 text-[12px] font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {vaultSearchResults.length > 0 && (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {vaultSearchResults.map((r, i) => (
                <div key={i} className="p-3 bg-surface rounded-lg border border-border">
                  <p className="text-[11px] font-mono text-accent truncate mb-1">{r.file.replace(vaultPath, '').replace(/\\/g, '/')}</p>
                  <p className="text-[12px] text-text-secondary leading-snug whitespace-pre-wrap">{r.snippet}</p>
                </div>
              ))}
            </div>
          )}
          {vaultSearchResults.length === 0 && vaultSearchQuery && !searching && (
            <p className="text-[12px] text-text-muted">No results for "{vaultSearchQuery}"</p>
          )}
        </SubSection>
      )}

      {/* Remote Dispatch */}
      <SubSection title="Remote Dispatch">
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-text-muted leading-relaxed">
            Start a local HTTP server so your phone or any script can send tasks to Lumen.
            POST to <span className="font-mono text-accent">http://YOUR_IP:{remoteDispatchPort}/dispatch</span> with <span className="font-mono text-accent text-[11px]">{"{ \"text\": \"do something\" }"}</span>
          </p>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-[13px] font-medium text-text-secondary">Enable remote dispatch</p>
              <p className="text-[11.5px] text-text-muted">Listens on all network interfaces — use only on trusted networks.</p>
            </div>
            <Toggle on={remoteDispatchEnabled} onChange={(v) => {
              setRemoteDispatchEnabled(v)
              if (v) tower?.remoteDispatch?.start?.(remoteDispatchPort, '')
              else    tower?.remoteDispatch?.stop?.()
            }} />
          </div>

          <div className="flex items-center gap-2">
            <Field label="Port" hint="">
              <input
                type="number"
                value={dispatchPortInput}
                onChange={(e) => setDispatchPortInput(e.target.value)}
                onBlur={() => {
                  const p = parseInt(dispatchPortInput)
                  if (!isNaN(p) && p > 1024 && p < 65535) {
                    setRemoteDispatchPort(p)
                    if (remoteDispatchEnabled) tower?.remoteDispatch?.start?.(p, '')
                  }
                }}
                className={`${inputClass} w-28 font-mono`}
                min={1025} max={65534}
              />
            </Field>
          </div>

          {remoteDispatchEnabled && serverIPs.length > 0 && (
            <div className="flex flex-col gap-1.5 p-3 bg-surface rounded-lg border border-green-500/20">
              <p className="text-[11.5px] font-semibold text-green-400">✓ Server running — POST to:</p>
              {serverIPs.map((ip) => (
                <p key={ip} className="text-[12px] font-mono text-text-secondary">
                  http://{ip}:{remoteDispatchPort}/dispatch
                </p>
              ))}
              <p className="text-[11px] text-text-muted mt-1">Example: <span className="font-mono">{"curl -X POST http://IP:PORT/dispatch -H 'Content-Type: application/json' -d '{\"text\":\"summarize my last meeting\"}'"}  </span></p>
            </div>
          )}

          {remoteDispatchEnabled && serverIPs.length === 0 && (
            <p className="text-[12px] text-text-muted">Starting server… (check that port {remoteDispatchPort} is available)</p>
          )}
        </div>
      </SubSection>

      {/* Agent config */}
      <SubSection title="Agent Behavior">
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
  { id: 'mobile',       label: 'Mobile',         icon: '📱', group: 'Lumen' },
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
    appearance:   <ThemeEngine />,
    privacy:      <PrivacySection />,
    usage:        <UsageSection />,
    mobile:       <MobileSection />,
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
        <div className="max-w-3xl mx-auto px-10 py-10">
          {content[section]}
        </div>
      </div>
    </div>
  )
}
