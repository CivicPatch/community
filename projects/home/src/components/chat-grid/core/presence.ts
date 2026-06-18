// Pure presence-derived helpers. No DOM and no time source of their own — `now` is
// passed in, so callers (and tests) stay deterministic.

import { huddleOf } from './huddles'
import type { Coord, Player, PlayerId, HuddleId } from './types'

export interface PresenceDiff {
  joined: PlayerId[]
  left: PlayerId[]
  /** posted or changed to a NON-empty status (clearing a status doesn't count) */
  statusPosted: PlayerId[]
}

/** What changed between two roster snapshots — the trigger source for join/leave/status
 *  sounds. Pure: feed it the grace-smoothed `onPlayers` snapshots. A newcomer who already
 *  has a status counts as `joined`, not `statusPosted` (no double-fire). */
export const diffPresence = (prev: Player[], next: Player[]): PresenceDiff => {
  const prevById = new Map(prev.map((p) => [p.id, p]))
  const nextIds = new Set(next.map((p) => p.id))
  const joined: PlayerId[] = []
  const statusPosted: PlayerId[] = []
  for (const p of next) {
    const before = prevById.get(p.id)
    if (!before) joined.push(p.id)
    else if (p.status && p.statusAt !== before.statusAt) statusPosted.push(p.id)
  }
  const left = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id)
  return { joined, left, statusPosted }
}

export interface RankedRoster {
  /** others in MY huddle (people I can hear) — promoted under "You" */
  huddle: Player[]
  /** everyone else online */
  grid: Player[]
}

/** Partition the roster into my huddle vs. the rest of the grid, each sorted by
 *  distance from me (so nearer people rise), name as the tiebreaker. The whole roster
 *  is shown; huddle membership is a sort/grouping signal, not a filter. */
export const rankRoster = (
  others: Player[],
  huddles: Map<string, HuddleId>,
  myCoord: Coord | null,
): RankedRoster => {
  const myHuddle = myCoord ? huddleOf(huddles, myCoord) : null
  const huddle: Player[] = []
  const grid: Player[] = []
  for (const p of others) {
    if (myHuddle !== null && huddleOf(huddles, p.coord) === myHuddle) huddle.push(p)
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
  return { huddle: huddle.sort(rank), grid: grid.sort(rank) }
}

/** How long a freshly-set status shows as a floating bubble before it settles to
 *  hover / roster-only. */
export const BUBBLE_MS = 60_000

/** Is a status still "fresh" enough to show as a bubble over the avatar? Pure: the
 *  caller decides WHEN to re-evaluate (one timeout at statusAt + BUBBLE_MS). */
export const bubbleVisible = (statusAt: number | undefined, now: number): boolean =>
  statusAt !== undefined && now - statusAt < BUBBLE_MS
