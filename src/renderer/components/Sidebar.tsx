import { useState, useMemo, useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore, isClaudeModel } from '../stores/settingsStore'
import { useUIStore, type HelmNav } from '../stores/uiStore'
import { SettingsPanel } from './SettingsPanel'
import type { Conversation } from '../stores/chatStore'
import {
  SIDEBAR_FOCUS_SEARCH_EVENT,
  OPEN_SETTINGS_EVENT,
  OPEN_ARTIFACTS_EVENT,
  OPEN_PROJECTS_EVENT,
} from '../hooks/useKeyboardShortcuts'

// ─── Helm navigation ──────────────────────────────────────────────────────────

const HELM_NAV: { id: HelmNav; label: string; desc: string }[] = [
  { id: 'new-task',   label: 'New Task',   desc: 'Start an automated task'    },
  { id: 'projects',   label: 'Projects',   desc: 'Manage your projects'       },
  { id: 'scheduled',  label: 'Scheduled',  desc: 'Recurring & timed tasks'    },
  { id: 'customize',  label: 'Customize',  desc: 'Helm config & permissions'  },
  { id: 'dispatch',   label: 'Dispatch',   desc: 'Route tasks to agents'      },
]

// ─── Chat + Code top-level nav ─────────────────────────────────────────────────
// Each mode has persistent top-of-sidebar action items, matching the Claude
// desktop pattern. `action` is the behavior when clicked.

type NavAction =
  | { kind: 'create' }           // create a new conversation in current mode
  | { kind: 'settings' }         // open settings panel
  | { kind: 'artifacts' }        // open the artifacts gallery for active conv
  | { kind: 'projects' }         // open the projects manager
  | { kind: 'stub'; message: string } // placeholder for not-yet-built features

type SidebarIcon =
  | 'plus' | 'folder' | 'sliders' | 'package'
  | 'zap'  | 'routines' | 'more'

interface SidebarNavItem {
  id: string
  label: string
  icon: SidebarIcon
  action: NavAction
}

const CHAT_NAV: SidebarNavItem[] = [
  { id: 'new-chat',   label: 'New Chat',   icon: 'plus',    action: { kind: 'create'  } },
  { id: 'projects',   label: 'Projects',   icon: 'folder',  action: { kind: 'projects' } },
  { id: 'customize',  label: 'Customize',  icon: 'sliders', action: { kind: 'settings' } },
  { id: 'artifacts',  label: 'Artifacts',  icon: 'package', action: { kind: 'artifacts' } },
]

const CODE_NAV: SidebarNavItem[] = [
  { id: 'new-session', label: 'New Session', icon: 'plus',     action: { kind: 'create'  } },
  { id: 'projects',    label: 'Projects',    icon: 'folder',   action: { kind: 'projects' } },
  { id: 'customize',   label: 'Customize',   icon: 'sliders',  action: { kind: 'settings' } },
  { id: 'more',        label: 'More',        icon: 'more',     action: { kind: 'stub', message: 'More options coming soon' } },
]

// ─── Icon atlas (small inline SVGs — lucide-style) ─────────────────────────────

function NavIcon({ name }: { name: SidebarIcon }) {
  const common = 'w-[15px] h-[15px] shrink-0'
  const stroke = 'currentColor'
  const sw = 1.75
  switch (name) {
    case 'plus':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      )
    case 'folder':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'sliders':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      )
    case 'package':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    case 'zap':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    case 'routines':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9" /><polyline points="21 3 21 9 15 9" />
        </svg>
      )
    case 'more':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5"  r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      )
  }
}

// ─── Shared: top-level nav item row ────────────────────────────────────────────

function NavItem({
  item, onClick,
}: {
  item: SidebarNavItem
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium
                 text-text-secondary hover:text-text-primary hover:bg-surface-hover
                 transition-colors"
    >
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </button>
  )
}

// ─── Shared: section header (Pinned / Recents) ────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[11px] font-medium text-text-muted tracking-wide">
      {label}
    </p>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

// ─── ConversationItem ─────────────────────────────────────────────────────────

