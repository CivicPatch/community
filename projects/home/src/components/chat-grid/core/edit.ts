// Pure config mutation for Map Mode. The editor (shell) collects field values into
// a Cell; these helpers upsert/remove it in the GridConfig and serialize for export.

import type { Cell, Coord, GridConfig } from './types'
import { coordsEqual } from './grid'

/** A cell with no appearance/behavior/wall is just empty floor — not worth keeping. */
export const isMeaningfulCell = (cell: Cell): boolean =>
  cell.color !== undefined ||
  cell.image !== undefined ||
  cell.char !== undefined ||
  cell.audio === true ||
  cell.link !== undefined ||
  cell.description !== undefined ||
  cell.walkable === false

/** Upsert a cell (matched by coord). An empty cell is removed entirely. Pure. */
export const setCell = (config: GridConfig, cell: Cell): GridConfig => {
  const cells = config.cells.filter((c) => !coordsEqual(c.coord, cell.coord))
  if (isMeaningfulCell(cell)) cells.push(cell)
  return { ...config, cells }
}

/** Remove any cell at the coord (back to empty floor). Pure. */
export const clearCell = (config: GridConfig, coord: Coord): GridConfig => ({
  ...config,
  cells: config.cells.filter((c) => !coordsEqual(c.coord, coord)),
})

/** Pretty JSON for copy-paste / PR (trailing newline like the committed file). */
export const serializeConfig = (config: GridConfig): string =>
  JSON.stringify(config, null, 2) + '\n'
