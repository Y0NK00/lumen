import { useState } from 'react'
import type { ToolCall } from '../stores/chatStore'

// ─── Tool name → human label ──────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  // File tools (Phase 4)
  read_file:          'Read File',
  write_file:         'Write File',
  list_dir:           'List Directory',
  // Browser tools (Phase 5)
  browser_navigate:   'Navigate',
  browser_get_content:'Read Page',
  browser_screenshot: 'Screenshot',
  browser_click:      'Click',
  browser_type:       'Type',
  // Future
  web_search:         'Web Search',
  run_command:        'Run Command',
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ')
}

// ─── Tool name → icon ─────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read_file:          '📄',
  write_file:         '💾',
  list_dir:           '📁',
  browser_navigate:   '🌐',
  browser_get_content:'📖',
  browser_screenshot: '📸',
  browser_click:      '👆',
  browser_type:       '⌨️',
  web_search:         '🔍',
  run_command:        '⚡',
}

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧'
}

// ─── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  if (status === 'running') {
    return (
      <span className="inline-block w-3.5 h-3.5 border-2 border-text-muted border-t-accent rounded-full animate-spin" />
    )
  }
  if (status === 'done') {
    return <span className="text-green-400 text-xs leading-none">✓</span>
  }
  return <span className="text-error text-xs leading-none">✗</span>
}

// ─── Collapsible panel ────────────────────────────────────────────────────────

interface CollapsibleProps {
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function Collapsible({ label, children, defaultOpen = false }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="mt-1.5 border border-border rounded overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
      >
        <span>{label}</span>
        <span className="ml-2 opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2.5 py-2 bg-code-bg border-t border-border overflow-x-auto">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ToolCallCardProps {
  toolCall: ToolCall & { imageDataUrl?: string }
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const hasInput  = toolCall.input && Object.keys(toolCall.input).length > 0
  const hasResult = toolCall.result !== undefined
  const isScreenshot = toolCall.name === 'browser_screenshot'

  return (
    <div className="mt-3 rounded-lg border border-border bg-assistant-bubble/50 px-3 py-2.5 text-xs">

      {/* ── Header: icon + tool name + status ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <StatusIcon status={toolCall.status} />
        <span className="text-base leading-none" aria-hidden>{toolIcon(toolCall.name)}</span>
        <span className="font-mono font-medium text-accent">{toolLabel(toolCall.name)}</span>
        {toolCall.status === 'running' && (
          <span className="text-text-muted italic">executing…</span>
        )}
        {toolCall.status === 'error' && (
          <span className="text-error italic">failed</span>
        )}
      </div>

      {/* ── Input (collapsible) ───────────────────────────────────────────── */}
      {hasInput && (
        <Collapsible label="Input">
          <pre className="text-text-secondary font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
        </Collapsible>
      )}

      {/* ── Result (collapsible) ─────────────────────────────────────────── */}
      {hasResult && (
        <>
          {isScreenshot && toolCall.imageDataUrl ? (
            // Screenshots render as an actual inline image
            <Collapsible label="Screenshot" defaultOpen>
              <img
                src={toolCall.imageDataUrl}
                alt="Browser screenshot"
                className="max-w-full rounded border border-border"
              />
            </Collapsible>
          ) : (
            <Collapsible label={toolCall.success ? 'Result' : 'Error'} defaultOpen>
              <pre
                className={[
                  'font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-48 overflow-y-auto',
                  toolCall.success ? 'text-text-secondary' : 'text-error',
                ].join(' ')}
              >
                {toolCall.result}
              </pre>
            </Collapsible>
          )}
        </>
      )}
    </div>
  )
}
