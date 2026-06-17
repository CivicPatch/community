// Fade bubbles: schedule a single timeout to the soonest status expiry, which bumps
// `nowMs` to force a re-render so faded bubbles disappear. One timer at a time
// (cheap), reschedules whenever the roster or the clock changes.

import { useEffect } from 'haunted'
import type { Player } from '../core/types'
import { BUBBLE_MS } from '../core/presence'

export const useStatusBubbles = (
  others: Player[],
  nowMs: number,
  setNowMs: (n: number) => void,
  meRef: { current: Player | null },
) => {
  useEffect(() => {
    const stamps = [meRef.current?.statusAt, ...others.map((o) => o.statusAt)].filter(
      (t): t is number => typeof t === 'number',
    )
    const now = Date.now()
    const next = stamps
      .map((t) => t + BUBBLE_MS)
      .filter((exp) => exp > now)
      .sort((a, b) => a - b)[0]
    if (next === undefined) return
    const id = setTimeout(() => setNowMs(Date.now()), next - now)
    return () => clearTimeout(id)
  }, [others, nowMs])
}
