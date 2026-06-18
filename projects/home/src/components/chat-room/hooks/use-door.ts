// Doors: landing on a door cell switches you to its target room. Position-driven —
// when your coord lands on a door (pointing somewhere other than the room you're
// already in), record the arrival spawn and switch. Pathfinding never routes THROUGH
// a door (see core/pathfind), so you only ever arrive on one deliberately.

import { useEffect } from 'haunted'
import type { Coord, Room } from '../core/types'
import { doorAt } from '../core/room'

export interface DoorDeps {
  room: Room | null
  myCoord: Coord | null
  mapMode: boolean
  roomUrl: string
  arrivalSpawnRef: { current: Coord | null }
  switchRoom: (url: string) => void
}

export const useDoor = (deps: DoorDeps) => {
  useEffect(() => {
    if (deps.mapMode || !deps.room || !deps.myCoord) return
    const door = doorAt(deps.room, deps.myCoord)
    if (!door || door.to === deps.roomUrl) return // no door, or already heading there
    deps.arrivalSpawnRef.current = door.spawn ?? null
    deps.switchRoom(door.to)
  }, [deps.myCoord, deps.room, deps.mapMode])
}
