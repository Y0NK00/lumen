import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
  error?: string
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
  createConversation: (model?: string) => string
  setActiveConversation: (id: string) => void
  deleteConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void
  addMessage: (convId: string, data: Omit<Message, 'id' | 'timestamp'>) => Message
  updateMessage: (convId: string, msgId: string, patch: Partial<Omit<Message, 'id'>>) => void
  deleteMessage: (convId: string, msgId: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: {},
  activeConversationId: null,

  createConversation: (model = 'qwen2.5:14b') => {
    const id = crypto.randomUUID()
    const now = Date.now()
    set((state) => ({
      conversations: {
        ...state.conversations,
        [id]: { id, title: 'New Conversation', model, messages: [], createdAt: now, updatedAt: now },
      },
      activeConversationId: id,
    }))
    return id
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  deleteConversation: (id) => {
    set((state) => {
      const { [id]: _removed, ...rest } = state.conversations
      const ids = Object.keys(rest)
      const newActive = state.activeConversationId === id ? (ids[0] ?? null) : state.activeConversationId
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

  addMessage: (convId, data) => {
    const message: Message = { ...data, id: crypto.randomUUID(), timestamp: Date.now() }
    set((state) => {
      const conv = state.conversations[convId]
      if (!conv) return state
      const isFirstUserMessage = conv.messages.length === 0 && data.role === 'user'
      const title = isFirstUserMessage
        ? data.content.slice(0, 60).trimEnd() + (data.content.length > 60 ? '…' : '')
        : conv.title
      return {
        conversations: {
          ...state.conversations,
          [convId]: { ...conv, title, messages: [...conv.messages, message], updatedAt: Date.now() },
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
          [convId]: { ...conv, messages: conv.messages.filter((m) => m.id !== msgId), updatedAt: Date.now() },
        },
      }
    })
  },
}))