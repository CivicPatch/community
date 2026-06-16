import { describe, it, expect } from 'vitest'
import type { GridConfig } from './types'
import { clearCell, isMeaningfulCell, serializeConfig, setCell } from './edit'

const base: GridConfig = { columns: 3, rows: 3, cells: [] }

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

describe('serializeConfig', () => {
  it('round-trips to valid JSON', () => {
    const c = setCell(base, { coord: { col: 0, row: 0 }, char: 'A' })
    expect(JSON.parse(serializeConfig(c))).toEqual(c)
  })
})
