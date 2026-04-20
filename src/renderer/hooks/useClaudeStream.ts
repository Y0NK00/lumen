import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useProjectsStore } from '../stores/projectsStore'
import type { Message, ToolCall } from '../stores/chatStore'

// ─── Window type augmentation ─────────────────────────────────────────────────
// Tells TypeScript about every method on window.tower (injected by preload.js).
// This app uses 'tower' as the contextBridge key, not 'electronAPI'.

declare global {
  interface Window {
    tower: {
      // ── Claude streaming (Phase 3) ─────────────────────────────────────────
      startClaudeStream: (
        requestId: string,
        messages: Array<{ role: string; content: string }>,
        model: string,
        apiKey: string,
        systemPrompt?: string
      ) => void
      abortClaudeStream: (requestId: string) => void
      onClaudeChunk: (
        callback: (data: { requestId: string; text: string }) => void
      ) => () => void
      onClaudeDone: (
        callback: (data: { requestId: string }) => void
      ) => () => void
      onClaudeError: (
        callback: (data: { requestId: string; message: string }) => void
      ) => () => void

      // ── Tool use events (Phase 4) ─────────────────────────────────────────
      // Fired by main.js when Claude decides to call a tool (before execution)
      // and when the tool finishes (with result + input).
      onClaudeToolStart: (
        callback: (data: {
          requestId: string
          toolId: string
          toolName: string
        }) => void
      ) => () => void
      onClaudeToolResult: (
        callback: (data: {
          requestId: string
          toolId: string
          toolName: string
          input: Record<string, unknown>
          result: string
          success: boolean
          imageDataUrl?: string   // Phase 5: set for browser_screenshot
          oldContent?: string | null  // Phase 6: write_file previous content
          newContent?: string | null  // Phase 6: write_file new content
        }) => void
      ) => () => void

      // ── File system (already in preload) ──────────────────────────────────
      readFile: (path: string) => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      listDir: (path: string) => Promise<string[]>
      runCommand: (cmd: string) => Promise<string>

      // ── Window controls (Phase 6 titlebar) ───────────────────────────────
      minimize: () => void
      maximize: () => void
      close: () => void
      onWindowMaximized?: (cb: (e: unknown, maximized: boolean) => void) => void
      offWindowMaximized?: (cb: (e: unknown, maximized: boolean) => void) => void

      // ── Settings + project sync ───────────────────────────────────────────────
      syncSettings:  (data: { apiKey: string; model: string }) => void
      syncRootPath:  (rootPath: string | null) => void

      // ── Cron bridge ───────────────────────────────────────────────────────────
      cronRegister:   (task: { id: string; label: string; prompt: string; cadence: string; enabled: boolean; scheduledFor?: number }) => void
      cronUnregister: (id: string) => void
      cronSync:       (tasks: Array<{ id: string; label: string; prompt: string; cadence: string; enabled: boolean; scheduledFor?: number }>) => void
      cronRunNow:     (task: { id: string; label: string; prompt: string; cadence: string; enabled: boolean; scheduledFor?: number }) => void
      onCronTaskRan:     (callback: (data: { taskId: string; ranAt: number }) => void) => () => void
      onCronTaskResult:  (callback: (data: { taskId: string; label: string; prompt: string; result: string; ranAt: number }) => void) => () => void

      // ── Multi-window ─────────────────────────────────────────────────────────
      openConversationWindow?: (conversationId: string) => void

      // ── Dialogs ───────────────────────────────────────────────────────────────
      openFolderDialog?: () => Promise<string | null>

      // ── Browser extension status ──────────────────────────────────────────────
      getBrowserStatus?:      () => Promise<{ connected: boolean }>
      onBrowserConnected?:    (cb: () => void) => (() => void) | void
      onBrowserDisconnected?: (cb: () => void) => (() => void) | void

      // ── Google OAuth ──────────────────────────────────────────────────────────
      connectGoogle?:     () => Promise<void>
      onGoogleConnected?: (cb: (e: unknown, connected: boolean) => void) => void
      onGoogleError?:     (cb: (e: unknown, message: string) => void) => void
    }
  }
}

// ─── Hook return type ─────────────────────────────────────────────────────────

interface UseClaudeStreamReturn {
  sendMessage: (userContent: string) => Promise<void>
  stopStream: () => void
  isStreaming: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClaudeStream(): UseClaudeStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const currentRequestIdRef = useRef<string | null>(null)

