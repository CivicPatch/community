// Pure movement rules: key -> direction, and whether a target cell is enterable.

import type { Coord, Grid } from './types'
import { coordKey, isWalkable } from './grid'

/** Pace of a single traversal step, ms. Shared by the local walker (use-movement)
 *  and the remote replay (travel animator) so an announced path plays back at the
 *  same cadence everywhere. */
export const STEP_MS = 140

const KEY_DELTAS: Record<string, Coord> = {
  w: { col: 0, row: -1 },
  s: { col: 0, row: 1 },
  a: { col: -1, row: 0 },
  d: { col: 1, row: 0 },
  arrowup: { col: 0, row: -1 },
  arrowdown: { col: 0, row: 1 },
  arrowleft: { col: -1, row: 0 },
  arrowright: { col: 1, row: 0 },
}

export const keyToDelta = (key: string): Coord | null =>
  KEY_DELTAS[key.toLowerCase()] ?? null

export const applyDelta = (from: Coord, d: Coord): Coord => ({
  col: from.col + d.col,
  row: from.row + d.row,
})

/** Enterable = in bounds, walkable, and not occupied by another player. */
export const canEnter = (
  grid: Grid,
  target: Coord,
  occupied: Set<string>,
): boolean => isWalkable(grid, target) && !occupied.has(coordKey(target))
