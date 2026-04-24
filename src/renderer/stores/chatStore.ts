import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// =============================================================================
// PHASE 4 CHANGES vs Phase 3:
//   - Added ToolCall interface
//   - Added toolCalls?: ToolCall[] to Message
//   - Added addToolCall() and updateToolCall() store actions
//   - Everything else is identical to Phase 3
// =============================================================================

// ─── Types ────────────────────────────────────────────────────────────────────

// Represents a single tool call made by Claude during an assistant turn.
// Multiple tool calls can appear in one Message (Claude can call several tools
// in parallel in a single response).
export interface ToolCall {
  id: string                          // Claude's tool_use block ID — used to match start/result events
  name: string                        // e.g. 'read_file', 'list_dir'
  input: Record<string, unknown>      // Parsed JSON input from Claude
  result?: string                     // Tool output (set after execution)
  success?: boolean                   // Whether the tool ran without error
  status: 'running' | 'done' | 'error'
  imageDataUrl?: string               // Phase 5: set for browser_screenshot, renders inline in ToolCallCard
  oldContent?: string | null          // Phase 6: write_file — content before the write (for DiffViewer)
  newContent?: string                 // Phase 6: write_file — content after the write (for DiffViewer)
}

// Attachment carried in a user message — image (base64) or file (text content)
export interface MessageAttachment {
  type: 'image' | 'file'
  name: string
  mimeType: string          // e.g. 'image/png', 'application/pdf', 'text/plain'
  data: string              // base64 for images; extracted text for files
  size: number              // original byte size
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
  error?: string
  toolCalls?: ToolCall[]              // Phase 4: populated when Claude uses tools
  attachments?: MessageAttachment[]   // Phase N: drag-and-drop files/images
}

// Conversations live in one of two top-level modes: 'chat' (regular chat)
// or 'code' (code sessions with shell/grep/git tool access).
// Field is optional for backward compat with pre-migration stored data;
// sidebar filtering treats `undefined` as 'chat'.
export type ConvMode = 'chat' | 'code' | 'helm'

export interface Conversation {
  id: string
  title: string
  model: string
  mode?: ConvMode
  messages: Message[]
  createdAt: number
  updatedAt: number
  pinned?: boolean              // v2: surfaced in the Pinned sidebar section
  pinnedAt?: number             // when it was pinned (used to sort pinned list)
  projectId?: string            // v3: optional Project scope (rootPath + systemPrompt)
  agentSystemPrompt?: string    // v4: Helm agent-injected system prompt (code/research/file/schedule)
}

interface ChatStore {
  conversations: Record<string, Conversation>
  activeConversationId: string | null

  // Conversation actions
  createConversation: (model?: string, mode?: ConvMode, projectId?: string, agentSystemPrompt?: string) => string
  setActiveConversation: (id: string) => void
  deleteConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void
  updateConversationModel:  (id: string, model: string) => void
  togglePinned: (id: string) => void
  setConversationProject: (id: string, projectId: string | null) => void

  // Message actions — addMessage returns the created message so callers can
  // reference its ID (e.g. the streaming hook needs to update the same msg).
  addMessage: (convId: string, data: Omit<Message, 'id' | 'timestamp'>) => Message
  updateMessage: (convId: string, msgId: string, patch: Partial<Omit<Message, 'id'>>) => void
  deleteMessage: (convId: string, msgId: string) => void

  // Phase 4: Tool call actions
  addToolCall: (convId: string, msgId: string, toolCall: ToolCall) => void
  updateToolCall: (convId: string, msgId: string, toolId: string, patch: Partial<ToolCall>) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      conversations: {},
      activeConversationId: null,

      // ── Conversation CRUD ────────────────────────────────────────────────

