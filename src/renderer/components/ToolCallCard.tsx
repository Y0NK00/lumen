import { useState } from 'react'
import type { ToolCall } from '../stores/chatStore'
import { DiffViewer } from './DiffViewer'

// ─── Tool metadata ────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: string; group: string }> = {
  read_file:           { label: 'Read',       icon: '📄', group: 'file'    },
  write_file:          { label: 'Write',      icon: '💾', group: 'file'    },
  list_dir:            { label: 'List',       icon: '📁', group: 'file'    },
  browser_navigate:    { label: 'Navigate',   icon: '🌐', group: 'browser' },
  browser_get_content: { label: 'Read page',  icon: '📖', group: 'browser' },
  browser_screenshot:  { label: 'Screenshot', icon: '📸', group: 'browser' },
  browser_click:       { label: 'Click',      icon: '👆', group: 'browser' },
  browser_type:        { label: 'Type',       icon: '⌨️', group: 'browser' },
  web_search:          { label: 'Search',     icon: '🔍', group: 'search'  },
  run_command:         { label: 'Run',        icon: '⚡', group: 'shell'   },
  grep:                { label: 'Grep',       icon: '🔎', group: 'shell'   },
}

function meta(name: string) {
  return TOOL_META[name] ?? { label: name.replace(/_/g, ' '), icon: '🔧', group: 'other' }
}

// Short summary shown in the list row — URL, path, command, query, etc.
function rowSummary(tc: ToolCall): string {
  const inp = (tc.input ?? {}) as Record<string, unknown>
  switch (tc.name) {
    case 'browser_navigate': return stripProtocol(String(inp.url ?? ''))
    case 'browser_get_content': return stripProtocol(String(inp.url ?? ''))
    case 'browser_click':    return String(inp.selector ?? '').slice(0, 50)
    case 'browser_type':     return `"${String(inp.text ?? '').slice(0, 40)}"`
    case 'read_file':
    case 'write_file':
    case 'list_dir':         return basename(String(inp.path ?? ''))
    case 'run_command':
    case 'grep':             return String(inp.command ?? inp.pattern ?? '').slice(0, 55)
    case 'web_search':       return `"${String(inp.query ?? '').slice(0, 50)}"`
    default:                 return ''
  }
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '')
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// ─── Grouped summary label ────────────────────────────────────────────────────
// "Searched 2 sources · Ran 3 commands" etc.

export function toolGroupSummary(toolCalls: ToolCall[]): string {
  const counts: Record<string, number> = {}
  for (const tc of toolCalls) {
    const g = meta(tc.name).group
    counts[g] = (counts[g] ?? 0) + 1
  }
  const parts: string[] = []
  if (counts.browser || counts.search) {
    const n = (counts.browser ?? 0) + (counts.search ?? 0)
    parts.push(`Searched ${n} source${n !== 1 ? 's' : ''}`)
  }
  if (counts.file) {
    const n = counts.file
    parts.push(`Accessed ${n} file${n !== 1 ? 's' : ''}`)
  }
  if (counts.shell) {
    const n = counts.shell
    parts.push(`Ran ${n} command${n !== 1 ? 's' : ''}`)
  }
  if (counts.other) {
    const n = counts.other
    parts.push(`${n} tool${n !== 1 ? 's' : ''}`)
  }
  return parts.join(' · ') || `${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''}`
}

// ─── Single row (inside the expanded list) ────────────────────────────────────

function ToolRow({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const { label, icon } = meta(tc.name)
  const summary = rowSummary(tc)
  const isScreenshot = tc.name === 'browser_screenshot'

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/5 transition-colors text-left w-full group"
      >
        {/* Status dot */}
        {tc.status === 'running' ? (
          <span className="w-3 h-3 border border-text-muted border-t-accent rounded-full animate-spin shrink-0" />
        ) : tc.status === 'done' ? (
          <span className="text-[10px] text-green-400 shrink-0 w-3 text-center">✓</span>
        ) : (
          <span className="text-[10px] text-error shrink-0 w-3 text-center">✗</span>
        )}

        <span className="text-sm leading-none shrink-0" aria-hidden>{icon}</span>

        <span className="text-xs text-text-muted shrink-0">{label}</span>

        {summary && (
          <span className="text-xs text-text-secondary truncate min-w-0 flex-1">{summary}</span>
        )}

        {/* Expand chevron — only show if there's something to expand */}
        {(tc.result || isScreenshot) && (
          <svg
            width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 text-text-muted opacity-0 group-hover:opacity-60 transition-all
                        ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="1,2.5 4,5.5 7,2.5" />
          </svg>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="ml-8 mb-1 rounded-lg overflow-hidden border border-border/60 bg-code-bg">
          {isScreenshot && tc.imageDataUrl ? (
            <img src={tc.imageDataUrl} alt="Screenshot" className="max-w-full" />
          ) : tc.name === 'write_file' && tc.newContent ? (
            <DiffViewer
              oldContent={(tc as any).oldContent ?? ''}
              newContent={tc.newContent}
              filename={String(tc.input?.path ?? '')}
            />
          ) : (
            <pre className={`px-3 py-2.5 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all max-h-52 overflow-y-auto
                            ${tc.success !== false ? 'text-text-secondary' : 'text-error'}`}>
              {tc.result}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ToolCallGroup — the public export used by MessageList ────────────────────
// Renders all tool calls for a message as a single collapsible group.

interface ToolCallGroupProps {
  toolCalls: (ToolCall & { imageDataUrl?: string; oldContent?: string | null; newContent?: string | null })[]
}

export function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
  const [open, setOpen] = useState(false)
  if (toolCalls.length === 0) return null

  const isRunning = toolCalls.some((tc) => tc.status === 'running')
  const hasError   = toolCalls.some((tc) => tc.status === 'error')
  const summary    = toolGroupSummary(toolCalls)

  return (
    <div className="my-2 rounded-xl border border-border/50 bg-surface/40 overflow-hidden text-xs">
      {/* ── Header row — click to expand/collapse ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        {isRunning ? (
          <span className="w-3 h-3 border border-text-muted border-t-accent rounded-full animate-spin shrink-0" />
        ) : hasError ? (
          <span className="text-error shrink-0">✗</span>
        ) : (
          <span className="text-green-400 shrink-0">✓</span>
        )}

        <span className="flex-1 text-text-secondary font-medium">
          {isRunning ? `Working…` : summary}
        </span>

        {/* Live step name while running */}
        {isRunning && (() => {
          const running = toolCalls.find((tc) => tc.status === 'running')
          return running ? (
            <span className="text-text-muted truncate max-w-[200px]">
              {meta(running.name).label}
              {rowSummary(running) && ` · ${rowSummary(running)}`}
            </span>
          ) : null
        })()}

        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor"
          strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="1,2.5 4,5.5 7,2.5" />
        </svg>
      </button>

      {/* ── Expanded list ── */}
      {open && (
        <div className="border-t border-border/50 px-3 py-1.5 flex flex-col">
          {toolCalls.map((tc) => (
            <ToolRow key={tc.id} tc={tc} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Legacy export (keep so old imports don't break) ─────────────────────────
// Anything still using <ToolCallCard> directly gets the row version.

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  return <ToolRow tc={toolCall} />
}
