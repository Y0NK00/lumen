import { useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

// ─── Known models ─────────────────────────────────────────────────────────────

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-5',    label: 'Claude Opus 4.5   (most capable)' },
  { value: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5 (balanced)' },
  { value: 'claude-haiku-4-5',   label: 'Claude Haiku 4.5  (fastest)' },
]

const OLLAMA_MODELS = [
  { value: 'qwen2.5:14b',   label: 'Qwen 2.5 14B' },
  { value: 'qwen2.5:7b',    label: 'Qwen 2.5 7B' },
  { value: 'llama3.2:3b',   label: 'Llama 3.2 3B' },
  { value: 'mistral:7b',    label: 'Mistral 7B' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const {
    claudeApiKey,
    defaultClaudeModel,
    defaultOllamaModel,
    ollamaBaseUrl,
    defaultProvider,
    setClaudeApiKey,
    setDefaultClaudeModel,
    setDefaultOllamaModel,
    setOllamaBaseUrl,
    setDefaultProvider,
  } = useSettingsStore()

  // Local state so edits don't commit on every keystroke
  const [apiKeyDraft, setApiKeyDraft] = useState(claudeApiKey)
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(ollamaBaseUrl)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setClaudeApiKey(apiKeyDraft.trim())
    setOllamaBaseUrl(ollamaUrlDraft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
        <button
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      {/* Default provider */}
      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Default provider
        </label>
        <div className="flex gap-2">
          {(['ollama', 'claude'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setDefaultProvider(p)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                defaultProvider === p
                  ? 'bg-accent text-white'
                  : 'bg-surface text-text-muted hover:text-text-primary'
              }`}
            >
              {p === 'ollama' ? '🏠 Ollama' : '🤖 Claude'}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Used when you create a new conversation.
        </p>
      </section>

      {/* Claude section */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-text-primary border-b border-border pb-1">
          Claude API
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">API Key</label>
          <div className="flex gap-1.5">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5
                         text-xs text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="px-2 text-xs text-text-muted hover:text-text-primary
                         bg-surface border border-border rounded-lg transition-colors"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          {claudeApiKey && claudeApiKey !== apiKeyDraft && (
            <p className="text-xs text-amber-400">Unsaved changes</p>
          )}
          {!claudeApiKey && (
            <p className="text-xs text-text-muted">
              Get yours at{' '}
              <span className="text-accent">console.anthropic.com</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">Default model</label>
          <select
            value={defaultClaudeModel}
            onChange={(e) => setDefaultClaudeModel(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5
                       text-xs text-text-primary focus:outline-none focus:border-accent
                       transition-colors"
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Ollama section */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-text-primary border-b border-border pb-1">
          Ollama (local)
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">Server URL</label>
          <input
            type="text"
            value={ollamaUrlDraft}
            onChange={(e) => setOllamaUrlDraft(e.target.value)}
            placeholder="http://10.0.0.22:11434"
            className="bg-surface border border-border rounded-lg px-3 py-1.5
                       text-xs text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">Default model</label>
          <select
            value={defaultOllamaModel}
            onChange={(e) => setDefaultOllamaModel(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5
                       text-xs text-text-primary focus:outline-none focus:border-accent
                       transition-colors"
          >
            {OLLAMA_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Save button */}
      <button
        onClick={handleSave}
        className={`w-full py-2 rounded-xl text-xs font-semibold transition-all ${
          saved
            ? 'bg-green-600 text-white'
            : 'bg-accent text-white hover:bg-accent-hover active:scale-95'
        }`}
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  )
}
