import { useChatStore } from '../stores/chatStore'
import { useOllamaStream } from '../hooks/useOllamaStream'
import { useClaudeStream } from '../hooks/useClaudeStream'
import { useSettingsStore, isClaudeModel } from '../stores/settingsStore'
import { useProjectsStore } from '../stores/projectsStore'
import { useUIStore } from '../stores/uiStore'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { useState, useCallback, useEffect } from 'react'
import { ArtifactsPane, Artifact } from './ArtifactsPane'
import { OPEN_ARTIFACTS_EVENT } from '../hooks/useKeyboardShortcuts'
import type { Message } from '../stores/chatStore'

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

function ConversationHeader({ onCloseArtifacts }: { onCloseArtifacts?: () => void }) {
  const { conversations, activeConversationId } = useChatStore()
  const conv = activeConversationId ? conversations[activeConversationId] : null
  if (!conv) return null

  const isClaude = isClaudeModel(conv.model)

  // Strip down model name for display: "claude-sonnet-4-5" → "Sonnet 4.5"
  const modelShort = isClaude
    ? conv.model
        .replace('claude-', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : conv.model

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 min-w-0">
      <h1 className="text-sm font-medium text-text-primary truncate flex-1 min-w-0" title={conv.title}>
        {conv.title}
      </h1>
      {/* Model pill */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
          isClaude
            ? 'text-violet-300/80 bg-violet-900/20 border-violet-800/30'
            : 'text-text-muted bg-surface border-border'
        }`}>
          {modelShort}
        </span>
      </div>
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

  if (!conv) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <NoConversationSelected />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* Chat column */}
      <div className={`flex flex-col min-w-0 transition-all duration-300 ${activeArtifact ? 'w-1/2 border-r border-border' : 'w-full'}`}>
        <ConversationHeader onCloseArtifacts={activeArtifact ? handleCloseArtifacts : undefined} />
        {artifactsToast && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-md bg-accent/10 border border-accent/20 shrink-0">
            <p className="text-[11.5px] text-accent">{artifactsToast}</p>
          </div>
        )}
        {/* Centered content rail — slightly wider (880px) and balanced so the
            content doesn't feel left-shifted by the 260px sidebar. Messages and
            input share the same rail so the input doesn't look offset. */}
        <div className="flex flex-col flex-1 min-h-0 w-full max-w-[840px] mx-auto">
          <MessageList
            messages={conv.messages}
            onOpenInArtifacts={handleOpenInArtifacts}
          />
          <InputBox
            onSend={sendMessage}
            onStop={stopStream}
            isStreaming={isStreaming}
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
