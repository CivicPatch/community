// Author-time guardrails. Returns human-readable problems; [] means valid.
// The huddle-size cap is the mesh-safety lever: forbid oversized huddles.

import type { RoomConfig } from './types'
import { buildRoom, coordKey, inBounds } from './room'
import { buildHuddles } from './huddles'

export const DEFAULT_MAX_HUDDLE_CELLS = 6

export const validateGrid = (config: RoomConfig): string[] => {
  const errors: string[] = []

  if (config.columns <= 0 || config.rows <= 0)
    errors.push(`room needs positive dimensions (got ${config.columns}x${config.rows})`)

  const room = buildRoom(config)

  const seen = new Set<string>()
  for (const cell of config.cells) {
    const key = coordKey(cell.coord)
    if (!inBounds(room, cell.coord)) errors.push(`cell out of bounds: ${key}`)
    if (seen.has(key)) errors.push(`duplicate cell at ${key}`)
    seen.add(key)
    if (cell.char !== undefined && [...cell.char].length !== 1)
      errors.push(`cell ${key}: char must be exactly one character`)
    if (cell.link && !cell.link.url) errors.push(`cell ${key}: link is missing a url`)
    if (cell.radio && !cell.radio.url) errors.push(`cell ${key}: radio is missing a url`)
    if (cell.door) {
      if (!cell.door.to) errors.push(`cell ${key}: door is missing a destination (to)`)
      if (cell.audio || cell.link || cell.radio)
        errors.push(`cell ${key}: a door can't also be audio/link/radio — it's a silent threshold`)
    }
  }

  if (config.spawn && !inBounds(room, config.spawn))
    errors.push(`spawn out of bounds: ${coordKey(config.spawn)}`)

  const cap = config.maxHuddleCells ?? DEFAULT_MAX_HUDDLE_CELLS
  const counts = new Map<number, number>()
  for (const huddleId of buildHuddles(room).values())
    counts.set(huddleId, (counts.get(huddleId) ?? 0) + 1)
  for (const [huddleId, count] of counts)
    if (count > cap)
      errors.push(`huddle ${huddleId} has ${count} cells (max ${cap}) — split it up`)

  return errors
}
