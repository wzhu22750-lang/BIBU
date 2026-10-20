import { useLayoutEffect, useRef } from 'react'

// Some keyboards resize the layout viewport; others shrink only the visual
// viewport. Use its bottom edge so both modes reserve the keyboard exactly once.
export function useChatViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const shell = ref.current
    if (!enabled || !shell) return
    const viewport = window.visualViewport
    let frame: number | null = null
    const update = () => {
      const layoutHeight = window.innerHeight
      // Pinch zoom is an accessibility action, not a keyboard opening.
      const bottom =
        viewport && Math.abs(viewport.scale - 1) < 0.01
          ? Math.min(layoutHeight, viewport.height + viewport.offsetTop)
          : layoutHeight
      shell.style.setProperty('--chat-viewport-height', `${bottom}px`)
      shell.style.setProperty('--chat-keyboard-inset', `${Math.max(0, layoutHeight - bottom)}px`)
    }
    const schedule = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        update()
      })
    }
    update()
    window.addEventListener('resize', schedule)
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      shell.style.removeProperty('--chat-viewport-height')
      shell.style.removeProperty('--chat-keyboard-inset')
    }
  }, [enabled])
  return ref
}
