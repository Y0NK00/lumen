import { useEffect, useRef } from 'react'
import type { Message } from '../stores/chatStore'
import { ToolCallGroup } from './ToolCallCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ThinkingBlock, extractThinkingFromMessage } from './ThinkingBlock'
import { useSettingsStore } from '../stores/settingsStore'

// Density → bottom margin per message bubble
const DENSITY_MB = { compact: 'mb-2', comfortable: 'mb-5', spacious: 'mb-9' } as const

// ─── Single message bubble ────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message
  onOpenInArtifacts?: (code: string, language: string) => void
}

function MessageBubble({ message, onOpenInArtifacts }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isEmpty = !message.content && message.isStreaming && !message.toolCalls?.length
  const density = useSettingsStore((s) => s.density)
  const mb = DENSITY_MB[density]

  return (
    <div className={`flex w-full min-w-0 ${isUser ? 'justify-end' : 'justify-start'} ${mb} message-enter`}>

      {/* Assistant avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 shrink-0 mr-3 mt-0.5
                        flex items-center justify-center">
          <span className="text-sm leading-none">💡</span>
        </div>
      )}

      <div className={[
        // Assistant bubbles fill more of the rail (85%) so they don't feel
        // cramped; user bubbles stay narrower (72%) to keep their trailing
        // right-edge visually distinct.
        'min-w-0 rounded-2xl text-sm leading-relaxed',
        isUser
          ? 'max-w-[72%] bg-surface border border-border text-text-primary px-4 py-3 rounded-tr-sm break-anywhere'
          : 'max-w-[85%] text-text-primary overflow-x-hidden',
      ].join(' ')}>

        {/* Error */}
        {message.error && (
          <p className="text-error text-xs mb-2 px-1">{message.error}</p>
        )}

        {/* Empty streaming — pulsing dots */}
        {isEmpty ? (
          <ThinkingIndicator />
        ) : isUser ? (
          <div className="flex flex-col gap-2">
            {/* Inline attachment previews */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((att, idx) =>
                  att.type === 'image' ? (
                    <img
                      key={idx}
                      src={`data:${att.mimeType};base64,${att.data}`}
                      alt={att.name}
                      className="max-w-[240px] max-h-[200px] rounded-xl object-cover border border-border/40"
                    />
                  ) : (
                    <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/20 border border-border/30 text-[11.5px] text-text-muted">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                        <rect x="2" y="1" width="10" height="12" rx="1.5" />
                        <line x1="4.5" y1="5" x2="9.5" y2="5" />
                        <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" />
                      </svg>
                      <span>{att.name}</span>
                    </div>
                  )
                )}
              </div>
            )}
            {message.content && (
              <p className="whitespace-pre-wrap break-anywhere text-[13.5px]">{message.content}</p>
            )}
          </div>
        ) : (
          <div className="min-w-0">
            {/* Text content */}
            {message.content && (
              <>
                {(() => {
                  const { thinking, mainContent } = extractThinkingFromMessage(message.content)
                  return (
                    <>
                      {thinking && <ThinkingBlock content={thinking} />}
                      <MarkdownRenderer
                        content={mainContent}
                        onOpenInArtifacts={onOpenInArtifacts}
                      />
                    </>
                  )
                })()}
                {/* Blinking cursor while streaming */}
                {message.isStreaming && !message.toolCalls?.some((tc) => tc.status === 'running') && (
                  <span className="streaming-cursor" aria-hidden />
                )}
              </>
            )}

            {/* Tool calls — grouped into one collapsible row */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolCallGroup toolCalls={message.toolCalls} />
            )}

            {/* Waiting for tool result */}
            {!message.content && message.isStreaming && (
              <ThinkingIndicator />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

// ─── MessageList ──────────────────────────────────────────────────────────────

interface MessageListProps {
  messages: Message[]
  onOpenInArtifacts?: (code: string, language: string) => void
}

export function MessageList({ messages, onOpenInArtifacts }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    userScrolledUpRef.current = !atBottom
  }

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    userScrolledUpRef.current = false
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center px-8 gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <span className="text-xl">💡</span>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-1">What can I help with?</h2>
          <p className="text-xs text-text-muted max-w-xs">
            Ask anything — or ask Lumen to read a file, list a folder, run a command, or write something to disk.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden px-8 pt-5 pb-2 min-h-0"
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onOpenInArtifacts={onOpenInArtifacts}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
