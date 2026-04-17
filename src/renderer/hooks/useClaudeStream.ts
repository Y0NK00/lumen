import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Message } from '../stores/chatStore'

// ─── Window type augmentation ─────────────────────────────────────────────────
// Tell TypeScript that window.tower exists (Electron injects it via preload).
// This app uses 'tower' as the contextBridge key, not 'electronAPI'.

declare global {
  interface Window {
    tower: {
      startClaudeStream: (
        requestId: string,
        messages: Array<{ role: string; content: string }>,
        model: string,
        apiKey: string
      ) => void
      abortClaudeStream: (requestId: string) => void
      onClaudeChunk: (callback: (data: { requestId: string; text: string }) => void) => () => void
      onClaudeDone: (callback: (data: { requestId: string }) => void) => () => void
      onClaudeError: (callback: (data: { requestId: string; message: string }) => void) => () => void
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseClaudeStreamReturn {
  sendMessage: (userContent: string) => Promise<void>
  stopStream: () => void
  isStreaming: boolean
}

export function useClaudeStream(): UseClaudeStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const currentRequestIdRef = useRef<string | null>(null)

  const sendMessage = useCallback(async (userContent: string) => {
    const store = useChatStore.getState()
    const { activeConversationId, addMessage } = store
    const { claudeApiKey } = useSettingsStore.getState()

    if (!activeConversationId || isStreaming) return

    if (!claudeApiKey) {
      console.error('[useClaudeStream] No Claude API key set. Open settings to add one.')
      return
    }

    const conv = store.conversations[activeConversationId]
    if (!conv) return

    // ── Build message history ────────────────────────────────────────────────
    const history = conv.messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    history.push({ role: 'user', content: userContent })

    addMessage(activeConversationId, { role: 'user', content: userContent })

    const assistantMsg: Message = addMessage(activeConversationId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    })

    const requestId = crypto.randomUUID()
    currentRequestIdRef.current = requestId
    setIsStreaming(true)

    let accumulated = ''
    let streamDone = false

    await new Promise<void>((resolve) => {
      const cleanupChunk = window.tower.onClaudeChunk(({ requestId: id, text }) => {
        if (id !== requestId) return

        accumulated += text

        useChatStore.getState().updateMessage(
          activeConversationId,
          assistantMsg.id,
          { content: accumulated, isStreaming: true }
        )
      })

      const cleanupDone = window.tower.onClaudeDone(({ requestId: id }) => {
        if (id !== requestId) return
        if (streamDone) return
        streamDone = true

        useChatStore.getState().updateMessage(
          activeConversationId,
          assistantMsg.id,
          { content: accumulated, isStreaming: false }
        )

        cleanupChunk()
        cleanupDone()
        cleanupError()
        resolve()
      })

      const cleanupError = window.tower.onClaudeError(({ requestId: id, message }) => {
        if (id !== requestId) return
        if (streamDone) return
        streamDone = true

        useChatStore.getState().updateMessage(
          activeConversationId,
          assistantMsg.id,
          {
            content: accumulated || '',
            isStreaming: false,
            error: `Claude API error: ${message}`,
          }
        )

        cleanupChunk()
        cleanupDone()
        cleanupError()
        resolve()
      })

      // ── Fire the stream ────────────────────────────────────────────────────
      window.tower.startClaudeStream(
        requestId,
        history,
        conv.model,
        claudeApiKey
      )
    })

    setIsStreaming(false)
    currentRequestIdRef.current = null
  }, [isStreaming])

  const stopStream = useCallback(() => {
    const id = currentRequestIdRef.current
    if (id) {
      window.tower.abortClaudeStream(id)
    }
  }, [])

  return { sendMessage, stopStream, isStreaming }
}
