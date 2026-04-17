import { Sidebar } from './Sidebar'
import { ChatPane } from './ChatPane'

export function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ChatPane />
      </main>
    </div>
  )
}