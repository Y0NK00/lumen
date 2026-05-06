import { useEffect, useRef } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { DisplayMessage } from '../stores/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import { FileCard } from './FileCard'

function messageText(msg: DisplayMessage): string {
  if ('isStreaming' in msg && msg.isStreaming) return msg.content
  const sm = msg as { content: Array<{ type: string; text?: string }> }
  return sm.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
}

/** Resend icon button — always visible at low opacity on mobile (no hover state on touch) */
function ResendButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Resend message"
      onClick={onClick}
      title="Resend"
      className="w-6 h-6 flex items-center justify-center rounded-lg transition-all duration-150 mt-1 active:scale-90 opacity-45 hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] active:opacity-100 active:text-[var(--color-accent)]"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
    </button>
  )
}

/** Lumen avatar — small purple hexagon dot */
function LumenAvatar() {
  return (
    <div
      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-[var(--color-accent)]"
      style={{
        background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <circle cx="10" cy="10" r="2.5" fill="currentColor"/>
      </svg>
    </div>
  )
}

/** Pulsing dots shown while the first streaming token arrives */
function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 h-5 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 60%, transparent)',
            animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/** Starter prompt chips — title + subtitle + arrow */
const STARTERS_CHAT: { title: string; sub: string }[] = [
  { title: 'Explain a concept',    sub: 'Simple, clear breakdown' },
  { title: 'Help me write',        sub: 'Draft, edit, or improve' },
  { title: 'Debug my code',        sub: 'Find and fix the issue' },
  { title: 'Brainstorm ideas',     sub: 'Explore options together' },
]

const STARTERS_COWORK: { title: string; sub: string }[] = [
  { title: 'Plan my week',       sub: 'Prioritize and batch tasks' },
  { title: 'Draft a follow-up',  sub: 'Email or message template' },
  { title: 'Summarize a thread', sub: 'Turn noise into next steps' },
]

const STARTERS_CODE: { title: string; sub: string }[] = [
  { title: 'Review this diff',    sub: 'Risks, tests, and refactors' },
  { title: 'Explain an error',    sub: 'Stack trace → root cause' },
  { title: 'Scaffold a feature',  sub: 'Files and API shape' },
]

interface MessageListProps {
  messages: DisplayMessage[]
  onResend?: (content: string) => void
  isStreaming?: boolean
}

export function MessageList({ messages, onResend, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)
  const workspace = useWorkspaceStore((s) => s.mode)
  const user = useAuthStore((s) => s.user)
  const firstName = user?.displayName?.split(/\s+/)[0] ?? user?.email?.split('@')[0] ?? 'there'

  // Scroll to bottom whenever a new message is added (user sends or assistant reply starts)
  useEffect(() => {
    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length
      const el = containerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  // While streaming, run a RAF loop that sticky-scrolls only if user is near the bottom.
  // This avoids firing scrollIntoView 30x/sec which causes extra repaints on iOS.
  useEffect(() => {
    if (!isStreaming) return
    let rafId: number
    const tick = () => {
      const el = containerRef.current
      if (el) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (distFromBottom < 150) el.scrollTop = el.scrollHeight
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isStreaming])

  const starters =
    workspace === 'cowork' ? STARTERS_COWORK : workspace === 'code' ? STARTERS_CODE : STARTERS_CHAT

  const emptyShellClass =
    workspace === 'chat'
      ? ''
      : 'dot-grid-bg'

  if (messages.length === 0) {
    const title =
      workspace === 'cowork'
        ? "Let's knock something off your list"
        : workspace === 'code'
          ? `What's up next, ${firstName}?`
          : 'How can I help?'
    const subtitle =
      workspace === 'chat'
        ? 'Powered by Claude'
        : workspace === 'cowork'
          ? 'Cowork workspace — same column as Chat, separate history.'
          : 'Code workspace — separate history from Chat and Cowork.'

    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center min-h-0 overflow-y-auto ${emptyShellClass}`}
        data-message-list
      >
        <div className="w-[min(100%,680px)] mx-auto flex flex-col items-center justify-center gap-5 px-5 sm:px-6 pb-6 py-8 box-border">
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
                boxShadow: '0 0 24px color-mix(in srgb, var(--color-accent) 15%, transparent)',
              }}
            >
              <span className="text-[22px] leading-none" aria-hidden>
                {workspace === 'code' ? '☀' : '✦'}
              </span>
            </div>
            <div>
              <p
                className={`text-[18px] sm:text-[20px] font-semibold sm:font-normal ${workspace !== 'chat' ? 'font-display' : ''}`}
                style={{ letterSpacing: '-0.3px', color: 'var(--color-text-primary)' }}
              >
                {title}
              </p>
              <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full max-w-sm">
            {starters.map((s) => (
              <button
                key={s.title}
                type="button"
                className="group flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all duration-150 bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] hover:border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)]"
                onClick={() => onResend?.(s.title)}
              >
                <div>
                  <p className="text-[13.5px] font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                    {s.title}
                  </p>
                  <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{s.sub}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 ml-3 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <path d="M3 7h8M7 3l4 4-4 4"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      data-message-list
    >
      <div className="w-[min(100%,680px)] mx-auto px-5 sm:px-6 py-4 space-y-1 box-border">
      {messages.map((msg) => {
        const text = messageText(msg)
        const isUser = msg.role === 'user'
        const isStreaming = 'isStreaming' in msg && msg.isStreaming
        const isEmpty = !text && isStreaming

        if (isUser) {
          return (
            <div key={msg.id} className="group flex justify-end items-start gap-1.5 py-1">
              {onResend && (
                <ResendButton onClick={() => onResend(text)} />
              )}
              <div
                className="max-w-[80%] rounded-2xl rounded-tr-[4px] px-4 py-2.5"
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent-light) 0%, var(--color-accent-hover) 60%, var(--color-accent-dark) 100%)',
                  boxShadow: '0 2px 12px 2px color-mix(in srgb, var(--color-accent) 25%, transparent)',
                }}
              >
                <p className="text-[14.5px] text-white leading-[1.65] whitespace-pre-wrap break-words">
                  {text}
                </p>
              </div>
            </div>
          )
        }

        // AI message — no bubble, avatar on left
        const fileBlocks = (Array.isArray(msg.content) ? (msg.content as Array<{ type: string; file?: unknown }>).filter((b) => b.type === 'file_event') : [])
        return (
          <div key={msg.id} className="flex gap-2.5 py-1.5">
            <LumenAvatar />
            <div className="flex-1 min-w-0 overflow-hidden pt-0.5">
              {fileBlocks.map((b, idx) => (
                <FileCard key={`${msg.id}-file-${idx}`} file={b.file as never} />
              ))}
              {isEmpty ? (
                <StreamingIndicator />
              ) : (
                <MarkdownRenderer content={text} isStreaming={isStreaming} />
              )}
            </div>
          </div>
        )
      })}
      <div className="h-2" />
      </div>
    </div>
  )
}
