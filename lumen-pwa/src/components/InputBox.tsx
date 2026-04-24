import { useRef, useCallback, useEffect, useState } from 'react'

interface InputBoxProps {
  onSend: (content: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

// Web Speech API — webkit prefix for Safari/iOS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionAPI: (new () => any) | undefined =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

export function InputBox({ onSend, onStop, isStreaming, disabled = false }: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus()
  }, [isStreaming])

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
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

  const toggleVoice = useCallback(() => {
    if (!SpeechRecognitionAPI) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const transcript = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join('')
      const el = textareaRef.current
      if (el) {
        el.value = transcript
        resize()
      }
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, resize])

  return (
    <div className="shrink-0 w-full border-t border-border bg-background">
      <div className="w-full max-w-3xl mx-auto px-3 py-3">
        <div className={[
          'flex items-end gap-2 rounded-2xl border px-3 py-2.5 transition-all duration-150',
          isStreaming || disabled
            ? 'border-border bg-surface/60'
            : 'border-border bg-surface focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]',
        ].join(' ')}>

          {/* Voice button — only shown when Speech API is available and not streaming */}
          {!!SpeechRecognitionAPI && !isStreaming && (
            <button
              onClick={toggleVoice}
              title={isListening ? 'Stop listening' : 'Voice input'}
              className={[
                'shrink-0 w-8 h-8 flex items-center justify-center rounded-xl transition-colors',
                isListening
                  ? 'bg-error/20 text-error animate-pulse'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
              ].join(' ')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="9" y1="22" x2="15" y2="22" />
              </svg>
            </button>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              isListening ? '🎤 Listening…' :
              isStreaming  ? 'Generating…'  :
              'Message Lumen…'
            }
            disabled={disabled || isListening}
            onInput={resize}
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none bg-transparent border-0 text-[14px] text-text-primary
                       placeholder:text-text-muted outline-none leading-[1.6]
                       max-h-[160px] overflow-y-auto py-0.5"
          />

          {isStreaming ? (
            <button
              onClick={onStop}
              title="Stop"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
                         bg-error/15 text-error hover:bg-error/25 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={disabled}
              title="Send"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
                         bg-accent text-white hover:bg-accent-hover
                         transition-colors active:scale-95 disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L6.5 12M6.5 1L2 5.5M6.5 1L11 5.5"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-text-muted select-none">
          Claude API · Enter to send
        </p>
      </div>
    </div>
  )
}
