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

  // ── Appearance: font size ─────────────────────────────────────────────────
  useEffect(() => {
    const SIZES = { xs: '12px', sm: '14px', base: '16px' } as const
    const apply = (s: ReturnType<typeof useSettingsStore.getState>) => {
      document.documentElement.style.fontSize = SIZES[s.fontSize] ?? '14px'
    }
    apply(useSettingsStore.getState())
    return useSettingsStore.subscribe(apply)
  }, [])

  // ── Appearance: theme + color mode ────────────────────────────────────────
  useEffect(() => {
    const apply = (s: ReturnType<typeof useSettingsStore.getState>) => {
      const root = document.documentElement
      root.setAttribute('data-theme', s.theme)

      // Color mode: 'auto' listens to OS preference
      if (s.colorMode === 'light') {
        root.setAttribute('data-color-mode', 'light')
      } else if (s.colorMode === 'dark') {
        root.removeAttribute('data-color-mode')
      } else {
        // auto: check system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (prefersDark) root.removeAttribute('data-color-mode')
        else root.setAttribute('data-color-mode', 'light')
      }
    }
    apply(useSettingsStore.getState())
    const unsub = useSettingsStore.subscribe(apply)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const mqHandler = () => apply(useSettingsStore.getState())
    mq.addEventListener('change', mqHandler)
    return () => { unsub(); mq.removeEventListener('change', mqHandler) }
  }, [])

  // ── Appearance: chat font ─────────────────────────────────────────────────
  useEffect(() => {
    const FONT_CLASSES = ['font-chat-default', 'font-chat-sans', 'font-chat-system', 'font-chat-dyslexia']
    const apply = (s: ReturnType<typeof useSettingsStore.getState>) => {
      const root = document.documentElement
      FONT_CLASSES.forEach((c) => root.classList.remove(c))
      root.classList.add(`font-chat-${s.chatFont}`)
    }
    apply(useSettingsStore.getState())
    return useSettingsStore.subscribe(apply)
  }, [])

  // ── Appearance: background animation ─────────────────────────────────────
  useEffect(() => {
    const apply = (s: ReturnType<typeof useSettingsStore.getState>) => {
      const root = document.documentElement
      const preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const shouldAnimate =
        s.backgroundAnimation === 'enabled' ||
        (s.backgroundAnimation === 'auto' && !preferReducedMotion)
      root.classList.toggle('bg-animated', shouldAnimate)
    }
    apply(useSettingsStore.getState())
    return useSettingsStore.subscribe(apply)
  }, [])

  // ── Token usage: reset if new month ──────────────────────────────────────
  useEffect(() => {
    useSettingsStore.getState().resetTokensIfNewMonth()
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
