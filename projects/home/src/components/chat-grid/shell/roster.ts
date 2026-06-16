// The set of OTHER players, with a presence grace period: when someone vanishes
// we hold them briefly before dropping them, so a reconnecting (throttled or
// backgrounded) peer doesn't blink out and back in. Presence decides membership;
// broadcast updates coords. Encapsulating this keeps the backend adapter readable.

import type { Coord, Player, PlayerId } from '../core/types'

export interface Roster {
  /** Reconcile membership against the currently-present players. */
  applyPresence(present: Player[]): void
  /** Update one member's position (from a broadcast). */
  updateCoord(id: PlayerId, coord: Coord): void
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

  const change = () => opts.onChange([...members.values()])
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
        if (!members.has(p.id)) members.set(p.id, { ...p })
        // existing members keep their broadcast-updated coord, not the presence one
      }
      for (const id of [...members.keys()]) {
        if (presentIds.has(id) || pending.has(id)) continue
        pending.set(
          id,
          setTimeout(() => {
            pending.delete(id)
            if (members.delete(id)) change()
          }, opts.graceMs),
        )
      }
      change()
    },
    updateCoord(id, coord) {
      const p = members.get(id)
      if (p) {
        p.coord = coord
        change()
      }
    },
    clear() {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      members.clear()
      change()
    },
    dispose() {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
    },
  }
}
