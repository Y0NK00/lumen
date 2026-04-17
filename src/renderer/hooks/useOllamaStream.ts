import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import type { Message } from '../stores/chatStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const OLLAMA_BASE = 'http://10.0.0.22:11434'

// ─── Ollama wire types ────────────────────────────────────────────────────────

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface OllamaChunk {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
  done_reason?: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseOllamaStreamReturn {
  sendMessage: (userContent: string) => Promise<void>
  stopStream: () => void
  isStreaming: boolean
}

export function useOllamaStream(): UseOllamaStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (userContent: string) => {
    // Pull fresh state at call time — avoids stale closure on conversations map.
    const store = useChatStore.getState()
    const { activeConversationId, addMessage, updateMessage } = store

    if (!activeConversationId || isStreaming) return

    const conv = store.conversations[activeConversationId]
    if (!conv) return

    // Snapshot history BEFORE mutating state so the history we send to Ollama
    // doesn't include the messages we're about to add.
    const history: OllamaMessage[] = conv.messages
      .filter((m) => !m.isStreaming)          // exclude any leftover streaming msg
      .map((m) => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: userContent })

    // Write the user message to the store.
    addMessage(activeConversationId, { role: 'user', content: userContent })

    // Add an empty assistant placeholder we'll stream tokens into.
    const assistantMsg: Message = addMessage(activeConversationId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    })

    abortRef.current = new AbortController()
    setIsStreaming(true)

      let accumulated = ''
      let buffer = ''

    try {
      const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: conv.model,
          messages: history,
          stream: true,
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`Ollama ${response.status}: ${response.statusText}`)
      }
      if (!response.body) {
        throw new Error('Ollama response has no body')
      }

      // ── Read the NDJSON stream ─────────────────────────────────────────────
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Chunks may arrive mid-line. Process only complete lines.
        const lines = buffer.split('\n')
        // Keep the last (potentially incomplete) fragment in the buffer.
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const chunk: OllamaChunk = JSON.parse(trimmed)
            accumulated += chunk.message?.content ?? ''

            // Re-fetch updateMessage in case component unmounted / remounted.
            useChatStore.getState().updateMessage(
              activeConversationId,
              assistantMsg.id,
              {
                content: accumulated,
                isStreaming: !chunk.done,
              }
            )

            if (chunk.done) break
          } catch {
            // Partial or malformed JSON — skip and continue.
          }
        }
      }

      // Flush any remaining buffer content.
      if (buffer.trim()) {
        try {
          const chunk: OllamaChunk = JSON.parse(buffer.trim())
          accumulated += chunk.message?.content ?? ''
        } catch {
          // Ignore malformed tail.
        }
      }
    } catch (err) {
      const error = err as Error

      if (error.name === 'AbortError') {
        // User stopped the stream intentionally — mark as done, keep content.
        useChatStore.getState().updateMessage(
          activeConversationId,
          assistantMsg.id,
          { isStreaming: false }
        )
      } else {
        // Real error — surface it in the message bubble.
        useChatStore.getState().updateMessage(
          activeConversationId,
          assistantMsg.id,
          {
            content: accumulated || '',
            isStreaming: false,
            error: `Connection error: ${error.message}. Is Ollama running at ${OLLAMA_BASE}?`,
          }
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null

      // Belt-and-suspenders: make absolutely sure isStreaming is cleared
      // even if the store update inside the try block was never reached.
      const finalState = useChatStore.getState()
      const finalMsg = finalState.conversations[activeConversationId]?.messages
        .find((m) => m.id === assistantMsg.id)

      if (finalMsg?.isStreaming) {
        finalState.updateMessage(activeConversationId, assistantMsg.id, {
          isStreaming: false,
        })
      }
    }
  }, [isStreaming])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { sendMessage, stopStream, isStreaming }
}
