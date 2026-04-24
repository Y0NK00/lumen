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
    <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/25
                    flex items-center justify-center shrink-0 mt-0.5">
      <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.8" strokeLinejoin="round"/>
        <circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
      </svg>
    </div>
  )
}

/** Pulsing dots shown while streaming */
function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 h-5 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent/60"
          style={{ animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  )
}

/** Starter prompt chips shown on empty state */
const STARTERS = [
  'Explain a concept to me',
  'Help me write something',
  'Debug my code',
  'Brainstorm ideas',
]

interface MessageListProps {
  messages: DisplayMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)

  // Only auto-scroll when a new message is appended — not on every delta.
  // Calling scrollIntoView on every delta causes mobile Safari to stutter badly.
  useEffect(() => {
    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-6" data-message-list>
        {/* Logo + greeting */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20
                          flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
            </svg>
          </div>
          <div>
            <p className="text-[17px] font-semibold text-text-primary">How can I help?</p>
            <p className="text-[13px] text-text-muted mt-0.5">Powered by Claude</p>
          </div>
        </div>

        {/* Starter chips */}
        <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
          {STARTERS.map((s) => (
            <button
              key={s}
              className="text-left px-3 py-2.5 rounded-xl border border-border bg-surface
                         text-[12.5px] text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         hover:border-border/80 transition-all duration-150 leading-snug"
            >
              {s}
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
              <div className="max-w-[80%] bg-surface-active border border-border/80
                              rounded-2xl rounded-tr-md px-4 py-2.5">
                <p className="text-[14.5px] text-text-primary leading-[1.65] whitespace-pre-wrap break-words">
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
