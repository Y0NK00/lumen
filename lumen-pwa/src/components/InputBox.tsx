import { useRef, useCallback, useEffect } from 'react'

interface InputBoxProps {
  onSend: (content: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function InputBox({ onSend, onStop, isStreaming, disabled = false }: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus()
  }, [isStreaming])

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  const handleSend = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const content = el.value.trim()
    if (!content || disabled) return
    onSend(content)
    el.value = ''
    el.style.height = 'auto'
  }, [onSend, disabled])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="px-4 pb-5 pt-2 shrink-0 w-full max-w-[840px] mx-auto">
      <div className={[
        'flex items-end gap-3 rounded-2xl border px-4 py-3 transition-all duration-150 shadow-sm',
        isStreaming || disabled
          ? 'border-border bg-surface/60'
          : 'border-border bg-surface hover:border-accent/30 focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]',
      ].join(' ')}>

        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={isStreaming ? 'Generating…' : 'Message Lumen… (Shift+Enter for newline)'}
          disabled={disabled}
          onInput={resize}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none bg-transparent border-0 text-[14px] text-text-primary
                     placeholder:text-text-muted outline-none leading-[1.55]
                     max-h-[200px] overflow-y-auto py-1"
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            title="Stop generation"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl
                       bg-error/15 text-error hover:bg-error/25 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled}
            title="Send (Enter)"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl
                       bg-accent text-white hover:bg-accent-hover
                       transition-colors active:scale-95 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1L6.5 12M6.5 1L2 5.5M6.5 1L11 5.5"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-text-muted">
        Claude API · Shift+Enter for newline
      </p>
    </div>
  )
}
