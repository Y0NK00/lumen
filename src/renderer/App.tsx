import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { useChatStore } from './stores/chatStore'
import { useHelmStore } from './stores/helmStore'
import { useProjectsStore } from './stores/projectsStore'
import { useSettingsStore } from './stores/settingsStore'
import { useUIStore } from './stores/uiStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App() {
  const { createConversation, conversations, setActiveConversation, activeConversationId } = useChatStore()

  // Register Ctrl+N / Ctrl+K / Ctrl+1/2/3 / Ctrl+,
  useKeyboardShortcuts()

  useEffect(() => {
    // If this window was opened with ?conv=<id> (via "open in new window"),
    // select that conversation. Otherwise create/restore the default one.
    const params = new URLSearchParams(window.location.search)
    const convParam = params.get('conv')

    if (convParam && conversations[convParam]) {
      setActiveConversation(convParam)
      return
    }

    const hasConversations = Object.keys(conversations).length > 0
    if (!hasConversations || !activeConversationId) createConversation()
  }, []) // eslint-disable-line

  // ── Settings sync → main process ────────────────────────────────────────────
  // Push API key + model to main on boot and whenever they change so the cron
  // runner can call Claude without an IPC round-trip at execution time.
  useEffect(() => {
    const push = (s: ReturnType<typeof useSettingsStore.getState>) => {
      window.tower?.syncSettings?.({ apiKey: s.claudeApiKey, model: s.defaultClaudeModel })
    }
    push(useSettingsStore.getState())
    return useSettingsStore.subscribe(push)
  }, [])

  // ── Appearance: apply font-size to root element ────────────────────────────
  // Since Tailwind uses rem units, changing the root font-size scales the whole
  // UI. xs=12px, sm=14px (default), base=16px.
  useEffect(() => {
    const SIZES = { xs: '12px', sm: '14px', base: '16px' } as const
    const apply = (s: ReturnType<typeof useSettingsStore.getState>) => {
      document.documentElement.style.fontSize = SIZES[s.fontSize] ?? '14px'
    }
    apply(useSettingsStore.getState())
    return useSettingsStore.subscribe(apply)
  }, [])

  // ── Project rootPath sync → main process ─────────────────────────────────────
  // Push the active project's rootPath so file tools can be scoped correctly.
  useEffect(() => {
    const push = () => {
      const { projects, activeProjectId } = useProjectsStore.getState()
      const rootPath = activeProjectId ? (projects[activeProjectId]?.rootPath ?? null) : null
      window.tower?.syncRootPath?.(rootPath)
    }
    push()
    return useProjectsStore.subscribe(push)
  }, [])

  // ── Cron task sync + result handler ──────────────────────────────────────────
  // Sync persisted tasks to main on boot. When a task fires, update lastRunAt
  // in the store and create a new conversation with the prompt + result.
  useEffect(() => {
    const tasks = Object.values(useHelmStore.getState().scheduledTasks)
    window.tower?.cronSync?.(tasks)

    const cleanupRan = window.tower?.onCronTaskRan?.((data) => {
      useHelmStore.getState().updateScheduledTask(data.taskId, { lastRunAt: data.ranAt })
    })

    const cleanupResult = window.tower?.onCronTaskResult?.((data) => {
      const { claudeApiKey, defaultClaudeModel, defaultOllamaModel, defaultProvider } = useSettingsStore.getState()
      if (!claudeApiKey) return
      const model = defaultProvider === 'claude' ? defaultClaudeModel : defaultOllamaModel
      const { createConversation, addMessage } = useChatStore.getState()
      const convId = createConversation(model, 'chat')
      addMessage(convId, { role: 'user', content: `[Scheduled: ${data.label}]\n\n${data.prompt}` })
      addMessage(convId, { role: 'assistant', content: data.result })
      // Switch to Chat and surface the result
      useUIStore.getState().setMode('chat')
    })

    return () => { cleanupRan?.(); cleanupResult?.() }
  }, [])

  return <Layout />
}
