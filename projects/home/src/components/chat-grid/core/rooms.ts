// Audio rooms = connected components of `audio` cells (4-adjacency).
// Computed ONCE from the static grid; membership is a lookup, not a recompute.

import type { Coord, Grid, Player, PlayerId, RoomId } from './types'
import { coordKey, coordsEqual, isAudio, neighbors } from './grid'

/** Flood-fill every audio cell into a connected component id. */
export const buildRooms = (grid: Grid): Map<string, RoomId> => {
  const rooms = new Map<string, RoomId>()
  let next: RoomId = 0

  for (const [key, cell] of grid.cells) {
    if (!cell.audio || rooms.has(key)) continue

    const queue: Coord[] = [cell.coord]
    rooms.set(key, next)
    while (queue.length) {
      const cur = queue.shift() as Coord
      for (const n of neighbors(grid, cur)) {
        const nk = coordKey(n)
        if (rooms.has(nk) || !isAudio(grid, n)) continue
        rooms.set(nk, next)
        queue.push(n)
      }
    }
    next++
  }
  return rooms
}

export const roomOf = (rooms: Map<string, RoomId>, c: Coord): RoomId | null => {
  const r = rooms.get(coordKey(c))
  return r === undefined ? null : r
}

/** Ids of the other players sharing my audio room (empty if I'm not in one). */
export const peersInRoom = (
  rooms: Map<string, RoomId>,
  me: Coord,
  players: Player[],
): PlayerId[] => {
  const myRoom = roomOf(rooms, me)
  if (myRoom === null) return []
  return players
    .filter((p) => !coordsEqual(p.coord, me) && roomOf(rooms, p.coord) === myRoom)
    .map((p) => p.id)
}
