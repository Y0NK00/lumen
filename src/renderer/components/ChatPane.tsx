import { useChatStore } from '../stores/chatStore'
import { useOllamaStream } from '../hooks/useOllamaStream'
import { useClaudeStream } from '../hooks/useClaudeStream'
import { useSettingsStore, isClaudeModel } from '../stores/settingsStore'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'

// ─── EmptyState ───────────────────────────────────────────────────────────────

function NoConversationSelected() {
  const { createConversation } = useChatStore()
  const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore()

  const handleNew = () => {
    const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
    createConversation(model)
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 text-center px-8">
      <span className="text-6xl" aria-hidden>💡</span>
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Welcome to Lumen</h2>
        <p className="text-sm text-text-muted">
          Select a conversation from the sidebar, or start a new one.
        </p>
      </div>
      <button
        onClick={handleNew}
        className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium
                   hover:bg-accent-hover transition-colors active:scale-95"
      >
        New Conversation
      </button>
    </div>
  )
}

// ─── ConversationHeader ───────────────────────────────────────────────────────

function ConversationHeader() {
  const { conversations, activeConversationId } = useChatStore()
  const conv = activeConversationId ? conversations[activeConversationId] : null
  if (!conv) return null

  const isClaude = isClaudeModel(conv.model)

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
      <h1 className="text-sm font-medium text-text-primary truncate max-w-[60%]" title={conv.title}>
        {conv.title}
      </h1>
      <div className="flex items-center gap-2">
        {/* Provider badge */}
        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
          isClaude
            ? 'bg-violet-900/40 text-violet-300'
            : 'bg-surface text-text-muted'
        }`}>
          {isClaude ? '🤖 Claude' : '🏠 Ollama'}
        </span>
        {/* Model badge */}
        <span className="text-xs text-text-muted font-mono bg-surface px-2 py-0.5 rounded-md">
          {conv.model}
        </span>
      </div>
    </div>
  )
}

// ─── ModelStream hook selector ────────────────────────────────────────────────
//
// React rules: you can't call hooks conditionally. The workaround is to call
// BOTH hooks unconditionally, then choose which one to actually use.
//
// Both hooks start idle — the one we don't use never fires a request.

function useActiveStream(model: string) {
  const ollamaStream = useOllamaStream()
  const claudeStream = useClaudeStream()

  return isClaudeModel(model) ? claudeStream : ollamaStream
}

// ─── ChatPane ─────────────────────────────────────────────────────────────────

export function ChatPane() {
  const { conversations, activeConversationId } = useChatStore()

  const conv = activeConversationId ? conversations[activeConversationId] : null

  // Call both hooks (React rules require unconditional hook calls)
  const { sendMessage, stopStream, isStreaming } = useActiveStream(
    conv?.model ?? ''
  )

  if (!activeConversationId || !conv) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <NoConversationSelected />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ConversationHeader />

      <MessageList messages={conv.messages} />

      <InputBox
        onSend={sendMessage}
        onStop={stopStream}
        isStreaming={isStreaming}
      />
    </div>
  )
}
