import { describe, it, expect } from 'vitest'
import type { Coord, RoomConfig } from './types'
import { buildRoom, coordKey } from './room'
import { findPath } from './pathfind'

const open = buildRoom({ columns: 3, rows: 3, cells: [] } satisfies RoomConfig)
const last = (path: Coord[]) => path[path.length - 1]
const has = (path: Coord[], c: Coord) => path.some((p) => coordKey(p) === coordKey(c))

describe('findPath', () => {
  it('walks a straight line', () => {
    const path = findPath(open, { col: 0, row: 0 }, { col: 2, row: 0 }, new Set())
    expect(path).not.toBeNull()
    expect(path).toHaveLength(2)
    expect(last(path!)).toEqual({ col: 2, row: 0 })
  })

  it('returns [] when already at the target', () => {
    expect(findPath(open, { col: 1, row: 1 }, { col: 1, row: 1 }, new Set())).toEqual([])
  })

  it('routes around a wall', () => {
    // middle column walled off for the top two rows, gap at the bottom
    const room = buildRoom({
      columns: 3,
      rows: 3,
      cells: [
        { coord: { col: 1, row: 0 }, walkable: false },
        { coord: { col: 1, row: 1 }, walkable: false },
      ],
    })
    const path = findPath(room, { col: 0, row: 0 }, { col: 2, row: 0 }, new Set())
    expect(path).not.toBeNull()
    expect(last(path!)).toEqual({ col: 2, row: 0 })
    expect(has(path!, { col: 1, row: 0 })).toBe(false)
    expect(has(path!, { col: 1, row: 1 })).toBe(false)
  })

  it('returns null when the target is walled off', () => {
    const room = buildRoom({
      columns: 3,
      rows: 3,
      cells: [
        { coord: { col: 1, row: 0 }, walkable: false },
        { coord: { col: 1, row: 1 }, walkable: false },
        { coord: { col: 1, row: 2 }, walkable: false },
      ],
    })
    expect(findPath(room, { col: 0, row: 0 }, { col: 2, row: 0 }, new Set())).toBeNull()
  })

  it('avoids occupied cells', () => {
    const occupied = new Set([coordKey({ col: 1, row: 0 })])
    const path = findPath(open, { col: 0, row: 0 }, { col: 2, row: 0 }, occupied)
    expect(path).not.toBeNull()
    expect(has(path!, { col: 1, row: 0 })).toBe(false)
    expect(last(path!)).toEqual({ col: 2, row: 0 })
  })

  it('returns null when the target itself is occupied', () => {
    const occupied = new Set([coordKey({ col: 2, row: 0 })])
    expect(findPath(open, { col: 0, row: 0 }, { col: 2, row: 0 }, occupied)).toBeNull()
  })
})
