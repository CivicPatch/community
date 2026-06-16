import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Player } from '../core/types'
import { createRoster } from './roster'

const player = (id: string, col = 0, row = 0): Player => ({ id, name: id, coord: { col, row } })

describe('roster', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    let latest: Player[] = []
    const roster = createRoster({ graceMs: 1000, onChange: (p) => (latest = p) })
    return { roster, ids: () => latest.map((p) => p.id), get: (id: string) => latest.find((p) => p.id === id) }
  }

  it('reports present players', () => {
    const { roster, ids } = setup()
    roster.applyPresence([player('a'), player('b')])
    expect(ids()).toEqual(['a', 'b'])
  })

  it('holds a vanished player through the grace window, then drops it', () => {
    const { roster, ids } = setup()
    roster.applyPresence([player('a')])
    roster.applyPresence([]) // a vanished
    expect(ids()).toEqual(['a']) // still here during grace
    vi.advanceTimersByTime(1000)
    expect(ids()).toEqual([]) // dropped after grace
  })

  it('cancels the drop if the player returns within the window', () => {
    const { roster, ids } = setup()
    roster.applyPresence([player('a')])
    roster.applyPresence([]) // vanished
    vi.advanceTimersByTime(500)
    roster.applyPresence([player('a')]) // returned in time
    vi.advanceTimersByTime(1000)
    expect(ids()).toEqual(['a'])
  })

  it('updates a coord without re-adding', () => {
    const { roster, get } = setup()
    roster.applyPresence([player('a', 1, 1)])
    roster.updateCoord('a', { col: 5, row: 5 })
    expect(get('a')?.coord).toEqual({ col: 5, row: 5 })
  })

  it('keeps the broadcast coord when presence re-syncs with a stale one', () => {
    const { roster, get } = setup()
    roster.applyPresence([player('a', 0, 0)])
    roster.updateCoord('a', { col: 3, row: 3 })
    roster.applyPresence([player('a', 0, 0)]) // presence still shows the spawn coord
    expect(get('a')?.coord).toEqual({ col: 3, row: 3 })
  })
})
