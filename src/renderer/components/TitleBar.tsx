// src/renderer/components/TitleBar.tsx
// Custom frameless titlebar.
// Left: Lumen branding + project switcher  |  Center: mode tabs  |  Right: window controls

import { useState, useEffect, useRef } from 'react'
import { useUIStore, type AppMode } from '../stores/uiStore'
import { useProjectsStore } from '../stores/projectsStore'

const MODES: { id: AppMode; label: string }[] = [
  { id: 'chat', label: 'Chat'  },
  { id: 'helm', label: 'Helm'  },
  { id: 'code', label: 'Code'  },
]

// ─── Project Switcher ─────────────────────────────────────────────────────────

function ProjectSwitcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { projects, activeProjectId, setActiveProject } = useProjectsStore()
  const projectList = Object.values(projects)
  const active = activeProjectId ? projects[activeProjectId] : null

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-transparent
                   text-xs text-text-secondary hover:text-text-primary hover:border-border
                   hover:bg-surface transition-all"
        title={active ? `Project: ${active.name}` : 'No project selected'}
      >
        <span className="text-[11px] leading-none">{active?.emoji ?? '◫'}</span>
        <span className="max-w-[100px] truncate">{active?.name ?? 'No Project'}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" className="text-text-muted shrink-0">
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-surface border border-border rounded-xl
                        shadow-xl z-50 overflow-hidden py-1">
          {projectList.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted">No projects yet</p>
          ) : (
            <>
              {projectList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProject(p.id); setOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left
                              transition-colors
                              ${p.id === activeProjectId
                                ? 'text-text-primary bg-accent/10'
                                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                              }`}
                >
                  <span className="text-[13px] leading-none">{p.emoji ?? '◫'}</span>
                  <span className="truncate flex-1">{p.name}</span>
                  {p.id === activeProjectId && (
                    <span className="text-accent text-[10px]">✓</span>
                  )}
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => { setActiveProject(null); setOpen(false) }}
                  className="w-full px-3 py-1.5 text-xs text-left text-text-muted
                             hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  Clear project
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TitleBar ─────────────────────────────────────────────────────────────────

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { mode, setMode } = useUIStore()

  useEffect(() => {
    const handler = (_: unknown, maximized: boolean) => setIsMaximized(maximized)
    window.tower?.onWindowMaximized?.(handler)
    return () => window.tower?.offWindowMaximized?.(handler)
  }, [])

  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center h-11 px-4 shrink-0 border-b border-border bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* ── Left: branding + project switcher ──────────────────────────────── */}
      <div className="flex items-center gap-2.5 justify-self-start">
        <div className="w-5 h-5 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
          <span className="text-[11px] leading-none" aria-hidden>💡</span>
        </div>
        <span className="text-sm font-semibold text-text-primary tracking-tight">Lumen</span>
        <span className="text-[9px] text-accent/70 font-mono px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 leading-none">
          v2
        </span>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ProjectSwitcher />
      </div>

      {/* ── Center: mode tabs ───────────────────────────────────────────────── */}
      {/* Each tab is its own button — separated, bordered, wider. No shared pill. */}
      <div
        className="flex items-center gap-2 justify-self-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={[
              'min-w-[88px] h-8 px-5 rounded-lg border text-[13px] font-medium transition-all duration-150',
              mode === id
                ? 'bg-accent text-white border-accent shadow-[0_0_0_1px_rgba(139,92,246,0.35)]'
                : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:border-accent/40 hover:bg-surface-hover',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Right: window controls ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0.5 justify-self-end"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => window.tower.minimize()}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Minimize"
        >
          <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
            <rect width="10" height="1.5" rx="0.75" />
          </svg>
        </button>

        <button
          onClick={() => window.tower.maximize()}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="3" y="0.65" width="7.35" height="7.35" rx="1" />
              <path d="M0.65 3v6.35a1 1 0 001 1h6.35" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="0.65" y="0.65" width="8.7" height="8.7" rx="1" />
            </svg>
          )}
        </button>

        <button
          onClick={() => window.tower.close()}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted
                     hover:text-white hover:bg-red-500/80 transition-colors"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  )
}
