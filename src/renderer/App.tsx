import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { useChatStore } from './stores/chatStore'

export default function App() {
  const { createConversation, conversations, activeConversationId } = useChatStore()

  useEffect(() => {
    const hasConversations = Object.keys(conversations).length > 0
    if (!hasConversations || !activeConversationId) createConversation()
  }, []) // eslint-disable-line

  return <Layout />
}