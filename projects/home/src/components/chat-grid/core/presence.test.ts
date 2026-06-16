import { describe, it, expect } from 'vitest'
import { BUBBLE_MS, bubbleVisible, rankRoster } from './presence'
import type { Player, RoomId } from './types'

const player = (id: string, col: number, row: number, name = id): Player => ({
  id,
  name,
  coord: { col, row },
})

describe('bubbleVisible', () => {
  it('is false when no status has been set', () => {
    expect(bubbleVisible(undefined, 1000)).toBe(false)
  })

  it('is true from the moment it is set until the window elapses', () => {
    expect(bubbleVisible(1000, 1000)).toBe(true)
    expect(bubbleVisible(1000, 1000 + BUBBLE_MS - 1)).toBe(true)
  })

  it('is false once the fresh window has elapsed', () => {
    expect(bubbleVisible(1000, 1000 + BUBBLE_MS)).toBe(false)
    expect(bubbleVisible(1000, 1000 + BUBBLE_MS + 5_000)).toBe(false)
  })

  it('treats a future statusAt (clock skew) as fresh rather than expired', () => {
    expect(bubbleVisible(2000, 1000)).toBe(true)
  })
})

describe('rankRoster', () => {
  // rooms map keyed by `${col},${row}` -> room id; here room 0 = {0,0},{1,0}
  const rooms = new Map<string, RoomId>([
    ['0,0', 0],
    ['1,0', 0],
  ])

  it('puts everyone in the grid bucket when I am not in a room', () => {
    const others = [player('a', 0, 0), player('b', 5, 5)]
    const { blob, grid } = rankRoster(others, rooms, { col: 9, row: 9 })
    expect(blob).toEqual([])
    expect(grid.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('promotes others sharing my audio room into the blob', () => {
    const others = [player('roommate', 1, 0), player('elsewhere', 5, 5)]
    const { blob, grid } = rankRoster(others, rooms, { col: 0, row: 0 })
    expect(blob.map((p) => p.id)).toEqual(['roommate'])
    expect(grid.map((p) => p.id)).toEqual(['elsewhere'])
  })

  it('sorts each bucket by distance from me, then name', () => {
    const others = [player('far', 8, 0), player('near', 3, 0), player('mid', 5, 0)]
    const { grid } = rankRoster(others, rooms, { col: 0, row: 0 })
    expect(grid.map((p) => p.id)).toEqual(['near', 'mid', 'far'])
  })
})
