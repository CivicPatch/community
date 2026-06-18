// Pure room helpers: construction, lookup, bounds, adjacency.

import type { Coord, Room, RoomConfig, Cell } from './types'

export const coordKey = (c: Coord): string => `${c.col},${c.row}`

export const coordsEqual = (a: Coord, b: Coord): boolean =>
  a.col === b.col && a.row === b.row

export const buildRoom = (config: RoomConfig): Room => {
  const cells = new Map<string, Cell>()
  for (const cell of config.cells) cells.set(coordKey(cell.coord), cell)
  return { columns: config.columns, rows: config.rows, cells }
}

export const cellAt = (room: Room, coord: Coord): Cell | undefined =>
  room.cells.get(coordKey(coord))

export const inBounds = (room: Room, c: Coord): boolean =>
  c.col >= 0 && c.row >= 0 && c.col < room.columns && c.row < room.rows

/**
 * Walkable = in bounds, not blocked. An explicit `walkable` always wins; otherwise
 * link "kiosks" block by default (you click them, you don't stand on them); every
 * other cell is walkable.
 */
export const isWalkable = (room: Room, c: Coord): boolean => {
  if (!inBounds(room, c)) return false
  const cell = cellAt(room, c)
  if (!cell) return true
  if (cell.walkable !== undefined) return cell.walkable
  return !cell.link
}

export const isAudio = (room: Room, c: Coord): boolean => cellAt(room, c)?.audio === true

/** The radio station at a coord, or null. Pure selector — the shell tunes/stops off this. */
export const radioAt = (room: Room, c: Coord): { url: string; label?: string } | null =>
  cellAt(room, c)?.radio ?? null

/** The door at a coord, or null. Landing here switches rooms (see use-door). */
export const doorAt = (
  room: Room,
  c: Coord,
): { to: string; spawn?: Coord; label?: string } | null => cellAt(room, c)?.door ?? null

/** 4-directional (orthogonal) in-bounds neighbours — matches WASD movement. */
export const neighbors = (room: Room, c: Coord): Coord[] => {
  const deltas: Coord[] = [
    { col: 0, row: -1 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
    { col: 1, row: 0 },
  ]
  return deltas
    .map((d) => ({ col: c.col + d.col, row: c.row + d.row }))
    .filter((n) => inBounds(room, n))
}

/**
 * Nearest walkable, unoccupied cell to `from` (BFS outward). Returns `from`
 * itself if it's already free, or falls back to `from` if the room is full.
 */
export const nearestFreeCell = (room: Room, from: Coord, occupied: Set<string>): Coord => {
  const seen = new Set<string>([coordKey(from)])
  const queue: Coord[] = [from]
  while (queue.length) {
    const cur = queue.shift() as Coord
    if (isWalkable(room, cur) && !occupied.has(coordKey(cur))) return cur
    for (const n of neighbors(room, cur)) {
      const k = coordKey(n)
      if (!seen.has(k)) {
        seen.add(k)
        queue.push(n)
      }
    }
  }
  return from
}
