import { useEffect } from 'react'

/**
 * On iOS Safari, the software keyboard overlays the viewport but doesn't
 * resize the layout viewport. This hook listens to the VisualViewport API
 * and sets a CSS variable --viewport-height that components can use
 * instead of 100vh/100dvh. When the keyboard is up, this shrinks correctly.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport

    const update = () => {
      const h = vv ? vv.height : window.innerHeight
      document.documentElement.style.setProperty('--viewport-height', `${h}px`)
    }

    update()

    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    } else {
      window.addEventListener('resize', update)
    }

    return () => {
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      } else {
        window.removeEventListener('resize', update)
      }
    }
  }, [])
}
