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

    // Optimistically add the user message
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

    // Delta batching — accumulate text_delta events and flush at ~30fps
    // to prevent too many Zustand updates from hanging mobile Safari.
    let deltaBuffer = ''
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flushDelta = (msgId: string, cId: string) => {
      if (deltaBuffer) {
        store().updateStreamingMessage(cId, msgId, deltaBuffer)
        deltaBuffer = ''
      }
      flushTimer = null
    }

    const scheduledFlush = (msgId: string, cId: string) => {
      if (!flushTimer) {
        flushTimer = setTimeout(() => flushDelta(msgId, cId), 33) // ~30fps
      }
    }

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
          deltaBuffer += d.delta as string
          scheduledFlush(assistantMsgId, convId)
        } else if (event === 'done' && assistantMsgId) {
          // Flush any remaining buffered text immediately
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
          flushDelta(assistantMsgId, convId)
          store().finalizeStreamingMessage(convId, assistantMsgId)
          // Refresh with server-persisted data
          getConversation(convId).then(({ conversation, messages }) => {
            store().upsertConversation(conversation)
            store().setMessages(convId!, messages)
          }).catch(() => {})
        } else if (event === 'title_updated') {
          store().updateConversationTitle(convId, (d.title as string))
        } else if (event === 'error') {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
          if (assistantMsgId) {
            flushDelta(assistantMsgId, convId)
            store().finalizeStreamingMessage(convId, assistantMsgId)
          }
          console.error('[stream] error event:', d)
        }
      }
    } catch (err) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[stream] fetch error:', err)
      if (assistantMsgId) {
        flushDelta(assistantMsgId, convId)
        store().finalizeStreamingMessage(convId, assistantMsgId)
      }
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
