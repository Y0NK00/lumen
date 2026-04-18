import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message } from '../stores/chatStore'
import { ToolCallCard } from './ToolCallCard'
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock, extractThinkingFromMessage } from './ThinkingBlock';

// =============================================================================
// PHASE 4 CHANGES vs Phase 2:
//   - Imports ToolCallCard
//   - MessageBubble renders toolCalls below text content (assistant only)
//   - No other changes
// =============================================================================

// ─── Code block renderer ──────────────────────────────────────────────────────

interface CodeProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

function CodeBlock({ inline, className, children }: CodeProps) {
  const language = /language-(\w+)/.exec(className ?? '')?.[1] ?? 'text'
  const code = String(children).replace(/\n$/, '')

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-code-inline text-text-primary">
        {children}
      </code>
    )
  }

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-code-header border-b border-border">
        <span className="text-xs text-text-muted font-mono">{language}</span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 16px',
          fontSize: '13px',
          lineHeight: '1.5',
          background: 'var(--color-code-bg)',
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="text-xs text-text-muted hover:text-text-primary transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ─── Single message bubble ────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message
  onOpenInArtifacts: (code: string, language: string) => void; // ADD
}

function MessageBubble({ message, onOpenInArtifacts }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isEmpty = !message.content && message.isStreaming && !message.toolCalls?.length

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {/* Assistant avatar dot */}
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-accent shrink-0 mr-3 mt-0.5 flex items-center justify-center">
          <span className="text-xs">💡</span>
        </div>
      )}

      <div
        className={[
          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-user-bubble text-text-primary rounded-tr-sm'
            : 'bg-assistant-bubble text-text-primary rounded-tl-sm',
        ].join(' ')}
      >
        {/* Error state */}
        {message.error && (
          <p className="text-error text-xs mb-1">{message.error}</p>
        )}

        {/* Empty streaming state — show pulsing dots */}
        {isEmpty ? (
          <ThinkingIndicator />
        ) : isUser ? (
          // User messages: plain text, preserve newlines
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          // Assistant messages: markdown + optional tool call cards
          <div className="prose prose-sm prose-invert max-w-none break-words">
            {/* Text content (may be empty if Claude went straight to tool use) */}
            {message.content && (
              <>
                {(() => {
                     const { thinking, mainContent } = extractThinkingFromMessage(message.content);
                     return (
                      <>
                         {thinking && <ThinkingBlock content={thinking} />}
                         <MarkdownRenderer
                         content={mainContent}
                         onOpenInArtifacts={onOpenInArtifacts}
                      />
                     </>
                     );
                })()}
                {/* Blinking cursor while streaming and no tool calls are running */}
                {message.isStreaming && !message.toolCalls?.some((tc) => tc.status === 'running') && (
                  <span className="streaming-cursor" aria-hidden />
                )}
              </>
            )}

            {/* ── Phase 4: Tool call cards ──────────────────────────────── */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="not-prose mt-1">
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}

            {/* Thinking indicator: no text yet but streaming (waiting for tool result) */}
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
    <div className="flex items-center gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

// ─── MessageList ──────────────────────────────────────────────────────────────

interface MessageListProps {
  messages: Message[]
    onOpenInArtifacts: (code: string, language: string) => void;
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
        <span className="text-5xl" aria-hidden>💡</span>
        <h2 className="text-lg font-semibold text-text-primary">What can I help with?</h2>
        <p className="text-sm text-text-muted max-w-sm">
          Ask anything — or ask Claude to read a file, list a folder, or write something to disk.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-6 py-6"
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} onOpenInArtifacts={onOpenInArtifacts} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