interface ConversationItemProps {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onOpenWindow: () => void
  onTogglePin: () => void
}

function ConversationItem({ conv, isActive, onSelect, onDelete, onOpenWindow, onTogglePin }: ConversationItemProps) {
  const lastMsg = conv.messages[conv.messages.length - 1]
  const preview = lastMsg?.content?.slice(0, 55) ?? 'No messages yet'
  const isClaude = isClaudeModel(conv.model)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={[
        'group relative pl-3 pr-2 py-2.5 rounded-lg cursor-pointer transition-all duration-150 select-none',
        isActive
          ? 'bg-surface border border-border text-text-primary'
          : 'text-text-secondary hover:bg-surface hover:text-text-primary border border-transparent',
      ].join(' ')}
    >
      {/* Active left bar */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-accent rounded-full" />
      )}

      {/* Title */}
      <div className="flex items-center gap-1.5 pr-8 mb-0.5">
        <span
          className={`text-[9px] shrink-0 ${isClaude ? 'text-violet-400' : 'text-text-muted'}`}
          title={isClaude ? 'Claude' : 'Ollama'}
        >
          {isClaude ? '●' : '○'}
        </span>
        <p className="text-[12.5px] font-medium truncate leading-tight">{conv.title}</p>
      </div>

      {/* Preview + time */}
      <div className="flex items-center gap-2 pl-3.5">
        <p className="text-[11px] text-text-muted truncate flex-1">{preview}</p>
        <span className="text-[10px] text-text-muted shrink-0 tabular-nums">{relativeTime(conv.updatedAt)}</span>
      </div>

      {/* Pin indicator — shown when pinned, even when not hovered */}
      {conv.pinned && (
        <div
          className="absolute right-1.5 top-2 text-accent opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none"
          title="Pinned"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
        </div>
      )}

      {/* Action buttons — shown on hover */}
      <div
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5
                   opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={[
            'w-5 h-5 flex items-center justify-center rounded transition-all',
            conv.pinned
              ? 'text-accent hover:bg-accent/10'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
          ].join(' ')}
          onClick={onTogglePin}
          title={conv.pinned ? 'Unpin' : 'Pin'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill={conv.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-all"
          onClick={onOpenWindow}
          title="Open in new window"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M3.5 1H1a.5.5 0 00-.5.5v6.5a.5.5 0 00.5.5h6.5a.5.5 0 00.5-.5V5.5" />
            <path d="M5.5 1H8m0 0v2.5M8 1L4.5 4.5" />
          </svg>
        </button>
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

// ─── HelmNavItem ──────────────────────────────────────────────────────────────

function HelmNavItem({
  item, isActive, onClick,
}: {
  item: (typeof HELM_NAV)[number]
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={item.desc}
      className={[
        'relative w-full flex items-center px-3 py-2 rounded-lg text-left transition-all duration-150',
        isActive
          ? 'bg-surface border border-border text-text-primary'
          : 'text-text-secondary hover:bg-surface hover:text-text-primary border border-transparent',
      ].join(' ')}
    >
      {isActive && (
        <div className="absolute left-0 top-2 bottom-2 w-[2px] bg-accent rounded-full" />
      )}
      <span className="text-[12.5px] font-medium">{item.label}</span>
    </button>
  )
}

// ─── SettingsButton (shared footer) ──────────────────────────────────────────
// Full-opacity cog icon (lucide Settings). Hover brightens the background and
// spins the cog for a subtle tactile cue.

function SettingsToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'group flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-medium w-full transition-colors',
        active
          ? 'bg-accent/15 text-accent'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
      ].join(' ')}
    >
      <svg
        width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0 transition-transform duration-300 group-hover:rotate-45"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Settings
    </button>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { conversations, activeConversationId, createConversation, setActiveConversation, deleteConversation, togglePinned } =
    useChatStore()
  const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore()
  const { mode, helmNav, setHelmNav } = useUIStore()

  const [showSettings, setShowSettings] = useState(false)
  const [search, setSearch] = useState('')
  const [stubMessage, setStubMessage] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Listen for Ctrl+K (focus search) and Ctrl+, (open settings) — dispatched
  // from the global useKeyboardShortcuts hook.
  useEffect(() => {
    const focusSearch = () => {
      // If settings are open, close them first so the sidebar list is visible.
      if (showSettings) setShowSettings(false)
      // Next tick so the input is in the DOM if we just toggled off settings.
      setTimeout(() => searchRef.current?.focus(), 0)
    }
    const openSettings = () => setShowSettings(true)

    window.addEventListener(SIDEBAR_FOCUS_SEARCH_EVENT, focusSearch)
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings)
    return () => {
      window.removeEventListener(SIDEBAR_FOCUS_SEARCH_EVENT, focusSearch)
      window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings)
    }
  }, [showSettings])

  const handleNewConversation = () => {
    const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
    // Pass the current mode so Chat and Code conversations don't bleed into each other.
    const convMode = mode === 'code' ? 'code' : 'chat'
    createConversation(model, convMode)
    setShowSettings(false)
  }

  // Dispatch a nav action clicked from the top-of-sidebar list.
  const handleNavAction = (action: NavAction) => {
    if (action.kind === 'create') {
      handleNewConversation()
    } else if (action.kind === 'settings') {
      setShowSettings(true)
    } else if (action.kind === 'artifacts') {
      // ChatPane listens for this and opens the most recent artifact from
      // the active conversation (or shows a "none" toast).
      window.dispatchEvent(new CustomEvent(OPEN_ARTIFACTS_EVENT))
    } else if (action.kind === 'projects') {
      // Layout listens for this and mounts the ProjectsPane overlay.
      window.dispatchEvent(new CustomEvent(OPEN_PROJECTS_EVENT))
    } else {
      // Show the stub message inline for a couple seconds — cheap "coming soon" UX
      setStubMessage(action.message)
      setTimeout(() => setStubMessage((cur) => (cur === action.message ? null : cur)), 2200)
    }
  }

  const handleOpenWindow = (convId: string) => {
    window.tower?.openConversationWindow?.(convId)
  }

  // Filter by mode first — a conversation without a `mode` field (legacy data)
  // is treated as 'chat' so nothing breaks on existing stores.
  const sorted = useMemo(() => {
    const activeMode = mode === 'code' ? 'code' : 'chat'
    return Object.values(conversations)
      .filter((c) => (c.mode ?? 'chat') === activeMode)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [conversations, mode])

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter(
      (c) => c.title.toLowerCase().includes(q) ||
             c.messages.some((m) => m.content?.toLowerCase().includes(q))
    )
  }, [sorted, search])

  // Split into pinned (top) and recents (rest). Pinned are sorted by pinnedAt
  // descending (most recently pinned first). Recents use updatedAt order.
  // When searching, pinned vs recent split is collapsed — users want results.
  const { pinnedList, recentsList } = useMemo(() => {
    if (search.trim()) return { pinnedList: [], recentsList: filtered }
    const pinned = filtered.filter((c) => c.pinned)
      .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
    const recents = filtered.filter((c) => !c.pinned)
    return { pinnedList: pinned, recentsList: recents }
  }, [filtered, search])

  // ── Settings overlay (shared between modes) ─────────────────────────────────
  if (showSettings) {
    return (
      <aside className="w-[260px] shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden">
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </aside>
    )
  }

  // ── Helm sidebar ────────────────────────────────────────────────────────────
  if (mode === 'helm') {
    return (
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden">
        {/* Mode label */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
            Helm
          </p>
          <button
            onClick={() => setHelmNav('new-task')}
            className="w-5 h-5 flex items-center justify-center rounded text-text-muted
                       hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="New Task"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <line x1="5.5" y1="1" x2="5.5" y2="10" />
              <line x1="1" y1="5.5" x2="10" y2="5.5" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {HELM_NAV.map((item) => (
            <HelmNavItem
              key={item.id}
              item={item}
              isActive={helmNav === item.id}
              onClick={() => setHelmNav(item.id)}
            />
          ))}
        </nav>
        {/* Customize + user footer */}
        <div className="px-2 pt-2 border-t border-border">
          <NavItem
            item={{ id: 'customize', label: 'Customize', icon: 'sliders', action: { kind: 'settings' } }}
            onClick={() => setShowSettings(true)}
          />
        </div>
        <div className="border-t border-border px-3 py-2.5 shrink-0 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-accent">W</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-medium text-text-primary truncate">Will</p>
            <p className="text-[10.5px] text-text-muted truncate">Helm control</p>
          </div>
        </div>
      </aside>
    )
  }

  // ── Chat / Code sidebar ──────────────────────────────────────────────────────
  // Layout mirrors the Claude desktop app:
  //   1. Mode label header (tight, compact)
  //   2. Persistent top-level nav (New Chat/Projects/Customize/Artifacts or Code equivalents)
  //   3. Search
  //   4. "Pinned" section header + empty hint
  //   5. "Recents" section header + conversation list
  //   6. User footer (Will)
  const navItems = mode === 'code' ? CODE_NAV : CHAT_NAV

  return (
    <aside className="w-[260px] shrink-0 flex flex-col border-r border-border bg-sidebar overflow-hidden">

      {/* Mode label */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
          {mode === 'code' ? 'Code' : 'Chat'}
        </p>
      </div>

      {/* Persistent top-level nav */}
      <div className="px-2 space-y-0.5">
        {navItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            onClick={() => handleNavAction(item.action)}
          />
        ))}
      </div>

      {/* Stub message toast (inline, not a popup) */}
      {stubMessage && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-md bg-accent/10 border border-accent/20">
          <p className="text-[11px] text-accent">{stubMessage}</p>
        </div>
      )}

      {/* Search */}
      <div className="px-3 pt-4 pb-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            width="11" height="11" viewBox="0 0 15 15" fill="none">
            <path d="M10 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zm-.7 3.507l2.846 2.847-.848.848L8.454 10.35A4.5 4.5 0 1110 6.5a4.48 4.48 0 01-.7 2.343"
              fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search… (Ctrl+K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[12.5px] bg-surface border border-border rounded-lg
                       text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent/40
                       transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable region: Pinned + Recents */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-2">

        {/* Pinned section — visible only when not searching */}
        {!search && (
          <>
            <SectionHeader label="Pinned" />
            {pinnedList.length === 0 ? (
              <div className="px-3 pb-1">
                <p className="text-[11px] text-text-muted italic">
                  Hover a conversation and click the pin icon to pin it here.
                </p>
              </div>
            ) : (
              <div className="px-2 space-y-0.5">
                {pinnedList.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeConversationId}
                    onSelect={() => setActiveConversation(conv.id)}
                    onDelete={() => deleteConversation(conv.id)}
                    onOpenWindow={() => handleOpenWindow(conv.id)}
                    onTogglePin={() => togglePinned(conv.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Recents / Results section */}
        <SectionHeader label={search ? 'Results' : 'Recents'} />
        <div className="px-2">
          {recentsList.length === 0 ? (
            search ? (
              <p className="px-2 py-2 text-[11.5px] text-text-muted">No results for "{search}"</p>
            ) : mode === 'code' ? (
              <p className="px-2 py-2 text-[11.5px] text-text-muted italic">
                No code sessions yet. Use "New Session" above to start one.
              </p>
            ) : (
              <p className="px-2 py-2 text-[11.5px] text-text-muted italic">
                No conversations yet. Use "New Chat" above to start one.
              </p>
            )
          ) : (
            <div className="space-y-0.5">
              {recentsList.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={() => setActiveConversation(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                  onOpenWindow={() => handleOpenWindow(conv.id)}
                  onTogglePin={() => togglePinned(conv.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User footer — pinned to bottom */}
      <div className="border-t border-border px-3 py-2.5 shrink-0 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-semibold text-accent">W</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-text-primary truncate">Will</p>
          <p className="text-[10.5px] text-text-muted truncate tabular-nums">
            {sorted.length} {mode === 'code' ? 'sessions' : 'chats'}
          </p>
        </div>
      </div>
    </aside>
  )
}
