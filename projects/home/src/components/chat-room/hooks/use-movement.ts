// Movement: keyboard steps, click-to-travel (animated along a path), the moveTo
// primitive that commits a position locally + broadcasts it, and the collision
// tiebreak that hops you off a cell two clients landed on. Owns the travel timer.
// Returns the handlers the room binds (onKeyDown / onCellClick) plus cancelTravel,
// which the connection hook calls on teardown.

import { useEffect, useRef } from 'haunted'
import type { Cell, Coord, Room, Player } from '../core/types'
import type { Session } from '../shell/session'
import { cellAt, coordKey, coordsEqual, nearestFreeCell } from '../core/room'
import { applyDelta, canEnter, keyToDelta, STEP_MS } from '../core/movement'
import { findPath } from '../core/pathfind'

const occupiedSet = (players: Player[]): Set<string> => {
  const s = new Set<string>()
  for (const p of players) s.add(coordKey(p.coord))
  return s
}

export interface MovementDeps {
  myCoord: Coord | null
  others: Player[]
  mapMode: boolean
  roomRef: { current: Room | null }
  othersRef: { current: Player[] }
  session: Session
  setMyCoord: (c: Coord) => void
  setEditCell: (c: Cell | null) => void
}

export const useMovement = (deps: MovementDeps) => {
  const { myCoord, others, mapMode, roomRef, othersRef, setMyCoord, setEditCell } = deps
  const { me, meId, backendRef } = deps.session
  const travelRef = useRef<{ timer: number | null }>({ timer: null })

  const cancelTravel = () => {
    if (travelRef.current.timer !== null) {
      clearInterval(travelRef.current.timer)
      travelRef.current.timer = null
    }
  }

  // broadcast=false during click-to-travel: the whole trip is announced once up
  // front (travelTo) and replayed on each peer, so the per-cell steps stay local.
  const moveTo = (target: Coord, broadcast = true): boolean => {
    const g = roomRef.current
    if (!g) return false
    if (!canEnter(g, target, occupiedSet(othersRef.current))) return false
    if (me.current) me.current.coord = target
    setMyCoord(target)
    if (broadcast) backendRef.current?.updatePosition(target)
    return true
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (mapMode) return // editing, not playing
    const delta = keyToDelta(e.key)
    if (!delta || !myCoord) return
    e.preventDefault()
    cancelTravel()
    moveTo(applyDelta(myCoord, delta))
  }

  const startTravel = (path: Coord[]) => {
    cancelTravel()
    if (!path.length) return
    backendRef.current?.travelTo(path) // announce the whole trip once; peers replay it
    let i = 0
    // settle everyone on our final cell — confirms the arrival for latecomers, and
    // corrects peers if we stop short (a settle ≠ the announced destination snaps them).
    const settle = () => {
      if (me.current) backendRef.current?.updatePosition(me.current.coord)
      cancelTravel()
    }
    const tick = () => {
      const g = roomRef.current
      if (!g) return cancelTravel()
      if (i >= path.length) return settle() // arrived
      const step = path[i]
      if (!canEnter(g, step, occupiedSet(othersRef.current))) return settle() // blocked mid-walk
      moveTo(step, false) // animate locally; the trip was already announced
      i++
    }
    // establish the interval BEFORE the first step, so a throw in step 0 can't
    // prevent the rest of the path from running
    travelRef.current.timer = window.setInterval(tick, STEP_MS)
    tick()
  }

  const onCellClick = (target: Coord) => {
    const g = roomRef.current
    if (!g) return
    if (mapMode) {
      // open the cell editor on a clone of the current cell (or a blank one)
      setEditCell(structuredClone(cellAt(g, target) ?? { coord: target }))
      return
    }
    if (!myCoord) return
    const path = findPath(g, myCoord, target, occupiedSet(othersRef.current))
    if (path && path.length) startTravel(path)
  }

  // Cells are exclusive, but two clients can land on the same one (e.g. both spawn
  // there before presence syncs). Deterministic tiebreak: the lowest id keeps the
  // cell; anyone else hops to the nearest free cell.
  useEffect(() => {
    const g = roomRef.current
    if (!g || !myCoord) return
    const sharing = others.some((p) => coordsEqual(p.coord, myCoord) && p.id < meId.current)
    if (sharing) moveTo(nearestFreeCell(g, myCoord, occupiedSet(others)))
  }, [others, myCoord])

  return { onKeyDown, onCellClick, cancelTravel }
}
