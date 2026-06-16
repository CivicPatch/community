// Pure presence-derived helpers. No DOM and no time source of their own — `now` is
// passed in, so callers (and tests) stay deterministic.

import { roomOf } from './rooms'
import type { Coord, Player, RoomId } from './types'

export interface RankedRoster {
  /** others in MY audio room (people I can hear) — promoted under "You" */
  blob: Player[]
  /** everyone else online */
  grid: Player[]
}

/** Partition the roster into my audio blob vs. the rest of the grid, each sorted by
 *  distance from me (so nearer people rise), name as the tiebreaker. The whole roster
 *  is shown; audio-room membership is a sort/grouping signal, not a filter. */
export const rankRoster = (
  others: Player[],
  rooms: Map<string, RoomId>,
  myCoord: Coord | null,
): RankedRoster => {
  const myRoom = myCoord ? roomOf(rooms, myCoord) : null
  const blob: Player[] = []
  const grid: Player[] = []
  for (const p of others) {
    if (myRoom !== null && roomOf(rooms, p.coord) === myRoom) blob.push(p)
    else grid.push(p)
  }
  const rank = (a: Player, b: Player) => {
    if (myCoord) {
      const da = Math.abs(a.coord.col - myCoord.col) + Math.abs(a.coord.row - myCoord.row)
      const db = Math.abs(b.coord.col - myCoord.col) + Math.abs(b.coord.row - myCoord.row)
      if (da !== db) return da - db
    }
    return a.name.localeCompare(b.name)
  }
  return { blob: blob.sort(rank), grid: grid.sort(rank) }
}

/** How long a freshly-set status shows as a floating bubble before it settles to
 *  hover / roster-only. */
export const BUBBLE_MS = 60_000

/** Is a status still "fresh" enough to show as a bubble over the avatar? Pure: the
 *  caller decides WHEN to re-evaluate (one timeout at statusAt + BUBBLE_MS). */
export const bubbleVisible = (statusAt: number | undefined, now: number): boolean =>
  statusAt !== undefined && now - statusAt < BUBBLE_MS
