import type { CSSProperties, ReactNode } from 'react'

const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
const drag = { WebkitAppRegion: 'drag' } as CSSProperties

export function isElectronShell(): boolean {
  return typeof window !== 'undefined' && window.lumenShell?.isElectron === true
}

const BROWSER_CHROME_HINT =
  'Minimize / maximize need the Lumen desktop window. From lumen-pwa: npm run dev, then npm run electron:dev — or use your browser window controls.'

/** Window controls: wired in Electron; visible in the browser with limited behavior + tooltips. */
export function WindowControlButtons({ className = '' }: { className?: string }) {
  const shell = typeof window !== 'undefined' ? window.lumenShell : undefined
  const electron = shell?.isElectron === true

  const btn =
    'flex h-8 w-9 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-background)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:!bg-transparent'

  return (
    <div className={`flex items-center gap-0.5 ${className}`} style={noDrag}>
      <button
        type="button"
        className={btn}
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Minimize"
        disabled={!electron}
        title={electron ? 'Minimize' : BROWSER_CHROME_HINT}
        onClick={() => electron && shell?.minimize()}
        onMouseEnter={(e) => {
          if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-surface-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="10" height="1" viewBox="0 0 10 1" aria-hidden>
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Maximize or restore"
        disabled={!electron}
        title={electron ? 'Maximize' : BROWSER_CHROME_HINT}
        onClick={() => electron && shell?.toggleMaximize()}
        onMouseEnter={(e) => {
          if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-surface-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <rect x="1" y="1" width="9" height="9" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label={electron ? 'Close window' : 'Close tab or window'}
        title={electron ? 'Close' : 'Closes this tab when the page opened it; otherwise use the browser close button.'}
        onClick={() => {
          if (electron && shell) shell.close()
          else window.close()
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'color-mix(in srgb, #e81123 90%, transparent)'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-secondary)'
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
          <path d="M1 1l8 8M9 1L1 9" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Desktop header — single centered row:
 *   [sidebarButton? left] [drag] [workspacePanel centered] [drag] [window controls right]
 *
 * sidebarButton is only passed when the sidebar is collapsed so the user can reopen it.
 */
export function DesktopMainHeader({
  workspacePanel,
  sidebarButton,
}: {
  workspacePanel: ReactNode
  sidebarButton?: ReactNode
}) {
  const electron = isElectronShell()

  return (
    <div
      className="hidden sm:flex shrink-0 border-b items-center min-h-[52px] px-2 gap-1"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-background)',
      }}
    >
      {/* Left slot — sidebar-open button shown only when sidebar is collapsed */}
      <div className="shrink-0 flex items-center" style={noDrag}>
        {sidebarButton}
      </div>

      {/* Left drag spacer */}
      <div
        className="flex-1 min-w-0 self-stretch"
        style={electron ? drag : undefined}
        aria-hidden={electron}
      />

      {/* Centered workspace panel (tabs + new chat) */}
      <div className="shrink-0 flex flex-col items-center gap-1 py-1.5" style={noDrag}>
        {workspacePanel}
      </div>

      {/* Right drag spacer */}
      <div
        className="flex-1 min-w-0 self-stretch"
        style={electron ? drag : undefined}
        aria-hidden={electron}
      />

      {/* Window controls */}
      <div className="shrink-0 flex items-center py-0.5 pl-1" style={noDrag}>
        <WindowControlButtons />
      </div>
    </div>
  )
}
