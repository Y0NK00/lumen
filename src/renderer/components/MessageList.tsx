import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message } from '../stores/chatStore'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="text-xs text-text-muted hover:text-text-primary transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

interface CodeProps { inline?: boolean; className?: string; children?: React.ReactNode }

function CodeBlock({ inline, className, children }: CodeProps) {
  const language = /language-(\w+)/.exec(className ?? '')?.[1] ?? 'text'
  const code = String(children).replace(/\n$/, '')
  if (inline) {
    return <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-code-inline text-text-primary">{children}</code>
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
        customStyle={{ margin: 0, padding: '12px 16px', fontSize: '13px', lineHeight: '1.5', background: 'var(--color-code-bg)' }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
      >{code}</SyntaxHighlighter>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isEmpty = !message.content && message.isStreaming

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-accent shrink-0 mr-3 mt-0.5 flex items-center justify-center">
          <span className="text-xs">💡</span>
        </div>
      )}
      <div className={[
        'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isUser ? 'bg-user-bubble text-text-primary rounded-tr-sm' : 'bg-assistant-bubble text-text-primary rounded-tl-sm',
      ].join(' ')}>
        {message.error && <p className="text-error text-xs mb-1">{message.error}</p>}
        {isEmpty ? <ThinkingIndicator /> : isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: CodeBlock as any,
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{children}</a>
                ),
              }}
            >{message.content}</ReactMarkdown>
            {message.isStreaming && <span className="streaming-cursor" aria-hidden />}
          </div>
        )}
      </div>
    </div>
  )
}

export function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 60
  }

  useEffect(() => {
    if (!userScrolledUpRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    userScrolledUpRef.current = false
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length]) // eslint-disable-line

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center px-8 gap-3">
        <span className="text-5xl" aria-hidden>💡</span>
        <h2 className="text-lg font-semibold text-text-primary">What can I help with?</h2>
        <p className="text-sm text-text-muted max-w-sm">Ask anything. Your local Qwen model is ready.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-6">
      {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      <div ref={bottomRef} />
    </div>
  )
}