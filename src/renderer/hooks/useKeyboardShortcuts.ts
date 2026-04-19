// src/renderer/hooks/useKeyboardShortcuts.ts
// Global keyboard shortcuts for Lumen. Registered once at app root via <App />.
//
// Shortcuts:
//   Ctrl/Cmd + N        → new conversation in current mode
//   Ctrl/Cmd + 1        → Chat mode
//   Ctrl/Cmd + 2        → Helm mode
//   Ctrl/Cmd + 3        → Code mode
//   Ctrl/Cmd + K        → focus sidebar search (dispatches a custom event
//                         the Sidebar listens for)
//   Ctrl/Cmd + ,        → open Settings
//
// Design notes:
//   - We skip the handler when the user is typing in an editable field so
//     shortcuts don't hijack message input. Exception: Ctrl+K is allowed
//     anywhere so you can jump to search from anywhere.
//   - Sidebar search focus uses a DOM CustomEvent rather than lifting the
//     input ref up to App — keeps Sidebar ownership of its own state.

import { useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore, type AppMode } from '../stores/uiStore'

export const SIDEBAR_FOCUS_SEARCH_EVENT = 'lumen:focus-sidebar-search'
export const OPEN_SETTINGS_EVENT        = 'lumen:open-settings'
export const OPEN_ARTIFACTS_EVENT       = 'lumen:open-artifacts'
export const OPEN_PROJECTS_EVENT        = 'lumen:open-projects'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const target = e.target as HTMLElement | null
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)

      // Ctrl+K always works — lets users jump to search from the chat input.
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(SIDEBAR_FOCUS_SEARCH_EVENT))
        return
      }

      // Ctrl+B → toggle sidebar visibility. Allowed while typing because
      // giving yourself more screen real estate shouldn't require de-focusing.
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useUIStore.getState().toggleSidebar()
        return
      }

      // Everything else is blocked while typing.
      if (inEditable) return

      // Ctrl+N → new conversation in current mode
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        const { mode } = useUIStore.getState()
        const { defaultProvider, defaultClaudeModel, defaultOllamaModel } = useSettingsStore.getState()
        const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
        const convMode = mode === 'code' ? 'code' : 'chat'
        // Helm mode has no conversation concept yet — fall back to Chat.
        if (mode === 'helm') useUIStore.getState().setMode('chat')
        useChatStore.getState().createConversation(model, convMode)
        return
      }

      // Ctrl+1 / 2 / 3 → mode switch
      if (['1', '2', '3'].includes(e.key)) {
        const mapping: Record<string, AppMode> = { '1': 'chat', '2': 'helm', '3': 'code' }
        const next = mapping[e.key]
        if (next) {
          e.preventDefault()
          useUIStore.getState().setMode(next)
        }
        return
      }

      // Ctrl+, → settings
      if (e.key === ',') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT))
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
