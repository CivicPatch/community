// Reconnect primitives — the single home for the "surviving a PiP pop" contract.
//
// THE PROBLEM: popping the room into a Picture-in-Picture window moves the <chat-room>
// host across documents (see hooks/use-pip.ts). That fires the custom element's
// disconnect→reconnect, and haunted runs every effect's CLEANUP on the disconnect but only
// re-runs effects whose deps changed on the reconnect. So any effect that set up a
// subscription (a listener, timer, socket, the realtime connection, the mic) has its
// cleanup run and is then never re-established — it dies silently, and only when popped.
//
// THE RULE: any effect that sets up something needing teardown must re-run after a pop.
// Don't hand-thread a nonce into a plain useEffect — use these instead, so the intent is
// named and the mechanism lives in one place:
//   • useReconnectEffect — a useEffect that also re-runs when the reconnect nonce changes.
//   • useOnChange        — runs when its deps change but NOT on first mount (for "react to
//                          a change" effects, e.g. re-acquiring the mic after a reconnect,
//                          which would double up with the initial setup if it ran on mount).
// The nonce itself is owned by chat-room.ts, bumped on each pop (see its useOnChange).

import { useEffect, useRef } from 'haunted'

export const useReconnectEffect = (
  effect: () => void | (() => void),
  deps: unknown[],
  reconnectNonce: number,
) => {
  useEffect(effect, [...deps, reconnectNonce])
}

// Runs `effect` when `deps` change, but not on the initial mount (unlike useEffect, which
// also fires once on mount). Useful for reacting to a change — a pop, a reconnect — where
// running on mount would duplicate work the initial render already did.
export const useOnChange = (effect: () => void | (() => void), deps: unknown[]) => {
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    return effect()
  }, deps)
}
