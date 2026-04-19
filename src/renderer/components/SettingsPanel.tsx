// src/renderer/components/SettingsPanel.tsx
// Full settings panel — tabbed: API Keys, Models, Appearance, Workspace, Keybindings

import { useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

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

type Tab = 'api' | 'models' | 'appearance' | 'workspace' | 'keybindings'

interface SettingsPanelProps {
  onClose: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-widest border-b border-border pb-1.5 mb-3">
      {children}
    </h3>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-medium text-text-secondary">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-text-muted leading-snug">{hint}</p>}
    </div>
  )
}

const inputClass =
  'bg-surface border border-border rounded-lg px-3 py-2 text-[12.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-colors'

// ─── Tab: API Keys ────────────────────────────────────────────────────────────

function ApiTab() {
  const { claudeApiKey, setClaudeApiKey } = useSettingsStore()
  const [draft, setDraft] = useState(claudeApiKey)
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = () => {
    setClaudeApiKey(draft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isValid = draft.startsWith('sk-ant-') && draft.length > 20

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHeader>Anthropic / Claude</SectionHeader>
        <div className="flex flex-col gap-4">
          <Field
            label="API Key"
            hint={!claudeApiKey ? 'Get yours at console.anthropic.com → API Keys' : undefined}
          >
            <div className="flex gap-1.5">
              <input
                type={show ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="sk-ant-api03-..."
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={() => setShow((v) => !v)}
                className="px-2.5 bg-surface border border-border rounded-lg text-xs text-text-muted
                           hover:text-text-primary transition-colors"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            {draft && !isValid && (
              <p className="text-[11px] text-amber-400">Key format looks off — should start with sk-ant-</p>
            )}
            {claudeApiKey && draft !== claudeApiKey && (
              <p className="text-[11px] text-amber-400">Unsaved changes</p>
            )}
          </Field>

          <button
            onClick={save}
            className={`w-full py-2 rounded-xl text-xs font-semibold transition-all ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-accent text-white hover:bg-accent-hover active:scale-95'
            }`}
          >
            {saved ? 'Saved' : 'Save API Key'}
          </button>
        </div>
      </section>

      <section>
        <SectionHeader>Ollama (Local)</SectionHeader>
        <Field label="No API key required" hint="Ollama runs on your machine. Configure the server URL in the Models tab.">
          <div className="flex items-center gap-2 py-2 px-3 bg-surface border border-border rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="text-xs text-text-secondary">No credentials needed</span>
          </div>
        </Field>
      </section>
    </div>
  )
}

// ─── Tab: Models ──────────────────────────────────────────────────────────────