      createConversation: (model = 'qwen2.5:14b', mode: ConvMode = 'chat', projectId?: string, agentSystemPrompt?: string) => {
        const id = crypto.randomUUID()
        const now = Date.now()
        set((state) => ({
          conversations: {
            ...state.conversations,
            [id]: {
              id,
              title: 'New Conversation',
              model,
              mode,
              messages: [],
              createdAt: now,
              updatedAt: now,
              projectId,
              ...(agentSystemPrompt ? { agentSystemPrompt } : {}),
            },
          },
          activeConversationId: id,
        }))
        return id
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id })
      },

      deleteConversation: (id) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...rest } = state.conversations
          const ids = Object.keys(rest)
          const newActive =
            state.activeConversationId === id ? (ids[0] ?? null) : state.activeConversationId
          return { conversations: rest, activeConversationId: newActive }
        })
      },

      updateConversationTitle: (id, title) => {
        set((state) => {
          const conv = state.conversations[id]
          if (!conv) return state
          return { conversations: { ...state.conversations, [id]: { ...conv, title } } }
        })
      },

      updateConversationModel: (id, model) => {
        set((state) => {
          const conv = state.conversations[id]
          if (!conv) return state
          return { conversations: { ...state.conversations, [id]: { ...conv, model, updatedAt: Date.now() } } }
        })
      },

      // Scope a conversation to a Project (or clear it with null).
      setConversationProject: (id, projectId) => {
        set((state) => {
          const conv = state.conversations[id]
          if (!conv) return state
          return {
            conversations: {
              ...state.conversations,
              [id]: {
                ...conv,
                projectId: projectId ?? undefined,
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      // Toggle pinned state. Pinned conversations surface in the sidebar's
      // "Pinned" section, sorted by pinnedAt descending (most recently pinned first).
      togglePinned: (id) => {
        set((state) => {
          const conv = state.conversations[id]
          if (!conv) return state
          const nextPinned = !conv.pinned
          return {
            conversations: {
              ...state.conversations,
              [id]: {
                ...conv,
                pinned: nextPinned,
                pinnedAt: nextPinned ? Date.now() : undefined,
              },
            },
          }
        })
      },

      // ── Message CRUD ─────────────────────────────────────────────────────

      addMessage: (convId, data) => {
        const message: Message = {
          ...data,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        }

        set((state) => {
          const conv = state.conversations[convId]
          if (!conv) return state

          // Auto-title: use first 60 chars of the first user message
          const isFirstUserMessage = conv.messages.length === 0 && data.role === 'user'
          const title = isFirstUserMessage
            ? data.content.slice(0, 60).trimEnd() + (data.content.length > 60 ? '…' : '')
            : conv.title

          return {
            conversations: {
              ...state.conversations,
              [convId]: {
                ...conv,
                title,
                messages: [...conv.messages, message],
                updatedAt: Date.now(),
              },
            },
          }
        })

        return message
      },

      updateMessage: (convId, msgId, patch) => {
        set((state) => {
          const conv = state.conversations[convId]
          if (!conv) return state
          return {
            conversations: {
              ...state.conversations,
              [convId]: {
                ...conv,
                messages: conv.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      deleteMessage: (convId, msgId) => {
        set((state) => {
          const conv = state.conversations[convId]
          if (!conv) return state
          return {
            conversations: {
              ...state.conversations,
              [convId]: {
                ...conv,
                messages: conv.messages.filter((m) => m.id !== msgId),
                updatedAt: Date.now(),
              },
            },
          }
        })
      },

      // ── Phase 4: Tool call CRUD ──────────────────────────────────────────

      // Append a new ToolCall to a specific message.
      // Called when main fires 'claude-tool-start'.
      addToolCall: (convId, msgId, toolCall) => {
        set((state) => {
          const conv = state.conversations[convId]
          if (!conv) return state
          return {
            conversations: {
              ...state.conversations,
              [convId]: {
                ...conv,
                messages: conv.messages.map((m) => {
                  if (m.id !== msgId) return m
                  return {
                    ...m,
                    toolCalls: [...(m.toolCalls ?? []), toolCall],
                  }
                }),
              },
            },
          }
        })
      },

      // Patch an existing ToolCall by toolId within a message.
      // Called when main fires 'claude-tool-result'.
      updateToolCall: (convId, msgId, toolId, patch) => {
        set((state) => {
          const conv = state.conversations[convId]
          if (!conv) return state
          return {
            conversations: {
              ...state.conversations,
              [convId]: {
                ...conv,
                messages: conv.messages.map((m) => {
                  if (m.id !== msgId) return m
                  return {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.id === toolId ? { ...tc, ...patch } : tc
                    ),
                  }
                }),
              },
            },
          }
        })
      },
    }),
    {
      name: 'lumen-conversations',
      // ── Persistence migrations ─────────────────────────────────────────
      // Each version bump should add a branch below and keep older branches
      // intact so a store on an older version can migrate through them in
      // order. Zustand only runs migrate() when persisted.version < current.
      //
      // v1: added `mode` to Conversation. Backfill 'chat' on missing fields.
      // v2: added `pinned` / `pinnedAt`. No backfill needed — undefined means
      //     not pinned, which is the correct default. Version bump just
      //     documents the schema change.
      // v3: added `projectId`. No backfill needed — undefined means unscoped.
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as { conversations?: Record<string, Conversation> } | undefined
        if (!state?.conversations) return persisted

        let convs = state.conversations

        if (version < 1) {
          const migrated: Record<string, Conversation> = {}
          for (const [id, conv] of Object.entries(convs)) {
            migrated[id] = { ...conv, mode: conv.mode ?? 'chat' }
          }
          convs = migrated
        }
        // v2 is a no-op for data — fields default to undefined correctly.

        return { ...state, conversations: convs }
      },
    }
  )
)
