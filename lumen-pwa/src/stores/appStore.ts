// Server-synced store — conversations and messages fetched from the API.
// The server is the source of truth. This store is a read/write cache.

import { create } from 'zustand'
import type { ConversationSummary, ServerMessage } from '../lib/api'

// UI-only message added during streaming before it's persisted
export interface StreamingMessage {
  id: string        // assistantMessage.id from assistant_start event
  role: 'assistant'
  content: string
  isStreaming: true
}

export type DisplayMessage =
  | (ServerMessage & { isStreaming?: false })
  | StreamingMessage

interface AppStore {
  // ── Conversation list ────────────────────────────────────────────────────
  conversations: ConversationSummary[]
  conversationsLoaded: boolean
  setConversations: (convs: ConversationSummary[]) => void
  upsertConversation: (conv: ConversationSummary) => void
  removeConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void

  // ── Active conversation ──────────────────────────────────────────────────
  activeId: string | null
  setActiveId: (id: string | null) => void

  // ── Messages (per conversation cache) ───────────────────────────────────
  messagesByConv: Record<string, DisplayMessage[]>
  setMessages: (convId: string, messages: ServerMessage[]) => void
  appendMessage: (convId: string, msg: DisplayMessage) => void
  updateStreamingMessage: (convId: string, msgId: string, delta: string) => void
  finalizeStreamingMessage: (convId: string, msgId: string) => void

  // ── Streaming state ──────────────────────────────────────────────────────
  streamingConvId: string | null
  setStreamingConvId: (id: string | null) => void

  /** Clear cached conversations/messages so the next login loads fresh lists. */
  resetSession: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  conversations: [],
  conversationsLoaded: false,
  setConversations: (conversations) => set({ conversations, conversationsLoaded: true }),
  upsertConversation: (conv) =>
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conv.id)
      return {
        conversations: exists
          ? s.conversations.map((c) => (c.id === conv.id ? conv : c))
          : [conv, ...s.conversations],
      }
    }),
  updateConversationTitle: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    })),
  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),

  activeId: null,
  setActiveId: (activeId) => set({ activeId }),

  messagesByConv: {},
  setMessages: (convId, messages) =>
    set((s) => ({ messagesByConv: { ...s.messagesByConv, [convId]: messages } })),
  appendMessage: (convId, msg) =>
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: [...(s.messagesByConv[convId] ?? []), msg],
      },
    })),
  updateStreamingMessage: (convId, msgId, delta) =>
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] ?? []).map((m) =>
          m.id === msgId && m.isStreaming
            ? { ...m, content: m.content + delta }
            : m
        ),
      },
    })),
  // Strip isStreaming flag — message is complete. Cast needed because the spread
  // of StreamingMessage doesn't carry the full ServerMessage shape; the server
  // will return the canonical record on next fetch, so this is fine at runtime.
  finalizeStreamingMessage: (convId, msgId) =>
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] ?? []).map((m) =>
          m.id === msgId ? ({ ...m, isStreaming: false } as DisplayMessage) : m
        ),
      },
    })),

  streamingConvId: null,
  setStreamingConvId: (streamingConvId) => set({ streamingConvId }),

  resetSession: () =>
    set({
      conversations: [],
      conversationsLoaded: false,
      activeId: null,
      messagesByConv: {},
      streamingConvId: null,
    }),
}))
