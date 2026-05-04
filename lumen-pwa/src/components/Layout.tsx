import { useState, useRef, useCallback, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPane } from './ChatPane'
import { WorkspaceTabs } from './WorkspaceTabs'
import { WorkspaceFeaturePanels } from './WorkspaceFeaturePanels'
import { SettingsView } from './SettingsView'
import { DesktopMainHeader } from './WindowChrome'
import { TopCommandBar } from './TopCommandBar'
import { useAppStore } from '../stores/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { createConversation } from '../lib/api'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [featurePanel, setFeaturePanel] = useState<null | 'projects' | 'artifacts' | 'dispatch'>(null)
  const { activeId, conversations, setActiveId } = useAppStore()
  const workspaceMode = useWorkspaceStore((s) => s.mode)
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace)

  const activeConv = conversations.find((c) => c.id === activeId)

  const handleNew = async () => {
    const conv = await createConversation({ workspace: workspaceMode })
    useWorkspaceStore.getState().upsertInList(conv)
    setActiveId(conv.id)
  }

  const headerTitle =
    workspaceMode === 'cowork'
      ? 'Cowork'
      : workspaceMode === 'code'
        ? 'Code'
        : (activeConv?.title || 'Lumen')

  // ── Swipe-right-to-open-sidebar gesture ──
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const focusSidebarSearch = useCallback(() => {
    document.querySelector<HTMLInputElement>('.sidebar-search')?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setDesktopSidebarOpen((s) => !s)
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        focusSidebarSearch()
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusSidebarSearch])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    // Only trigger when swipe starts within 40px of left edge,
    // moves right at least 60px, and is mostly horizontal (dy < 80px)
    if (touchStartX.current < 40 && dx > 60 && dy < 80) {
      setSidebarOpen(true)
    }
  }, [])

  return (
    <div
      className="flex w-full min-h-0 overflow-hidden rounded-[inherit]"
      style={{ height: '100%', background: 'var(--color-background)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop sidebar — Claude-style floating card; width collapses to hide */}
      <div
        className={`hidden sm:flex shrink-0 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
          desktopSidebarOpen ? 'w-[308px]' : 'w-0'
        }`}
      >
        <div
          className={`h-full min-h-0 flex flex-col p-2 box-border overflow-hidden ${
            desktopSidebarOpen ? 'w-[292px]' : 'w-0 min-w-0'
          }`}
        >
          <Sidebar
            onSettings={() => setSettingsOpen(true)}
            onOpenFeaturePanel={setFeaturePanel}
            onNewChat={() => void handleNew()}
            toolbarSlot={
              <TopCommandBar
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleSidebar={() => setDesktopSidebarOpen((s) => !s)}
                onFocusSearch={focusSidebarSearch}
                sidebarCollapsed={!desktopSidebarOpen}
              />
            }
          />
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as React.CSSProperties}
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              onSettings={() => { setSidebarOpen(false); setSettingsOpen(true) }}
              onOpenFeaturePanel={(p) => { setFeaturePanel(p); setSidebarOpen(false) }}
              onNewChat={() => { void handleNew(); setSidebarOpen(false) }}
            />
          </div>
        </div>
      )}

      {/* Settings overlay */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50">
          <SettingsView onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      <WorkspaceFeaturePanels open={featurePanel} onClose={() => setFeaturePanel(null)} />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <div
          className="sm:hidden flex items-center gap-2 px-2 py-2 shrink-0 relative"
          style={{
            // No backdrop-filter here — it creates a GPU compositing layer that
            // causes iOS Safari to flash black during rapid streaming re-renders.
            background: 'rgba(8,8,16,0.97)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 14%, transparent)',
          } as React.CSSProperties}
        >
          {/* Accent gradient line at very bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 30%, transparent) 40%, color-mix(in srgb, var(--color-accent) 30%, transparent) 60%, transparent)' }}
          />

          {/* Hamburger */}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4"/>
              <line x1="2" y1="8" x2="14" y2="8"/>
              <line x1="2" y1="12" x2="14" y2="12"/>
            </svg>
          </button>

          {/* Title */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            {workspaceMode === 'chat' && !activeConv && (
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="shrink-0">
                <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="10" cy="10" r="2.5" fill="var(--color-accent)"/>
              </svg>
            )}
            <p
              className="text-[14px] font-semibold truncate"
              style={{ letterSpacing: '-0.3px', color: 'var(--color-text-primary)' }}
            >
              {headerTitle}
            </p>
          </div>

          {/* New chat */}
          <button
            type="button"
            aria-label="New conversation"
            onClick={handleNew}
            title="New chat"
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
        </div>

        <div
          className="sm:hidden shrink-0 px-2 pb-2 pt-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <WorkspaceTabs
            mode={workspaceMode}
            onChange={(m) => { void switchWorkspace(m) }}
            className="w-full"
          />
        </div>

        <DesktopMainHeader
          sidebarButton={
            !desktopSidebarOpen ? (
              <TopCommandBar
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleSidebar={() => setDesktopSidebarOpen((s) => !s)}
                onFocusSearch={focusSidebarSearch}
                sidebarCollapsed={true}
              />
            ) : undefined
          }
          workspacePanel={
            <WorkspaceTabs
              mode={workspaceMode}
              onChange={(m) => { void switchWorkspace(m) }}
              variant="main"
            />
          }
        />

        <main className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden w-full">
          <ChatPane />
        </main>
      </div>
    </div>
  )
}
