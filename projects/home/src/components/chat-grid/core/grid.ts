// Pure grid helpers: construction, lookup, bounds, adjacency.

import type { Coord, Grid, GridConfig, Cell } from './types'

export const coordKey = (c: Coord): string => `${c.col},${c.row}`

export const coordsEqual = (a: Coord, b: Coord): boolean =>
  a.col === b.col && a.row === b.row

export const buildGrid = (config: GridConfig): Grid => {
  const cells = new Map<string, Cell>()
  for (const cell of config.cells) cells.set(coordKey(cell.coord), cell)
  return { columns: config.columns, rows: config.rows, cells }
}

export const cellAt = (grid: Grid, coord: Coord): Cell | undefined =>
  grid.cells.get(coordKey(coord))

export const inBounds = (grid: Grid, c: Coord): boolean =>
  c.col >= 0 && c.row >= 0 && c.col < grid.columns && c.row < grid.rows

/** Walkable = in bounds and not explicitly marked `walkable: false`. */
export const isWalkable = (grid: Grid, c: Coord): boolean => {
  if (!inBounds(grid, c)) return false
  return cellAt(grid, c)?.walkable !== false
}

export const isAudio = (grid: Grid, c: Coord): boolean =>
  cellAt(grid, c)?.content?.type === 'audio'

/** 4-directional (orthogonal) in-bounds neighbours — matches WASD movement. */
export const neighbors = (grid: Grid, c: Coord): Coord[] => {
  const deltas: Coord[] = [
    { col: 0, row: -1 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
    { col: 1, row: 0 },
  ]
  return deltas
    .map((d) => ({ col: c.col + d.col, row: c.row + d.row }))
    .filter((n) => inBounds(grid, n))
}
