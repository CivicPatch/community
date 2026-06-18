import { describe, it, expect } from 'vitest'
import type { RoomConfig } from './types'
import { clearCell, isMeaningfulCell, serializeConfig, setCell, setRoomMeta } from './edit'

const base: RoomConfig = { columns: 3, rows: 3, cells: [] }

describe('isMeaningfulCell', () => {
  it('is false for an empty cell, true when any field is set', () => {
    expect(isMeaningfulCell({ coord: { col: 0, row: 0 } })).toBe(false)
    expect(isMeaningfulCell({ coord: { col: 0, row: 0 }, audio: true })).toBe(true)
    expect(isMeaningfulCell({ coord: { col: 0, row: 0 }, walkable: false })).toBe(true)
    expect(isMeaningfulCell({ coord: { col: 0, row: 0 }, walkable: true })).toBe(false)
  })
})

describe('setCell', () => {
  it('adds a new cell', () => {
    expect(setCell(base, { coord: { col: 1, row: 1 }, audio: true }).cells).toHaveLength(1)
  })
  it('replaces the cell at the same coord', () => {
    const a = setCell(base, { coord: { col: 1, row: 1 }, audio: true })
    const b = setCell(a, { coord: { col: 1, row: 1 }, color: '#fff' })
    expect(b.cells).toHaveLength(1)
    expect(b.cells[0].color).toBe('#fff')
    expect(b.cells[0].audio).toBeUndefined()
  })
  it('removes a cell that became empty', () => {
    const a = setCell(base, { coord: { col: 1, row: 1 }, audio: true })
    expect(setCell(a, { coord: { col: 1, row: 1 } }).cells).toHaveLength(0)
  })
  it('does not mutate the input config', () => {
    setCell(base, { coord: { col: 0, row: 0 }, audio: true })
    expect(base.cells).toHaveLength(0)
  })
})

describe('clearCell', () => {
  it('removes the cell at a coord', () => {
    const a = setCell(base, { coord: { col: 2, row: 2 }, char: 'X' })
    expect(clearCell(a, { col: 2, row: 2 }).cells).toHaveLength(0)
  })
})

describe('setRoomMeta', () => {
  const seeded: RoomConfig = {
    columns: 5,
    rows: 5,
    spawn: { col: 4, row: 4 },
    cells: [{ coord: { col: 4, row: 4 }, char: 'X' }],
  }
  it('updates dimensions', () => {
    expect(setRoomMeta(seeded, { columns: 8 }).columns).toBe(8)
  })
  it('prunes cells outside new bounds and clamps spawn when shrinking', () => {
    const r = setRoomMeta(seeded, { columns: 3, rows: 3 })
    expect(r.cells).toHaveLength(0) // (4,4) is now out of bounds
    expect(r.spawn).toEqual({ col: 2, row: 2 }) // clamped
  })
  it('floors and clamps dimensions to >= 1', () => {
    expect(setRoomMeta(seeded, { columns: 0 }).columns).toBe(1)
  })
})

describe('serializeConfig', () => {
  it('round-trips to valid JSON', () => {
    const c = setCell(base, { coord: { col: 0, row: 0 }, char: 'A' })
    expect(JSON.parse(serializeConfig(c))).toEqual(c)
  })
})
