import { useState, useMemo, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { createConversation, deleteConversation, logout } from '../lib/api'
import type { ConversationSummary } from '../lib/api'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

function ConversationItem({
  conv, isActive, onSelect, onDelete,
}: {
  conv: ConversationSummary
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={[
        'group relative pl-4 pr-2 py-2.5 rounded-lg cursor-pointer transition-all duration-150 select-none',
        isActive
          ? 'bg-surface border border-border text-text-primary'
          : 'text-text-secondary hover:bg-surface hover:text-text-primary border border-transparent',
      ].join(' ')}
    >
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-accent rounded-full" />
      )}
      <div className="flex items-center gap-1.5 pr-8 mb-0.5">
        <p className="text-[12.5px] font-medium truncate leading-tight">{conv.title || 'New Conversation'}</p>
      </div>
      <div className="flex items-center gap-2 pl-0">
        <span className="text-[10px] text-text-muted tabular-nums">
          {relativeTime(conv.lastMessageAt ?? conv.updatedAt)}
        </span>
        {conv.messageCount > 0 && (
          <span className="text-[10px] text-text-muted">{conv.messageCount} msgs</span>
        )}
      </div>

      {/* Delete button */}
      <div
        className="absolute right-1.5 top-1/2 -translate-y-1/2
                   opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted
                     hover:text-error hover:bg-error/10 transition-all"
          onClick={onDelete}
          title="Delete"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function UserMenu({ user }: { user: { displayName: string | null; email: string } }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleLogout = async () => {
    await logout()
    clearAuth()
  }

  const initials = (user.displayName ?? user.email).slice(0, 1).toUpperCase()
  const displayName = user.displayName ?? user.email.split('@')[0]

  return (
    <div className="relative border-t border-border shrink-0" ref={menuRef}>
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-surface border border-border
                        rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[11.5px] font-medium text-text-primary">{user.displayName ?? user.email}</p>
            <p className="text-[10.5px] text-text-muted truncate">{user.email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px]
                         text-text-muted hover:text-error hover:bg-surface-hover transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-hover transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30
                        flex items-center justify-center shrink-0">
          <span className="text-[11px] font-semibold text-accent">{initials}</span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12.5px] font-medium text-text-primary truncate">{displayName}</p>
          <p className="text-[10.5px] text-text-muted truncate">{user.email}</p>
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
             strokeWidth="1.4" strokeLinecap="round"
             className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
    </div>
  )
}

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { conversations, activeId, setActiveId, upsertConversation, removeConversation } = useAppStore()
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')

  const handleNew = async () => {
    const conv = await createConversation()
    upsertConversation(conv)
    setActiveId(conv.id)
    onClose?.()
  }

  const handleSelect = (id: string) => {
    setActiveId(id)
    onClose?.()
  }

  const handleDelete = async (id: string) => {
    await deleteConversation(id).catch(() => {})
    removeConversation(id)
  }

  const sorted = useMemo(() =>
    [...conversations].sort((a, b) =>
      new Date(b.lastMessageAt ?? b.updatedAt).getTime() -
      new Date(a.lastMessageAt ?? a.updatedAt).getTime()
    ), [conversations])

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [sorted, search])

  return (
    <aside className="w-[260px] shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z"
              stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2" fill="#8b5cf6" />
          </svg>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Lumen</p>
        </div>
        <button
          onClick={handleNew}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="New conversation"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            width="11" height="11" viewBox="0 0 15 15" fill="none">
            <path d="M10 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zm-.7 3.507l2.846 2.847-.848.848L8.454 10.35A4.5 4.5 0 1110 6.5a4.48 4.48 0 01-.7 2.343"
              fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[12.5px] bg-surface border border-border rounded-lg
                       text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-[11.5px] text-text-muted italic">
            {search ? `No results for "${search}"` : 'No conversations yet.'}
          </p>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              onSelect={() => handleSelect(conv.id)}
              onDelete={() => handleDelete(conv.id)}
            />
          ))
        )}
      </div>

      {user && <UserMenu user={user} />}
    </aside>
  )
}
