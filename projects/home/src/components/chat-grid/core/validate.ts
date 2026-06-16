// Author-time guardrails. Returns human-readable problems; [] means valid.
// The room-size cap is the mesh-safety lever: forbid oversized audio rooms.

import type { GridConfig } from './types'
import { buildGrid, coordKey, inBounds } from './grid'
import { buildRooms } from './rooms'

export const DEFAULT_MAX_ROOM_CELLS = 6

export const validateGrid = (config: GridConfig): string[] => {
  const errors: string[] = []

  if (config.columns <= 0 || config.rows <= 0)
    errors.push(`grid needs positive dimensions (got ${config.columns}x${config.rows})`)

  const grid = buildGrid(config)

  const seen = new Set<string>()
  for (const cell of config.cells) {
    const key = coordKey(cell.coord)
    if (!inBounds(grid, cell.coord)) errors.push(`cell out of bounds: ${key}`)
    if (seen.has(key)) errors.push(`duplicate cell at ${key}`)
    seen.add(key)
    if (cell.char !== undefined && [...cell.char].length !== 1)
      errors.push(`cell ${key}: char must be exactly one character`)
    if (cell.link && !cell.link.url) errors.push(`cell ${key}: link is missing a url`)
  }

  if (config.spawn && !inBounds(grid, config.spawn))
    errors.push(`spawn out of bounds: ${coordKey(config.spawn)}`)

  const cap = config.maxRoomCells ?? DEFAULT_MAX_ROOM_CELLS
  const counts = new Map<number, number>()
  for (const roomId of buildRooms(grid).values())
    counts.set(roomId, (counts.get(roomId) ?? 0) + 1)
  for (const [roomId, count] of counts)
    if (count > cap)
      errors.push(`audio room ${roomId} has ${count} cells (max ${cap}) — split it up`)

  return errors
}
