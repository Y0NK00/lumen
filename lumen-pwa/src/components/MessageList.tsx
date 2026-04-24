import { useEffect, useRef } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { DisplayMessage } from '../stores/appStore'

function messageText(msg: DisplayMessage): string {
  if ('isStreaming' in msg && msg.isStreaming) return msg.content
  const sm = msg as { content: Array<{ type: string; text?: string }> }
  return sm.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
}

/** Lumen avatar — small purple hexagon dot */
function LumenAvatar() {
  return (
    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)' }}>
      <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.8" strokeLinejoin="round"/>
        <circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
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
            background: 'rgba(139,92,246,0.6)',
            animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/** Starter prompt chips — title + subtitle + arrow */
const STARTERS: { title: string; sub: string }[] = [
  { title: 'Explain a concept',    sub: 'Simple, clear breakdown' },
  { title: 'Help me write',        sub: 'Draft, edit, or improve' },
  { title: 'Debug my code',        sub: 'Find and fix the issue' },
  { title: 'Brainstorm ideas',     sub: 'Explore options together' },
]

interface MessageListProps {
  messages: DisplayMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)

  useEffect(() => {
    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 pb-6" data-message-list>
        {/* Logo + greeting */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(139,92,246,0.1)',
              border: '1px solid rgba(139,92,246,0.2)',
              boxShadow: '0 0 24px rgba(139,92,246,0.15)',
            }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
            </svg>
          </div>
          <div>
            <p className="text-[18px] font-semibold text-text-primary" style={{ letterSpacing: '-0.3px' }}>
              How can I help?
            </p>
            <p className="text-[12.5px] text-text-muted mt-0.5">Powered by Claude</p>
          </div>
        </div>

        {/* Starter chips */}
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {STARTERS.map((s) => (
            <button
              key={s.title}
              className="group flex items-center justify-between px-4 py-3 rounded-xl
                         text-left transition-all duration-150"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.3)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--color-surface)'
              }}
            >
              <div>
                <p className="text-[13.5px] font-medium text-text-primary leading-snug">{s.title}</p>
                <p className="text-[11.5px] text-text-muted mt-0.5">{s.sub}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 text-text-muted ml-3 group-hover:text-accent transition-colors">
                <path d="M3 7h8M7 3l4 4-4 4"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1"
      data-message-list
    >
      {messages.map((msg) => {
        const text = messageText(msg)
        const isUser = msg.role === 'user'
        const isStreaming = 'isStreaming' in msg && msg.isStreaming
        const isEmpty = !text && isStreaming

        if (isUser) {
          return (
            <div key={msg.id} className="flex justify-end px-3 py-1">
              <div
                className="max-w-[80%] rounded-2xl rounded-tr-[4px] px-4 py-2.5"
                style={{
                  background: 'linear-gradient(135deg, #9f7aea 0%, #7c3aed 60%, #6d28d9 100%)',
                  boxShadow: '0 2px 12px 2px rgba(139,92,246,0.25)',
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
        return (
          <div key={msg.id} className="flex gap-2.5 px-3 py-1.5">
            <LumenAvatar />
            <div className="flex-1 min-w-0 overflow-hidden pt-0.5">
              {isEmpty ? (
                <StreamingIndicator />
              ) : (
                <MarkdownRenderer content={text} isStreaming={isStreaming} />
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} className="h-2" />
    </div>
  )
}
