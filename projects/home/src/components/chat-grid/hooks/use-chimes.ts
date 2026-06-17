// Notification chimes: diff each roster snapshot against the previous and play the
// sounds the user is subscribed to. The first snapshot after joining is the silent
// baseline (no chime for everyone already present); one chime per kind per snapshot.
// `prevRef`/`prefsRef` live here — only this effect reads them; the ref keeps the
// effect firing on roster change alone while always seeing the latest prefs.

import { useEffect, useRef } from 'haunted'
import type { Player } from '../core/types'
import type { SoundPrefs } from '../shell/sound-prefs'
import type { Pinger } from '../shell/ping'
import { diffPresence } from '../core/presence'

export const useChimes = (
  others: Player[],
  prefs: SoundPrefs,
  pingerRef: { current: Pinger | null },
) => {
  const prevRef = useRef<Player[] | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = others
    if (prev === null) return
    const { joined, left, statusPosted } = diffPresence(prev, others)
    const p = prefsRef.current
    const pinger = pingerRef.current
    if (!pinger) return
    if (p.joinLeave && joined.length) pinger.play('join')
    if (p.joinLeave && left.length) pinger.play('leave')
    if (p.status && statusPosted.length) pinger.play('status')
  }, [others])
}
