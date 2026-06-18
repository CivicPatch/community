// The set of OTHER players, with a presence grace period: when someone vanishes
// we hold them briefly before dropping them, so a reconnecting (throttled or
// backgrounded) peer doesn't blink out and back in. Presence decides membership;
// broadcast updates coords. Encapsulating this keeps the backend adapter readable.

import type { Coord, Player, PlayerId } from '../core/types'
import { createTravelAnimator } from './travel'

export interface Roster {
  /** Reconcile membership against the currently-present players. */
  applyPresence(present: Player[]): void
  /** Update one member's position (a discrete broadcast move/settle). */
  updateCoord(id: PlayerId, coord: Coord): void
  /** Replay an announced click-to-travel path for one member, cell by cell. */
  travel(id: PlayerId, path: Coord[]): void
  /** Empty the roster (e.g. on a fresh join). */
  clear(): void
  /** Cancel pending timers without emitting (on teardown). */
  dispose(): void
}

export const createRoster = (opts: {
  graceMs: number
  onChange: (others: Player[]) => void
}): Roster => {
  const members = new Map<PlayerId, Player>()
  const pending = new Map<PlayerId, ReturnType<typeof setTimeout>>()
  const walks = createTravelAnimator()

  const change = () => opts.onChange([...members.values()])
  const setCoord = (id: PlayerId, coord: Coord) => {
    const p = members.get(id)
    if (p) {
      p.coord = coord
      change()
    }
  }
  const cancelPending = (id: PlayerId) => {
    const t = pending.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      pending.delete(id)
    }
  }

  return {
    applyPresence(present) {
      const presentIds = new Set<PlayerId>()
      for (const p of present) {
        presentIds.add(p.id)
        cancelPending(p.id) // they're back (or never left) — keep them
        const existing = members.get(p.id)
        // refresh presence-owned fields (name, audioEnabled) but keep the
        // broadcast-owned coord, so a re-track doesn't snap them back to spawn
        members.set(p.id, existing ? { ...p, coord: existing.coord } : { ...p })
      }
      for (const id of [...members.keys()]) {
        if (presentIds.has(id) || pending.has(id)) continue
        pending.set(
          id,
          setTimeout(() => {
            pending.delete(id)
            walks.cancel(id)
            if (members.delete(id)) change()
          }, opts.graceMs),
        )
      }
      change()
    },
    updateCoord(id, coord) {
      // A settle that just confirms the destination of an in-flight walk: leave the
      // animation to finish smoothly. Any other discrete move supersedes it.
      if (walks.headedTo(id, coord)) return
      walks.cancel(id)
      setCoord(id, coord)
    },
    travel(id, path) {
      if (!members.has(id)) return // not on the roster yet — nothing to animate
      walks.travel(id, path, (coord) => setCoord(id, coord))
    },
    clear() {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      walks.cancelAll()
      members.clear()
      change()
    },
    dispose() {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      walks.cancelAll()
    },
  }
}
