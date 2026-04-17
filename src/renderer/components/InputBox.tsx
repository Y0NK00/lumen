import { useRef, useCallback, useEffect } from 'react'

interface InputBoxProps {
  onSend: (content: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function InputBox({ onSend, onStop, isStreaming, disabled = false }: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => { if (!isStreaming) textareaRef.current?.focus() }, [isStreaming])

  const handleSend = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const content = el.value.trim()
    if (!content || isStreaming || disabled) return
    onSend(content)
    el.value = ''
    el.style.height = 'auto'
  }, [onSend, isStreaming, disabled])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  return (
    <div className="px-4 pb-4 pt-2">
      <div className={[
        'flex items-end gap-2 rounded-2xl border px-4 py-3 transition-colors',
        isStreaming || disabled
          ? 'border-border bg-surface opacity-70'
          : 'border-border bg-surface focus-within:border-accent/50',
      ].join(' ')}>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={isStreaming ? 'Waiting for response…' : 'Message Lumen  (Shift+Enter for newline)'}
          disabled={isStreaming || disabled}
          onInput={resize}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none leading-relaxed max-h-[200px] overflow-y-auto"
        />
        {isStreaming ? (
          <button onClick={onStop} title="Stop" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-error/20 text-error hover:bg-error/30 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/></svg>
          </button>
        ) : (
          <button onClick={handleSend} disabled={disabled} title="Send (Enter)" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors active:scale-95 disabled:opacity-50">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L7 13M7 1L2 6M7 1L12 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-xs text-text-muted">
        {isStreaming ? 'Generating…' : 'Runs locally on your Ollama instance. Nothing leaves your machine.'}
      </p>
    </div>
  )
}