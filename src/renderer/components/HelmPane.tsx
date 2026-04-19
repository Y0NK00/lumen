// src/renderer/components/HelmPane.tsx
// Helm mode — the task control center.
// Left panel: Progress, Working Folders, Context widgets.
// Right area: content for selected nav item.

import { useState, useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useChatStore } from '../stores/chatStore'
import {
  useHelmStore,
  CADENCE_LABELS,
  AGENT_META,
  type Cadence,
  type AgentId,
} from '../stores/helmStore'

// ─── Widget: Progress ─────────────────────────────────────────────────────────

interface Task {
  id: string
  label: string
  status: 'running' | 'queued' | 'done' | 'failed'
  model?: string
}

function ProgressWidget() {
  // Placeholder — will hook into a task store once Helm tasks are implemented
  const tasks: Task[] = []

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Progress</p>
      {tasks.length === 0 ? (
        <p className="text-xs text-text-muted italic">No active tasks</p>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              t.status === 'running' ? 'bg-accent animate-pulse' :
              t.status === 'queued'  ? 'bg-text-muted' :
              t.status === 'done'    ? 'bg-green-400' :
                                       'bg-error'
            }`} />
            <span className="text-xs text-text-primary truncate">{t.label}</span>
            {t.model && (
              <span className="text-[10px] text-text-muted font-mono ml-auto shrink-0">{t.model}</span>
            )}
          </div>
        ))
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

// ─── Right panel (pinned widgets) ─────────────────────────────────────────────

function RightPanel() {
  return (
    <aside className="w-[220px] shrink-0 flex flex-col border-l border-border bg-sidebar overflow-y-auto">
      <div className="px-4 pt-5 pb-4 flex flex-col gap-4">
        <ProgressWidget />
        <div className="border-t border-border" />
        <WorkingFoldersWidget />
        <div className="border-t border-border" />
        <ContextWidget />
      </div>
    </aside>
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

// Super-lightweight auto-routing heuristic for "Claude (Auto)". It's not
// trying to be smart — it just picks the best-fit enabled agent based on
// keywords. A real router will replace this when execution lands.
function classifyPrompt(prompt: string): AgentId {
  const p = prompt.toLowerCase()
  if (/\b(shell|bash|grep|git|compile|build|refactor|npm|pip|deploy|code|script|debug)\b/.test(p)) return 'code'
  if (/\b(research|search|summarize|compare|find out|look up|news|article|web)\b/.test(p))         return 'research'
  if (/\b(file|folder|organize|rename|move|copy|read|write|delete|clean up)\b/.test(p))            return 'file'
  if (/\b(schedule|every|daily|weekly|cron|recurring|remind)\b/.test(p))                           return 'schedule'
  return 'code' // sensible default — most workflows are code-adjacent
}

function NewTaskContent() {
  const [prompt, setPrompt] = useState('')
  const [agent, setAgent] = useState('Claude (Auto)')
  const [priority, setPriority] = useState('Normal')
  const [lastDispatch, setLastDispatch] = useState<string | null>(null)

  const agents = useHelmStore((s) => s.agents)
  const incrementAgentRouteCount = useHelmStore((s) => s.incrementAgentRouteCount)
  const setHelmNav = useUIStore((s) => s.setHelmNav)

  const dispatch = () => {
    if (!prompt.trim()) return
    // Only auto-route through enabled agents. If the picked agent is disabled,
    // fall back to the first enabled one; if none, degrade gracefully.
    const picked = classifyPrompt(prompt)
    const enabledIds = (Object.keys(agents) as AgentId[]).filter((id) => agents[id].enabled)
    const target: AgentId | null =
      agents[picked].enabled ? picked : (enabledIds[0] ?? null)

    if (target) {
      incrementAgentRouteCount(target)
      setLastDispatch(AGENT_META[target].name)
    } else {
      setLastDispatch('No enabled agents — open Dispatch to enable one')
    }
    setPrompt('')
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
          disabled={!prompt.trim()}
          onClick={dispatch}
          className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium
                     hover:bg-accent-hover transition-colors active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Dispatch Task
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

function ScheduledContent() {
  const scheduledTasks = useHelmStore((s) => s.scheduledTasks)
  const createScheduledTask = useHelmStore((s) => s.createScheduledTask)
  const deleteScheduledTask = useHelmStore((s) => s.deleteScheduledTask)
  const toggleScheduledTask = useHelmStore((s) => s.toggleScheduledTask)

  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cadence, setCadence] = useState<Cadence>('daily')

  // Sort: enabled first (so disabled ones drop to bottom), then newest first.
  const sorted = useMemo(() => {
    return Object.values(scheduledTasks).sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return b.createdAt - a.createdAt
    })
  }, [scheduledTasks])

  const canSave = label.trim().length > 0 && prompt.trim().length > 0

  const save = () => {
    if (!canSave) return
    createScheduledTask({ label: label.trim(), prompt: prompt.trim(), cadence })
    setLabel('')
    setPrompt('')
    setCadence('daily')
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
              onClick={() => { setShowForm(false); setLabel(''); setPrompt('') }}
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
              </div>
              <button
                onClick={() => deleteScheduledTask(t.id)}
                className="text-text-muted hover:text-error transition-colors text-sm shrink-0"
                title="Delete"
              >
                ×
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

  const content = {
    'new-task':  <NewTaskContent />,
    'projects':  <ProjectsContent />,
    'scheduled': <ScheduledContent />,
    'customize': <CustomizeContent />,
    'dispatch':  <DispatchContent />,
  }[helmNav]

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Centering wrapper — content's max-w-xl now sits in the middle of
            the available space instead of hugging the left edge. */}
        <div className="flex justify-center px-8 py-6">
          {content}
        </div>
      </div>
      <RightPanel />
    </div>
  )
}
