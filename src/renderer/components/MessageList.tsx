import { useEffect, useRef } from 'react'
import type { Message } from '../stores/chatStore'
import { ToolCallCard } from './ToolCallCard'
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
          ? 'max-w-[72%] bg-surface border border-border text-text-primary px-4 py-3 rounded-tr-sm overflow-hidden break-words'
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
          <p className="whitespace-pre-wrap break-words text-[13.5px]">{message.content}</p>
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

            {/* Tool call cards */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-1 space-y-1">
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
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
