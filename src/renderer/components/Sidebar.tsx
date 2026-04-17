import { useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore, isClaudeModel } from '../stores/settingsStore'
import { SettingsPanel } from './SettingsPanel'
import type { Conversation } from '../stores/chatStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── ConversationItem ─────────────────────────────────────────────────────────

interface ConversationItemProps {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

function ConversationItem({ conv, isActive, onSelect, onDelete }: ConversationItemProps) {
  const lastMessage = conv.messages[conv.messages.length - 1]
  const preview = lastMessage?.content?.slice(0, 60) ?? 'No messages yet'
  const isClaude = isClaudeModel(conv.model)

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
      {/* Title row */}
      <div className="flex items-center gap-1.5 pr-6">
        <span className="text-xs shrink-0" title={isClaude ? 'Claude' : 'Ollama'}>
          {isClaude ? '🤖' : '🏠'}
        </span>
        <p className="text-sm font-medium truncate leading-tight">
          {conv.title}
        </p>
      </div>

      {/* Preview + timestamp row */}
      <div className="flex items-center gap-2 mt-0.5 pl-5">
        <p className="text-xs text-text-muted truncate flex-1">{preview}</p>
        <span className="text-xs text-text-muted shrink-0">
          {relativeTime(conv.updatedAt)}
        </span>
      </div>

      {/* Delete button — visible on hover */}
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100
                   w-5 h-5 flex items-center justify-center rounded text-text-muted
                   hover:text-text-primary hover:bg-surface-hover transition-all"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="Delete conversation"
        aria-label="Delete conversation"
      >
        ×
      </button>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { conversations, activeConversationId, createConversation, setActiveConversation, deleteConversation } =
    useChatStore()
  const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore()

  const [showSettings, setShowSettings] = useState(false)

  // Create new conversation using whichever model is the current default.
  const handleNewConversation = () => {
    const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
    createConversation(model)
    setShowSettings(false)
  }

  // Sort conversations newest-first by updatedAt.
  const sorted = Object.values(conversations).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  return (
    <aside className="w-[280px] shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>💡</span>
          <span className="text-base font-semibold text-text-primary tracking-tight">Lumen</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Settings gear */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={[
              'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
              showSettings
                ? 'text-accent bg-surface-active'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
            ].join(' ')}
            title="Settings"
            aria-label="Settings"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02 3.23978 2.07312 2.96503 2.34787L2.34785 2.96505C2.0731 3.2398 2.01998 3.6775 2.23583 4.01337L2.81011 4.92438C2.62361 5.26337 2.47267 5.62492 2.36245 6.00392L1.31229 6.24201C0.925068 6.3298 0.650211 6.67394 0.650211 7.07098V7.92902C0.650211 8.32606 0.925068 8.6702 1.31229 8.75799L2.36245 8.99608C2.47267 9.37508 2.62361 9.73663 2.81011 10.0756L2.23583 10.9866C2.01998 11.3225 2.0731 11.7602 2.34785 12.0349L2.96503 12.6521C3.23978 12.9269 3.67748 12.98 4.01335 12.7641L4.92436 12.1899C5.26335 12.3764 5.6249 12.5273 6.0039 12.6375L6.24198 13.6877C6.32977 14.0749 6.67391 14.3498 7.07095 14.3498H7.92899C8.32603 14.3498 8.67017 14.0749 8.75796 13.6877L8.99604 12.6375C9.37504 12.5273 9.73659 12.3764 10.0756 12.1899L10.9866 12.7641C11.3224 12.98 11.7601 12.9269 12.0349 12.6521L12.6521 12.0349C12.9268 11.7602 12.98 11.3225 12.7641 10.9866L12.1898 10.0756C12.3763 9.73663 12.5273 9.37508 12.6375 8.99608L13.6877 8.75799C14.0749 8.6702 14.3497 8.32606 14.3497 7.92902V7.07098C14.3497 6.67394 14.0749 6.3298 13.6877 6.24201L12.6375 6.00392C12.5273 5.62492 12.3763 5.26337 12.1898 4.92438L12.7641 4.01337C12.98 3.6775 12.9268 3.2398 12.6521 2.96505L12.0349 2.34787C11.7601 2.07312 11.3224 2.02 10.9866 2.23585L10.0756 2.81013C9.73659 2.62363 9.37504 2.47269 8.99604 2.36247L8.75796 1.31231C8.67017 0.925096 8.32603 0.650238 7.92899 0.650238H7.07095ZM4.92953 3.61002C5.35129 3.37038 5.81398 3.19553 6.30447 3.10079L6.54203 2.05493L7.45799 2.05493L7.69554 3.10079C8.18603 3.19553 8.64872 3.37038 9.07048 3.61002L9.98549 3.0357L10.6235 3.67378L10.0492 4.58878C10.2888 5.01054 10.4637 5.47323 10.5584 5.96372L11.6043 6.20128V7.11724L10.5584 7.35479C10.4637 7.84528 10.2888 8.30798 10.0492 8.72974L10.6235 9.64474L9.98549 10.2828L9.07048 9.70851C8.64872 9.94815 8.18603 10.123 7.69554 10.2177L7.45799 11.2636L6.54203 11.2636L6.30447 10.2177C5.81398 10.123 5.35129 9.94815 4.92953 9.70851L4.01452 10.2828L3.37644 9.64474L3.95073 8.72974C3.71109 8.30798 3.53624 7.84528 3.4415 7.35479L2.39563 7.11724V6.20128L3.4415 5.96372C3.53624 5.47323 3.71109 5.01054 3.95073 4.58878L3.37644 3.67378L4.01452 3.0357L4.92953 3.61002ZM9.02496 7.00001C9.02496 8.12188 8.12183 9.02501 6.99996 9.02501C5.87809 9.02501 4.97496 8.12188 4.97496 7.00001C4.97496 5.87814 5.87809 4.97501 6.99996 4.97501C8.12183 4.97501 9.02496 5.87814 9.02496 7.00001Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* New conversation */}
          <button
            onClick={handleNewConversation}
            className="flex items-center justify-center w-7 h-7 rounded-md
                       text-text-secondary hover:text-text-primary hover:bg-surface-hover
                       transition-colors"
            title="New conversation"
            aria-label="New conversation"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M11.8536 1.14645C11.6583 0.951185 11.3417 0.951185 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main area: settings panel OR conversation list ── */}
      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      ) : (
        <>
          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <p className="text-sm text-text-muted text-center px-4">
                  No conversations yet.
                </p>
                <button
                  onClick={handleNewConversation}
                  className="text-xs text-accent hover:underline"
                >
                  Start one →
                </button>
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

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border">
            <p className="text-xs text-text-muted">
              {sorted.length} conversation{sorted.length !== 1 ? 's' : ''}
              {' · '}
              <span className="capitalize">{useSettingsStore.getState().defaultProvider}</span>
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
