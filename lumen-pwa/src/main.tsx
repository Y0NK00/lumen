import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import { getActiveTheme, applyTheme } from './stores/themeStore'

// Apply persisted theme BEFORE React renders to avoid a flash of wrong gradient colors.
// The Zustand store reads localStorage synchronously here.
try {
  const stored = localStorage.getItem('lumen-theme')
  const themeId = stored ? (JSON.parse(stored)?.state?.themeId ?? 'lumen') : 'lumen'
  applyTheme(getActiveTheme(themeId))
} catch {
  // Silently fall back to default purple theme
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
