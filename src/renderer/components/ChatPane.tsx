import { useChatStore } from '../stores/chatStore'
import { useOllamaStream } from '../hooks/useOllamaStream'
import { useClaudeStream } from '../hooks/useClaudeStream'
import { useSettingsStore, isClaudeModel } from '../stores/settingsStore'
import { useProjectsStore } from '../stores/projectsStore'
import { useUIStore } from '../stores/uiStore'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { useState, useCallback, useEffect, useRef } from 'react'
import type { MessageAttachment } from '../stores/chatStore'
import { ArtifactsPane, Artifact } from './ArtifactsPane'
import { OPEN_ARTIFACTS_EVENT } from '../hooks/useKeyboardShortcuts'
import type { Message } from '../stores/chatStore'
import { writeSessionLog } from '../stores/memoryStore'
import { OPEN_SETTINGS_EVENT } from '../hooks/useKeyboardShortcuts'

// ─── Artifact extraction ─────────────────────────────────────────────────────
// Scan a message's content for fenced code blocks. Returns them in order.
// Pattern matches ```lang\n...\n``` or ```\n...\n```.
const CODE_FENCE_RE = /```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g

interface ExtractedArtifact { code: string; language: string; messageIdx: number }

function extractArtifactsFromMessages(messages: Message[]): ExtractedArtifact[] {
  const out: ExtractedArtifact[] = []
  messages.forEach((m, idx) => {
    if (!m.content) return
    const re = new RegExp(CODE_FENCE_RE.source, 'g')
    let match: RegExpExecArray | null
    while ((match = re.exec(m.content)) !== null) {
      const lang = match[1] || 'text'
      const code = match[2]
      if (code.trim().length === 0) continue
      out.push({ code, language: lang, messageIdx: idx })
    }
  })
  return out
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function NoConversationSelected() {
  const { createConversation } = useChatStore()
  const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore()
  const { activeProjectId } = useProjectsStore()
  const { mode } = useUIStore()
  const isCode = mode === 'code'

  const handleNew = () => {
    const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
    createConversation(model, isCode ? 'code' : 'chat', activeProjectId ?? undefined)
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-5 text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <span className="text-2xl">{isCode ? '⌨️' : '💡'}</span>
      </div>
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-1">
          {isCode ? 'Code Sessions' : 'Welcome to Lumen'}
        </h2>
        <p className="text-xs text-text-muted max-w-sm">
          {isCode
            ? 'Start a code session to give Claude shell, grep, and git access.'
            : 'Select a conversation from the sidebar, or start a new one.'}
        </p>
      </div>
      <button
        onClick={handleNew}
        className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium
                   hover:bg-accent-hover transition-colors active:scale-95"
      >
        {isCode ? '+ Start Code Session' : 'New Conversation'}
      </button>
    </div>
  )
}

// ─── ConversationHeader ───────────────────────────────────────────────────────

type LogStatus = 'idle' | 'generating' | 'ok' | 'error'

async function buildSessionLogContent(
  messages: { role: string; content: string }[],
  apiKey: string,
  title: string
): Promise<{ summary: string; decisions: string[]; nextSteps: string[] }> {
  const transcript = messages
    .slice(-30)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 600)}`)
    .join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Summarize this conversation as a session log. Output ONLY valid JSON with this shape:
{"summary":"2-3 sentence summary of what was discussed","decisions":["decision 1"],"nextSteps":["next step 1"]}

Rules: max 5 decisions, max 5 next steps, be specific and actionable.

