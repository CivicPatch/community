// Fade bubbles: schedule a single timeout to the soonest upcoming bubble event — either a
// fade-start (BUBBLE_MS - BUBBLE_FADE_MS, when the fade-out class goes on) or an expiry
// (BUBBLE_MS, when it's removed) — which bumps `nowMs` to force the re-render that applies
// it. One timer at a time (cheap), reschedules whenever the roster or the clock changes.

import { useEffect } from 'haunted'
import type { Player } from '../core/types'
import { BUBBLE_MS, BUBBLE_FADE_MS } from '../core/presence'

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
      .flatMap((t) => [t + BUBBLE_MS - BUBBLE_FADE_MS, t + BUBBLE_MS])
      .filter((at) => at > now)
      .sort((a, b) => a - b)[0]
    if (next === undefined) return
    const id = setTimeout(() => setNowMs(Date.now()), next - now)
    return () => clearTimeout(id)
  }, [others, nowMs])
}
