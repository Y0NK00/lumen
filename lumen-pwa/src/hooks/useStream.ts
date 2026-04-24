import { useCallback, useRef, useState } from 'react'
import { sseStream } from '../lib/stream'
import { useAppStore } from '../stores/appStore'
import { createConversation, getConversation } from '../lib/api'

export function useStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const store = useAppStore.getState

  const send = useCallback(async (content: string, conversationId?: string) => {
    if (isStreaming) return

    const s = store()

    // Create a new conversation if none is active
    let convId = conversationId ?? s.activeId
    if (!convId) {
      const conv = await createConversation()
      s.upsertConversation(conv)
      s.setActiveId(conv.id)
      convId = conv.id
    }

    // Optimistically add the user message to the display list
    const optimisticUserMsg = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: 'user' as const,
      content: [{ type: 'text', text: content }],
      finishReason: null,
      createdAt: new Date().toISOString(),
    }
    store().appendMessage(convId, optimisticUserMsg)

    const abort = new AbortController()
    abortRef.current = abort
    setIsStreaming(true)
    store().setStreamingConvId(convId)

    let assistantMsgId: string | null = null

    try {
      const activeConv = store().conversations.find((c) => c.id === convId)
      const model = activeConv?.model

      for await (const { event, data } of sseStream(convId, content, model, abort.signal)) {
        const d = data as Record<string, unknown>

        if (event === 'assistant_start') {
          assistantMsgId = d.messageId as string
          store().appendMessage(convId, {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            isStreaming: true,
          })
        } else if (event === 'text_delta' && assistantMsgId) {
          store().updateStreamingMessage(convId, assistantMsgId, d.delta as string)
        } else if (event === 'done' && assistantMsgId) {
          store().finalizeStreamingMessage(convId, assistantMsgId)
          // Refresh conversation summary to get updated title/timestamp
          getConversation(convId).then(({ conversation, messages }) => {
            store().upsertConversation(conversation)
            // Replace display messages with server-persisted ones
            store().setMessages(convId!, messages)
          }).catch(() => {})
        } else if (event === 'error') {
          if (assistantMsgId) store().finalizeStreamingMessage(convId, assistantMsgId)
          console.error('[stream] error event:', d)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[stream] fetch error:', err)
      if (assistantMsgId) store().finalizeStreamingMessage(convId, assistantMsgId)
    } finally {
      setIsStreaming(false)
      store().setStreamingConvId(null)
      abortRef.current = null
    }
  }, [isStreaming, store])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { send, stop, isStreaming }
}
