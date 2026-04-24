import { useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { useAppStore } from './stores/appStore'
import { apiJSON, listConversations } from './lib/api'
import { LoginPage } from './components/LoginPage'
import { Layout } from './components/Layout'

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

  // On mount: verify token is still valid
  useEffect(() => {
    if (token && !user) {
      tryHydrateUser().then((data) => {
        if (!data) clearAuth()
      })
    }
  }, []) // eslint-disable-line

  // Load conversations when authenticated
  useEffect(() => {
    if (!token || conversationsLoaded) return
    listConversations()
      .then((items) => {
        setConversations(items)
        if (items.length > 0) {
          useAppStore.getState().setActiveId(items[0].id)
        }
      })
      .catch(() => clearAuth())
  }, [token, conversationsLoaded]) // eslint-disable-line

  if (!token) return <LoginPage />

  return <Layout />
}
