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
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
  error?: string
  toolCalls?: ToolCall[]              // Phase 4: populated when Claude uses tools
}

export interface Conversation {
  id: string
  title: string
  model: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

interface ChatStore {
  conversations: Record<string, Conversation>
  activeConversationId: string | null

  // Conversation actions
  createConversation: (model?: string) => string
  setActiveConversation: (id: string) => void
  deleteConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void

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

      createConversation: (model = 'qwen2.5:14b') => {
        const id = crypto.randomUUID()
        const now = Date.now()
        set((state) => ({
          conversations: {
            ...state.conversations,
            [id]: {
              id,
              title: 'New Conversation',
              model,
              messages: [],
              createdAt: now,
              updatedAt: now,
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
          return {
            conversations: {
              ...state.conversations,
              [id]: { ...conv, title },
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
    }
  )
)
