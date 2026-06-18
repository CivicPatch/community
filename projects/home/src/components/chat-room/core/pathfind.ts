// Click-to-travel: BFS shortest path avoiding walls and occupied cells.

import type { Coord, Room } from './types'
import { coordKey, doorAt, isWalkable, neighbors } from './room'

/**
 * Shortest path from `from` to `to`, skipping non-walkable and occupied cells.
 * Returns the steps AFTER `from` (last element is `to`), [] if already there,
 * or null if `to` is unreachable / not enterable.
 *
 * Doors are reachable as a DESTINATION but never traversed: a route never passes
 * THROUGH a door (it would whisk you to another room mid-walk), it only ends on one.
 */
export const findPath = (
  room: Room,
  from: Coord,
  to: Coord,
  occupied: Set<string>,
): Coord[] | null => {
  const toKey = coordKey(to)
  if (toKey === coordKey(from)) return []
  if (!isWalkable(room, to) || occupied.has(toKey)) return null

  const prev = new Map<string, Coord | null>()
  prev.set(coordKey(from), null)
  const queue: Coord[] = [from]

  while (queue.length) {
    const cur = queue.shift() as Coord
    for (const n of neighbors(room, cur)) {
      const nk = coordKey(n)
      if (prev.has(nk) || !isWalkable(room, n) || occupied.has(nk)) continue
      prev.set(nk, cur)
      if (nk === toKey) return reconstruct(prev, to)
      if (doorAt(room, n)) continue // reachable as a target, but don't route through it
      queue.push(n)
    }
  }
  return null
}

const reconstruct = (prev: Map<string, Coord | null>, to: Coord): Coord[] => {
  const path: Coord[] = []
  let cur: Coord | null = to
  while (cur) {
    path.push(cur)
    cur = prev.get(coordKey(cur)) ?? null
  }
  path.reverse()
  path.shift() // drop the start coord
  return path
}
