// Audio huddles = connected components of `audio` cells (4-adjacency).
// Computed ONCE from the static grid; membership is a lookup, not a recompute.

import type { Coord, Grid, Player, PlayerId, HuddleId } from './types'
import { coordKey, coordsEqual, isAudio, neighbors } from './grid'

/** Flood-fill every audio cell into a connected component id. */
export const buildHuddles = (grid: Grid): Map<string, HuddleId> => {
  const huddles = new Map<string, HuddleId>()
  let next: HuddleId = 0

  for (const [key, cell] of grid.cells) {
    if (!cell.audio || huddles.has(key)) continue

    const queue: Coord[] = [cell.coord]
    huddles.set(key, next)
    while (queue.length) {
      const cur = queue.shift() as Coord
      for (const n of neighbors(grid, cur)) {
        const nk = coordKey(n)
        if (huddles.has(nk) || !isAudio(grid, n)) continue
        huddles.set(nk, next)
        queue.push(n)
      }
    }
    next++
  }
  return huddles
}

export const huddleOf = (huddles: Map<string, HuddleId>, c: Coord): HuddleId | null => {
  const r = huddles.get(coordKey(c))
  return r === undefined ? null : r
}

/** Ids of the other players sharing my huddle (empty if I'm not in one). */
export const peersInHuddle = (
  huddles: Map<string, HuddleId>,
  me: Coord,
  players: Player[],
): PlayerId[] => {
  const myHuddle = huddleOf(huddles, me)
  if (myHuddle === null) return []
  return players
    .filter((p) => !coordsEqual(p.coord, me) && huddleOf(huddles, p.coord) === myHuddle)
    .map((p) => p.id)
}
