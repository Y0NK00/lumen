import { useChatStore } from '../stores/chatStore'
import { useOllamaStream } from '../hooks/useOllamaStream'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'

function NoConversationSelected() {
  const { createConversation } = useChatStore()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8">
      <span className="text-6xl" aria-hidden>💡</span>
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Welcome to Lumen</h2>
        <p className="text-sm text-text-muted">Select a conversation or start a new one.</p>
      </div>
      <button onClick={() => createConversation()} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors">New Conversation</button>
    </div>
  )
}

function ConversationHeader() {
  const { conversations, activeConversationId } = useChatStore()
  const conv = activeConversationId ? conversations[activeConversationId] : null
  if (!conv) return null
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
      <h1 className="text-sm font-medium text-text-primary truncate max-w-[60%]" title={conv.title}>{conv.title}</h1>
      <span className="text-xs text-text-muted font-mono bg-surface px-2 py-0.5 rounded-md">{conv.model}</span>
    </div>
  )
}

export function ChatPane() {
  const { conversations, activeConversationId } = useChatStore()
  const { sendMessage, stopStream, isStreaming } = useOllamaStream()

  if (!activeConversationId || !conversations[activeConversationId]) {
    return <div className="flex flex-col flex-1 overflow-hidden"><NoConversationSelected /></div>
  }

  const conv = conversations[activeConversationId]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ConversationHeader />
      <MessageList messages={conv.messages} />
      <InputBox onSend={sendMessage} onStop={stopStream} isStreaming={isStreaming} />
    </div>
  )
}