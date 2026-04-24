import { useEffect } from 'react'
import { MessageList } from './MessageList'
import { InputBox } from './InputBox'
import { useStream } from '../hooks/useStream'
import { useAppStore } from '../stores/appStore'
import { getConversation } from '../lib/api'

export function ChatPane() {
  const { send, stop, isStreaming } = useStream()
  const { activeId, messagesByConv, setMessages } = useAppStore()

  const messages = activeId ? (messagesByConv[activeId] ?? []) : []

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeId) return
    if (messagesByConv[activeId]) return // already cached
    getConversation(activeId).then(({ messages }) => {
      setMessages(activeId, messages)
    }).catch(console.error)
  }, [activeId, messagesByConv, setMessages])

  const handleSend = (content: string) => {
    send(content, activeId ?? undefined)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <MessageList messages={messages} />
      <InputBox
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
      />
    </div>
  )
}
