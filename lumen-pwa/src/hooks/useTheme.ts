import { useEffect } from 'react'
import { useThemeStore, getActiveTheme, applyTheme } from '../stores/themeStore'

/**
 * Call once at the top of the app (App.tsx).
 * Reads the persisted theme from localStorage and applies its CSS variables.
 * Re-applies whenever the user switches themes.
 */
export function useTheme() {
  const themeId = useThemeStore((s) => s.themeId)

  useEffect(() => {
    applyTheme(getActiveTheme(themeId))
  }, [themeId])
}
