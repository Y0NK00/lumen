import { create } from 'zustand'
import { listConversationsForWorkspace } from '../lib/api'
import { useAppStore } from './appStore'
import type { ConversationSummary } from '../lib/api'

export type WorkspaceMode = 'chat' | 'cowork' | 'code'

export type CoworkTab = 'overview' | 'projects' | 'artifacts' | 'dispatch'

type Lists = Record<WorkspaceMode, ConversationSummary[] | null>

const emptyLists = (): Lists => ({ chat: null, cowork: null, code: null })

function normalizeWorkspace(conv: ConversationSummary): WorkspaceMode {
  const w = conv.workspace
  return w === 'cowork' || w === 'code' ? w : 'chat'
}

export const useWorkspaceStore = create<{
  mode: WorkspaceMode
  coworkTab: CoworkTab
  lists: Lists
  activeConvId: Record<WorkspaceMode, string | null>
  switchWorkspace: (next: WorkspaceMode) => Promise<void>
  setCoworkTab: (tab: CoworkTab) => Promise<void>
  openCowork: (tab?: CoworkTab) => Promise<void>
  setList: (w: WorkspaceMode, items: ConversationSummary[]) => void
  upsertInList: (conv: ConversationSummary) => void
  removeFromList: (w: WorkspaceMode, id: string) => void
  resetWorkspace: () => void
}>((set, get) => ({
  mode: 'chat',
  coworkTab: 'overview',
  lists: emptyLists(),
  activeConvId: { chat: null, cowork: null, code: null },

  setList: (w, items) => set((s) => ({ lists: { ...s.lists, [w]: items } })),

  switchWorkspace: async (next) => {
    const prev = get().mode
    const prevActive = useAppStore.getState().activeId
    set((s) => ({
      activeConvId: { ...s.activeConvId, [prev]: prevActive },
    }))

    let list = get().lists[next]
    if (list === null) {
      try {
        list = await listConversationsForWorkspace(next)
      } catch (e) {
        console.error('Failed to load workspace list:', e)
        list = []
      }
      set((s) => ({ lists: { ...s.lists, [next]: list } }))
    }

    const remembered = get().activeConvId[next]
    const nextActive =
      remembered && list.some((c) => c.id === remembered)
        ? remembered
        : list[0]?.id ?? null

    set({ mode: next })
    useAppStore.setState({ conversations: list, activeId: nextActive })
  },

  setCoworkTab: async (tab) => {
    await get().switchWorkspace('cowork')
    set({ coworkTab: tab })
  },

  openCowork: async (tab = 'overview') => {
    await get().switchWorkspace('cowork')
    set({ coworkTab: tab })
  },

  upsertInList: (conv) => {
    const w = normalizeWorkspace(conv)
    set((s) => {
      const cur = s.lists[w]
      const base = cur ?? []
      const exists = base.some((c) => c.id === conv.id)
      const next = exists ? base.map((c) => (c.id === conv.id ? conv : c)) : [conv, ...base]
      return { lists: { ...s.lists, [w]: next } }
    })
    if (get().mode === w) {
      useAppStore.getState().upsertConversation(conv)
    }
  },

  removeFromList: (w, id) => {
    set((s) => {
      const cur = s.lists[w]
      const active =
        s.activeConvId[w] === id ? { ...s.activeConvId, [w]: null } : s.activeConvId
      if (cur === null) {
        return { activeConvId: active }
      }
      return { lists: { ...s.lists, [w]: cur.filter((c) => c.id !== id) }, activeConvId: active }
    })
    if (get().mode === w) {
      useAppStore.setState((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      }))
    }
  },

  resetWorkspace: () =>
    set({
      mode: 'chat',
      coworkTab: 'overview',
      lists: emptyLists(),
      activeConvId: { chat: null, cowork: null, code: null },
    }),
}))
