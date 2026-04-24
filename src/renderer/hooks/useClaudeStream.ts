import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore, estimateTokens } from '../stores/settingsStore'
import { useProjectsStore } from '../stores/projectsStore'
import { buildMemoryBlock, buildVaultBlock, useMemoryStore, generateMemoriesFromConversation } from '../stores/memoryStore'
import { buildSkillsBlock, matchSkillTriggers, useSkillsStore } from '../stores/skillsStore'
import type { Message, ToolCall, MessageAttachment } from '../stores/chatStore'

// ─── Window type augmentation ─────────────────────────────────────────────────
// Tells TypeScript about every method on window.tower (injected by preload.js).
// This app uses 'tower' as the contextBridge key, not 'electronAPI'.

declare global {
  interface Window {
    tower: {
      // ── Claude streaming (Phase 3) ─────────────────────────────────────────
      startClaudeStream: (
        requestId: string,
        messages: Array<{ role: string; content: string | unknown[] }>,
        model: string,
        apiKey: string,
        systemPrompt?: string
      ) => void
      abortClaudeStream: (requestId: string) => void
      onClaudeChunk: (
        callback: (data: { requestId: string; text: string }) => void
      ) => () => void
      onClaudeDone: (
        callback: (data: { requestId: string; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } }) => void
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

      // ── Remote dispatch ───────────────────────────────────────────────────────
      remoteDispatch?: {
        start:              (port: number, secret: string) => void
        stop:               () => void
        getIPs:             () => Promise<string[]>
        onMessage:          (cb: (data: { text: string }) => void) => () => void
        onServerStarted:    (cb: (data: { port: number; ips: string[] }) => void) => () => void
        onServerError:      (cb: (data: { message: string }) => void) => () => void
        onNewConversation?: (cb: (data: { id: string }) => void) => () => void
      }

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
  sendMessage: (userContent: string, attachments?: MessageAttachment[]) => Promise<void>
  stopStream: () => void
  isStreaming: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClaudeStream(): UseClaudeStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const currentRequestIdRef = useRef<string | null>(null)

  const sendMessage = useCallback(
    async (userContent: string, attachments?: MessageAttachment[]) => {
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

      // ── System prompt: profile + project context ──────────────────────────
      const { projects, activeProjectId } = useProjectsStore.getState()
      const activeProject = activeProjectId ? projects[activeProjectId] : null
      const projectPrompt = activeProject?.systemPrompt?.trim() || ''

      const { profilePreferences, profileAbout, profileCallName } =
        useSettingsStore.getState()

      const profileBlock = [
        profileCallName && `The user prefers to be called ${profileCallName}.`,
        profilePreferences && `User preferences:\n${profilePreferences}`,
        profileAbout && `About the user:\n${profileAbout}`,
      ]
        .filter(Boolean)
        .join('\n\n')

      // ── Agent system prompt (Helm dispatch) ───────────────────────────────
      // If this conversation was created by Helm's dispatch routing, it carries
      // a per-agent system prompt. Inject it before everything else so it sets
      // the operating context for the entire turn.
      const agentPrompt = conv.agentSystemPrompt?.trim() || ''

      // ── Skills: auto-trigger on keyword match, then build injection block ──
      const { activateSkill } = useSkillsStore.getState()
      const triggeredSkillIds = matchSkillTriggers(userContent)
      triggeredSkillIds.forEach((id) => activateSkill(id))
      const skillsBlock = buildSkillsBlock()

      // ── Memory: inject relevant context based on user message ─────────────
      // Gated on the memorySearchRef setting (Memory → "Search memories" toggle)
      const { memorySearchRef, vaultRagEnabled, vaultPath } = useSettingsStore.getState()
      const { block: memoryBlock, usedIds: memoryUsedIds } = memorySearchRef
        ? buildMemoryBlock(userContent)
        : { block: '', usedIds: [] }

      // ── Vault RAG: inject relevant Obsidian notes ────────────────────────
      // Gated on vaultRagEnabled + vaultPath being set
      const vaultBlock = (vaultRagEnabled && vaultPath)
        ? await buildVaultBlock(userContent)
        : ''

      // ── Assemble final system prompt ───────────────────────────────────────
      // Order: agent context (most authoritative) → profile → project → memory → vault → skills
      const systemPrompt =
        [agentPrompt, profileBlock, projectPrompt, memoryBlock, vaultBlock, skillsBlock]
          .filter(Boolean)
          .join('\n\n') || undefined

      // Track which memories were injected (increments useCount for ranking)
      if (memoryUsedIds.length > 0) {
        useMemoryStore.getState().markUsed(memoryUsedIds)
      }

      // ── Build message history ────────────────────────────────────────────────
      // Only finalized messages. Cap at the last 30 messages (15 turns) so long
      // conversations don't blow the rate limit on input tokens. We always keep
      // the final slice so the most recent context is preserved.
      // main.js handles the full tool_result history internally — we just send
      // the clean user-visible messages here.
      const MAX_HISTORY_MESSAGES = 30
      const allFinalized = conv.messages.filter((m) => !m.isStreaming)
      const trimmed = allFinalized.length > MAX_HISTORY_MESSAGES
        ? allFinalized.slice(-MAX_HISTORY_MESSAGES)
        : allFinalized
      const history = trimmed.map((m) => {
        // Re-construct vision content blocks for messages that had attachments
        if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          const contentBlocks: unknown[] = []
          for (const att of m.attachments) {
            if (att.type === 'image') {
              contentBlocks.push({
                type: 'image',
                source: { type: 'base64', media_type: att.mimeType, data: att.data },
              })
            } else {
              // Text files: prepend as a text block
              contentBlocks.push({
                type: 'text',
                text: `[File: ${att.name}]\n${att.data}`,
              })
            }
          }
          if (m.content) contentBlocks.push({ type: 'text', text: m.content })
          return { role: m.role as 'user' | 'assistant', content: contentBlocks }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content }
      })

      // Build content for the current user turn — may include attachment blocks
      let userApiContent: unknown = userContent
      if (attachments && attachments.length > 0) {
        const blocks: unknown[] = []
        for (const att of attachments) {
          if (att.type === 'image') {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: att.mimeType, data: att.data },
            })
          } else {
            blocks.push({ type: 'text', text: `[File: ${att.name}]\n${att.data}` })
          }
        }
        if (userContent) blocks.push({ type: 'text', text: userContent })
        userApiContent = blocks
      }

      history.push({ role: 'user', content: userApiContent as string })

      addMessage(activeConversationId, { role: 'user', content: userContent, attachments })

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
        const cleanupDone = window.tower.onClaudeDone(({ requestId: id, usage }) => {
          if (id !== requestId) return
          if (turnDone) return
          turnDone = true

          useChatStore.getState().updateMessage(activeConversationId, assistantMsg.id, {
            content: accumulated,
            isStreaming: false,
          })

          // Use real token counts from API if available, fall back to estimate
          const inputEst  = estimateTokens(userContent + (systemPrompt ?? ''))
          const outputEst = estimateTokens(accumulated)
          useSettingsStore.getState().addTokenUsage(
            usage?.input      ?? inputEst,
            usage?.output     ?? outputEst,
            usage?.cacheRead  ?? 0,
            usage?.cacheWrite ?? 0,
          )

          // ── Auto-memory generation (fire-and-forget) ────────────────────────
          // Gated on the "Auto-generate memories" setting (Memory → toggle).
          // Uses Claude Haiku to extract facts from the last N messages and
          // imports them — replacing any previously generated memories.
          const { memoryGenerate, claudeApiKey: keyForMemory } = useSettingsStore.getState()
          if (memoryGenerate && keyForMemory) {
            const finishedConv = useChatStore.getState().conversations[activeConversationId]
            if (finishedConv) {
              const msgs = finishedConv.messages
                .filter((m) => !m.isStreaming)
                .map((m) => ({ role: m.role, content: m.content }))
              generateMemoriesFromConversation(msgs, keyForMemory).then((items) => {
                if (items.length > 0) {
                  useMemoryStore.getState().importGenerated(items)
                }
              })
            }
          }

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

        // ── Fire ──────────────────────────────────────────────────────────────
        // Kick off the stream — main.js takes it from here and fires the events
        // above as the agent loop runs.
        const { defaultClaudeModel } = useSettingsStore.getState()
        window.tower.startClaudeStream(
          requestId,
          history,
          defaultClaudeModel,
          claudeApiKey,
          systemPrompt
        )
      })

      setIsStreaming(false)
      currentRequestIdRef.current = null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming]
  )

  const stopStream = useCallback(() => {
    const id = currentRequestIdRef.current
    if (id) {
      window.tower.abortClaudeStream(id)
      currentRequestIdRef.current = null
    }
    setIsStreaming(false)
  }, [])

  return { sendMessage, stopStream, isStreaming }
}
