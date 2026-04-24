import { useState, useMemo, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { createConversation, deleteConversation } from '../lib/api'
import type { ConversationSummary } from '../lib/api'

function groupByDate(convs: ConversationSummary[]) {
  const now = new Date()
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(+today - 86_400_000)
  const week      = new Date(+today - 6 * 86_400_000)
  const month     = new Date(+today - 29 * 86_400_000)

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today',      items: [] },
    { label: 'Yesterday',  items: [] },
    { label: 'This week',  items: [] },
    { label: 'This month', items: [] },
    { label: 'Older',      items: [] },
  ]

  for (const c of convs) {
    const d = new Date(c.lastMessageAt ?? c.updatedAt)
    if (d >= today)          groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= week)      groups[2].items.push(c)
    else if (d >= month)     groups[3].items.push(c)
    else                     groups[4].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

type NavSection = 'chats' | 'projects' | 'artifacts' | 'code' | 'dispatch'

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  {
    id: 'chats',
    label: 'Chats',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    ),
  },
  {
    id: 'code',
    label: 'Code',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
]

interface SidebarProps {
  onClose?: () => void
  onSettings?: () => void
}

export function Sidebar({ onClose, onSettings }: SidebarProps) {
  const { conversations, activeId, setActiveId, upsertConversation, removeConversation } = useAppStore()
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [activeNav, setActiveNav] = useState<NavSection>('chats')
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click (kept for any future menus)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) { /* no-op for now */ }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleNew = async () => {
    const conv = await createConversation()
    upsertConversation(conv)
    setActiveId(conv.id)
    onClose?.()
  }

  const handleSelect = (id: string) => { setActiveId(id); onClose?.() }
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

  const grouped = useMemo(() => groupByDate(filtered), [filtered])
  const initials = ((user?.displayName ?? user?.email) || '?').slice(0, 1).toUpperCase()
  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User'

  return (
    <aside
      className="w-[280px] shrink-0 flex flex-col overflow-hidden h-full"
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="10" cy="10" r="2.5" fill="var(--color-accent)"/>
          </svg>
          <span
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Lumen
          </span>
        </div>
        <button
          onClick={handleNew}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
          title="New chat"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="7" y1="1" x2="7" y2="13"/>
            <line x1="1" y1="7" x2="13" y2="7"/>
          </svg>
        </button>
      </div>

      {/* ── Nav tabs ── */}
      <div
        className="px-3 pb-2 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id
            const isLive = item.id === 'chats'
            return (
              <button
                key={item.id}
                onClick={() => { if (isLive) setActiveNav(item.id) }}
                title={item.label}
                disabled={!isLive}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all"
                style={{
                  color: isActive
                    ? 'var(--color-accent)'
                    : !isLive
                    ? 'var(--color-text-muted)'
                    : 'var(--color-text-secondary)',
                  background: isActive
                    ? `color-mix(in srgb, var(--color-accent) 10%, transparent)`
                    : 'transparent',
                  opacity: !isLive ? 0.45 : 1,
                  cursor: !isLive ? 'default' : 'pointer',
                }}
              >
                {item.icon}
                <span className="text-[9.5px] font-medium leading-none">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Content area ── */}
      {activeNav === 'chats' ? (
        <>
          {/* Search */}
          <div className="px-3 py-2.5">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl border"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                <path d="M10 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zm-.7 3.507l2.846 2.847-.848.848L8.454 10.35A4.5 4.5 0 1110 6.5a4.48 4.48 0 01-.7 2.343" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
              </svg>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-[13px] outline-none"
                style={{
                  color: 'var(--color-text-primary)',
                  // @ts-ignore
                  '::placeholder': { color: 'var(--color-text-muted)' },
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="9" y2="9"/>
                    <line x1="9" y1="1" x2="1" y2="9"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto min-h-0 pb-2">
            {filtered.length === 0 ? (
              <p
                className="px-5 py-6 text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {search ? `No results for "${search}"` : 'No conversations yet.'}
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.label} className="mb-1">
                  <p
                    className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {group.label}
                  </p>
                  {group.items.map((conv) => (
                    <div
                      key={conv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(conv.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSelect(conv.id)}
                      className="group relative flex items-center mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 select-none"
                      style={{
                        background: conv.id === activeId ? 'var(--color-surface-active)' : 'transparent',
                        color: conv.id === activeId ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      }}
                      onMouseEnter={e => {
                        if (conv.id !== activeId) {
                          e.currentTarget.style.background = 'var(--color-surface)'
                          e.currentTarget.style.color = 'var(--color-text-primary)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (conv.id !== activeId) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--color-text-secondary)'
                        }
                      }}
                    >
                      <p className="flex-1 text-[13px] truncate leading-snug pr-5">
                        {conv.title || 'New Conversation'}
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(conv.id) }}
                        title="Delete"
                        className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity
                                   w-6 h-6 flex items-center justify-center rounded-lg"
                        style={{ color: 'var(--color-text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = `color-mix(in srgb, var(--color-error) 10%, transparent)` }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
                      >
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="1" y1="1" x2="8" y2="8"/>
                          <line x1="8" y1="1" x2="1" y2="8"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* Coming soon pane for other nav sections */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: `color-mix(in srgb, var(--color-accent) 12%, transparent)` }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-center" style={{ color: 'var(--color-text-primary)' }}>
            Coming soon
          </p>
          <p className="text-[12.5px] text-center" style={{ color: 'var(--color-text-muted)' }}>
            {NAV_ITEMS.find(n => n.id === activeNav)?.label} will be available in a future update.
          </p>
        </div>
      )}

      {/* ── Footer ── */}
      <div
        className="border-t shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
        ref={menuRef}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* User button */}
          <button
            className="flex-1 flex items-center gap-3 px-2 py-2 rounded-xl transition-colors min-w-0"
            style={{ color: 'var(--color-text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={onSettings}
            title="Settings"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: `color-mix(in srgb, var(--color-accent) 20%, transparent)`,
                border: `1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)`,
              }}
            >
              <span
                className="text-[12px] font-bold"
                style={{ color: 'var(--color-accent)' }}
              >
                {initials}
              </span>
            </div>
            <span
              className="flex-1 text-[13px] font-medium truncate text-left"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {displayName}
            </span>
          </button>

          {/* Settings gear button */}
          <button
            onClick={onSettings}
            title="Settings"
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
