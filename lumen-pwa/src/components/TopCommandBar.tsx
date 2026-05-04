import { useEffect, useRef, useState } from 'react'
import { createConversation } from '../lib/api'
import { useAppStore } from '../stores/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
interface TopCommandBarProps {
  onOpenSettings: () => void
  onToggleSidebar: () => void
  onFocusSearch: () => void  // kept for Layout.tsx Ctrl+K shortcut; not wired to a toolbar button
  sidebarCollapsed: boolean
}

function Shortcut({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">{children}</span>
}

export function TopCommandBar({
  onOpenSettings,
  onToggleSidebar,
  sidebarCollapsed,
}: TopCommandBarProps) {
  const workspaceMode = useWorkspaceStore((s) => s.mode)
  const setActiveId = useAppStore((s) => s.setActiveId)
  const shell = typeof window !== 'undefined' ? window.lumenShell : undefined

  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const newConversation = async () => {
    const conv = await createConversation({ workspace: workspaceMode })
    useWorkspaceStore.getState().upsertInList(conv)
    setActiveId(conv.id)
    setMenuOpen(false)
  }

  const btn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]'

  /** Accent border only when menu is open — matches Claude's active state */
  const menuBtnOuter = menuOpen
    ? `${btn} border border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]`
    : btn

  const menuBtn =
    'w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'

  const run = (fn: () => void) => () => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={wrapRef} className="flex items-center gap-0.5">
      <div className="relative">
        <button
          type="button"
          className={menuBtnOuter}
          aria-label="Application menu"
          aria-expanded={menuOpen}
          title="Menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
          </svg>
        </button>

        {menuOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-[60] w-[min(calc(100vw-24px),280px)] max-h-[min(80vh,520px)] overflow-y-auto py-2 rounded-xl border shadow-xl"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            }}
          >
            <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">File</p>
            <button type="button" className={menuBtn} onClick={() => void newConversation()}>
              <span>New conversation</span>
              <Shortcut>Ctrl+N</Shortcut>
            </button>
            <button
              type="button"
              className={menuBtn}
              onClick={() => {
                onOpenSettings()
                setMenuOpen(false)
              }}
            >
              <span>Settings…</span>
              <Shortcut>Ctrl+,</Shortcut>
            </button>
            <div className="h-px bg-[var(--color-border)] my-1.5 mx-2" />
            <button
              type="button"
              className={menuBtn}
              onClick={() => {
                if (shell?.isElectron) shell.close()
                else window.close()
                setMenuOpen(false)
              }}
            >
              <span>Close window</span>
              <Shortcut>Ctrl+W</Shortcut>
            </button>

            <p className="px-3 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Edit</p>
            <button type="button" className={menuBtn} onClick={run(() => document.execCommand('undo'))}>
              <span>Undo</span>
              <Shortcut>Ctrl+Z</Shortcut>
            </button>
            <button type="button" className={menuBtn} onClick={run(() => document.execCommand('redo'))}>
              <span>Redo</span>
              <Shortcut>Ctrl+Shift+Z</Shortcut>
            </button>
            <div className="h-px bg-[var(--color-border)] my-1 mx-2" />
            <button type="button" className={menuBtn} onClick={run(() => document.execCommand('cut'))}>
              <span>Cut</span>
              <Shortcut>Ctrl+X</Shortcut>
            </button>
            <button type="button" className={menuBtn} onClick={run(() => document.execCommand('copy'))}>
              <span>Copy</span>
              <Shortcut>Ctrl+C</Shortcut>
            </button>
            <button type="button" className={menuBtn} onClick={run(() => document.execCommand('paste'))}>
              <span>Paste</span>
              <Shortcut>Ctrl+V</Shortcut>
            </button>
            <button type="button" className={menuBtn} onClick={run(() => document.execCommand('selectAll'))}>
              <span>Select all</span>
              <Shortcut>Ctrl+A</Shortcut>
            </button>
            <div className="h-px bg-[var(--color-border)] my-1 mx-2" />
            <button
              type="button"
              className={menuBtn}
              onClick={() => {
                const q = window.prompt('Find')
                if (q) (window as unknown as { find: (s: string) => boolean }).find(q)
              }}
            >
              <span>Find</span>
              <Shortcut>Ctrl+F</Shortcut>
            </button>

            <p className="px-3 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">View</p>
            <button
              type="button"
              className={menuBtn}
              onClick={() => {
                window.location.reload()
                setMenuOpen(false)
              }}
            >
              <span>Reload</span>
              <Shortcut>Ctrl+R</Shortcut>
            </button>
            <button
              type="button"
              className={menuBtn}
              onClick={() => void navigator.clipboard.writeText(window.location.href)}
            >
              <span>Copy URL</span>
            </button>

            <p className="px-3 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Help</p>
            <button
              type="button"
              className={menuBtn}
              onClick={() => window.open('https://github.com/Y0NK00/lumen', '_blank', 'noopener,noreferrer')}
            >
              Open documentation
            </button>
            <button type="button" className={menuBtn} onClick={() => window.alert('Lumen — personal AI assistant')}>
              About…
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className={btn}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        onClick={onToggleSidebar}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <line x1="5.5" y1="3" x2="5.5" y2="13" />
        </svg>
      </button>

      <button type="button" className={btn} aria-label="Appearance" title="Appearance settings" onClick={onOpenSettings}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <button type="button" className={btn} aria-label="Back" title="Back" onClick={() => window.history.back()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button type="button" className={btn} aria-label="Forward" title="Forward" onClick={() => window.history.forward()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
