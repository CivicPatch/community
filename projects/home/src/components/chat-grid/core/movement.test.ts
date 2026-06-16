import { describe, it, expect } from 'vitest'
import type { GridConfig } from './types'
import { buildGrid, coordKey } from './grid'
import { applyDelta, canEnter, keyToDelta } from './movement'

const grid = buildGrid({
  columns: 3,
  rows: 3,
  cells: [{ coord: { col: 1, row: 1 }, walkable: false }],
} satisfies GridConfig)

describe('keyToDelta', () => {
  it('maps wasd and arrow keys (case-insensitive)', () => {
    expect(keyToDelta('w')).toEqual({ col: 0, row: -1 })
    expect(keyToDelta('D')).toEqual({ col: 1, row: 0 })
    expect(keyToDelta('ArrowLeft')).toEqual({ col: -1, row: 0 })
    expect(keyToDelta('x')).toBeNull()
  })
})

describe('applyDelta', () => {
  it('adds a delta to a coord', () => {
    expect(applyDelta({ col: 2, row: 2 }, { col: -1, row: 0 })).toEqual({ col: 1, row: 2 })
  })
})

describe('canEnter', () => {
  const occupied = new Set<string>([coordKey({ col: 2, row: 0 })])

  it('allows empty, walkable, in-bounds cells', () => {
    expect(canEnter(grid, { col: 0, row: 0 }, occupied)).toBe(true)
  })
  it('blocks walls, occupants and out-of-bounds', () => {
    expect(canEnter(grid, { col: 1, row: 1 }, occupied)).toBe(false) // wall
    expect(canEnter(grid, { col: 2, row: 0 }, occupied)).toBe(false) // occupied
    expect(canEnter(grid, { col: 3, row: 0 }, occupied)).toBe(false) // oob
  })
})
