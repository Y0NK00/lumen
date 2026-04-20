// src/renderer/components/HelmPane.tsx
// Helm mode — the task control center.
// Left panel: Progress, Working Folders, Context widgets.
// Right area: content for selected nav item.

import { useState, useMemo, useEffect, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useProjectsStore } from '../stores/projectsStore'
import {
  useHelmStore,
  CADENCE_LABELS,
  AGENT_META,
  type Cadence,
  type AgentId,
} from '../stores/helmStore'
import { classifyPrompt } from '../utils/classifyPrompt'
import { useClaudeStream } from '../hooks/useClaudeStream'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'

// ─── Widget: Progress ─────────────────────────────────────────────────────────
// Shows the active Helm conversation's tool-call steps as a live checklist,
// plus a summary row for each dispatched task in the log.

function ProgressWidget() {
  const dispatchLog = useUIStore((s) => s.dispatchLog)
  const helmConvId  = useUIStore((s) => s.helmConvId)
  const conversations = useChatStore((s) => s.conversations)

  // Collect tool calls from the active Helm conversation for the step checklist
  const activeConv = helmConvId ? conversations[helmConvId] : null
  const toolSteps = activeConv
    ? activeConv.messages.flatMap((m) => m.toolCalls ?? [])
    : []
  const isRunning = activeConv?.messages.some((m) => m.isStreaming) ?? false

  const hasAnything = toolSteps.length > 0 || dispatchLog.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Progress</p>

      {/* Live step checklist for the active conversation */}
      {toolSteps.length > 0 && (
        <div className="flex flex-col gap-1 pb-1">
          {toolSteps.map((tc) => (
            <div key={tc.id} className="flex items-center gap-1.5 min-w-0">
              {tc.status === 'running' ? (
                <span className="w-3 h-3 shrink-0 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                </span>
              ) : tc.status === 'done' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-green-400">
                  <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-error">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              )}
              <p className="text-[10px] text-text-secondary truncate">
                {tc.name.replace(/_/g, ' ')}
              </p>
            </div>
          ))}
          {isRunning && toolSteps.every((t) => t.status !== 'running') && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              <p className="text-[10px] text-accent">thinking…</p>
            </div>
          )}
        </div>
      )}

      {/* Summary rows for dispatched tasks */}
      {dispatchLog.length > 0 && (
        <div className="flex flex-col gap-1">
          {dispatchLog.map((record) => {
            const conv    = conversations[record.convId]
            const running = conv?.messages.some((m) => m.isStreaming) ?? false
            const done    = conv && conv.messages.length >= 2 && !running
            return (
              <div key={record.id} className="flex items-start gap-2 py-0.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                  running ? 'bg-accent animate-pulse' :
                  done    ? 'bg-green-400'            : 'bg-text-muted'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text-primary truncate">
                    {record.prompt.length > 36 ? record.prompt.slice(0, 36) + '…' : record.prompt}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {running ? 'running' : done ? 'done' : 'queued'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!hasAnything && (
        <p className="text-xs text-text-muted italic">No active tasks</p>
      )}
    </div>
  )
}

// ─── Widget: Working Folders ──────────────────────────────────────────────────

function WorkingFoldersWidget() {
  const [folders, setFolders] = useState<string[]>([])

  const addFolder = async () => {
    try {
      // Ask main process to open a folder dialog
      if (window.tower?.openFolderDialog) {
        const result = await window.tower.openFolderDialog()
        if (result) setFolders((prev) => [...new Set([...prev, result])])
      }
    } catch {
      // openFolderDialog not implemented yet — no-op
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Working Folders</p>
        <button
          onClick={addFolder}
          className="text-[10px] text-text-muted hover:text-accent transition-colors"
          title="Add folder"
        >
          + add
        </button>
      </div>
      {folders.length === 0 ? (
        <p className="text-xs text-text-muted italic">No folders mounted</p>
      ) : (
        folders.map((f) => (
          <div key={f} className="flex items-center gap-1.5 group">
            <svg width="10" height="10" viewBox="0 0 15 15" fill="currentColor" className="text-text-muted shrink-0">
              <path d="M1.5 3.5A.5.5 0 012 3h4.172a.5.5 0 01.353.146l1.5 1.5A.5.5 0 008.378 5H13a.5.5 0 01.5.5v7a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5v-9z" />
            </svg>
            <span className="text-xs text-text-secondary truncate flex-1" title={f}>
              {f.split(/[/\\]/).pop() ?? f}
            </span>
            <button
              onClick={() => setFolders((prev) => prev.filter((x) => x !== f))}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all text-[10px]"
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Widget: Context ──────────────────────────────────────────────────────────

function ContextWidget() {
  const { conversations } = useChatStore()
  const convCount = Object.keys(conversations).length
  const msgCount = Object.values(conversations).reduce((acc, c) => acc + c.messages.length, 0)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Context</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Conversations</span>
          <span className="text-text-primary font-mono tabular-nums">{convCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Total messages</span>
          <span className="text-text-primary font-mono tabular-nums">{msgCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Memory files</span>
          <span className="text-text-muted font-mono">—</span>
        </div>
      </div>
    </div>
  )
}

// ─── Widget: Status ───────────────────────────────────────────────────────────

function StatusWidget() {
  const claudeApiKey = useSettingsStore((s) => s.claudeApiKey)
  const { projects, activeProjectId } = useProjectsStore()
  const activeProject = activeProjectId ? projects[activeProjectId] : null
  const hasKey = !!claudeApiKey
  const [browserConnected, setBrowserConnected] = useState(false)

  // Poll / listen for browser extension connection status
  useEffect(() => {
    const check = async () => {
      try {
        const status = await window.tower?.getBrowserStatus?.()
        setBrowserConnected(status?.connected ?? false)
      } catch { setBrowserConnected(false) }
    }
    check()
    // Both calls return a cleanup fn — collect them for unmount
    const offConnect    = window.tower?.onBrowserConnected?.(() => setBrowserConnected(true))
    const offDisconnect = window.tower?.onBrowserDisconnected?.(() => setBrowserConnected(false))
    // Fallback poll every 5s in case events are missed
    const t = setInterval(check, 5000)
    return () => { clearInterval(t); offConnect?.(); offDisconnect?.() }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Status</p>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasKey ? 'bg-green-400' : 'bg-error'}`} />
        <span className="text-xs text-text-secondary">
          {hasKey ? 'Claude connected' : 'No API key set'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${browserConnected ? 'bg-green-400' : 'bg-text-muted'}`} />
        <span className="text-xs text-text-secondary">
          {browserConnected ? 'Browser connected' : 'Browser not connected'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeProject ? 'bg-accent' : 'bg-text-muted'}`} />
        <span className="text-xs text-text-secondary truncate">
          {activeProject
            ? `${activeProject.emoji ?? '◫'} ${activeProject.name}`
            : 'No project active'}
        </span>
      </div>
    </div>
  )
}

// ─── Right panel (pinned widgets) ─────────────────────────────────────────────

function RightPanel() {
  return (
    <aside className="w-[230px] shrink-0 flex flex-col border-l border-border bg-sidebar overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="pl-4 pr-4 pt-5 pb-4 flex flex-col gap-4">
          <StatusWidget />
          <div className="border-t border-border" />
          <ProgressWidget />
          <div className="border-t border-border" />
          <WorkingFoldersWidget />
          <div className="border-t border-border" />
          <ContextWidget />
        </div>
      </div>
    </aside>
  )
}

// ─── Helm direct chat (default entry point) ──────────────────────────────────
// Shown when helmNav === 'chat' and no conversation is active yet.
// First message auto-creates a conversation and transitions to HelmChatView.

function HelmChatContent() {
  const setHelmConvId = useUIStore((s) => s.setHelmConvId)
  const setPendingDispatch = useUIStore((s) => s.setPendingDispatch)

  const handleSend = (text: string) => {
    const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore.getState()
    const { activeProjectId } = useProjectsStore.getState()
    const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
    // createConversation also sets activeConversationId in chatStore
    const convId = useChatStore.getState().createConversation(model, 'helm', activeProjectId ?? undefined)
    setHelmConvId(convId)
    setPendingDispatch(text)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Empty state — flex column with items-center reliably centers here */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <span className="text-2xl">⚡</span>
        </div>
        <div>
          <h2 className="text-base font-semibold text-text-primary mb-1">Helm</h2>
          <p className="text-xs text-text-muted max-w-sm">
            Direct chat with full tool access. Complex tasks, file operations, shell commands.
            Use the sidebar to schedule recurring tasks or route to specialized agents.
          </p>
        </div>
      </div>
      {/* Input — InputBox self-centers via its own max-w-[840px] mx-auto */}
      <div className="shrink-0 border-t border-border bg-background/50">
        <InputBox onSend={handleSend} onStop={() => {}} isStreaming={false} />
      </div>
    </div>
  )
}

// ─── Helm inline chat view ───────────────────────────────────────────────────
// Shown whenever helmConvId is set — either from a direct chat message or a
// structured task dispatch. Stays entirely within Helm mode.

function HelmChatView() {
  const helmConvId = useUIStore((s) => s.helmConvId)
  const setHelmConvId = useUIStore((s) => s.setHelmConvId)
  const setHelmNav = useUIStore((s) => s.setHelmNav)
  const pendingDispatch = useUIStore((s) => s.pendingDispatch)
  const setPendingDispatch = useUIStore((s) => s.setPendingDispatch)
  const conversations = useChatStore((s) => s.conversations)

  const conv = helmConvId ? conversations[helmConvId] : null
  const { sendMessage, stopStream, isStreaming } = useClaudeStream()

  // Track the exact dispatch string we've already consumed. This prevents
  // React StrictMode's double-invoke from firing sendMessage twice with the
  // same prompt — the ref persists across the double-run while state doesn't.
  const consumedDispatchRef = useRef<string | null>(null)

  // Auto-send a dispatched or first-message prompt once the conv is live
  useEffect(() => {
    if (!pendingDispatch || !conv || isStreaming) return
    if (consumedDispatchRef.current === pendingDispatch) return   // already consumed
    consumedDispatchRef.current = pendingDispatch
    const prompt = pendingDispatch
    setPendingDispatch(null)
    sendMessage(prompt)
  }, [pendingDispatch, conv, isStreaming, sendMessage, setPendingDispatch])

  if (!conv) return null

  const handleBack = () => {
    setHelmConvId(null)
    setHelmNav('chat')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-2.5 border-b border-border shrink-0">
        <button
          onClick={handleBack}
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
          title="New chat"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 2L4 6.5l4.5 4.5" />
          </svg>
        </button>
        <p className="text-sm font-medium text-text-primary truncate flex-1">{conv.title}</p>
        {isStreaming && (
          <span className="text-[10px] text-accent font-medium animate-pulse shrink-0">running…</span>
        )}
      </div>

      {/* Messages — centered column matches InputBox's max-w-[840px] */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col w-full max-w-[840px] mx-auto">
          <MessageList messages={conv.messages} />
        </div>
      </div>

      {/* Input — InputBox self-centers via its own max-w-[840px] mx-auto */}
      <div className="shrink-0 border-t border-border bg-background/50">
        <InputBox onSend={sendMessage} onStop={stopStream} isStreaming={isStreaming} />
      </div>
    </div>
  )
}

// ─── Custom select ────────────────────────────────────────────────────────────

function CustomSelect({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                   bg-surface border border-border text-sm text-text-primary
                   hover:border-accent/40 transition-colors focus:outline-none"
      >
        <span>{value}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-text-muted shrink-0">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg
                        shadow-lg overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${value === opt
                  ? 'text-accent bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Content areas ────────────────────────────────────────────────────────────

function NewTaskContent() {
  const [prompt, setPrompt] = useState('')
  const [agent, setAgent] = useState('Claude (Auto)')
  const [priority, setPriority] = useState('Normal')
  const [lastDispatch, setLastDispatch] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)

  const agents = useHelmStore((s) => s.agents)
  const incrementAgentRouteCount = useHelmStore((s) => s.incrementAgentRouteCount)
  const setHelmNav = useUIStore((s) => s.setHelmNav)
  const addDispatch = useUIStore((s) => s.addDispatch)
  const setPendingDispatch = useUIStore((s) => s.setPendingDispatch)
  const setHelmConvId = useUIStore((s) => s.setHelmConvId)

  const dispatch = async () => {
    if (!prompt.trim() || dispatching) return
    setDispatching(true)
    try {
      // classifyPrompt uses LLM (haiku) when a key is set, regex fallback otherwise.
      const target = await classifyPrompt(prompt)
      const enabledIds = (Object.keys(agents) as AgentId[]).filter((id) => agents[id].enabled)
      const resolved: AgentId | null = agents[target]?.enabled ? target : (enabledIds[0] ?? null)

      if (resolved) {
        incrementAgentRouteCount(resolved)
        setLastDispatch(AGENT_META[resolved].name)

        // Create a conversation for this task — stays in Helm mode, shown inline
        const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore.getState()
        const { activeProjectId } = useProjectsStore.getState()
        const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
        const convId = useChatStore.getState().createConversation(model, 'helm', activeProjectId ?? undefined)

        // Log to Progress widget + dispatch history
        addDispatch({
          id:        crypto.randomUUID(),
          prompt:    prompt.trim(),
          agentName: AGENT_META[resolved].name,
          convId,
          createdAt: Date.now(),
        })

        // Show conversation in Helm center and trigger auto-send
        setHelmConvId(convId)
        setPendingDispatch(prompt.trim())
      } else {
        setLastDispatch('No enabled agents — open Dispatch to enable one')
      }
      setPrompt('')
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-0.5">New Task</h2>
        <p className="text-xs text-text-muted">
          Describe what you want Helm to do. Tasks run autonomously using your connected tools and agents.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          Task Description
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Monitor my home lab and alert me if any service goes down, then attempt to restart it..."
          rows={5}
          className="w-full bg-surface border border-border rounded-xl px-4 py-3
                     text-sm text-text-primary placeholder:text-text-muted resize-none
                     focus:outline-none focus:border-accent/40
                     transition-colors leading-relaxed"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Agent</label>
          <CustomSelect
            value={agent}
            onChange={setAgent}
            options={['Claude (Auto)', 'Claude Opus', 'Claude Sonnet', 'Local (Ollama)']}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Priority</label>
          <CustomSelect
            value={priority}
            onChange={setPriority}
            options={['Normal', 'High', 'Low']}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={!prompt.trim() || dispatching}
          onClick={dispatch}
          className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium
                     hover:bg-accent-hover transition-colors active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {dispatching ? 'Routing…' : 'Dispatch Task'}
        </button>
        {prompt && (
          <button
            onClick={() => setPrompt('')}
            className="px-4 py-2 rounded-xl text-sm text-text-muted
                       hover:text-text-primary transition-colors"
          >
            Clear
          </button>
        )}
        {lastDispatch && (
          <button
            onClick={() => setHelmNav('dispatch')}
            className="ml-auto text-xs text-text-muted hover:text-accent transition-colors"
          >
            Routed to <span className="text-text-primary">{lastDispatch}</span> →
          </button>
        )}
      </div>
    </div>
  )
}

function ProjectsContent() {
  return (
    <div className="flex flex-col gap-4 w-full max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-0.5">Projects</h2>
        <p className="text-xs text-text-muted">Group related tasks and conversations into projects.</p>
      </div>
      <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-border rounded-xl">
        <span className="text-3xl opacity-30">◫</span>
        <p className="text-sm text-text-muted">No projects yet</p>
        <button className="text-xs text-accent hover:underline">Create your first project →</button>
      </div>
    </div>
  )
}

// Format a unix ms timestamp as a relative "X ago" string
function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000)  return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// Convert a datetime-local string ("2026-04-19T14:30") to unix ms, or undefined
function parseLocalDateTime(value: string): number | undefined {
  if (!value) return undefined
  const ms = new Date(value).getTime()
  return isNaN(ms) ? undefined : ms
}

// Format unix ms as a datetime-local input value
function toLocalDateTimeValue(ms?: number): string {
  if (!ms) return ''
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

function ScheduledContent() {
  const scheduledTasks = useHelmStore((s) => s.scheduledTasks)
  const createScheduledTask = useHelmStore((s) => s.createScheduledTask)
  const deleteScheduledTask = useHelmStore((s) => s.deleteScheduledTask)
  const toggleScheduledTask = useHelmStore((s) => s.toggleScheduledTask)

  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cadence, setCadence] = useState<Cadence>('daily')
  const [scheduledForStr, setScheduledForStr] = useState('')

  // Sort: enabled first (so disabled ones drop to bottom), then newest first.
  const sorted = useMemo(() => {
    return Object.values(scheduledTasks).sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return b.createdAt - a.createdAt
    })
  }, [scheduledTasks])

  const scheduledFor = parseLocalDateTime(scheduledForStr)
  const onceValid = cadence !== 'once' || (!!scheduledFor && scheduledFor > Date.now())
  const canSave = label.trim().length > 0 && prompt.trim().length > 0 && onceValid

  const save = () => {
    if (!canSave) return
    createScheduledTask({
      label: label.trim(),
      prompt: prompt.trim(),
      cadence,
      ...(cadence === 'once' && scheduledFor ? { scheduledFor } : {}),
    })
    setLabel('')
    setPrompt('')
    setCadence('daily')
    setScheduledForStr('')
    setShowForm(false)
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary mb-0.5">Scheduled</h2>
          <p className="text-xs text-text-muted">Set up tasks that run on a schedule or trigger on events.</p>
        </div>
        {!showForm && sorted.length > 0 && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                       hover:bg-accent-hover transition-colors shrink-0"
          >
            + New
          </button>
        )}
      </div>

      {showForm ? (
        <div className="flex flex-col gap-3 p-4 border border-border rounded-xl bg-surface">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Morning vault summary"
              className="w-full bg-background border border-border rounded-lg px-3 py-2
                         text-sm text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Summarize yesterday's session logs from the vault and surface any open loops."
              className="w-full bg-background border border-border rounded-lg px-3 py-2
                         text-sm text-text-primary placeholder:text-text-muted resize-none
                         focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Cadence</label>
            <CustomSelect
              value={CADENCE_LABELS[cadence]}
              onChange={(v) => {
                const entry = (Object.entries(CADENCE_LABELS) as [Cadence, string][])
                  .find(([, label]) => label === v)
                if (entry) setCadence(entry[0])
              }}
              options={Object.values(CADENCE_LABELS)}
            />
          </div>
          {cadence === 'once' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Run at</label>
              <input
                type="datetime-local"
                value={scheduledForStr}
                onChange={(e) => setScheduledForStr(e.target.value)}
                min={toLocalDateTimeValue(Date.now())}
                className="w-full bg-background border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary focus:outline-none focus:border-accent/40
                           transition-colors [color-scheme:dark]"
              />
              {scheduledForStr && scheduledFor && scheduledFor <= Date.now() && (
                <p className="text-[11px] text-error">Pick a future date and time</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              disabled={!canSave}
              onClick={save}
              className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                         hover:bg-accent-hover transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Task
            </button>
            <button
              onClick={() => { setShowForm(false); setLabel(''); setPrompt(''); setScheduledForStr('') }}
              className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-border rounded-xl">
          <span className="text-3xl opacity-30">◷</span>
          <p className="text-sm text-text-muted">No scheduled tasks</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-accent hover:underline"
          >
            Schedule a task →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 px-3 py-2.5 bg-surface border border-border rounded-xl
                          transition-opacity ${t.enabled ? '' : 'opacity-50'}`}
            >
              <button
                onClick={() => toggleScheduledTask(t.id)}
                className={`w-8 h-4 rounded-full transition-colors shrink-0 relative
                            ${t.enabled ? 'bg-accent' : 'bg-surface-active'}`}
                title={t.enabled ? 'Pause' : 'Resume'}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform
                                  ${t.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">{t.label}</p>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-active text-text-muted shrink-0">
                    {CADENCE_LABELS[t.cadence]}
                  </span>
                </div>
                <p className="text-xs text-text-muted truncate">{t.prompt}</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {t.lastRunAt
                    ? `Last run: ${timeAgo(t.lastRunAt)}`
                    : t.cadence === 'once' && t.scheduledFor
                      ? `Scheduled: ${new Date(t.scheduledFor).toLocaleString()}`
                      : 'Never run'}
                </p>
              </div>
              {/* Run now — fires the task immediately via cron bridge */}
              <button
                onClick={() => window.tower.cronRunNow(t)}
                className="w-6 h-6 flex items-center justify-center rounded text-text-muted
                           hover:text-accent hover:bg-accent/10 transition-all shrink-0"
                title="Run now"
              >
                <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
                  <path d="M1 1.5v7l7-3.5L1 1.5z" />
                </svg>
              </button>
              <button
                onClick={() => deleteScheduledTask(t.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-text-muted
                           hover:text-error hover:bg-error/10 transition-all shrink-0"
                title="Delete"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CustomizeContent() {
  return (
    <div className="flex flex-col gap-5 w-full max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-0.5">Customize Helm</h2>
        <p className="text-xs text-text-muted">Configure how Helm operates, what tools it can use, and its behavior.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide border-b border-border pb-1.5">
          Tool Permissions
        </h3>
        {[
          { label: 'File system access',  desc: 'Read and write files on disk',      on: true  },
          { label: 'Shell execution',     desc: 'Run terminal commands',             on: true  },
          { label: 'Web browsing',        desc: 'Open and interact with websites',   on: false },
          { label: 'Git operations',      desc: 'Run git commands on repos',         on: true  },
          { label: 'Process management',  desc: 'List and kill system processes',    on: false },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm text-text-primary">{item.label}</p>
              <p className="text-xs text-text-muted">{item.desc}</p>
            </div>
            <div className={`w-8 h-4 rounded-full transition-colors cursor-pointer shrink-0 ${item.on ? 'bg-accent' : 'bg-surface-active'}`} />
          </div>
        ))}
      </section>
    </div>
  )
}

function DispatchContent() {
  const agents = useHelmStore((s) => s.agents)
  const toggleAgent = useHelmStore((s) => s.toggleAgent)

  // Stable order — we don't want toggling to shuffle the list.
  const ordered: AgentId[] = ['code', 'research', 'file', 'schedule']

  return (
    <div className="flex flex-col gap-5 w-full max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-0.5">Dispatch</h2>
        <p className="text-xs text-text-muted">
          Route tasks to specialized agents. Toggle an agent off to exclude it from auto-routing. Counts update as tasks are dispatched.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {ordered.map((id) => {
          const state = agents[id]
          const meta = AGENT_META[id]
          return (
            <div
              key={id}
              className={`flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl
                          transition-opacity ${state.enabled ? '' : 'opacity-50'}`}
            >
              <span className="text-xl w-6 text-center text-text-muted">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{meta.name}</p>
                <p className="text-xs text-text-muted">{meta.desc}</p>
              </div>
              <span
                className="text-[10px] font-mono tabular-nums text-text-muted shrink-0"
                title="Tasks routed"
              >
                {state.tasksRouted} routed
              </span>
              <button
                onClick={() => toggleAgent(id)}
                className={`w-8 h-4 rounded-full transition-colors shrink-0 relative
                            ${state.enabled ? 'bg-accent' : 'bg-surface-active'}`}
                title={state.enabled ? 'Disable' : 'Enable'}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform
                                  ${state.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── HelmPane ─────────────────────────────────────────────────────────────────

export function HelmPane() {
  const { helmNav } = useUIStore()
  const helmConvId = useUIStore((s) => s.helmConvId)

  const formContent = ({
    'chat':      null, // handled above by isChatView
    'new-task':  <NewTaskContent />,
    'projects':  <ProjectsContent />,
    'scheduled': <ScheduledContent />,
    'customize': <CustomizeContent />,
    'dispatch':  <DispatchContent />,
  } as Record<string, React.ReactNode>)[helmNav]

  return (
    <div className="flex h-full overflow-hidden">
      {/*
        Center column: flex-col gives a proper containing block so that
        centering works correctly in all child views.
        — Chat/conv views fill the column directly (h-full chain works)
        — Form views scroll inside a flex-1 child; centering uses a separate
          inner wrapper (flex justify-center) so overflow never interferes.
      */}
      <div className="flex-1 flex flex-col min-w-0">
        {helmConvId ? (
          <HelmChatView />
        ) : helmNav === 'chat' ? (
          <HelmChatContent />
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex justify-center px-6 py-6">
              <div className="w-full max-w-xl min-w-0">
                {formContent}
              </div>
            </div>
          </div>
        )}
      </div>
      <RightPanel />
    </div>
  )
}
