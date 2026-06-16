// Click-to-travel: BFS shortest path avoiding walls and occupied cells.

import type { Coord, Grid } from './types'
import { coordKey, isWalkable, neighbors } from './grid'

/**
 * Shortest path from `from` to `to`, skipping non-walkable and occupied cells.
 * Returns the steps AFTER `from` (last element is `to`), [] if already there,
 * or null if `to` is unreachable / not enterable.
 */
export const findPath = (
  grid: Grid,
  from: Coord,
  to: Coord,
  occupied: Set<string>,
): Coord[] | null => {
  const toKey = coordKey(to)
  if (toKey === coordKey(from)) return []
  if (!isWalkable(grid, to) || occupied.has(toKey)) return null

  const prev = new Map<string, Coord | null>()
  prev.set(coordKey(from), null)
  const queue: Coord[] = [from]

  while (queue.length) {
    const cur = queue.shift() as Coord
    for (const n of neighbors(grid, cur)) {
      const nk = coordKey(n)
      if (prev.has(nk) || !isWalkable(grid, n) || occupied.has(nk)) continue
      prev.set(nk, cur)
      if (nk === toKey) return reconstruct(prev, to)
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
