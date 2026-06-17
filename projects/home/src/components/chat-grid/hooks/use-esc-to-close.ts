// Esc closes whatever overlay/menu is open, wherever focus happens to be. The
// listener is attached only while something is open, so it never interferes with
// normal play. The latest callback is kept in a ref, so toggling `active` is the
// only thing that re-subscribes.

import { useEffect, useRef } from 'haunted'

export const useEscToClose = (active: boolean, onEscape: () => void) => {
  const cb = useRef(onEscape)
  cb.current = onEscape
  useEffect(() => {
    if (!active) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [active])
}
