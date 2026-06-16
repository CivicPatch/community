// Pure data types for the chat-grid. No DOM, no network — just shapes.

export type Coord = { col: number; row: number }

/** Discriminated union — v1 ships `audio` only; text/link/meet drop in later. */
export type CellContent =
  | { type: 'audio' }

export interface Cell {
  coord: Coord
  content?: CellContent
  /** presentation only, independent of content type (e.g. floor colour) */
  style?: { color?: string }
  /** defaults to true; non-walkable cells block movement and pathfinding */
  walkable?: boolean
}

export interface GridConfig {
  columns: number
  rows: number
  /** only "special" cells need listing; every other coord is implicit empty floor */
  cells: Cell[]
  spawn?: Coord
  /** max cells allowed in one audio room (mesh safety). See validate.ts default. */
  maxRoomCells?: number
}

/** Derived, lookup-friendly grid built from a GridConfig. */
export interface Grid {
  columns: number
  rows: number
  /** special cells keyed by `${col},${row}`; absent keys are empty floor */
  cells: Map<string, Cell>
}

export type PlayerId = string

export interface Player {
  id: PlayerId
  name: string
  coord: Coord
  /** has this player turned on their mic? (presence-synced, so everyone sees it) */
  audioEnabled?: boolean
}

/** Connected-component index from the flood fill. Coords with no audio room are absent. */
export type RoomId = number
