import { useRef, useCallback, useEffect, useState } from 'react'

interface InputBoxProps {
  onSend: (content: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  onSystemPrompt?: () => void
}

// Web Speech API — webkit prefix for Safari/iOS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionAPI: (new () => any) | undefined =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

export function InputBox({ onSend, onStop, isStreaming, disabled = false, onSystemPrompt }: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  const [hasText, setHasText] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  // Text that existed in the textarea before voice started — prepended to transcript
  const preVoiceTextRef = useRef<string>('')

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus()
  }, [isStreaming])

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
    setHasText(el.value.trim().length > 0)
  }, [])

  const handleSend = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const content = el.value.trim()
    if (!content || disabled) return
    onSend(content)
    el.value = ''
    el.style.height = 'auto'
    setHasText(false)
  }, [onSend, disabled])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const scrollMsgListToBottom = () => {
    const m = document.querySelector('[data-message-list]')
    if (m) m.scrollTop = m.scrollHeight
  }

  const toggleVoice = useCallback(() => {
    if (!SpeechRecognitionAPI) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    // Save any text already in the box so we can prepend it to the transcript
    preVoiceTextRef.current = textareaRef.current?.value.trim() ?? ''

    const recognition = new SpeechRecognitionAPI()
    // continuous: true keeps listening through natural pauses instead of stopping
    // after the first silence (the original bug causing early cutoff on iOS)
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) { transcript += e.results[i][0].transcript }
      const el = textareaRef.current
      if (el) {
        // Prepend any text that was in the box before voice started
        const prefix = preVoiceTextRef.current
        el.value = prefix ? `${prefix} ${transcript}` : transcript
        resize()
      }
    }

    recognition.onend = () => setIsListening(false)
    // On error, preserve existing text — don't wipe anything
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, resize])

  const canSend = hasText && !disabled && !isStreaming

  return (
    <div className="shrink-0 w-full flex justify-center bg-gradient-to-t from-background via-background/95 to-transparent pt-4 pb-3">
      {/* Explicit width + flex parent centers the composer in the main column (flex contexts can ignore mx-auto). */}
      <div className="w-[min(100%,680px)] shrink-0 px-5 sm:px-6 box-border">
        {/* Full-width pill — matches MessageList content column width */}
        <div
          className="flex w-full min-w-0 items-end gap-2.5 rounded-2xl px-5 py-4 transition-all duration-150"
          style={{
            background: 'var(--color-surface)',
            border: isStreaming || disabled
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(255,255,255,0.10)',
            boxShadow: isStreaming || disabled ? 'none' : undefined,
          }}
        >

          {/* System prompt button */}
          {!!onSystemPrompt && !isStreaming && (
            <button
              type="button"
              aria-label="Set system prompt"
              onClick={onSystemPrompt}
              title="System prompt"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-colors mb-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </button>
          )}

          {/* Voice button - hidden while streaming */}
          {!!SpeechRecognitionAPI && !isStreaming && (
            <button
              type="button"
              aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              onClick={toggleVoice}
              title={isListening ? 'Stop listening' : 'Voice input'}
              className={[
                'shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-colors mb-0.5',
                isListening
                  ? 'bg-error/20 text-error animate-pulse'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
              ].join(' ')}
            >
              {isListening ? (
                /* Waveform icon when active */
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 2v8M15 2v8M3 8v8M21 8v8M6 5v14M18 5v14M12 2v20"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="9" y1="22" x2="15" y2="22" />
                </svg>
              )}
            </button>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              isListening ? '🎤  Listening…' :
              isStreaming  ? 'Generating…'   :
              'Ask anything…'
            }
            disabled={disabled || isListening}
            onFocus={scrollMsgListToBottom}
            onInput={resize}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 resize-none bg-transparent border-0 text-[16px] text-text-primary
                       placeholder:text-text-muted outline-none leading-[1.6]
                       max-h-[320px] overflow-y-auto py-3 px-2 min-h-[3.5rem]"
          />

          {/* Action button — Stop while streaming, Send otherwise */}
          {isStreaming ? (
            <button
              type="button"
              aria-label="Stop generating"
              onClick={onStop}
              title="Stop generating"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl mb-0.5
                         bg-error/15 text-error hover:bg-error/25 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <rect x="1.5" y="1.5" width="6" height="6" rx="1.5" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              onClick={handleSend}
              disabled={!canSend}
              title="Send"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl mb-0.5 transition-all duration-150 active:scale-95"
              style={canSend ? {
                background: 'linear-gradient(135deg, var(--color-accent-light) 0%, var(--color-accent-dark) 100%)',
                boxShadow: '0 2px 8px 2px color-mix(in srgb, var(--color-accent) 35%, transparent)',
                color: 'white',
              } : {
                background: 'var(--color-surface-active)',
                color: 'var(--color-text-muted)',
                cursor: 'not-allowed',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L6.5 12M6.5 1L2 5.5M6.5 1L11 5.5"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
