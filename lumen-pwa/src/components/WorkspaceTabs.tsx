import type { ReactNode } from 'react'
import type { WorkspaceMode } from '../stores/workspaceStore'

const TABS: { id: WorkspaceMode; label: string; icon: ReactNode }[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'cowork',
    label: 'Cowork',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0" aria-hidden>
        <path d="M9 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="4" width="4" height="4" rx="1" />
        <rect x="3" y="10" width="4" height="4" rx="1" />
        <rect x="3" y="16" width="4" height="4" rx="1" />
        <line x1="10" y1="6" x2="21" y2="6" strokeLinecap="round" />
        <line x1="10" y1="12" x2="21" y2="12" strokeLinecap="round" />
        <line x1="10" y1="18" x2="21" y2="18" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'code',
    label: 'Code',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0" aria-hidden>
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

interface WorkspaceTabsProps {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
  className?: string
  /**
   * main = compact w-fit header strip hugging the three tabs (default).
   * sidebar = full-width inside the sidebar rail.
   */
  variant?: 'main' | 'sidebar'
}

export function WorkspaceTabs({ mode, onChange, className = '', variant = 'main' }: WorkspaceTabsProps) {
  const isSidebar = variant === 'sidebar'

  const shellClass = isSidebar
    ? 'min-w-0 w-full gap-0.5 p-1 rounded-xl'
    : 'w-fit max-w-[min(100vw-2rem,380px)] gap-1 p-1.5 rounded-xl shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-border)_55%,transparent)]'

  const tabClass = isSidebar
    ? 'min-h-[36px] px-1.5 py-2 text-[11px] sm:text-[12px] rounded-lg'
    : 'min-h-[36px] px-3 sm:px-4 py-1.5 text-[13px] rounded-lg min-w-[5.5rem]'

  return (
    <div
      className={`grid grid-cols-3 ${shellClass} ${className}`}
      style={{ background: 'var(--color-surface)' }}
      role="tablist"
      aria-label="Workspace"
    >
      {TABS.map((tab) => {
        const active = mode === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={tab.label}
            onClick={() => onChange(tab.id)}
            className={`min-w-0 flex items-center justify-center gap-2 font-medium transition-colors duration-150 truncate ${tabClass}`}
            style={{
              background: active ? 'var(--color-surface-active)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.25)' : 'none',
            }}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
