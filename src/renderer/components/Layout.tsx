import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPane } from './ChatPane'
import { HelmPane } from './HelmPane'
import { TitleBar } from './TitleBar'
import { ProjectsPane } from './ProjectsPane'
import { SettingsPage } from './SettingsPage'
import { useUIStore } from '../stores/uiStore'
import { OPEN_PROJECTS_EVENT, OPEN_SETTINGS_EVENT } from '../hooks/useKeyboardShortcuts'

export function Layout() {
  const { mode, sidebarCollapsed } = useUIStore()
  const [showProjects, setShowProjects] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Sidebar dispatches OPEN_PROJECTS_EVENT; we toggle the overlay.
  useEffect(() => {
    const handler = () => setShowProjects(true)
    window.addEventListener(OPEN_PROJECTS_EVENT, handler)
    return () => window.removeEventListener(OPEN_PROJECTS_EVENT, handler)
  }, [])

  // Ctrl+, and UserMenu both dispatch OPEN_SETTINGS_EVENT → full-page overlay.
  useEffect(() => {
    const handler = () => setShowSettings(true)
    window.addEventListener(OPEN_SETTINGS_EVENT, handler)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler)
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TitleBar />
      {showSettings ? (
        // Settings covers the full content area (below the title bar)
        <SettingsPage onClose={() => setShowSettings(false)} />
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar is mounted either way so state (search text, etc.) is
              preserved across toggles. Collapse is done by hiding its DOM. */}
          {!sidebarCollapsed && <Sidebar />}
          <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {showProjects
              ? <ProjectsPane onClose={() => setShowProjects(false)} />
              : mode === 'helm' ? <HelmPane /> : <ChatPane />}
          </main>
        </div>
      )}
    </div>
  )
}
