import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPane } from './ChatPane'
import { useAppStore } from '../stores/appStore'
import { createConversation } from '../lib/api'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { activeId, conversations, upsertConversation, setActiveId } = useAppStore()

  const activeConv = conversations.find((c) => c.id === activeId)

  const handleNew = async () => {
    const conv = await createConversation()
    upsertConversation(conv)
    setActiveId(conv.id)
  }

  return (
    <div
      className="flex w-full overflow-hidden bg-background"
      style={{ height: 'var(--viewport-height, 100dvh)' }}
    >
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 flex h-full">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile top bar — frosted glass with accent gradient bottom border */}
        <div
          className="md:hidden flex items-center gap-2 px-2 py-2 shrink-0 relative"
          style={{
            background: 'rgba(8,8,16,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 14%, transparent)',
          }}
        >
          {/* Accent gradient line at very bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 30%, transparent) 40%, color-mix(in srgb, var(--color-accent) 30%, transparent) 60%, transparent)' }}
          />

          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl
                       text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
            </svg>
          </button>

          {/* Title */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            {!activeConv && (
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="shrink-0">
                <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="10" cy="10" r="2.5" fill="#8b5cf6"/>
              </svg>
            )}
            <p className="text-[14px] font-semibold text-text-primary truncate" style={{ letterSpacing: '-0.3px' }}>
              {activeConv?.title || 'Lumen'}
            </p>
          </div>

          {/* New chat */}
          <button
            onClick={handleNew}
            title="New chat"
            className="w-9 h-9 flex items-center justify-center rounded-xl
                       text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="7.5" y1="1" x2="7.5" y2="14"/>
              <line x1="1" y1="7.5" x2="14" y2="7.5"/>
            </svg>
          </button>
        </div>

        <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ChatPane />
        </main>
      </div>
    </div>
  )
}
