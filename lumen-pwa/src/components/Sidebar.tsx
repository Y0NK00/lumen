import { useState, useMemo, useRef, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore, THEMES } from '../stores/themeStore'
import { createConversation, deleteConversation, logout } from '../lib/api'
import type { ConversationSummary } from '../lib/api'

function groupByDate(convs: ConversationSummary[]) {
  const now = new Date()
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(+today - 86_400_000)
  const week      = new Date(+today - 6 * 86_400_000)
  const month     = new Date(+today - 29 * 86_400_000)

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today',     items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'This month', items: [] },
    { label: 'Older',     items: [] },
  ]

  for (const c of convs) {
    const d = new Date(c.lastMessageAt ?? c.updatedAt)
    if (d >= today)     groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= week)  groups[2].items.push(c)
    else if (d >= month) groups[3].items.push(c)
    else                 groups[4].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

interface SidebarProps { onClose?: () => void }

export function Sidebar({ onClose }: SidebarProps) {
  const { conversations, activeId, setActiveId, upsertConversation, removeConversation } = useAppStore()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const { themeId, setTheme } = useThemeStore()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

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
  const handleLogout = async () => { await logout(); clearAuth() }

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
    <aside className="w-[280px] shrink-0 flex flex-col bg-sidebar overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
          </svg>
          <span className="text-[15px] font-semibold text-text-primary tracking-tight">Lumen</span>
        </div>
        <button onClick={handleNew}
          className="w-8 h-8 flex items-center justify-center rounded-lg
                     text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="New chat">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-xl border border-border">
          <svg width="12" height="12" viewBox="0 0 15 15" fill="none" className="text-text-muted shrink-0">
            <path d="M10 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zm-.7 3.507l2.846 2.847-.848.848L8.454 10.35A4.5 4.5 0 1110 6.5a4.48 4.48 0 01-.7 2.343" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
          </svg>
          <input type="text" placeholder="Search…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-muted outline-none"/>
          {search && (
            <button onClick={() => setSearch('')} className="text-text-muted hover:text-text-primary transition-colors">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-2">
        {filtered.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-text-muted">
            {search ? `No results for "${search}"` : 'No conversations yet.'}
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                {group.label}
              </p>
              {group.items.map((conv) => (
                <div key={conv.id}
                  role="button" tabIndex={0}
                  onClick={() => handleSelect(conv.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelect(conv.id)}
                  className={[
                    'group relative flex items-center mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 select-none',
                    conv.id === activeId
                      ? 'bg-surface-active text-text-primary'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                  ].join(' ')}>
                  <p className="flex-1 text-[13px] truncate leading-snug pr-5">
                    {conv.title || 'New Conversation'}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(conv.id) }}
                    title="Delete"
                    className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity
                               w-6 h-6 flex items-center justify-center rounded-lg
                               text-text-muted hover:text-error hover:bg-error/10">
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* User footer */}
      <div className="border-t border-border" ref={menuRef}>
        {menuOpen && (
          <div className="mx-2 mb-1 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
            {/* Account info */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[12.5px] font-medium text-text-primary">{displayName}</p>
              <p className="text-[11px] text-text-muted truncate">{user?.email}</p>
            </div>

            {/* Theme picker */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-text-muted mb-2">
                Accent color
              </p>
              <div className="flex gap-2 flex-wrap">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    title={t.label}
                    onClick={() => setTheme(t.id)}
                    className="w-6 h-6 rounded-full transition-all duration-150 relative"
                    style={{ background: t.accent }}
                  >
                    {themeId === t.id && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Sign out */}
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px]
                         text-text-muted hover:text-error hover:bg-surface-hover transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        )}
        <button onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover transition-colors">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            }}>
            <span className="text-[12px] font-bold text-accent">{initials}</span>
          </div>
          <span className="flex-1 text-[13px] font-medium text-text-primary truncate text-left">{displayName}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className={`text-text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
            <path d="M2 4l4 4 4-4"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
