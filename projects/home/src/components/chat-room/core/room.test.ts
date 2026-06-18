import { describe, it, expect } from 'vitest'
import type { RoomConfig } from './types'
import {
  buildRoom,
  cellAt,
  coordKey,
  coordsEqual,
  inBounds,
  isAudio,
  isWalkable,
  nearestFreeCell,
  neighbors,
  radioAt,
} from './room'

const config: RoomConfig = {
  columns: 5,
  rows: 4,
  cells: [
    { coord: { col: 1, row: 1 }, audio: true },
    { coord: { col: 2, row: 2 }, walkable: false },
    { coord: { col: 0, row: 0 }, color: '#f00' },
    { coord: { col: 3, row: 0 }, radio: { url: 'http://stream', label: 'Test FM' } },
  ],
}
const room = buildRoom(config)

describe('radioAt', () => {
  it('returns the station at a radio tile, null elsewhere', () => {
    expect(radioAt(room, { col: 3, row: 0 })).toEqual({ url: 'http://stream', label: 'Test FM' })
    expect(radioAt(room, { col: 0, row: 0 })).toBeNull()
    expect(radioAt(room, { col: 4, row: 3 })).toBeNull()
  })
  it('keeps radio tiles walkable (you stand on them, unlike link kiosks)', () => {
    expect(isWalkable(room, { col: 3, row: 0 })).toBe(true)
  })
})

describe('coord helpers', () => {
  it('keys and compares coords', () => {
    expect(coordKey({ col: 3, row: 7 })).toBe('3,7')
    expect(coordsEqual({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true)
    expect(coordsEqual({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false)
  })
})

describe('buildRoom / cellAt', () => {
  it('indexes only the special cells', () => {
    expect(room.columns).toBe(5)
    expect(room.cells.size).toBe(4)
    expect(cellAt(room, { col: 1, row: 1 })?.audio).toBe(true)
    expect(cellAt(room, { col: 4, row: 3 })).toBeUndefined()
  })
})

describe('bounds & walkability', () => {
  it('respects the room extent', () => {
    expect(inBounds(room, { col: 0, row: 0 })).toBe(true)
    expect(inBounds(room, { col: 5, row: 0 })).toBe(false)
    expect(inBounds(room, { col: 0, row: -1 })).toBe(false)
  })

  it('treats empty floor as walkable and out-of-bounds as not', () => {
    expect(isWalkable(room, { col: 3, row: 3 })).toBe(true)
    expect(isWalkable(room, { col: 2, row: 2 })).toBe(false) // wall
    expect(isWalkable(room, { col: 9, row: 9 })).toBe(false) // oob
  })

  it('treats link kiosks as non-walkable by default, but honors an explicit override', () => {
    const g = buildRoom({
      columns: 3,
      rows: 1,
      cells: [
        { coord: { col: 0, row: 0 }, link: { url: 'x' } },
        { coord: { col: 1, row: 0 }, link: { url: 'x' }, walkable: true },
      ],
    })
    expect(isWalkable(g, { col: 0, row: 0 })).toBe(false) // kiosk blocks
    expect(isWalkable(g, { col: 1, row: 0 })).toBe(true) // explicit override
  })

  it('detects audio cells', () => {
    expect(isAudio(room, { col: 1, row: 1 })).toBe(true)
    expect(isAudio(room, { col: 0, row: 0 })).toBe(false)
  })
})

describe('neighbors', () => {
  it('returns 4 in the middle, fewer at edges/corners', () => {
    expect(neighbors(room, { col: 2, row: 1 })).toHaveLength(4)
    expect(neighbors(room, { col: 0, row: 1 })).toHaveLength(3)
    expect(neighbors(room, { col: 0, row: 0 })).toHaveLength(2)
  })
})

describe('nearestFreeCell', () => {
  it('returns the cell itself when it is already free', () => {
    expect(nearestFreeCell(room, { col: 3, row: 3 }, new Set())).toEqual({ col: 3, row: 3 })
  })

  it('hops to an adjacent cell when the start is occupied', () => {
    const occupied = new Set([coordKey({ col: 3, row: 3 })])
    const free = nearestFreeCell(room, { col: 3, row: 3 }, occupied)
    expect(coordsEqual(free, { col: 3, row: 3 })).toBe(false)
    expect(neighbors(room, { col: 3, row: 3 }).some((n) => coordsEqual(n, free))).toBe(true)
  })

  it('skips walls and occupied cells', () => {
    // (2,2) is a wall in the shared fixture; occupy (3,3) too
    const occupied = new Set([coordKey({ col: 3, row: 3 })])
    const free = nearestFreeCell(room, { col: 3, row: 3 }, occupied)
    expect(isWalkable(room, free)).toBe(true)
    expect(occupied.has(coordKey(free))).toBe(false)
  })
})
