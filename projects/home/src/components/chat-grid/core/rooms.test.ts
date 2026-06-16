import { describe, it, expect } from 'vitest'
import type { GridConfig, Player } from './types'
import { buildGrid } from './grid'
import { buildRooms, peersInRoom, roomOf } from './rooms'

const audio = (col: number, row: number) => ({ coord: { col, row }, audio: true })

// Two separate audio blobs: an L-shape of 3 (top-left) and a single cell (bottom-right).
const config: GridConfig = {
  columns: 6,
  rows: 6,
  cells: [audio(0, 0), audio(1, 0), audio(0, 1), audio(5, 5)],
}
const grid = buildGrid(config)
const rooms = buildRooms(grid)

describe('buildRooms / roomOf', () => {
  it('groups contiguous audio cells into one room', () => {
    const a = roomOf(rooms, { col: 0, row: 0 })
    expect(a).not.toBeNull()
    expect(roomOf(rooms, { col: 1, row: 0 })).toBe(a)
    expect(roomOf(rooms, { col: 0, row: 1 })).toBe(a)
  })

  it('keeps non-adjacent blobs as separate rooms', () => {
    expect(roomOf(rooms, { col: 5, row: 5 })).not.toBe(roomOf(rooms, { col: 0, row: 0 }))
  })

  it('returns null off the audio cells', () => {
    expect(roomOf(rooms, { col: 3, row: 3 })).toBeNull()
  })
})

describe('peersInRoom', () => {
  const players: Player[] = [
    { id: 'same', name: 'A', coord: { col: 1, row: 0 } }, // my room
    { id: 'far', name: 'B', coord: { col: 5, row: 5 } }, // other room
    { id: 'floor', name: 'C', coord: { col: 3, row: 3 } }, // no room
    { id: 'me-dup', name: 'D', coord: { col: 0, row: 0 } }, // same cell as me -> excluded
  ]

  it('returns only others in my room', () => {
    const peers = peersInRoom(rooms, { col: 0, row: 0 }, players)
    expect(peers).toEqual(['same'])
  })

  it('returns nothing when I am not in a room', () => {
    expect(peersInRoom(rooms, { col: 3, row: 3 }, players)).toEqual([])
  })
})
