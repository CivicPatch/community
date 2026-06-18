// The remote-walk replay: an announced path plays back one cell per STEP_MS, a new
// walk supersedes an in-flight one, and `headedTo` lets a confirming settle pass.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Coord } from '../core/types'
import { STEP_MS } from '../core/movement'
import { createTravelAnimator } from './travel'

const c = (col: number, row: number): Coord => ({ col, row })

describe('travel animator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('replays a path one cell per STEP_MS (first cell immediately)', () => {
    const a = createTravelAnimator()
    const steps: Coord[] = []
    a.travel('p', [c(1, 0), c(2, 0), c(3, 0)], (coord) => steps.push(coord))

    expect(steps).toEqual([c(1, 0)]) // first cell now
    vi.advanceTimersByTime(STEP_MS)
    expect(steps).toEqual([c(1, 0), c(2, 0)])
    vi.advanceTimersByTime(STEP_MS)
    expect(steps).toEqual([c(1, 0), c(2, 0), c(3, 0)])
    vi.advanceTimersByTime(STEP_MS * 5) // no further steps after arrival
    expect(steps).toEqual([c(1, 0), c(2, 0), c(3, 0)])
  })

  it('an empty path is a no-op', () => {
    const a = createTravelAnimator()
    const steps: Coord[] = []
    a.travel('p', [], (coord) => steps.push(coord))
    vi.advanceTimersByTime(STEP_MS * 3)
    expect(steps).toEqual([])
  })

  it('a new walk replaces the one in flight', () => {
    const a = createTravelAnimator()
    const steps: Coord[] = []
    a.travel('p', [c(1, 0), c(2, 0), c(3, 0)], (coord) => steps.push(coord))
    a.travel('p', [c(0, 1), c(0, 2)], (coord) => steps.push(coord)) // redirect
    expect(steps).toEqual([c(1, 0), c(0, 1)]) // each walk's first cell fired once
    vi.advanceTimersByTime(STEP_MS)
    expect(steps).toEqual([c(1, 0), c(0, 1), c(0, 2)])
    vi.advanceTimersByTime(STEP_MS * 3) // the original path's later cells never play
    expect(steps).toEqual([c(1, 0), c(0, 1), c(0, 2)])
  })

  it('headedTo is true for the live destination only', () => {
    const a = createTravelAnimator()
    a.travel('p', [c(1, 0), c(2, 0)], () => {})
    expect(a.headedTo('p', c(2, 0))).toBe(true) // the destination
    expect(a.headedTo('p', c(1, 0))).toBe(false) // a mid-path cell
    expect(a.headedTo('other', c(2, 0))).toBe(false)
    vi.advanceTimersByTime(STEP_MS * 2) // walk finishes
    expect(a.headedTo('p', c(2, 0))).toBe(false) // no longer in flight
  })

  it('cancel and cancelAll stop replay', () => {
    const a = createTravelAnimator()
    const steps: Coord[] = []
    a.travel('p', [c(1, 0), c(2, 0)], (coord) => steps.push(coord))
    a.travel('q', [c(5, 0), c(6, 0)], (coord) => steps.push(coord))
    a.cancel('p')
    vi.advanceTimersByTime(STEP_MS)
    expect(steps).toEqual([c(1, 0), c(5, 0), c(6, 0)]) // p stopped, q ran
    a.cancelAll()
    vi.advanceTimersByTime(STEP_MS * 3)
    expect(steps).toEqual([c(1, 0), c(5, 0), c(6, 0)])
  })
})
