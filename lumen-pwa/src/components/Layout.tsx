import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPane } from './ChatPane'
import { useAppStore } from '../stores/appStore'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { activeId, conversations } = useAppStore()

  const activeConv = conversations.find((c) => c.id === activeId)

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">

      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 flex h-full">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
            </svg>
          </button>
          <p className="text-[13px] font-medium text-text-primary truncate flex-1">
            {activeConv?.title || 'Lumen'}
          </p>
        </div>

        <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ChatPane />
        </main>
      </div>
    </div>
  )
}
