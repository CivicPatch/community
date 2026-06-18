// Pure config mutation for Map Mode. The editor (shell) collects field values into
// a Cell; these helpers upsert/remove it in the RoomConfig and serialize for export.

import type { Cell, Coord, RoomConfig } from './types'
import { coordsEqual } from './room'

/** A cell with no appearance/behavior/wall is just empty floor — not worth keeping. */
export const isMeaningfulCell = (cell: Cell): boolean =>
  cell.color !== undefined ||
  cell.image !== undefined ||
  cell.svg !== undefined ||
  cell.char !== undefined ||
  cell.audio === true ||
  cell.link !== undefined ||
  cell.radio !== undefined ||
  cell.description !== undefined ||
  cell.walkable === false

/** Update room dimensions/spawn/cap, pruning cells that fall out of the new bounds. */
export const setRoomMeta = (
  config: RoomConfig,
  patch: Partial<Pick<RoomConfig, 'columns' | 'rows' | 'spawn' | 'maxHuddleCells'>>,
): RoomConfig => {
  const next: RoomConfig = { ...config, ...patch }
  next.columns = Math.max(1, Math.floor(next.columns))
  next.rows = Math.max(1, Math.floor(next.rows))
  next.cells = next.cells.filter(
    (c) =>
      c.coord.col >= 0 &&
      c.coord.row >= 0 &&
      c.coord.col < next.columns &&
      c.coord.row < next.rows,
  )
  if (next.spawn)
    next.spawn = {
      col: Math.max(0, Math.min(next.spawn.col, next.columns - 1)),
      row: Math.max(0, Math.min(next.spawn.row, next.rows - 1)),
    }
  return next
}

/** Upsert a cell (matched by coord). An empty cell is removed entirely. Pure. */
export const setCell = (config: RoomConfig, cell: Cell): RoomConfig => {
  const cells = config.cells.filter((c) => !coordsEqual(c.coord, cell.coord))
  if (isMeaningfulCell(cell)) cells.push(cell)
  return { ...config, cells }
}

/** Remove any cell at the coord (back to empty floor). Pure. */
export const clearCell = (config: RoomConfig, coord: Coord): RoomConfig => ({
  ...config,
  cells: config.cells.filter((c) => !coordsEqual(c.coord, coord)),
})

/** Pretty JSON for copy-paste / PR (trailing newline like the committed file). */
export const serializeConfig = (config: RoomConfig): string =>
  JSON.stringify(config, null, 2) + '\n'
