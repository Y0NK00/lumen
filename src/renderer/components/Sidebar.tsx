import { useChatStore } from '../stores/chatStore'
import type { Conversation } from '../stores/chatStore'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

interface ConversationItemProps {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

function ConversationItem({ conv, isActive, onSelect, onDelete }: ConversationItemProps) {
  const lastMessage = conv.messages[conv.messages.length - 1]
  const preview = lastMessage?.content?.slice(0, 60) ?? 'No messages yet'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={[
        'group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors select-none',
        isActive
          ? 'bg-surface-active text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      ].join(' ')}
    >
      <p className="text-sm font-medium truncate pr-6 leading-tight">{conv.title}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <p className="text-xs text-text-muted truncate flex-1">{preview}</p>
        <span className="text-xs text-text-muted shrink-0">{relativeTime(conv.updatedAt)}</span>
      </div>
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100
                   w-5 h-5 flex items-center justify-center rounded text-text-muted
                   hover:text-text-primary transition-all"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title="Delete conversation"
      >×</button>
    </div>
  )
}

export function Sidebar() {
  const { conversations, activeConversationId, createConversation, setActiveConversation, deleteConversation } =
    useChatStore()

  const sorted = Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside className="w-[280px] shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden">
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>💡</span>
          <span className="text-base font-semibold text-text-primary tracking-tight">Lumen</span>
        </div>
        <button
          onClick={() => createConversation()}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary
                     hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="New conversation"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M11.8536 1.14645C11.6583.951185 11.3417.951185 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm text-text-muted text-center px-4">No conversations yet.</p>
            <button onClick={() => createConversation()} className="text-xs text-accent hover:underline">Start one →</button>
          </div>
        ) : (
          sorted.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeConversationId}
              onSelect={() => setActiveConversation(conv.id)}
              onDelete={() => deleteConversation(conv.id)}
            />
          ))
        )}
      </div>
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-text-muted">{sorted.length} conversation{sorted.length !== 1 ? 's' : ''}</p>
      </div>
    </aside>
  )
}