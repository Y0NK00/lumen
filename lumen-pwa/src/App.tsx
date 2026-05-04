import { useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { useAppStore } from './stores/appStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import { apiJSON, listConversationsForWorkspace } from './lib/api'
import { LoginPage } from './components/LoginPage'
import { Layout } from './components/Layout'
import { useVisualViewport } from './hooks/useVisualViewport'
import { useTheme } from './hooks/useTheme'

async function tryHydrateUser() {
  const token = localStorage.getItem('lumen_token')
  if (!token) return null
  try {
    const data = await apiJSON<{ auth: { userId: string; role: string } }>('/api/auth/me')
    return data
  } catch {
    localStorage.removeItem('lumen_token')
    return null
  }
}

export default function App() {
  const { token, user, clearAuth } = useAuthStore()
  const { setConversations, conversationsLoaded } = useAppStore()

  // Track visual viewport so iOS keyboard shrinks layout correctly
  useVisualViewport()
  // Apply persisted accent theme to CSS variables
  useTheme()

  // On mount: verify token is still valid
  useEffect(() => {
    if (token && !user) {
      tryHydrateUser().then((data) => {
        if (!data) {
          useAppStore.getState().resetSession()
          useWorkspaceStore.getState().resetWorkspace()
          clearAuth()
        }
      })
    }
  }, []) // eslint-disable-line

  // Load Chat workspace when authenticated. Do not clearAuth on failure — older servers without `workspace` caused a false “login broken” loop.
  useEffect(() => {
    if (!token || conversationsLoaded) return
    listConversationsForWorkspace('chat')
      .then((items) => {
        useWorkspaceStore.getState().setList('chat', items)
        setConversations(items)
        if (items.length > 0) {
          useAppStore.getState().setActiveId(items[0].id)
          useWorkspaceStore.setState((s) => ({
            activeConvId: { ...s.activeConvId, chat: items[0].id },
          }))
        }
      })
      .catch((e) => {
        console.error('Failed to load conversations (session kept):', e)
        useWorkspaceStore.getState().setList('chat', [])
        setConversations([])
      })
  }, [token, conversationsLoaded]) // eslint-disable-line

  if (!token) return <LoginPage />

  return <Layout />
}
