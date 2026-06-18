// Pure viewport geometry for the grid's scroll "camera". No DOM — the shell
// (use-viewport) measures the element, calls these, and applies the result, so the
// fiddly clamping/dead-zone math is testable in isolation.

export interface Box {
  w: number
  h: number
}
export interface Scroll {
  x: number
  y: number
}
/** A cell's pixel rect within the scrollable content. */
export interface CellRect {
  x: number
  y: number
  size: number
}
export interface Edges {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, Math.max(0, max)))

/** Which edges still hide content past the current scroll (1px slack for rounding). */
export const overflowEdges = (s: Scroll, view: Box, content: Box): Edges => ({
  up: s.y > 1,
  down: s.y + view.h < content.h - 1,
  left: s.x > 1,
  right: s.x + view.w < content.w - 1,
})

/** Dead-zone follow: the least scroll that keeps `cell` at least `margin` px from
 *  every viewport edge (clamped to the scrollable range). Unchanged if already inside,
 *  so the view only moves as the avatar nears an edge — not on every step mid-room. */
export const followScroll = (
  s: Scroll,
  view: Box,
  content: Box,
  cell: CellRect,
  margin: number,
): Scroll => {
  let { x, y } = s
  if (cell.x - margin < x) x = cell.x - margin
  else if (cell.x + cell.size + margin > x + view.w) x = cell.x + cell.size + margin - view.w
  if (cell.y - margin < y) y = cell.y - margin
  else if (cell.y + cell.size + margin > y + view.h) y = cell.y + cell.size + margin - view.h
  return { x: clamp(x, content.w - view.w), y: clamp(y, content.h - view.h) }
}

/** Manual pan: step `frac` of a viewport in (dx,dy) ∈ {-1,0,1}, clamped to range. */
export const panScroll = (
  s: Scroll,
  view: Box,
  content: Box,
  dx: number,
  dy: number,
  frac = 0.6,
): Scroll => ({
  x: clamp(s.x + dx * view.w * frac, content.w - view.w),
  y: clamp(s.y + dy * view.h * frac, content.h - view.h),
})
