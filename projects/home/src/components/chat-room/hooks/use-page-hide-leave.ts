// Closing a tab/window does NOT run effect cleanup, so leave() never fires and our
// presence lingers as a "ghost" until the server times out the dropped socket —
// inconsistent, because it depends on whether the socket closed gracefully.
// Proactively leave on `pagehide` (the reliable close/nav signal; `unload`/
// `beforeunload` don't fire on mobile Safari). Skip the bfcache case (persisted) —
// that page may come back, so don't tear it down.

import type { RealtimeBackend } from '../shell/realtime'
import { useReconnectEffect } from './use-reconnect'

// reconnectNonce: a PiP pop moves the host across documents, running this cleanup (the
// listener is removed) without re-running the effect — bumping the nonce re-arms it.
export const usePageHideLeave = (
  backendRef: { current: RealtimeBackend | null },
  reconnectNonce: number,
) => {
  useReconnectEffect(
    () => {
      const onPageHide = (e: PageTransitionEvent) => {
        if (e.persisted) return
        backendRef.current?.leave()
      }
      window.addEventListener('pagehide', onPageHide)
      return () => window.removeEventListener('pagehide', onPageHide)
    },
    [],
    reconnectNonce,
  )
}
