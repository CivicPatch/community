import { describe, it, expect } from 'vitest'
import { BUBBLE_MS, BUBBLE_FADE_MS, bubbleVisible, bubbleLeaving, diffPresence, rankRoster } from './presence'
import type { Player, HuddleId } from './types'

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

describe('bubbleLeaving', () => {
  it('is false when no status has been set', () => {
    expect(bubbleLeaving(undefined, 1000)).toBe(false)
  })

  it('is false for most of the bubble life, true only in the final fade stretch', () => {
    expect(bubbleLeaving(1000, 1000)).toBe(false)
    expect(bubbleLeaving(1000, 1000 + BUBBLE_MS - BUBBLE_FADE_MS - 1)).toBe(false)
    expect(bubbleLeaving(1000, 1000 + BUBBLE_MS - BUBBLE_FADE_MS)).toBe(true)
    expect(bubbleLeaving(1000, 1000 + BUBBLE_MS - 1)).toBe(true)
  })
})

describe('rankRoster', () => {
  // huddles map keyed by `${col},${row}` -> huddle id; here huddle 0 = {0,0},{1,0}
  const huddles = new Map<string, HuddleId>([
    ['0,0', 0],
    ['1,0', 0],
  ])

  it('puts everyone in the room bucket when I am not in a huddle', () => {
    const others = [player('a', 0, 0), player('b', 5, 5)]
    const { huddle, room } = rankRoster(others, huddles, { col: 9, row: 9 })
    expect(huddle).toEqual([])
    expect(room.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('promotes others sharing my huddle into the huddle', () => {
    const others = [player('roommate', 1, 0), player('elsewhere', 5, 5)]
    const { huddle, room } = rankRoster(others, huddles, { col: 0, row: 0 })
    expect(huddle.map((p) => p.id)).toEqual(['roommate'])
    expect(room.map((p) => p.id)).toEqual(['elsewhere'])
  })

  it('sorts each bucket by distance from me, then name', () => {
    const others = [player('far', 8, 0), player('near', 3, 0), player('mid', 5, 0)]
    const { room } = rankRoster(others, huddles, { col: 0, row: 0 })
    expect(room.map((p) => p.id)).toEqual(['near', 'mid', 'far'])
  })
})

describe('diffPresence', () => {
  const withStatus = (p: Player, status: string, statusAt: number): Player => ({
    ...p,
    status,
    statusAt,
  })

  it('detects joins and leaves by id', () => {
    const prev = [player('a', 0, 0), player('b', 1, 0)]
    const next = [player('a', 0, 0), player('c', 2, 0)]
    const d = diffPresence(prev, next)
    expect(d.joined).toEqual(['c'])
    expect(d.left).toEqual(['b'])
    expect(d.statusPosted).toEqual([])
  })

  it('counts a newcomer with a status as a join, not a status post', () => {
    const prev: Player[] = []
    const next = [withStatus(player('a', 0, 0), 'hi', 100)]
    const d = diffPresence(prev, next)
    expect(d.joined).toEqual(['a'])
    expect(d.statusPosted).toEqual([])
  })

  it('flags a status post when statusAt changes to a non-empty status', () => {
    const prev = [withStatus(player('a', 0, 0), 'old', 100)]
    const next = [withStatus(player('a', 0, 0), 'new', 200)]
    expect(diffPresence(prev, next).statusPosted).toEqual(['a'])
  })

  it('ignores movement (statusAt unchanged) and status clears (empty)', () => {
    const a1 = withStatus(player('a', 0, 0), 'hi', 100)
    const moved = withStatus(player('a', 5, 5), 'hi', 100) // same statusAt
    expect(diffPresence([a1], [moved]).statusPosted).toEqual([])
    const cleared = { ...player('a', 0, 0), status: '', statusAt: 200 }
    expect(diffPresence([a1], [cleared]).statusPosted).toEqual([])
  })
})
