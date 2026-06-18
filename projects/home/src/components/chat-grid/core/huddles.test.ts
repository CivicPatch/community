import { describe, it, expect } from 'vitest'
import type { GridConfig, Player } from './types'
import { buildGrid } from './grid'
import { buildHuddles, peersInHuddle, huddleOf } from './huddles'

const audio = (col: number, row: number) => ({ coord: { col, row }, audio: true })

// Two separate huddles: an L-shape of 3 (top-left) and a single cell (bottom-right).
const config: GridConfig = {
  columns: 6,
  rows: 6,
  cells: [audio(0, 0), audio(1, 0), audio(0, 1), audio(5, 5)],
}
const grid = buildGrid(config)
const huddles = buildHuddles(grid)

describe('buildHuddles / huddleOf', () => {
  it('groups contiguous audio cells into one huddle', () => {
    const a = huddleOf(huddles, { col: 0, row: 0 })
    expect(a).not.toBeNull()
    expect(huddleOf(huddles, { col: 1, row: 0 })).toBe(a)
    expect(huddleOf(huddles, { col: 0, row: 1 })).toBe(a)
  })

  it('keeps non-adjacent huddles as separate huddles', () => {
    expect(huddleOf(huddles, { col: 5, row: 5 })).not.toBe(huddleOf(huddles, { col: 0, row: 0 }))
  })

  it('returns null off the audio cells', () => {
    expect(huddleOf(huddles, { col: 3, row: 3 })).toBeNull()
  })
})

describe('peersInHuddle', () => {
  const players: Player[] = [
    { id: 'same', name: 'A', coord: { col: 1, row: 0 } }, // my huddle
    { id: 'far', name: 'B', coord: { col: 5, row: 5 } }, // other huddle
    { id: 'floor', name: 'C', coord: { col: 3, row: 3 } }, // no huddle
    { id: 'me-dup', name: 'D', coord: { col: 0, row: 0 } }, // same cell as me -> excluded
  ]

  it('returns only others in my huddle', () => {
    const peers = peersInHuddle(huddles, { col: 0, row: 0 }, players)
    expect(peers).toEqual(['same'])
  })

  it('returns nothing when I am not in a huddle', () => {
    expect(peersInHuddle(huddles, { col: 3, row: 3 }, players)).toEqual([])
  })
})
