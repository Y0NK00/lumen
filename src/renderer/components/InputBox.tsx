import { useRef, useCallback, useEffect, useState, DragEvent, ChangeEvent } from 'react'
import { useSettingsStore, isClaudeModel } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'
import type { MessageAttachment } from '../stores/chatStore'

// File types we can handle
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const ACCEPTED_TEXT_TYPES  = ['text/plain', 'text/markdown', 'text/csv']
const MAX_FILE_SIZE_MB = 20

interface InputBoxProps {
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  pendingAttachments?: MessageAttachment[]
  onPendingAttachmentsChange?: (atts: MessageAttachment[]) => void
}

// Read a File as base64 data URL, return just the base64 part
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => {
      const result = reader.result as string
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Read a File as plain text
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// ── Public helper — called by ChatPane for pane-level drops ──────────────────
export async function processDroppedFiles(files: File[]): Promise<MessageAttachment[]> {
  const results: MessageAttachment[] = []
  for (const file of files) {
    const att = await processFile(file)
    if (att) results.push(att)
  }
  return results
}

// Process a dropped/selected file into a MessageAttachment
async function processFile(file: File): Promise<MessageAttachment | null> {
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    console.warn(`[InputBox] File too large: ${file.name}`)
    return null
  }

  const mime = file.type || 'application/octet-stream'

  // Images → base64
  if (ACCEPTED_IMAGE_TYPES.includes(mime) || file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
    const data = await readAsBase64(file)
    return { type: 'image', name: file.name, mimeType: mime || 'image/png', data, size: file.size }
  }

  // Text files (.txt, .md, .csv) → inline text
  if (ACCEPTED_TEXT_TYPES.includes(mime) || file.name.match(/\.(txt|md|csv|log)$/i)) {
    const data = await readAsText(file)
    return { type: 'file', name: file.name, mimeType: mime || 'text/plain', data, size: file.size }
  }

  // PDF — read as text via main process readFile if accessible, else skip
  if (mime === 'application/pdf' || file.name.endsWith('.pdf')) {
    // PDFs: read as base64 and send to Claude's file API (vision handles PDFs too)
    const data = await readAsBase64(file)
    return { type: 'file', name: file.name, mimeType: 'application/pdf', data, size: file.size }
  }

  // .docx / .doc — extract text via ArrayBuffer + basic read (we can't parse DOCX without a library)
  // For now, tell the user we can't parse it
  console.warn(`[InputBox] Unsupported file type: ${mime}`)
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function InputBox({
  onSend, onStop, isStreaming, disabled = false,
  pendingAttachments, onPendingAttachmentsChange,
}: InputBoxProps) {
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { conversations, activeConversationId } = useChatStore()
  const conv    = activeConversationId ? conversations[activeConversationId] : null
  const isClaude = conv ? isClaudeModel(conv.model) : false

  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [isDragging,  setIsDragging]  = useState(false)
  const [fileError,   setFileError]   = useState<string | null>(null)

  // Merge pane-level drops into local attachments
  useEffect(() => {
    if (pendingAttachments && pendingAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...pendingAttachments])
      onPendingAttachmentsChange?.([])
      textareaRef.current?.focus()
    }
  }, [pendingAttachments, onPendingAttachmentsChange])

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus()
  }, [isStreaming])

  // ── File processing ──────────────────────────────────────────────────────
  const addFiles = useCallback(async (files: FileList | File[]) => {
    setFileError(null)
    const fileArray = Array.from(files)
    const results: MessageAttachment[] = []
    const errors: string[] = []

    for (const file of fileArray) {
      const attachment = await processFile(file)
      if (attachment) {
        results.push(attachment)
      } else if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errors.push(`${file.name}: too large (max ${MAX_FILE_SIZE_MB}MB)`)
      } else {
        errors.push(`${file.name}: unsupported type`)
      }
    }

    if (results.length > 0) setAttachments((prev) => [...prev, ...results])
    if (errors.length > 0) {
      setFileError(errors.join(' · '))
      setTimeout(() => setFileError(null), 4000)
    }
  }, [])

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Drag events ──────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) await addFiles(files)
  }, [addFiles])

  // ── File picker ──────────────────────────────────────────────────────────
  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(e.target.files)
      e.target.value = '' // reset so same file can be re-picked
    }
  }, [addFiles])

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const content = el.value.trim()
    if ((!content && attachments.length === 0) || disabled) return
    onSend(content, attachments.length > 0 ? attachments : undefined)
    el.value = ''
    el.style.height = 'auto'
    setAttachments([])
  }, [onSend, disabled, attachments])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Paste image support ──────────────────────────────────────────────────
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) {
        e.preventDefault()
        await addFiles([file])
      }
    }
  }, [addFiles])

  return (
    <div className="px-5 pb-5 pt-3 shrink-0 w-full max-w-[840px] mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.log"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-xl
                         bg-surface border border-border text-[11.5px] text-text-secondary
                         max-w-[180px]"
            >
              {att.type === 'image' ? (
                <img
                  src={`data:${att.mimeType};base64,${att.data}`}
                  alt={att.name}
                  className="w-8 h-8 rounded-md object-cover shrink-0"
                />
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="shrink-0 text-text-muted">
                  <rect x="2" y="1" width="10" height="12" rx="1.5" />
                  <line x1="4.5" y1="4.5" x2="9.5" y2="4.5" />
                  <line x1="4.5" y1="7" x2="9.5" y2="7" />
                  <line x1="4.5" y1="9.5" x2="7.5" y2="9.5" />
                </svg>
              )}
              <span className="truncate">{att.name}</span>
              <span className="text-[10px] text-text-muted shrink-0">{formatBytes(att.size)}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-border
                           text-text-muted hover:text-error hover:border-error/40 flex items-center justify-center
                           opacity-0 group-hover:opacity-100 transition-opacity text-[8px]"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {fileError && (
        <p className="text-[11.5px] text-error mb-1.5">{fileError}</p>
      )}

      {/* Input box */}
      <div className={[
        'flex items-end gap-3 rounded-2xl border px-4 py-3 transition-all duration-150 shadow-sm relative',
        isDragging
          ? 'border-accent/60 bg-accent/5'
          : isStreaming || disabled
            ? 'border-border bg-surface/60'
            : 'border-border bg-surface hover:border-accent/30 focus-within:border-accent/50 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]',
      ].join(' ')}>

        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || disabled}
          title="Attach file or image"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg
                     text-text-muted hover:text-text-primary hover:bg-surface-hover
                     disabled:opacity-30 transition-colors mb-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 6.5L7 11a3.5 3.5 0 01-5-5L7.5 1.5A2.5 2.5 0 1111 5L5.5 10.5A1.5 1.5 0 013.5 8.5L8.5 3.5" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={
            isStreaming
              ? 'Type to queue a message…'
              : attachments.length > 0
                ? 'Add a message or just send…'
                : 'Message Lumen… (drag & drop files or images)'
          }
          disabled={disabled}
          onInput={resize}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="flex-1 resize-none bg-transparent border-0 text-[14px] text-text-primary
                     placeholder:text-text-muted outline-none leading-[1.55]
                     max-h-[200px] overflow-y-auto py-1"
        />

        {/* While streaming: show stop button + a smaller queue/send button side by side */}
        {isStreaming ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleSend}
              disabled={disabled}
              title="Queue message (sends after response)"
              className="w-7 h-7 flex items-center justify-center rounded-lg
                         bg-accent/15 text-accent hover:bg-accent/25
                         transition-colors active:scale-95 disabled:opacity-30"
            >
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L6.5 12M6.5 1L2 5.5M6.5 1L11 5.5"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={onStop}
              title="Stop generation"
              className="w-9 h-9 flex items-center justify-center rounded-xl
                         bg-error/15 text-error hover:bg-error/25 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
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

      <p className="mt-2 text-center text-[11px] text-text-muted">
        {isStreaming
          ? 'Generating…  ·  Enter to queue next message  ·  Shift+Enter for newline'
          : isClaude
            ? 'Claude API  ·  Shift+Enter for newline  ·  Drag & drop images or files'
            : 'Ollama (local)  ·  Shift+Enter for newline'}
      </p>
    </div>
  )
}