function ModelsTab() {
  const {
    defaultProvider, setDefaultProvider,
    defaultClaudeModel, setDefaultClaudeModel,
    defaultOllamaModel, setDefaultOllamaModel,
    ollamaBaseUrl, setOllamaBaseUrl,
  } = useSettingsStore()
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl)

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHeader>Default Provider</SectionHeader>
        <div className="flex gap-2">
          {(['ollama', 'claude'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setDefaultProvider(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                defaultProvider === p
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {p === 'ollama' ? '🏠 Ollama (local)' : '🤖 Claude (cloud)'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted mt-2">Used when you create a new conversation.</p>
      </section>

      <section>
        <SectionHeader>Claude Models</SectionHeader>
        <div className="flex flex-col gap-2">
          {CLAUDE_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setDefaultClaudeModel(m.value)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all ${
                defaultClaudeModel === m.value
                  ? 'bg-accent/10 border-accent/25 text-text-primary'
                  : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border'
              }`}
            >
              <span className="text-xs font-medium">{m.label}</span>
              <span className="text-[10px] text-text-muted">{m.tier}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader>Ollama Models</SectionHeader>
        <div className="flex flex-col gap-3">
          <Field label="Server URL">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="http://10.0.0.22:11434"
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={() => setOllamaBaseUrl(urlDraft.trim())}
                className="px-3 bg-surface border border-border rounded-lg text-xs text-text-muted
                           hover:text-text-primary transition-colors"
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
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all ${
                  defaultOllamaModel === m.value
                    ? 'bg-accent/10 border-accent/25 text-text-primary'
                    : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="text-xs font-medium">{m.label}</span>
                {defaultOllamaModel === m.value && (
                  <span className="text-[10px] text-accent">default</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Tab: Appearance ──────────────────────────────────────────────────────────

function AppearanceTab() {
  const [fontSize, setFontSize] = useState('sm')
  const [density, setDensity] = useState('comfortable')

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHeader>Theme</SectionHeader>
        <div className="flex gap-2">
          {['Lumen Dark', 'Midnight', 'Slate'].map((t) => (
            <button
              key={t}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                t === 'Lumen Dark'
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted mt-2">More themes coming soon.</p>
      </section>

      <section>
        <SectionHeader>Font Size</SectionHeader>
        <div className="flex gap-2">
          {[
            { id: 'xs', label: 'Small' },
            { id: 'sm', label: 'Default' },
            { id: 'base', label: 'Large' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFontSize(id)}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                fontSize === id
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader>Message Density</SectionHeader>
        <div className="flex gap-2">
          {['compact', 'comfortable', 'spacious'].map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                density === d
                  ? 'bg-accent/15 border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader>Interface</SectionHeader>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Show thinking blocks',     desc: 'Expand Claude extended thinking',    on: true  },
            { label: 'Animate messages',          desc: 'Slide-in animation on new messages', on: true  },
            { label: 'Show streaming cursor',    desc: 'Blinking cursor while generating',   on: true  },
            { label: 'Compact tool call cards',  desc: 'Collapse tool results by default',   on: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-0.5">
              <div>
                <p className="text-xs text-text-primary">{item.label}</p>
                <p className="text-[11px] text-text-muted">{item.desc}</p>
              </div>
              <div className={`w-7 h-4 rounded-full cursor-pointer transition-colors shrink-0 ${
                item.on ? 'bg-accent' : 'bg-surface-active'
              }`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── Tab: Workspace ───────────────────────────────────────────────────────────

function WorkspaceTab() {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHeader>System Prompt</SectionHeader>
        <Field label="Global system prompt" hint="Prepended to every conversation. Leave blank to use the default.">
          <textarea
            rows={4}
            placeholder="e.g. You are a helpful assistant. Always respond concisely..."
            className={`${inputClass} resize-none leading-relaxed`}
          />
        </Field>
      </section>

      <section>
        <SectionHeader>Tool Limits</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max tool calls / turn" hint="Safety limit per agent turn.">
            <input type="number" defaultValue={25} min={1} max={100} className={inputClass} />
          </Field>
          <Field label="Command timeout (s)" hint="Max runtime for shell commands.">
            <input type="number" defaultValue={30} min={5} max={300} className={inputClass} />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeader>Data</SectionHeader>
        <div className="flex flex-col gap-2">
          <button className="w-full py-2 rounded-lg border border-border bg-surface text-xs text-text-muted
                             hover:text-text-primary hover:border-text-muted transition-colors">
            Export all conversations (JSON)
          </button>
          <button className="w-full py-2 rounded-lg border border-error/30 bg-error/5 text-xs text-error
                             hover:bg-error/10 transition-colors">
            Clear all conversations
          </button>
        </div>
      </section>
    </div>
  )
}

// ─── Tab: Keybindings ─────────────────────────────────────────────────────────

const KEYBINDINGS = [
  { action: 'New conversation',    keys: ['Ctrl', 'N']       },
  { action: 'Send message',        keys: ['Enter']           },
  { action: 'New line in input',   keys: ['Shift', 'Enter']  },
  { action: 'Stop generation',     keys: ['Escape']          },
  { action: 'Focus search',        keys: ['Ctrl', 'K']       },
  { action: 'Toggle sidebar',      keys: ['Ctrl', 'B']       },
  { action: 'Open settings',       keys: ['Ctrl', ',']       },
  { action: 'Switch to Chat',      keys: ['Ctrl', '1']       },
  { action: 'Switch to Helm',      keys: ['Ctrl', '2']       },
  { action: 'Switch to Code',      keys: ['Ctrl', '3']       },
]

function Key({ label }: { label: string }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-text-secondary">
      {label}
    </kbd>
  )
}

function KeybindingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Keyboard Shortcuts</SectionHeader>
      <div className="flex flex-col gap-0.5">
        {KEYBINDINGS.map(({ action, keys }) => (
          <div key={action} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <span className="text-xs text-text-secondary">{action}</span>
            <div className="flex items-center gap-1">
              {keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Key label={k} />
                  {i < keys.length - 1 && <span className="text-[10px] text-text-muted">+</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Custom keybindings coming in a future update.</p>
    </div>
  )
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'api',         label: 'API Keys',    icon: '🔑' },
  { id: 'models',      label: 'Models',      icon: '🤖' },
  { id: 'appearance',  label: 'Appearance',  icon: '🎨' },
  { id: 'workspace',   label: 'Workspace',   icon: '📁' },
  { id: 'keybindings', label: 'Shortcuts',   icon: '⌨️' },
]

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>('api')

  const content: Record<Tab, React.ReactNode> = {
    api:         <ApiTab />,
    models:      <ModelsTab />,
    appearance:  <AppearanceTab />,
    workspace:   <WorkspaceTab />,
    keybindings: <KeybindingsTab />,
  }

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-colors"
          aria-label="Close settings"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="7" y2="7" />
            <line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-col gap-0.5 px-2 py-2 border-b border-border shrink-0">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-all',
              tab === id
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover border border-transparent',
            ].join(' ')}
          >
            <span className="text-sm">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {content[tab]}
      </div>
    </div>
  )
}
