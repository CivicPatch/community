// The grid's scroll viewport, in one place: edge arrows, camera-follow on move, and
// click-to-pan. All the geometry is pure (core/camera); this hook just measures the
// board element, calls those functions, and applies the result (scrollTo + the
// data-* edge flags the arrows key off). Returns the element ref + a pan(dx,dy).
//
// Follow runs on every move (a manual pan is overridden by your next step) — the
// simplest behaviour that keeps you on screen; no camera "mode" to track.

import { useEffect, useRef } from 'haunted'
import { useReconnectEffect } from './use-reconnect'
import type { Coord, Room } from '../core/types'
import { overflowEdges, followScroll, panScroll } from '../core/camera'
import type { Box, Scroll, CellRect } from '../core/camera'

const FOLLOW_MARGIN_CELLS = 1.5

// reconnectNonce: bumped on a PiP pop, which moves the board across documents — that runs
// this effect's cleanup (scroll listener + ResizeObserver removed) without re-running it,
// so the arrows go dead. Re-running on the nonce re-attaches them.
export const useViewport = (room: Room | null, myCoord: Coord | null, reconnectNonce: number) => {
  const boardRef = useRef<HTMLElement | null>(null)
  // stable callback ref so lit binds it once (a fresh arrow each render would thrash)
  const setBoard = useRef((el?: Element) => {
    boardRef.current = (el as HTMLElement) ?? null
  }).current

  // Single DOM read: the board's viewport, scrollable content, scroll pos, cell size.
  const measure = () => {
    const el = boardRef.current
    if (!el || !room) return null
    const view: Box = { w: el.clientWidth, h: el.clientHeight }
    const content: Box = { w: el.scrollWidth, h: el.scrollHeight }
    const scroll: Scroll = { x: el.scrollLeft, y: el.scrollTop }
    return { el, view, content, scroll, cellPx: content.w / room.columns }
  }

  const refreshEdges = () => {
    const m = measure()
    if (!m) return
    const e = overflowEdges(m.scroll, m.view, m.content)
    m.el.toggleAttribute('data-up', e.up)
    m.el.toggleAttribute('data-down', e.down)
    m.el.toggleAttribute('data-left', e.left)
    m.el.toggleAttribute('data-right', e.right)
  }

  // Edge arrows: recompute on scroll, on resize, and when the room/grid changes. Wrapped so
  // the listener + observer re-attach after a PiP pop tears them down (see use-reconnect).
  useReconnectEffect(
    () => {
      const el = boardRef.current
      if (!el) return
      refreshEdges()
      el.addEventListener('scroll', refreshEdges, { passive: true })
      const ro = new ResizeObserver(refreshEdges)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
      return () => {
        el.removeEventListener('scroll', refreshEdges)
        ro.disconnect()
      }
    },
    [room],
    reconnectNonce,
  )

  // Camera-follow: keep the avatar in view as it moves.
  useEffect(() => {
    const m = measure()
    if (!m || !myCoord) return
    const cell: CellRect = { x: myCoord.col * m.cellPx, y: myCoord.row * m.cellPx, size: m.cellPx }
    const next = followScroll(m.scroll, m.view, m.content, cell, m.cellPx * FOLLOW_MARGIN_CELLS)
    if (next.x !== m.scroll.x || next.y !== m.scroll.y) m.el.scrollTo({ left: next.x, top: next.y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCoord, room])

  // Click an arrow to pan ~60% of a screen that way (smooth; the scroll event then
  // refreshes the edges). Swipe/trackpad scroll still works on top of this.
  const pan = (dx: number, dy: number) => {
    const m = measure()
    if (!m) return
    const next = panScroll(m.scroll, m.view, m.content, dx, dy)
    m.el.scrollTo({ left: next.x, top: next.y, behavior: 'smooth' })
  }

  return { setBoard, pan }
}
