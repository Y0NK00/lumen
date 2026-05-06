import React, { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore, type CoworkTab } from '../stores/workspaceStore'
import {
  deleteConversation,
  logout,
  listProjects,
  createProject,
  updateConversation,
} from '../lib/api'
import type { ConversationSummary, Project } from '../lib/api'
import { FilesPanel } from './FilesPanel'
import { useFilesStore } from '../stores/filesStore'

function groupByDate(convs: ConversationSummary[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(+today - 86_400_000)
  const week = new Date(+today - 6 * 86_400_000)
  const month = new Date(+today - 29 * 86_400_000)

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'This month', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const c of convs) {
    const d = new Date(c.lastMessageAt ?? c.updatedAt)
    if (d >= today) groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= week) groups[2].items.push(c)
    else if (d >= month) groups[3].items.push(c)
    else groups[4].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

type FolderFilter = 'all' | 'unfiled' | string

function NavRow({
  icon,
  label,
  onClick,
  badge,
  ariaLabel,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  badge?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-[13px] transition-colors duration-150 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-80">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {badge && (
        <span
          className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

interface SidebarProps {
  onClose?: () => void
  onSettings?: () => void
  onOpenFeaturePanel?: (panel: 'projects' | 'artifacts' | 'dispatch') => void
  /** Rendered at the very top of the sidebar panel, above nav items. */
  toolbarSlot?: React.ReactNode
  onNewChat?: () => void
  onOpenFiles?: () => void
}

export function Sidebar({ onClose, onSettings, onOpenFeaturePanel, toolbarSlot, onNewChat, onOpenFiles }: SidebarProps) {
  const { conversations, activeId, setActiveId } = useAppStore()
  const resetSession = useAppStore((s) => s.resetSession)
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace)
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const mode = useWorkspaceStore((s) => s.mode)
  const openCowork = useWorkspaceStore((s) => s.openCowork)
  const removeFromList = useWorkspaceStore((s) => s.removeFromList)
  const upsertInList = useWorkspaceStore((s) => s.upsertInList)
  const fileCount = useFilesStore((s) => s.files.length)

  const [search, setSearch] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [projects, setProjects] = useState<Project[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const showFolderBar = mode === 'cowork' || mode === 'code'

  useEffect(() => { setFolderFilter('all') }, [mode])

  useEffect(() => {
    if (!showFolderBar) return
    let cancelled = false
    listProjects().then((items) => { if (!cancelled) setProjects(items) }).catch(() => {})
    return () => { cancelled = true }
  }, [showFolderBar])

  useEffect(() => {
    if (!accountMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node))
        setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [accountMenuOpen])

  useEffect(() => {
    if (!renamingId) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renamingId])

  const goCowork = async (tab: CoworkTab, panel?: 'projects' | 'artifacts' | 'dispatch') => {
    await openCowork(tab)
    if (panel) onOpenFeaturePanel?.(panel)
    onClose?.()
  }

  const handleSelect = (id: string) => { setActiveId(id); onClose?.() }

  const handleDelete = async (id: string) => {
    await deleteConversation(id).catch(() => {})
    removeFromList(mode, id)
  }

  const handleStartRename = (conv: ConversationSummary) => {
    setRenamingId(conv.id)
    setRenameDraft(conv.title || 'New chat')
  }

  const handleCommitRename = async () => {
    if (!renamingId) return
    const title = renameDraft.trim()
    setRenamingId(null)
    if (!title) return
    try {
      const updated = await updateConversation(renamingId, { title })
      upsertInList(updated)
    } catch { /* ignore */ }
  }

  const handleMoveToFolder = async (convId: string, projectId: string | null) => {
    try {
      const updated = await updateConversation(convId, { projectId })
      upsertInList(updated)
    } catch { /* ignore */ }
  }

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name')
    if (!name?.trim()) return
    try {
      const p = await createProject({ name: name.trim() })
      setProjects((prev) => [...prev, p])
      setFolderFilter(p.id)
    } catch { /* ignore */ }
  }

  const sorted = useMemo(
    () => [...conversations].sort((a, b) =>
      new Date(b.lastMessageAt ?? b.updatedAt).getTime() -
      new Date(a.lastMessageAt ?? a.updatedAt).getTime()
    ),
    [conversations],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [sorted, search])

  const folderFiltered = useMemo(() => {
    if (!showFolderBar || folderFilter === 'all') return filtered
    if (folderFilter === 'unfiled') return filtered.filter((c) => !c.projectId)
    return filtered.filter((c) => c.projectId === folderFilter)
  }, [showFolderBar, folderFilter, filtered])

  const grouped = useMemo(() => groupByDate(folderFiltered), [folderFiltered])
  const initials = ((user?.displayName ?? user?.email) || '?').slice(0, 1).toUpperCase()
  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User'
  const tierLabel = user?.role === 'admin' ? 'Pro' : 'Member'

  const folderChip = (id: FolderFilter, label: string) => {
    const active = folderFilter === id
    return (
      <button
        type="button"
        key={String(id)}
        onClick={() => setFolderFilter(id)}
        className="w-full text-left text-[12px] px-2.5 py-1.5 rounded-lg truncate transition-colors"
        style={{
          background: active ? 'var(--color-surface-active)' : 'transparent',
          color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="h-full min-h-0 w-full flex flex-col min-w-0">
      <aside
        className="flex-1 flex flex-col min-h-0 rounded-2xl border overflow-hidden shadow-[0_8px_36px_rgba(0,0,0,0.42)]"
        style={{
          background: 'var(--color-sidebar)',
          borderColor: 'color-mix(in srgb, var(--color-border) 70%, transparent)',
        }}
      >
        {toolbarSlot && (
          <div className="px-2 pt-2 pb-1 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            {toolbarSlot}
          </div>
        )}

        <div className="px-2.5 pt-2 pb-1 shrink-0">
          <button
            type="button"
            aria-label="New conversation"
            onClick={() => { onNewChat?.(); onClose?.() }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-left text-[13px] font-medium transition-colors duration-150 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-80">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <line x1="7" y1="1" x2="7" y2="13" />
                <line x1="1" y1="7" x2="13" y2="7" />
              </svg>
            </span>
            New chat
          </button>
        </div>

        <div className="px-2.5 pb-3 flex flex-col gap-1 shrink-0">
          <NavRow
            label="Projects"
            onClick={() => void goCowork('projects', 'projects')}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            }
          />
          <NavRow
            label="Artifacts"
            onClick={() => void goCowork('artifacts', 'artifacts')}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            }
          />
          <NavRow
            label="Files"
            onClick={() => { onOpenFiles?.(); onClose?.() }}
            badge={fileCount > 0 ? String(fileCount) : undefined}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            }
          />
          <NavRow
            label="Customize"
            onClick={() => { onSettings?.(); onClose?.() }}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }
          />
          <NavRow
            label="Dispatch"
            onClick={() => void goCowork('dispatch', 'dispatch')}
            badge="Beta"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            }
          />
        </div>

        <FilesPanel />

        <div className="mx-3 mt-2 mb-2 shrink-0" style={{ height: '1px', background: 'var(--color-border)' }} />

        <div className="px-4 pt-3 pb-3">
          <p className="text-[11px] font-semibold tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Pinned
          </p>
          <div
            className="rounded-xl flex items-center justify-center text-[11px] px-2 py-4 min-h-[52px]"
            style={{
              border: '1px dashed var(--color-border)',
              color: 'var(--color-text-muted)',
              background: 'color-mix(in srgb, var(--color-surface) 50%, transparent)',
            }}
          >
            Drag to pin
          </div>
        </div>

        {showFolderBar && (
          <div className="px-3 pt-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                Folders
              </p>
              <button
                type="button"
                onClick={() => void handleNewFolder()}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors"
                style={{ color: 'var(--color-accent)' }}
              >
                + New
              </button>
            </div>
            <div className="flex flex-col gap-0.5 max-h-[140px] overflow-y-auto">
              {folderChip('all', 'All chats')}
              {folderChip('unfiled', 'Unfiled')}
              {projects.map((p) => folderChip(p.id, p.name))}
            </div>
          </div>
        )}

        <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
              <path d="M10 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zm-.7 3.507l2.846 2.847-.848.848L8.454 10.35A4.5 4.5 0 1110 6.5a4.48 4.48 0 01-.7 2.343" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sidebar-search flex-1 bg-transparent text-[13px] outline-none text-[var(--color-text-primary)]"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="text-[var(--color-text-muted)]">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <p className="px-4 pt-4 pb-1.5 text-[11px] font-semibold tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          Recents
        </p>

        <div className="flex-1 overflow-y-auto min-h-0 pb-2">
          {folderFiltered.length === 0 ? (
            <p className="px-5 py-4 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
              {search ? `No results for "${search}"` : 'No conversations yet.'}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                  {group.label}
                </p>
                {group.items.map((conv) => (
                  <div key={conv.id} className="group relative mx-2">
                    {renamingId === conv.id ? (
                      <div className="px-3 py-2 rounded-xl" style={{ background: 'var(--color-surface-active)' }}>
                        <input
                          ref={renameInputRef}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCommitRename()
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onBlur={() => void handleCommitRename()}
                          className="w-full bg-transparent text-[13px] outline-none rounded-md px-1 py-0.5"
                          style={{ color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelect(conv.id)}
                          className={`flex w-full items-center px-3 py-2.5 rounded-xl transition-all duration-150 select-none text-left pr-[4.75rem] ${
                            conv.id === activeId
                              ? 'bg-[var(--color-surface-active)] text-[var(--color-text-primary)]'
                              : 'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] truncate leading-snug">{conv.title || 'New chat'}</p>
                            {showFolderBar && conv.projectId && (
                              <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                {projects.find((p) => p.id === conv.projectId)?.name ?? 'Folder'}
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleStartRename(conv)}
                            title="Rename"
                            aria-label="Rename conversation"
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          {showFolderBar && (
                            <details className="relative">
                              <summary className="list-none w-6 h-6 flex items-center justify-center rounded-lg cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] [&::-webkit-details-marker]:hidden">
                                <span className="text-[14px] leading-none pb-0.5">⋯</span>
                              </summary>
                              <div
                                className="absolute right-0 bottom-full mb-1 min-w-[140px] py-1 rounded-lg z-30 shadow-lg"
                                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                              >
                                <p className="px-2.5 py-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Move to</p>
                                <button
                                  type="button"
                                  className="w-full text-left text-[12px] px-2.5 py-1.5 hover:bg-[var(--color-surface-hover)]"
                                  style={{ color: 'var(--color-text-primary)' }}
                                  onClick={() => { void handleMoveToFolder(conv.id, null); (document.activeElement as HTMLElement | null)?.blur() }}
                                >
                                  Unfiled
                                </button>
                                {projects.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full text-left text-[12px] px-2.5 py-1.5 truncate hover:bg-[var(--color-surface-hover)]"
                                    style={{ color: 'var(--color-text-primary)' }}
                                    onClick={() => { void handleMoveToFolder(conv.id, p.id); (document.activeElement as HTMLElement | null)?.blur() }}
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              </div>
                            </details>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete(conv.id)}
                            title="Delete"
                            aria-label="Delete conversation"
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)]"
                          >
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="border-t shrink-0 relative" style={{ borderColor: 'var(--color-border)' }}>
          <div ref={accountMenuRef} className="px-3 py-3.5">
            {accountMenuOpen && (
              <div
                className="absolute bottom-full left-3 right-3 mb-1 rounded-xl z-20 overflow-hidden shadow-lg"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}
              >
                <p className="text-[11.5px] px-3 pt-3 pb-2 truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {user?.email ?? 'Signed in'}
                </p>
                <div style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                    onClick={() => { setAccountMenuOpen(false); onSettings?.(); onClose?.() }}
                  >
                    <span className="opacity-80 w-4 h-4 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                    </span>
                    Settings
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors text-[var(--color-error)] hover:bg-[color-mix(in_srgb,var(--color-error)_8%,transparent)]"
                    onClick={async () => {
                      setAccountMenuOpen(false)
                      await logout().catch(() => {})
                      resetSession()
                      resetWorkspace()
                      clearAuth()
                      onClose?.()
                    }}
                  >
                    <span className="opacity-80 w-4 h-4 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                      </svg>
                    </span>
                    Log out
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex-1 flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors min-w-0 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left"
                onClick={() => setAccountMenuOpen((o) => !o)}
                title="Account"
                aria-label="Account menu"
                aria-expanded={accountMenuOpen}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                  }}
                >
                  <span className="text-[12px] font-bold" style={{ color: 'var(--color-accent)' }}>{initials}</span>
                </div>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                    {displayName}
                  </span>
                  <span className="block text-[11px] text-[var(--color-text-muted)] leading-tight">{tierLabel}</span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--color-text-muted)]" aria-hidden>
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
