import { describe, it, expect } from 'vitest'
import type { GridConfig } from './types'
import { validateGrid } from './validate'

const audio = (col: number, row: number) => ({
  coord: { col, row },
  content: { type: 'audio' as const },
})

describe('validateGrid', () => {
  it('passes a sane config', () => {
    const config: GridConfig = {
      columns: 5,
      rows: 5,
      cells: [audio(0, 0), audio(1, 0)],
      spawn: { col: 4, row: 4 },
    }
    expect(validateGrid(config)).toEqual([])
  })

  it('flags out-of-bounds cells', () => {
    const errs = validateGrid({ columns: 3, rows: 3, cells: [audio(5, 5)] })
    expect(errs.some((e) => e.includes('out of bounds'))).toBe(true)
  })

  it('flags duplicate cells', () => {
    const errs = validateGrid({ columns: 3, rows: 3, cells: [audio(1, 1), audio(1, 1)] })
    expect(errs.some((e) => e.includes('duplicate'))).toBe(true)
  })

  it('flags an out-of-bounds spawn', () => {
    const errs = validateGrid({ columns: 3, rows: 3, cells: [], spawn: { col: 9, row: 9 } })
    expect(errs.some((e) => e.includes('spawn out of bounds'))).toBe(true)
  })

  it('flags an oversized audio room (default cap 6)', () => {
    const row = Array.from({ length: 7 }, (_, col) => audio(col, 0))
    const errs = validateGrid({ columns: 10, rows: 10, cells: row })
    expect(errs.some((e) => e.includes('max 6'))).toBe(true)
  })

  it('respects a custom maxRoomCells', () => {
    const row = Array.from({ length: 7 }, (_, col) => audio(col, 0))
    expect(validateGrid({ columns: 10, rows: 10, cells: row, maxRoomCells: 8 })).toEqual([])
  })

  it('flags non-positive dimensions', () => {
    expect(validateGrid({ columns: 0, rows: 5, cells: [] }).length).toBeGreaterThan(0)
  })
})
