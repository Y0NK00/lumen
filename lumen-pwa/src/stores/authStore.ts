import { create } from 'zustand'
import type { User } from '../lib/api'

interface AuthStore {
  user: User | null
  token: string | null
  setAuth: (token: string, user: User) => void
  setUser: (user: User) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  // Hydrate from localStorage on init so a refresh doesn't log you out
  token: localStorage.getItem('lumen_token'),

  setAuth: (token, user) => {
    localStorage.setItem('lumen_token', token)
    set({ token, user })
  },

  setUser: (user) => {
    set({ user })
  },

  clearAuth: () => {
    localStorage.removeItem('lumen_token')
    set({ token: null, user: null })
  },
}))
