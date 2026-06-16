import { describe, it, expect } from 'vitest'
import type { GridConfig } from './types'
import {
  buildGrid,
  cellAt,
  coordKey,
  coordsEqual,
  inBounds,
  isAudio,
  isWalkable,
  neighbors,
} from './grid'

const config: GridConfig = {
  columns: 5,
  rows: 4,
  cells: [
    { coord: { col: 1, row: 1 }, content: { type: 'audio' } },
    { coord: { col: 2, row: 2 }, walkable: false },
    { coord: { col: 0, row: 0 }, style: { color: '#f00' } },
  ],
}
const grid = buildGrid(config)

describe('coord helpers', () => {
  it('keys and compares coords', () => {
    expect(coordKey({ col: 3, row: 7 })).toBe('3,7')
    expect(coordsEqual({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true)
    expect(coordsEqual({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false)
  })
})

describe('buildGrid / cellAt', () => {
  it('indexes only the special cells', () => {
    expect(grid.columns).toBe(5)
    expect(grid.cells.size).toBe(3)
    expect(cellAt(grid, { col: 1, row: 1 })?.content?.type).toBe('audio')
    expect(cellAt(grid, { col: 4, row: 3 })).toBeUndefined()
  })
})

describe('bounds & walkability', () => {
  it('respects the grid extent', () => {
    expect(inBounds(grid, { col: 0, row: 0 })).toBe(true)
    expect(inBounds(grid, { col: 5, row: 0 })).toBe(false)
    expect(inBounds(grid, { col: 0, row: -1 })).toBe(false)
  })

  it('treats empty floor as walkable and out-of-bounds as not', () => {
    expect(isWalkable(grid, { col: 3, row: 3 })).toBe(true)
    expect(isWalkable(grid, { col: 2, row: 2 })).toBe(false) // wall
    expect(isWalkable(grid, { col: 9, row: 9 })).toBe(false) // oob
  })

  it('detects audio cells', () => {
    expect(isAudio(grid, { col: 1, row: 1 })).toBe(true)
    expect(isAudio(grid, { col: 0, row: 0 })).toBe(false)
  })
})

describe('neighbors', () => {
  it('returns 4 in the middle, fewer at edges/corners', () => {
    expect(neighbors(grid, { col: 2, row: 1 })).toHaveLength(4)
    expect(neighbors(grid, { col: 0, row: 1 })).toHaveLength(3)
    expect(neighbors(grid, { col: 0, row: 0 })).toHaveLength(2)
  })
})