Conversation titled "${title}":
${transcript}`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  return JSON.parse(data.content?.[0]?.text ?? '{}')
}

function ConversationHeader({ onCloseArtifacts }: { onCloseArtifacts?: () => void }) {
  const { conversations, activeConversationId, updateConversationModel } = useChatStore()
  const {
    vaultPath, claudeApiKey,
    tokenInputMonth, tokenOutputMonth, tokenBudgetMonth,
  } = useSettingsStore()
  const conv = activeConversationId ? conversations[activeConversationId] : null
  const [showModelPicker, setShowModelPicker] = useState(false)

  // Token budget alert — show when >= 80% used
  const totalTokens  = tokenInputMonth + tokenOutputMonth
  const budgetPct    = tokenBudgetMonth > 0 ? (totalTokens / tokenBudgetMonth) * 100 : 0
  const budgetAlert  = budgetPct >= 80

  const MODEL_OPTIONS = [
    { value: 'claude-opus-4-6',            label: 'Claude Opus 4.6',   desc: 'Most capable' },
    { value: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6', desc: 'Balanced' },
    { value: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5',  desc: 'Fastest' },
  ]

  const [logStatus,     setLogStatus]     = useState<LogStatus>('idle')
  const [logToast,      setLogToast]      = useState<string | null>(null)
  const [exportStatus,  setExportStatus]  = useState<'idle' | 'copied' | 'saved'>('idle')

  if (!conv) return null

  // Build a clean Markdown export of the conversation
  const buildExportMarkdown = (): string => {
    const date = new Date().toLocaleString()
    const lines: string[] = [
      `# ${conv.title}`,
      `**Exported:** ${date}`,
      `**Model:** ${conv.model || 'unknown'}`,
      '',
      '---',
      '',
    ]
    for (const m of conv.messages.filter((msg) => !msg.isStreaming)) {
      const role = m.role === 'user' ? '**You**' : '**Lumen**'
      lines.push(`${role}\n`)
      lines.push(m.content || '')
      lines.push('')
      lines.push('---')
      lines.push('')
    }
    return lines.join('\n')
  }

  const handleExport = async (target: 'clipboard' | 'vault') => {
    const md = buildExportMarkdown()
    if (target === 'clipboard') {
      await navigator.clipboard.writeText(md)
      setExportStatus('copied')
      setTimeout(() => setExportStatus('idle'), 2000)
    } else {
      // Write to vault
      if (!vaultPath) {
        setLogToast('No vault path — set it in Settings → Workspace')
        setTimeout(() => setLogToast(null), 3000)
        return
      }
      const tower = (window as any).tower
      const dateStr = new Date().toISOString().split('T')[0]
      const safeName = conv.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 60)
      const filePath = `${vaultPath}/Exports/${dateStr} — ${safeName}.md`
      const result = await tower?.vault?.writeFile?.(filePath, md)
      if (result?.error) {
        setLogToast(`Export failed: ${result.error}`)
      } else {
        setExportStatus('saved')
        setLogToast(`Saved to vault ✓`)
      }
      setTimeout(() => { setExportStatus('idle'); setLogToast(null) }, 2500)
    }
  }

  const isClaude = isClaudeModel(conv.model)

  const modelShort = isClaude
    ? conv.model
        .replace('claude-', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : conv.model

  const handleLogSession = async () => {
    if (logStatus === 'generating') return
    if (!claudeApiKey) {
      setLogToast('No API key — add it in Settings → Models')
      setTimeout(() => setLogToast(null), 3000)
      return
    }
    if (!vaultPath) {
      setLogStatus('error')
      setLogToast('vault-missing')
      setTimeout(() => { setLogStatus('idle'); setLogToast(null) }, 5000)
      return
    }

    setLogStatus('generating')
    try {
      const msgs = conv.messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }))

      const logData = await buildSessionLogContent(msgs, claudeApiKey, conv.title)
      const result  = await writeSessionLog(vaultPath, {
        title: conv.title,
        summary:   logData.summary   ?? 'No summary generated.',
        decisions: logData.decisions ?? [],
        nextSteps: logData.nextSteps ?? [],
      })

      if (result.ok) {
        setLogStatus('ok')
        setLogToast('Session log saved to vault ✓')
      } else {
        setLogStatus('error')
        setLogToast(result.error ?? 'Failed to write log')
      }
    } catch (e) {
      setLogStatus('error')
      setLogToast(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setTimeout(() => { setLogStatus('idle'); setLogToast(null) }, 3000)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 min-w-0">
        <h1 className="text-sm font-medium text-text-primary truncate flex-1 min-w-0" title={conv.title}>
          {conv.title}
        </h1>

        {/* Model switcher pill — click to open dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowModelPicker((v) => !v)}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors ${
              isClaude
                ? 'text-violet-300/80 bg-violet-900/20 border-violet-800/30 hover:border-violet-600/50'
                : 'text-text-muted bg-surface border-border hover:border-border/60'
            }`}
            title="Switch model"
          >
            {modelShort} ▾
          </button>
          {showModelPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-[#0d0d1c] border border-white/10 rounded-xl shadow-xl min-w-[200px] py-1 overflow-hidden">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (activeConversationId) updateConversationModel(activeConversationId, opt.value)
                    setShowModelPicker(false)
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-4 transition-colors
                    ${conv?.model === opt.value ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-white/5'}`}
                >
                  <span className="text-[12px] font-medium">{opt.label}</span>
                  <span className="text-[10px] text-text-muted shrink-0">{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Token budget alert */}
        {budgetAlert && (
          <span className="text-[10px] px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 shrink-0" title={`${Math.round(budgetPct)}% of monthly budget used`}>
            {Math.round(budgetPct)}% budget
          </span>
        )}

        {/* Log session button */}
        <button
          onClick={handleLogSession}
          disabled={logStatus === 'generating'}
          className={`w-6 h-6 flex items-center justify-center rounded transition-all shrink-0
                      ${logStatus === 'ok'
                        ? 'text-green-400'
                        : logStatus === 'error'
                          ? 'text-error'
                          : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}
                      disabled:opacity-40`}
          title="Save session log to vault"
        >
          {logStatus === 'generating' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
                 className="animate-spin" strokeLinecap="round">
              <path d="M5 1.5A3.5 3.5 0 108.5 5" />
            </svg>
          ) : logStatus === 'ok' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="2,5 4.5,7.5 8.5,2.5" />
            </svg>
          ) : (
            <svg width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="8" height="9" rx="1.5" />
              <line x1="3" y1="4" x2="7" y2="4" />
              <line x1="3" y1="6" x2="7" y2="6" />
              <line x1="3" y1="8" x2="5.5" y2="8" />
            </svg>
          )}
        </button>

        {/* Export button — click = copy to clipboard, right-click = save to vault */}
        <button
          onClick={() => handleExport('clipboard')}
          onContextMenu={(e) => { e.preventDefault(); handleExport('vault') }}
          className={`w-6 h-6 flex items-center justify-center rounded transition-all shrink-0
                      ${exportStatus === 'copied' || exportStatus === 'saved'
                        ? 'text-green-400'
                        : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}`}
          title="Export conversation (click = copy MD · right-click = save to vault)"
        >
          {exportStatus === 'copied' || exportStatus === 'saved' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="2,5 4.5,7.5 8.5,2.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1H8.5A.5.5 0 019 1.5v7a.5.5 0 01-.5.5H1.5A.5.5 0 011 8.5v-7A.5.5 0 011.5 1H4" />
              <rect x="3" y="0.5" width="4" height="2" rx="0.5" />
              <line x1="3" y1="4.5" x2="7" y2="4.5" />
              <line x1="3" y1="6.5" x2="6" y2="6.5" />
            </svg>
          )}
        </button>

        {/* Close artifacts button */}
        {onCloseArtifacts && (
          <button
            onClick={onCloseArtifacts}
            className="w-6 h-6 flex items-center justify-center rounded text-text-muted
                       hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
            title="Close preview"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" />
            </svg>
          </button>
        )}
      </div>

      {/* Toast */}
      {logToast && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded-md border shrink-0 flex items-center justify-between gap-3 ${
          logStatus === 'error'
            ? 'bg-error/10 border-error/20'
            : 'bg-accent/10 border-accent/20'
        }`}>
          <p className={`text-[11.5px] ${logStatus === 'error' ? 'text-error' : 'text-accent'}`}>
            {logToast === 'vault-missing'
              ? 'No vault path set — session logs need a folder to write to.'
              : logToast}
          </p>
          {logToast === 'vault-missing' && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT))}
              className="text-[11px] font-medium text-error underline underline-offset-2 hover:opacity-80 shrink-0 transition-opacity"
            >
              Open Settings →
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ─── Model stream hook selector ───────────────────────────────────────────────

function useActiveStream(model: string) {
  const ollamaStream = useOllamaStream()
  const claudeStream = useClaudeStream()
  return isClaudeModel(model) ? claudeStream : ollamaStream
}

// ─── ChatPane ─────────────────────────────────────────────────────────────────

export function ChatPane() {
  const { conversations, activeConversationId } = useChatStore()
  const { mode, pendingDispatch, setPendingDispatch } = useUIStore()
  const rawConv = activeConversationId ? conversations[activeConversationId] : null

  // Mode guard: if the active conversation belongs to a different mode than
  // the current UI mode, treat it as "no conversation selected" so Chat can't
  // show a Code session and vice versa.
  const currentConvMode = mode === 'code' ? 'code' : 'chat'
  const conv = rawConv && (rawConv.mode ?? 'chat') === currentConvMode ? rawConv : null

  const { sendMessage, stopStream, isStreaming } = useActiveStream(conv?.model ?? '')

  // ── Message queue — send while Claude is still responding ─────────────────
  // When the user hits send during a stream, we store the message and fire it
  // the instant the current response finishes. Only one message can be queued
  // at a time; a second send while queued replaces the pending one.
  const [queuedMessage, setQueuedMessage] = useState<{
    content: string
    attachments?: MessageAttachment[]
  } | null>(null)

  // Fire queued message as soon as streaming stops
  useEffect(() => {
    if (!isStreaming && queuedMessage) {
      const { content, attachments } = queuedMessage
      setQueuedMessage(null)
      sendMessage(content, attachments)
    }
  }, [isStreaming, queuedMessage, sendMessage])

  // Wrapper passed to InputBox — queues if busy, sends immediately if not
  const handleSend = useCallback((content: string, attachments?: MessageAttachment[]) => {
    if (isStreaming) {
      setQueuedMessage({ content, attachments })
    } else {
      sendMessage(content, attachments)
    }
  }, [isStreaming, sendMessage])

  const cancelQueue = useCallback(() => setQueuedMessage(null), [])

  // ── Pending dispatch consumer (Chat mode only) ─────────────────────────────
  // HelmChatView is the primary consumer of pendingDispatch when mode === 'helm'.
  // This effect is a fallback for cases where mode has been explicitly set to
  // 'chat' before the dispatch fires (e.g. future direct-chat dispatch paths).
  useEffect(() => {
    if (mode !== 'chat') return
    if (pendingDispatch && conv && !isStreaming) {
      const prompt = pendingDispatch
      setPendingDispatch(null)
      sendMessage(prompt)
    }
  }, [mode, pendingDispatch, conv, isStreaming, sendMessage, setPendingDispatch])

  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null)
  const [artifactsToast, setArtifactsToast] = useState<string | null>(null)

  const handleOpenInArtifacts = useCallback((code: string, language: string) => {
    setActiveArtifact({ id: crypto.randomUUID(), code, language, timestamp: Date.now() })
  }, [])

  const handleCloseArtifacts = useCallback(() => setActiveArtifact(null), [])

  // Listen for the "open artifacts" event from the sidebar. Scans the active
  // conversation for fenced code blocks and opens the most recent one. If
  // none exist, shows a brief toast.
  useEffect(() => {
    const handler = () => {
      if (!conv) {
        setArtifactsToast('No conversation selected')
        setTimeout(() => setArtifactsToast(null), 2200)
        return
      }
      const extracted = extractArtifactsFromMessages(conv.messages)
      if (extracted.length === 0) {
        setArtifactsToast('No artifacts in this conversation yet')
        setTimeout(() => setArtifactsToast(null), 2200)
        return
      }
      const latest = extracted[extracted.length - 1]
      handleOpenInArtifacts(latest.code, latest.language)
    }
    window.addEventListener(OPEN_ARTIFACTS_EVENT, handler)
    return () => window.removeEventListener(OPEN_ARTIFACTS_EVENT, handler)
  }, [conv, handleOpenInArtifacts])

  // ── Remote dispatch consumer ──────────────────────────────────────────────
  // Fires when a phone/script sends a POST to the local HTTP server.
  // The event is dispatched by useRemoteDispatch after creating a conversation.
  useEffect(() => {
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string; convId: string }>).detail
      if (!isStreaming) {
        sendMessage(text)
      }
    }
    window.addEventListener('remote:sendMessage', handler)
    return () => window.removeEventListener('remote:sendMessage', handler)
  }, [sendMessage, isStreaming])

  // ── Pane-level drag-and-drop ─────────────────────────────────────────────
  // Handle drops anywhere in the chat pane, not just the input box.
  // Pending attachments get passed down to InputBox so the user can review
  // before sending.
  const [paneIsDragging, setPaneIsDragging] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([])
  const dragCounterRef = useRef(0) // track nested drag enter/leave to avoid flicker

  const handlePaneDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setPaneIsDragging(true)
  }, [])

  const handlePaneDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setPaneIsDragging(false)
  }, [])

  const handlePaneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handlePaneDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setPaneIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Dynamically import to avoid circular deps with InputBox
    const { processDroppedFiles } = await import('./InputBox')
    const attachments = await processDroppedFiles(files)
    if (attachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...attachments])
    }
  }, [])

  if (!conv) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <NoConversationSelected />
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 min-h-0 overflow-hidden relative"
      onDragEnter={handlePaneDragEnter}
      onDragLeave={handlePaneDragLeave}
      onDragOver={handlePaneDragOver}
      onDrop={handlePaneDrop}
    >
      {/* Full-pane drop overlay */}
      {paneIsDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3
                        bg-background/85 border-2 border-dashed border-accent/60 rounded-none pointer-events-none">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor"
               strokeWidth="1.5" strokeLinecap="round" className="text-accent opacity-70">
            <path d="M20 8v16M20 8l-6 6M20 8l6 6" />
            <rect x="6" y="26" width="28" height="8" rx="3" />
          </svg>
          <p className="text-accent text-base font-medium">Drop files to attach</p>
          <p className="text-text-muted text-sm">Images, PDFs, text files</p>
        </div>
      )}

      {/* Chat column */}
      <div className={`flex flex-col min-w-0 transition-all duration-300 ${activeArtifact ? 'w-1/2 border-r border-border' : 'w-full'}`}>
        <ConversationHeader onCloseArtifacts={activeArtifact ? handleCloseArtifacts : undefined} />
        {artifactsToast && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-md bg-accent/10 border border-accent/20 shrink-0">
            <p className="text-[11.5px] text-accent">{artifactsToast}</p>
          </div>
        )}
        <div className="flex flex-col flex-1 min-h-0 w-full max-w-[840px] self-center">
          <MessageList
            messages={conv.messages}
            onOpenInArtifacts={handleOpenInArtifacts}
          />
          {/* Queued message badge */}
          {queuedMessage && (
            <div className="mx-5 mb-1.5 flex items-center gap-2 px-3 py-1.5 rounded-xl
                            bg-accent/10 border border-accent/25 text-[11.5px] text-accent">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" className="shrink-0">
                <circle cx="6" cy="6" r="5" />
                <path d="M6 3.5v2.5l1.5 1.5" />
              </svg>
              <span className="flex-1 truncate">Queued: {queuedMessage.content.slice(0, 60)}{queuedMessage.content.length > 60 ? '…' : ''}</span>
              <button
                onClick={cancelQueue}
                className="shrink-0 hover:text-error transition-colors ml-1"
                title="Cancel queued message"
              >✕</button>
            </div>
          )}
          <InputBox
            onSend={handleSend}
            onStop={stopStream}
            isStreaming={isStreaming}
            pendingAttachments={pendingAttachments}
            onPendingAttachmentsChange={setPendingAttachments}
          />
        </div>
      </div>

      {/* Artifacts pane */}
      {activeArtifact && (
        <div className="w-1/2 shrink-0 overflow-hidden">
          <ArtifactsPane
            artifact={activeArtifact}
            onClose={handleCloseArtifacts}
          />
        </div>
      )}
    </div>
  )
}
