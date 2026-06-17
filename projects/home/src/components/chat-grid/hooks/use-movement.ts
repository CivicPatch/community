// Movement: keyboard steps, click-to-travel (animated along a path), the moveTo
// primitive that commits a position locally + broadcasts it, and the collision
// tiebreak that hops you off a cell two clients landed on. Owns the travel timer.
// Returns the handlers the grid binds (onKeyDown / onCellClick) plus cancelTravel,
// which the connection hook calls on teardown.

import { useEffect, useRef } from 'haunted'
import type { Cell, Coord, Grid, Player } from '../core/types'
import type { RealtimeBackend } from '../shell/realtime'
import { cellAt, coordKey, coordsEqual, nearestFreeCell } from '../core/grid'
import { applyDelta, canEnter, keyToDelta } from '../core/movement'
import { findPath } from '../core/pathfind'

const STEP_MS = 140 // pace of click-to-travel

const occupiedSet = (players: Player[]): Set<string> => {
  const s = new Set<string>()
  for (const p of players) s.add(coordKey(p.coord))
  return s
}

export interface MovementDeps {
  myCoord: Coord | null
  others: Player[]
  mapMode: boolean
  gridRef: { current: Grid | null }
  othersRef: { current: Player[] }
  me: { current: Player | null }
  meId: { current: string }
  backendRef: { current: RealtimeBackend | null }
  setMyCoord: (c: Coord) => void
  setEditCell: (c: Cell | null) => void
}

export const useMovement = (deps: MovementDeps) => {
  const { myCoord, others, mapMode, gridRef, othersRef, me, meId, backendRef, setMyCoord, setEditCell } = deps
  const travelRef = useRef<{ timer: number | null }>({ timer: null })

  const cancelTravel = () => {
    if (travelRef.current.timer !== null) {
      clearInterval(travelRef.current.timer)
      travelRef.current.timer = null
    }
  }

  const moveTo = (target: Coord) => {
    const g = gridRef.current
    if (!g) return
    if (!canEnter(g, target, occupiedSet(othersRef.current))) return
    if (me.current) me.current.coord = target
    setMyCoord(target)
    backendRef.current?.updatePosition(target)
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
    let i = 0
    const tick = () => {
      const g = gridRef.current
      if (i >= path.length || !g) return cancelTravel()
      const step = path[i]
      if (!canEnter(g, step, occupiedSet(othersRef.current))) return cancelTravel() // blocked mid-walk
      moveTo(step)
      i++
    }
    // establish the interval BEFORE the first step, so a throw in step 0 can't
    // prevent the rest of the path from running
    travelRef.current.timer = window.setInterval(tick, STEP_MS)
    tick()
  }

  const onCellClick = (target: Coord) => {
    const g = gridRef.current
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
    const g = gridRef.current
    if (!g || !myCoord) return
    const sharing = others.some((p) => coordsEqual(p.coord, myCoord) && p.id < meId.current)
    if (sharing) moveTo(nearestFreeCell(g, myCoord, occupiedSet(others)))
  }, [others, myCoord])

  return { onKeyDown, onCellClick, cancelTravel }
}
