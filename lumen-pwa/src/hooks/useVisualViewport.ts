import { useEffect } from 'react'

/**
 * Tracks the VisualViewport API so the layout shrinks correctly when
 * the iOS software keyboard opens. After each resize, scrolls the
 * message list to the bottom so content doesn't disappear behind the keyboard.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport

    const update = () => {
      const h = vv ? vv.height : window.innerHeight
      document.documentElement.style.setProperty('--viewport-height', `${h}px`)

      // Delay scroll until the iOS keyboard animation finishes (~300ms).
      // requestAnimationFrame fires too early — the layout hasn't settled yet,
      // so scrollHeight is wrong and the list jumps to the wrong position.
      setTimeout(() => {
        const msgList = document.querySelector('[data-message-list]') as HTMLElement | null
        if (msgList) msgList.scrollTop = msgList.scrollHeight
      }, 150)
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
