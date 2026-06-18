// Remote-walk replay. A peer announces a whole click-to-travel as ONE `travel`
// message (the ordered cells, last = destination); every receiver replays it
// locally, one cell per STEP_MS. This keeps the wire quiet (one message per trip,
// not one per cell) and the motion accurate (the real path, so no corner-cutting),
// and decouples the animation cadence from packet arrival (no jitter stutter).
//
// The animator owns only the timers; each caller supplies an `onStep` that mutates
// + emits its own player store (roster for Supabase, the Map for the fake backend).

import type { Coord, PlayerId } from '../core/types'
import { coordsEqual } from '../core/room'
import { STEP_MS } from '../core/movement'

export interface TravelAnimator {
  /** Replay `path` for `id`, calling `onStep(coord)` per cell. Replaces any walk
   *  already in flight for `id`. A path of [] is a no-op. */
  travel(id: PlayerId, path: Coord[], onStep: (coord: Coord) => void): void
  /** True if `id` is mid-walk toward exactly `coord` — lets a discrete settle that
   *  merely confirms the destination be ignored, so the animation finishes smoothly
   *  instead of snapping. */
  headedTo(id: PlayerId, coord: Coord): boolean
  /** Stop `id`'s walk (a discrete correction supersedes it, or they left). */
  cancel(id: PlayerId): void
  /** Stop every walk (teardown). */
  cancelAll(): void
}

export const createTravelAnimator = (): TravelAnimator => {
  const walks = new Map<PlayerId, { timer: ReturnType<typeof setInterval>; dest: Coord }>()

  const cancel = (id: PlayerId) => {
    const w = walks.get(id)
    if (w) {
      clearInterval(w.timer)
      walks.delete(id)
    }
  }

  return {
    travel(id, path, onStep) {
      cancel(id)
      if (!path.length) return
      let i = 0
      const tick = () => {
        if (i >= path.length) return cancel(id)
        onStep(path[i])
        i++
      }
      const timer = setInterval(tick, STEP_MS)
      walks.set(id, { timer, dest: path[path.length - 1] })
      tick() // first cell now, the rest on the interval
    },
    headedTo(id, coord) {
      const w = walks.get(id)
      return w !== undefined && coordsEqual(w.dest, coord)
    },
    cancel,
    cancelAll() {
      for (const w of walks.values()) clearInterval(w.timer)
      walks.clear()
    },
  }
}
