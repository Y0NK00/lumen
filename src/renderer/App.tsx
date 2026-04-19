import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { useChatStore } from './stores/chatStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App() {
  const { createConversation, conversations, setActiveConversation, activeConversationId } = useChatStore()

  // Register Ctrl+N / Ctrl+K / Ctrl+1/2/3 / Ctrl+,
  useKeyboardShortcuts()

  useEffect(() => {
    // If this window was opened with ?conv=<id> (via "open in new window"),
    // select that conversation. Otherwise create/restore the default one.
    const params = new URLSearchParams(window.location.search)
    const convParam = params.get('conv')

    if (convParam && conversations[convParam]) {
      setActiveConversation(convParam)
      return
    }

    const hasConversations = Object.keys(conversations).length > 0
    if (!hasConversations || !activeConversationId) createConversation()
  }, []) // eslint-disable-line

  return <Layout />
}
