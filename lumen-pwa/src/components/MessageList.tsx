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

interface MessageListProps {
  messages: DisplayMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)

  // Only scroll when a NEW message is added — not on every streaming delta.
  // Scroll-on-every-delta triggers a smooth-scroll fight that hangs mobile Safari.
  useEffect(() => {
    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted px-6">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="opacity-30">
          <path d="M18 4L32 11.5V24.5L18 32L4 24.5V11.5L18 4Z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="18" cy="18" r="4" fill="currentColor" />
        </svg>
        <p className="text-[14px]">Start a conversation</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-5" data-message-list>
      {messages.map((msg) => {
        const text = messageText(msg)
        const isUser = msg.role === 'user'
        const isStreaming = 'isStreaming' in msg && msg.isStreaming

        return (
          <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
              <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/30
                              flex items-center justify-center shrink-0 mt-0.5">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z"
                    stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="8" cy="8" r="2" fill="#8b5cf6" />
                </svg>
              </div>
            )}

            <div className={`${isUser
              ? 'max-w-[82%] bg-surface border border-border rounded-2xl rounded-tr-sm px-4 py-2.5'
              : 'flex-1 min-w-0 overflow-hidden'
            }`}>
              {isUser ? (
                <p className="text-[14px] text-text-primary leading-[1.6] whitespace-pre-wrap break-words">
                  {text}
                </p>
              ) : (
                <MarkdownRenderer content={text} isStreaming={isStreaming} />
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
