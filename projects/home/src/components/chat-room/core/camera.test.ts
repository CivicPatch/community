// Pure camera geometry: edge detection, dead-zone follow, clamped pan.

import { describe, it, expect } from 'vitest'
import { overflowEdges, followScroll, panScroll } from './camera'

const view = { w: 100, h: 100 }
const content = { w: 300, h: 300 } // 3x the viewport in both axes

describe('overflowEdges', () => {
  it('at the top-left: only down/right have hidden content', () => {
    expect(overflowEdges({ x: 0, y: 0 }, view, content)).toEqual({
      up: false,
      down: true,
      left: false,
      right: true,
    })
  })

  it('at the bottom-right: only up/left have hidden content', () => {
    expect(overflowEdges({ x: 200, y: 200 }, view, content)).toEqual({
      up: true,
      down: false,
      left: true,
      right: false,
    })
  })

  it('when content fits the viewport: no edges', () => {
    expect(overflowEdges({ x: 0, y: 0 }, view, { w: 100, h: 100 })).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    })
  })
})

describe('followScroll', () => {
  const margin = 20

  it('leaves scroll unchanged when the avatar is comfortably inside', () => {
    const cell = { x: 40, y: 40, size: 10 } // well within [20, 80] margins
    expect(followScroll({ x: 0, y: 0 }, view, content, cell, margin)).toEqual({ x: 0, y: 0 })
  })

  it('scrolls to keep an avatar near the right/bottom edge in view', () => {
    const cell = { x: 250, y: 250, size: 10 }
    const next = followScroll({ x: 0, y: 0 }, view, content, cell, margin)
    // needs cell.x+size+margin (280) within x+view.w → x = 180; same for y
    expect(next).toEqual({ x: 180, y: 180 })
  })

  it('clamps to the scrollable range (never past content - viewport)', () => {
    const cell = { x: 295, y: 295, size: 5 }
    const next = followScroll({ x: 0, y: 0 }, view, content, cell, margin)
    expect(next).toEqual({ x: 200, y: 200 }) // max scroll = 300 - 100
  })
})

describe('panScroll', () => {
  it('steps ~60% of a viewport in the given direction', () => {
    expect(panScroll({ x: 0, y: 0 }, view, content, 1, 0)).toEqual({ x: 60, y: 0 })
    expect(panScroll({ x: 100, y: 0 }, view, content, 0, 1)).toEqual({ x: 100, y: 60 })
  })

  it('clamps at the start and end', () => {
    expect(panScroll({ x: 0, y: 0 }, view, content, -1, 0)).toEqual({ x: 0, y: 0 })
    expect(panScroll({ x: 200, y: 0 }, view, content, 1, 0)).toEqual({ x: 200, y: 0 }) // already at max
  })
})
