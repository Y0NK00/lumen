import { useEffect, useState } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { useStream } from '../hooks/useStream'
import { useAppStore } from '../stores/appStore'
import { getConversation, updateConversation } from '../lib/api'

function SystemPromptModal({
  convId,
  initial,
  onClose,
}: {
  convId: string
  initial: string | null
  onClose: () => void
}) {
  const [value, setValue] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)
  const { upsertConversation } = useAppStore()

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateConversation(convId, { systemPrompt: value.trim() || null })
      upsertConversation(updated)
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>System prompt</p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
            </svg>
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12px] mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Instructions prepended to every message in this conversation. Your saved memories are also injected automatically.
          </p>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. You are a job application coach helping me land a senior IT security role..."
            rows={6}
            className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none outline-none"
            style={{
              background: 'var(--color-surface-hover)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
            }}
          />
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'var(--color-surface-hover)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[13px] font-medium"
            style={{ background: 'var(--color-accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ChatPane() {
  const { send, stop, isStreaming } = useStream()
  const { activeId, messagesByConv, setMessages, conversations } = useAppStore()
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)

  const messages = activeId ? (messagesByConv[activeId] ?? []) : []
  const activeConv = conversations.find(c => c.id === activeId) ?? null

  useEffect(() => {
    if (!activeId) return
    if (messagesByConv[activeId]) return
    getConversation(activeId).then(({ messages }) => {
      setMessages(activeId, messages)
    }).catch(console.error)
  }, [activeId, messagesByConv, setMessages])

  const handleSend = (content: string) => {
    send(content, activeId ?? undefined)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* System prompt indicator bar — only shown when one is set */}
      {activeConv?.systemPrompt && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 shrink-0 cursor-pointer"
          style={{
            background: `color-mix(in srgb, var(--color-accent) 8%, transparent)`,
            borderBottom: `1px solid color-mix(in srgb, var(--color-accent) 15%, transparent)`,
          }}
          onClick={() => setShowSystemPrompt(true)}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <p className="text-[11px] truncate flex-1" style={{ color: 'var(--color-accent)' }}>
            {activeConv.systemPrompt.slice(0, 80)}{activeConv.systemPrompt.length > 80 ? '…' : ''}
          </p>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
      )}

      <MessageList messages={messages} onResend={handleSend} />

      <InputBox
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
        onSystemPrompt={activeId ? () => setShowSystemPrompt(true) : undefined}
      />

      {showSystemPrompt && activeId && (
        <SystemPromptModal
          convId={activeId}
          initial={activeConv?.systemPrompt ?? null}
          onClose={() => setShowSystemPrompt(false)}
        />
      )}
    </div>
  )
}
