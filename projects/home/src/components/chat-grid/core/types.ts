// Pure data types for the chat-grid. No DOM, no network — just shapes.

export type Coord = { col: number; row: number }

/**
 * A cell composes optional APPEARANCE layers with optional BEHAVIOR roles, so any
 * combination is valid (e.g. an audio tile with a custom sprite, or a coloured
 * link). This replaced a one-type-per-cell union precisely so things compose.
 */
export interface Cell {
  coord: Coord
  /** defaults to true; non-walkable cells block movement and pathfinding */
  walkable?: boolean

  // --- appearance (composable) ---
  /** background fill colour */
  color?: string
  /** background image / sprite url */
  image?: string
  /** a single character drawn on the tile (signs, art) */
  char?: string

  // --- behavior (composable) ---
  /** proximity-voice zone */
  audio?: boolean
  /** clickable kiosk — rendered as a real <a>, opens in a new tab */
  link?: { url: string; label?: string; summary?: string }
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