  const sendMessage = useCallback(
    async (userContent: string) => {
      const store = useChatStore.getState()
      const { activeConversationId, addMessage, addToolCall, updateToolCall } = store
      const { claudeApiKey } = useSettingsStore.getState()

      if (!activeConversationId || isStreaming) return

      if (!claudeApiKey) {
        console.error('[useClaudeStream] No Claude API key set. Open settings to add one.')
        return
      }

      const conv = store.conversations[activeConversationId]
      if (!conv) return

      // ── Project context ──────────────────────────────────────────────────────
      // If the active project has a system prompt, pass it to the API so it
      // applies to every turn in this conversation.
      const { projects, activeProjectId } = useProjectsStore.getState()
      const activeProject = activeProjectId ? projects[activeProjectId] : null
      const systemPrompt = activeProject?.systemPrompt?.trim() || undefined

      // ── Build message history ────────────────────────────────────────────────
      // Only finalized messages. main.js handles the full tool_result history
      // internally — we just send the clean user-visible messages here.
      const history = conv.messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      history.push({ role: 'user', content: userContent })

      addMessage(activeConversationId, { role: 'user', content: userContent })

      // Create the assistant message that will receive all streaming content
      // for this entire agent turn (text + tool cards all go in this one bubble)
      const assistantMsg: Message = addMessage(activeConversationId, {
        role: 'assistant',
        content: '',
        isStreaming: true,
        toolCalls: [],
      })

      const requestId = crypto.randomUUID()
      currentRequestIdRef.current = requestId
      setIsStreaming(true)

      let accumulated = ''
      let turnDone = false

      await new Promise<void>((resolve) => {

        // ── Text chunks ────────────────────────────────────────────────────────
        const cleanupChunk = window.tower.onClaudeChunk(({ requestId: id, text }) => {
          if (id !== requestId) return
          accumulated += text
          useChatStore.getState().updateMessage(activeConversationId, assistantMsg.id, {
            content: accumulated,
            isStreaming: true,
          })
        })

        // ── Tool call starting ─────────────────────────────────────────────────
        // main.js fires this when it sees a tool_use content block start.
        // Input isn't available yet — it streams in as input_json_delta in main.
        // We add a 'running' card with empty input; it gets filled on tool-result.
        const cleanupToolStart = window.tower.onClaudeToolStart(
          ({ requestId: id, toolId, toolName }) => {
            if (id !== requestId) return

            const newToolCall: ToolCall = {
              id: toolId,
              name: toolName,
              input: {},
              status: 'running',
            }

            useChatStore.getState().addToolCall(
              activeConversationId,
              assistantMsg.id,
              newToolCall
            )
          }
        )

        // ── Tool result ────────────────────────────────────────────────────────
        // main.js fires this after executing the tool.
        // input is now fully parsed (main sends it back for display).
        // imageDataUrl is set for browser_screenshot — ToolCallCard shows it inline.
        const cleanupToolResult = window.tower.onClaudeToolResult(
          ({ requestId: id, toolId, input, result, success, imageDataUrl, oldContent, newContent }) => {
            if (id !== requestId) return

            useChatStore.getState().updateToolCall(
              activeConversationId,
              assistantMsg.id,
              toolId,
              {
                input,
                result,
                success,
                status: success ? 'done' : 'error',
                imageDataUrl: imageDataUrl ?? undefined,
                oldContent: oldContent ?? undefined,
                newContent: newContent ?? undefined,
              }
            )
          }
        )

        // ── Turn complete ──────────────────────────────────────────────────────
        // Fires once after the entire agent loop finishes — may have run through
        // multiple tool calls and API requests before getting here.
        const cleanupDone = window.tower.onClaudeDone(({ requestId: id }) => {
          if (id !== requestId) return
          if (turnDone) return
          turnDone = true

          useChatStore.getState().updateMessage(activeConversationId, assistantMsg.id, {
            content: accumulated,
            isStreaming: false,
          })

          cleanupChunk()
          cleanupToolStart()
          cleanupToolResult()
          cleanupDone()
          cleanupError()
          resolve()
        })

        // ── Error ──────────────────────────────────────────────────────────────
        const cleanupError = window.tower.onClaudeError(({ requestId: id, message }) => {
          if (id !== requestId) return
          if (turnDone) return
          turnDone = true

          useChatStore.getState().updateMessage(activeConversationId, assistantMsg.id, {
            content: accumulated || '',
            isStreaming: false,
            error: `Claude API error: ${message}`,
          })

          cleanupChunk()
          cleanupToolStart()
          cleanupToolResult()
          cleanupDone()
          cleanupError()
          resolve()
        })

        // ── Fire ───────────────────────────────────────────────────────────────
        // main.js runs the entire agent loop from here.
        // We just wait for events and update the UI as they arrive.
        window.tower.startClaudeStream(requestId, history, conv.model, claudeApiKey, systemPrompt)
      })

      setIsStreaming(false)
      currentRequestIdRef.current = null
    },
    [isStreaming]
  )

  const stopStream = useCallback(() => {
    const id = currentRequestIdRef.current
    if (id) window.tower.abortClaudeStream(id)
  }, [])

  return { sendMessage, stopStream, isStreaming }
}
